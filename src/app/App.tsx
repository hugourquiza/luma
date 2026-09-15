import { useCallback, useEffect, useMemo, useState } from 'react';
import { getSettings, saveSettings, openIslandDB, getProfiles, saveProfile, type Profile, type Settings } from '../storage/db';
import { audioManager } from '../audio/audio';
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
}

export default function App() {
  const [screen, setScreen] = useState<Screen>({ name: 'home' });
  const [state, setState] = useState<AppState>({
    profiles: [],
    settings: { id: 'main', volume: 1, muted: false, textScale: 1, reduceMotion: false },
    loading: true,
    storageOk: true,
    activeProfileId: null,
  });

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        await openIslandDB();
        const [profiles, settings] = await Promise.all([getProfiles(), getSettings()]);
        if (alive) {
          setState((s) => ({ ...s, profiles, settings, loading: false, storageOk: true, activeProfileId: settings.activeProfileId ?? null }));
          audioManager.setState({ muted: settings.muted, volume: settings.volume });
        }
      } catch (e) {
        // IndexedDB blocked → in-memory session only (§11)
        console.warn('IndexedDB no disponible', e);
        if (alive) setState((s) => ({ ...s, loading: false, storageOk: false }));
      }
    })();
    return () => {
      alive = false;
    };
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
    } catch {
      /* keep in memory */
    }
  }, []);

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
            onSelect={(id) => {
              selectProfile(id);
              go({ name: 'map' });
            }}
            onNewProfile={(p) => {
              // Persist the new profile atomically with the app state (§2 local profiles).
              if (!state.storageOk) { setState((s) => ({ ...s, profiles: [...s.profiles, p] })); return; }
              void (async () => {
                try {
                  await saveProfile(p);
                  setState({ ...state, profiles: [...state.profiles, p] });
                } catch (e) {
                  console.error('no se pudo guardar el perfil', e);
                }
              })().then(() => {
                selectProfile(p.id);
                go({ name: 'map' });
              });
            }}
            onBack={() => go({ name: 'home' })}
          />
        );
      case 'map':
        return (
          <Map
            profileId={state.activeProfileId!}
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
  }, [screen, state, selectProfile, updateSettings]);

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
