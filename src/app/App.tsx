import { useCallback, useEffect, useMemo, useState } from 'react';
import { getSettings, saveSettings, openIslandDB, getProfiles, saveProfile, type Profile, type Settings } from '../storage/db';
import { audioManager } from '../audio/audio';
import { ensureIdentity, startSync, createProfileLocal, listProfilesWithCache, importLocalProfileRemote, hasIdentityRemote } from '../api/repository';
import Home from './Home';
import ProfileSelect from './ProfileSelect';
import Map from './Map';
import LessonRun from './LessonRun';
import AdultZone from '../adult/AdultZone';

export type Screen =
  | { name: 'home' }
  | { name: 'profiles' }
  | { name: 'map' }
  | { name: 'lesson'; lessonId: string; resume?: boolean }
  | { name: 'adult' };

export interface AppState {
  profiles: Profile[];
  settings: Settings;
  loading: boolean;
  storageOk: boolean;
  activeProfileId: string | null;
  hasRemote: boolean;
  online: boolean;
}

export default function App() {
  const [screen, setScreen] = useState<Screen>({ name: 'home' });
  const [state, setState] = useState<AppState>({
    profiles: [],
    settings: { id: 'main', volume: 1, muted: false, textScale: 1, reduceMotion: false },
    loading: true,
    storageOk: true,
    activeProfileId: null,
    hasRemote: false,
    online: true,
  });

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        await openIslandDB();
        // Identidad remota: no bloquea el arranque si falla (modo offline).
        let hasRemote = false;
        try {
          hasRemote = await hasIdentityRemote();
        } catch {
          /* sin conexión inicial */
        }
        const [profiles, settings] = await Promise.all([getProfiles(), getSettings()]);
        if (alive) {
          setState((s) => ({ ...s, profiles, settings, loading: false, storageOk: true, activeProfileId: settings.activeProfileId ?? null, hasRemote, online: navigator.onLine }));
          audioManager.setState({ muted: settings.muted, volume: settings.volume });
        }
        // Arranca la sincronización de operaciones pendientes.
        if (alive) startSync();
      } catch (e) {
        // IndexedDB blocked → in-memory session only
        console.warn('IndexedDB no disponible', e);
        if (alive) setState((s) => ({ ...s, loading: false, storageOk: false }));
      }
    })();
    return () => { alive = false; };
  }, []);

  const refreshProfiles = useCallback(async () => {
    const { profiles } = await listProfilesWithCache();
    setState((s) => ({ ...s, profiles }));
  }, []);

  const updateSettings = useCallback(async (patch: Partial<Settings>) => {
    setState((s) => {
      const next = { ...s.settings, ...patch };
      audioManager.setState({ muted: next.muted, volume: next.volume });
      return { ...s, settings: next };
    });
    try {
      const merged = { ...(await getSettings()), ...patch };
      await saveSettings(merged);
    } catch { /* keep in memory */ }
  }, []);

  const refreshOnline = useCallback(() => {
    setState((s) => ({ ...s, online: navigator.onLine }));
  }, []);
  useEffect(() => {
    window.addEventListener('online', refreshOnline);
    window.addEventListener('offline', refreshOnline);
    return () => {
      window.removeEventListener('online', refreshOnline);
      window.removeEventListener('offline', refreshOnline);
    };
  }, [refreshOnline]);

  const selectProfile = useCallback((id: string) => {
    setState((s) => ({ ...s, activeProfileId: id }));
    void updateSettings({ activeProfileId: id });
  }, [updateSettings]);

  const unlockAudio = (e: React.SyntheticEvent) => {
    const t = e.target as HTMLElement;
    if (t && t.closest('button,a,[role="button"]')) {
      audioManager.resume();
    }
  };

  // Creación de perfil: guarda en caché local y lo envía a la nube en segundo
  // plano (no bloquea el flujo). El perfil local permite jugar ya; la subida
  // remota viaja cuando haya conexión/backend.
  const handleNewProfile = useCallback(async (p: Profile) => {
    if (state.storageOk) await saveProfile(p);
    setState((s) => ({ ...s, profiles: [...s.profiles, p] }));
    await createProfileLocal(p);
    selectProfile(p.id);
    setScreen({ name: 'map' });
    void refreshProfiles(); // refresca desde remoto/caché en segundo plano
  }, [state.storageOk, selectProfile, refreshProfiles]);

  // Subir un perfil local preexistente (confirmación adulta) a la nube.
  const handleUploadLocal = useCallback(async (p: Profile) => {
    await ensureIdentity(); // si no existe identidad, la crea y guarda el código
    await importLocalProfileRemote(p.id);
    setState((s) => ({ ...s, hasRemote: true }));
  }, []);

  const screenEl = useMemo(() => {
    const go = (s: Screen) => setScreen(s);
    switch (screen.name) {
      case 'home':
        return <Home onPlay={() => go({ name: 'profiles' })} onAdult={() => go({ name: 'adult' })} />;
      case 'profiles':
        return (
          <ProfileSelect
            profiles={state.profiles}
            storageOk={state.storageOk}
            hasRemote={state.hasRemote}
            online={state.online}
            onSelect={(id) => { selectProfile(id); go({ name: 'map' }); }}
            onNewProfile={handleNewProfile}
            onUploadLocal={handleUploadLocal}
            onBack={() => go({ name: 'home' })}
          />
        );
      case 'map':
        return (
          <Map
            profileId={state.activeProfileId!}
            profiles={state.profiles}
            onLesson={(lessonId) => go({ name: 'lesson', lessonId })}
            onAdult={() => go({ name: 'adult' })}
            onExit={() => go({ name: 'home' })}
          />
        );
      case 'lesson':
        return (
          <LessonRun
            key={screen.lessonId + (screen.resume ? '-resume' : '')}
            regionId={screen.lessonId.split('-l')[0]}
            lessonId={screen.lessonId}
            profileId={state.activeProfileId!}
            storageOk={state.storageOk}
            onExit={() => go({ name: 'map' })}
            onComplete={() => go({ name: 'map' })}
          />
        );
      case 'adult':
        return <AdultZone onBack={() => go({ name: 'home' })} settings={state.settings} onSettings={updateSettings} storageOk={state.storageOk} />;
      default:
        return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, state, selectProfile, updateSettings, handleNewProfile, handleUploadLocal]);

  void unlockAudio; // called via gesture handlers in children

  if (state.loading) {
    return (
      <div className="screen">
        <p>Cargando la isla...</p>
      </div>
    );
  }

  return <div onClickCapture={unlockAudio}>{screenEl}</div>;
}
