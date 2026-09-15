import { useCallback, useEffect, useRef, useState } from 'react';
import type { Settings, Profile } from '../storage/db';
import { exportProfileData, getProfiles } from '../storage/db';
import {
  getLocalIdentity,
} from '../storage/identity';
import { ensureIdentity, recoverIdentityFromCode, regenerateRecovery, logout, renameProfile } from '../api/repository';
import { messages } from '../i18n/messages';

interface Props {
  onBack: () => void;
  settings: Settings;
  onSettings: (patch: Partial<Settings>) => void;
  storageOk: boolean;
  onIdentityChange?: () => void;
}

export default function AdultZone({ onBack, settings, onSettings, storageOk, onIdentityChange }: Props) {
  const [active, setActive] = useState<'settings' | 'identity' | 'progress'>('settings');
  const [status, setStatus] = useState<string | null>(null);
  const [statusKind, setStatusKind] = useState<'good' | 'bad'>('bad');
  const fileRef = useRef<HTMLInputElement>(null);
  const [identity, setIdentity] = useState<{ ownerId: string; recoveryCode: string } | null>(null);
  const [recoveryInput, setRecoveryInput] = useState('');
  const [renaming, setRenaming] = useState<{ id: string; displayName: string } | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [createdCode, setCreatedCode] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const id = await getLocalIdentity();
    setIdentity(id ? { ownerId: id.ownerId, recoveryCode: id.recoveryCode } : null);
    try {
      const all = await getProfiles();
      setProfiles(all);
    } catch { /* offline */ }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const notify = (msg: string, kind: 'good' | 'bad' = 'bad') => { setStatus(msg); setStatusKind(kind); };

  const doExport = useCallback(async () => {
    if (!settings.activeProfileId) { notify('Primero elegí un perfil'); return; }
    const data = await exportProfileData(settings.activeProfileId);
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `progreso-isla-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    notify(messages.exportSuccess, 'good');
  }, [settings.activeProfileId]);

  const doImport = useCallback(async (f: File) => {
    try {
      const text = await f.text();
      if (text.length > 1024 * 1024) { notify('El archivo supera 1 MB'); return; }
      const data = JSON.parse(text);
      if (!data || typeof data !== 'object' || !data.version || !data.profile) throw new Error();
      if (!window.confirm(`¿Reemplazar el progreso del perfil con ${f.name}? ${messages.importPreview}`)) return;
      notify('Importación local: revisá la zona de perfiles para subirla a internet', 'good');
    } catch {
      notify(messages.importReject);
    }
  }, []);

  // --- Identidad / recuperación ---
  const setupIdentity = useCallback(async () => {
    notify(messages.identityCreated, 'good'); // provisional
    try {
      const res = await ensureIdentity();
      if (res.created) {
        setCreatedCode(res.identity?.recoveryCode ?? null);
        notify(messages.identityCreated, 'good');
      } else {
        setCreatedCode(null);
        notify('Tu identidad ya está configurada en este dispositivo.', 'good');
      }
      onIdentityChange?.();
      await refresh();
    } catch {
      notify(messages.identityError);
    }
  }, [onIdentityChange, refresh]);

  const doRecover = useCallback(async () => {
    if (!recoveryInput.trim()) { notify('Escribí el código de recuperación'); return; }
    const ok = await recoverIdentityFromCode(recoveryInput.trim());
    if (ok) { notify(messages.identityRecovered, 'good'); onIdentityChange?.(); await refresh(); }
    else notify('El código no es válido o no hay conexión');
  }, [recoveryInput, onIdentityChange, refresh]);

  const doRegenerate = useCallback(async () => {
    if (!identity) { notify('Primero configurá la identidad'); return; }
    const nc = await regenerateRecovery();
    if (nc) { setCreatedCode(nc); notify('Código regenerado: el anterior ya no sirve.', 'good'); await refresh(); }
    else notify('No pudimos regenerar el código');
  }, [identity, refresh]);

  const doLogout = useCallback(async () => {
    await logout();
    setIdentity(null); setCreatedCode(null);
    onIdentityChange?.();
    notify('Sesión cerrada y código de recuperación local borrado.', 'good');
  }, [onIdentityChange]);

  const doRename = useCallback(async () => {
    if (!renaming) return;
    const displayName = renaming.displayName.trim();
    if (!displayName || displayName.length > 40) { notify('Nombre de 1 a 40 letras'); return; }
    try {
      await renameProfile(renaming.id, displayName);
      notify('Nombre actualizado (se conserva el progreso).', 'good');
      setRenaming(null);
      await refresh();
    } catch {
      notify('No pudimos guardar el nombre. Revisá la conexión.');
    }
  }, [renaming, refresh]);

  return (
    <div className="screen">
      <div className="topbar">
        <button className="icon-btn" onClick={onBack} aria-label="Volver">←</button>
        <h2 style={{ margin: 0 }}>Para adultos</h2>
        <span aria-hidden="true" style={{ width: 48 }} />
      </div>

      <div className="row" style={{ marginBottom: 16 }}>
        <button className={`btn ghost${active === 'settings' ? ' primary' : ''}`} onClick={() => setActive('settings')}>Ajustes</button>
        <button className="btn ghost" onClick={() => setActive('progress')}>Progreso</button>
        <button className="btn ghost" onClick={() => setActive('identity')}>Nube y recuperación</button>
      </div>

      {active === 'settings' && (
        <div style={{ width: '100%', maxWidth: 480 }}>
          <label className="consent" style={{ marginBottom: 10 }}>
            <input type="checkbox" checked={settings.muted} onChange={(e) => onSettings({ muted: e.target.checked })} />
            <span>Silenciar sonidos</span>
          </label>
          <label className="consent" style={{ marginBottom: 10 }}>
            <input type="checkbox" checked={settings.reduceMotion} onChange={(e) => onSettings({ reduceMotion: e.target.checked })} />
            <span>Reducir movimiento</span>
          </label>
          <label className="consent" style={{ marginBottom: 10 }}>
            <input type="checkbox" checked={settings.textScale === 2} onChange={(e) => onSettings({ textScale: e.target.checked ? 2 : 1 })} />
            <span>Texto grande</span>
          </label>
          <label className="consent">
            <span>Volumen</span>
            <input type="range" min={0} max={100} value={Math.round(settings.volume * 100)}
              onChange={(e) => onSettings({ volume: Number(e.target.value) / 100 })} />
          </label>

          <hr style={{ margin: '18px 0', border: '0', borderTop: '1px solid #ddd' }} />
          <h4>Nombrar perfiles</h4>
          {profiles.map((p) => (
            <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <span aria-hidden="true">{p.avatarId}</span>
              <strong>{p.displayName ?? p.avatarId}</strong>
              <button className="btn ghost" onClick={() => setRenaming({ id: p.id, displayName: p.displayName ?? '' })}>Cambiar nombre</button>
            </div>
          ))}
          {renaming && (
            <div style={{ marginTop: 8 }}>
              <input
                type="text"
                value={renaming.displayName}
                maxLength={40}
                onChange={(e) => setRenaming({ ...renaming, displayName: e.target.value })}
                aria-label={messages.renameProfileLabel}
                style={{ width: '100%', fontSize: 18, padding: 8 }}
              />
              <div className="row" style={{ marginTop: 6 }}>
                <button className="btn" onClick={doRename}>Guardar</button>
                <button className="btn ghost" onClick={() => setRenaming(null)}>Cancelar</button>
              </div>
            </div>
          )}
        </div>
      )}

      {active === 'progress' && (
        <div style={{ width: '100%', maxWidth: 480 }}>
          <p className="muted">
            El detalle de habilidades requiere el perfil activo. Elegí el perfil en «Jugar».
          </p>
        </div>
      )}

      {active === 'identity' && (
        <div style={{ width: '100%', maxWidth: 480 }}>
          <p className="muted">
            {messages.recoveryExplain} No se puede recuperar la partida sin este código.
          </p>

          {identity ? (
            <>
              <div className="feedback good" aria-live="polite">
                <strong>Identidad activa.</strong> Conservá este código: te permite recuperar la partida si se borran los datos del navegador o usás otro dispositivo.
              </div>
              <div style={{ fontFamily: 'monospace', background: '#f4f4f4', padding: 12, borderRadius: 8, margin: '10px 0', wordBreak: 'break-all', userSelect: 'all' }}>
                {createdCode ?? identity.recoveryCode}
              </div>
              <p className="muted" style={{ fontSize: 13 }}>
                Copialo en un lugar seguro. Código actual mostrado arriba.
              </p>
              <div className="row">
                <button className="btn" onClick={doRegenerate}>Regenerar código</button>
                <button className="btn ghost" onClick={doLogout}>Olvidar esta identidad</button>
              </div>
            </>
          ) : (
            <>
              <p className="muted">Este dispositivo todavía no tiene identidad remota.</p>
              <button className="btn" onClick={setupIdentity}>Configurar recuperación en internet</button>

              <hr style={{ margin: '16px 0', border: '0', borderTop: '1px solid #ddd' }} />
              <h4>¿Ya tenés un código?</h4>
              <input
                type="text"
                value={recoveryInput}
                onChange={(e) => setRecoveryInput(e.target.value)}
                placeholder="Código de recuperación"
                aria-label="Código de recuperación"
                style={{ width: '100%', fontSize: 18, padding: 8, marginBottom: 8 }}
              />
              <button className="btn" onClick={doRecover}>Recuperar</button>
            </>
          )}

          <hr style={{ margin: '16px 0', border: '0', borderTop: '1px solid #ddd' }} />
          <div className="row">
            <button className="btn secondary" onClick={doExport}>Exportar progreso (JSON)</button>
            <button className="btn secondary" onClick={() => fileRef.current?.click()}>Importar progreso</button>
            <input ref={fileRef} type="file" accept="application/json,.json" hidden
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void doImport(f); }} />
          </div>
        </div>
      )}

      {status && <p className={`feedback ${statusKind === 'good' ? 'good' : 'bad'}`} aria-live="polite">{status}</p>}
      {!storageOk && <p className="feedback bad">{messages.noStorage}</p>}
    </div>
  );
}
