import { useState } from 'react';
import type { Profile } from '../storage/db';
import { messages } from '../i18n/messages';

interface Props {
  profiles: Profile[];
  storageOk: boolean;
  onSelect: (id: string) => void;
  onNewProfile: (p: Profile) => void;
  onBack: () => void;
}

const AVATARS = ['🦊', '🐸', '🦉', '🐼'];

export default function ProfileSelect({ profiles, storageOk, onSelect, onNewProfile, onBack }: Props) {
  const [picked, setPicked] = useState<string | null>(profiles[0]?.id ?? null);
  const [newAvatar, setNewAvatar] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [consent, setConsent] = useState(false);

  const canStartNew = !!newAvatar && consent;

  const createProfile = () => {
    if (!newAvatar) return;
    const p: Profile = { id: crypto.randomUUID(), avatarId: newAvatar, createdAt: Date.now() };
    onNewProfile(p);
  };

  const start = () => {
    if (picked) onSelect(picked);
    else if (canStartNew) createProfile();
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
            aria-label={`Perfil ${p.avatarId}`}
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

      {newAvatar && (
        <div style={{ width: '100%', maxWidth: 520, marginTop: 12 }}>
          <label className="consent">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              aria-label="Confirmo que el progreso se guarda solo en este dispositivo"
            />
            <span>
              Confirmo que este es un perfil local: el progreso se guarda solo en este dispositivo y no se
              comparte por internet.
            </span>
          </label>
        </div>
      )}

      {confirm && newAvatar && !consent && (
        <p className="feedback bad">Marcá la casilla para confirmar tu perfil.</p>
      )}

      <div className="row" style={{ marginTop: 24 }}>
        <button className="btn ghost" onClick={onBack}>
          ←
        </button>
        <button
          className="btn big"
          onClick={() => {
            if (!picked && !newAvatar) return;
            if (newAvatar && !consent) {
              setConfirm(true);
              return;
            }
            start();
          }}
          disabled={!picked && !canStartNew}
        >
          {messages.continue}
        </button>
      </div>
    </div>
  );
}
