import { useState } from 'react';
import type { Profile } from '../storage/db';
import { messages } from '../i18n/messages';
import { validateDisplayName, normalizeDisplayName } from '../shared/validate';

interface Props {
  profiles: Profile[];
  storageOk: boolean;
  /** true si este dispositivo tiene identidad remota configurada (para subir). */
  hasRemote: boolean;
  online: boolean;
  onSelect: (id: string) => void;
  onNewProfile: (p: Profile) => Promise<void>;
  onUploadLocal: (p: Profile) => Promise<void>;
  onBack: () => void;
}

const AVATARS = ['🦊', '🐸', '🦉', '🐼'];

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'pending' | 'error';

export default function ProfileSelect({ profiles, storageOk, hasRemote, online, onSelect, onNewProfile, onUploadLocal, onBack }: Props) {
  const [picked, setPicked] = useState<string | null>(profiles[0]?.id ?? null);
  const [newAvatar, setNewAvatar] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [consent, setConsent] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [uploadingId, setUploadingId] = useState<string | null>(null);

  const canStartNew = !!newAvatar && name.trim().length > 0 && saveStatus !== 'saving';

  const handleName = (value: string) => {
    setName(value);
    const check = validateDisplayName(value);
    setNameError(check.ok ? null : (check.error ?? null));
  };

  const createProfile = async () => {
    const check = validateDisplayName(name);
    if (!check.ok || !newAvatar) { setNameError(check.error ?? messages.nameRequired); setConfirm(true); return; }
    const p: Profile = {
      id: crypto.randomUUID(),
      avatarId: newAvatar,
      displayName: normalizeDisplayName(name),
      createdAt: Date.now(),
    };
    setNameError(null);
    setConfirm(false);
    setSaveStatus('saving');
    try {
      await onNewProfile(p);
      setSaveStatus('saved');
    } catch (e) {
      setSaveStatus('error');
      setErrorMsg(e instanceof Error ? e.message : messages.identityError);
      // No navegamos: el adulto ve el error y puede reintentar.
      return;
    }
  };

  const start = async () => {
    if (picked) { onSelect(picked); return; }
    if (canStartNew) await createProfile();
  };

  const uploadLocal = async (id: string) => {
    const p = profiles.find((x) => x.id === id);
    if (!p) return;
    setUploadingId(id);
    try {
      await onUploadLocal(p);
    } catch {
      /* el estado queda visible abajo */
    } finally {
      setUploadingId(null);
    }
  };

  const usedAvatars = new Set(profiles.map((p) => p.avatarId));
  const freeAvatars = AVATARS.filter((a) => !usedAvatars.has(a));

  return (
    <div className="screen">
      <h2>{messages.chooseProfile}</h2>
      {!storageOk && <p className="feedback bad">{messages.noStorage}</p>}

      <div className="avatars">
        {profiles.map((p) => (
          <button
            key={p.id}
            className={`avatar${picked === p.id ? ' selected' : ''}`}
            onClick={() => {
              setPicked(p.id);
              setNewAvatar(null);
              setConfirm(false);
            }}
            aria-label={`Perfil ${p.displayName ?? p.avatarId}`}
          >
            <span aria-hidden="true">{p.avatarId}</span>
          </button>
        ))}
        {freeAvatars.length > 0 && (
          <>
            {freeAvatars.map((a) => (
              <button
                key={a}
                className={`avatar${newAvatar === a ? ' selected' : ''}`}
                onClick={() => {
                  setNewAvatar(a);
                  setPicked(null);
                }}
                aria-label={`Nuevo perfil ${a}`}
              >
                <span aria-hidden="true">{a}</span>
              </button>
            ))}
          </>
        )}
      </div>

      {profiles.length > 0 && picked && (
        <div style={{ width: '100%', maxWidth: 520, marginTop: 12 }}>
          <p className="muted" style={{ textAlign: 'center' }}>
            {profiles.find((x) => x.id === picked)?.displayName ?? profiles.find((x) => x.id === picked)?.avatarId}
          </p>
          {hasRemote && (
            <p className="feedback bad" style={{ marginTop: 6 }}>
              {online ? (uploadingId === picked ? messages.uploading : 'Este perfil todavía vive solo en este dispositivo.') : messages.pendingOffline}
              {online && uploadingId !== picked && (
                <button className="btn ghost" onClick={() => uploadLocal(picked)} style={{ marginLeft: 8, padding: '4px 10px' }}>{messages.adultConsentUpload}</button>
              )}
            </p>
          )}
        </div>
      )}

      {newAvatar && (
        <div style={{ width: '100%', maxWidth: 520, marginTop: 12 }}>
          <label htmlFor="profileName" className="consent">
            <span><strong>{messages.profileName}</strong> ({messages.namePlaceholder})</span>
          </label>
          <input
            id="profileName"
            type="text"
            value={name}
            maxLength={40}
            aria-invalid={!!nameError}
            aria-describedby="profileNameHint"
            onChange={(e) => handleName(e.target.value)}
            style={{ width: '100%', fontSize: 20, padding: 10, marginTop: 6 }}
          />
          <p id="profileNameHint" className="muted" style={{ marginTop: 4, fontSize: 14 }}>
            {nameError ?? 'Entre 1 y 40 letras, con tildes y ñ. Ej.: «Ana Sofía» o «Pirata 7».'}
          </p>

          <label className="consent" style={{ marginTop: 10 }}>
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              aria-label="Confirmo guardar el nombre y el progreso en internet"
            />
            <span>{messages.saveToNet}</span>
          </label>
        </div>
      )}

      {confirm && newAvatar && !canStartNew && !nameError && (
        <p className="feedback bad">{name.trim().length === 0 ? messages.nameRequired : messages.uploadNeedsConfirm}</p>
      )}
      {saveStatus === 'error' && <p className="feedback bad" aria-live="polite">{messages.saveRetry} {errorMsg ?? ''}</p>}
      {saveStatus === 'saving' && <p className="feedback" aria-live="polite">{messages.saving}</p>}
      {saveStatus === 'saved' && <p className="feedback good" aria-live="polite">{messages.savedOk}</p>}
      {saveStatus === 'pending' && <p className="feedback bad" aria-live="polite">{messages.pendingOffline}</p>}

      <div className="row" style={{ marginTop: 24 }}>
        <button className="btn ghost" onClick={onBack}>
          ←
        </button>
        <button
          className="btn big"
          onClick={() => { void start(); }}
          disabled={(!picked && !canStartNew) || saveStatus === 'saving'}
        >
          {messages.continue}
        </button>
      </div>
    </div>
  );
}
