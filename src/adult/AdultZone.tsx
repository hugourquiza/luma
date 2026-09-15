import { useCallback, useRef, useState } from 'react';
import type { Settings } from '../storage/db';
import { exportProfileData } from '../storage/db';
import { messages } from '../i18n/messages';

interface Props {
  onBack: () => void;
  settings: Settings;
  onSettings: (patch: Partial<Settings>) => void;
  storageOk: boolean;
}

export default function AdultZone({ onBack, settings, onSettings, storageOk }: Props) {
  const [active, setActive] = useState<'settings' | 'export' | 'progress'>('settings');
  const [status, setStatus] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const doExport = useCallback(async () => {
    if (!settings.activeProfileId) { setStatus('Primero elegí un perfil'); return; }
    const data = await exportProfileData(settings.activeProfileId);
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `progreso-isla-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setStatus(messages.exportSuccess);
  }, [settings.activeProfileId]);

  const doImport = useCallback(async (f: File) => {
    try {
      const text = await f.text();
      if (text.length > 1024 * 1024) { setStatus('El archivo supera 1 MB'); return; }
      const data = JSON.parse(text);
      if (!data || typeof data !== 'object' || !data.version || !data.profile) throw new Error();
      // confirm preview
      if (!window.confirm(`¿Reemplazar el progreso del perfil con ${f.name}? ${messages.importPreview}`)) return;
      setStatus('Importación: revisá la consola para detalles (implementación parcial)');
    } catch {
      setStatus(messages.importReject);
    }
  }, []);

  return (
    <div className="screen">
      <div className="topbar">
        <button className="icon-btn" onClick={onBack} aria-label="Volver">←</button>
        <h2 style={{ margin: 0 }}>Para adultos</h2>
        <span aria-hidden="true" style={{ width: 48 }} />
      </div>

      <div className="row" style={{ marginBottom: 16 }}>
        <button className={`btn ghost${active === 'settings' ? '' : ''}`} onClick={() => setActive('settings')}>Ajustes</button>
        <button className="btn ghost" onClick={() => setActive('progress')}>Progreso</button>
        <button className="btn ghost" onClick={() => setActive('export')}>Datos</button>
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
        </div>
      )}

      {active === 'export' && (
        <div style={{ width: '100%', maxWidth: 480 }}>
          <p className="muted">
            El progreso queda guardado en este navegador. Puede perderse si se borran los datos del sitio y
            no se sincroniza entre dispositivos ni al cambiar de dominio.
          </p>
          <div className="row">
            <button className="btn" onClick={doExport}>Exportar progreso (JSON)</button>
            <button className="btn secondary" onClick={() => fileRef.current?.click()}>Importar progreso</button>
            <input ref={fileRef} type="file" accept="application/json,.json" hidden
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void doImport(f); }} />
          </div>
          {status && <p className="feedback bad" aria-live="polite">{status}</p>}
        </div>
      )}

      {active === 'progress' && (
        <p className="muted">El detalle de habilidades requiere el perfil activo. Elegí el perfil en «Jugar».</p>
      )}

      {!storageOk && <p className="feedback bad">{messages.noStorage}</p>}
    </div>
  );
}
