import { useEffect, useState } from 'react';
import type { RegionMeta } from '../content/loader';
import { loadRegionIndex } from '../content/loader';
import { getLessonProgress } from '../storage/db';
import type { Profile } from '../storage/db';

interface Props {
  profileId: string;
  profiles: Profile[];
  onLesson: (lessonId: string) => void;
  onAdult: () => void;
  onExit: () => void;
}

const lessonIdsFor = (region: RegionMeta) =>
  Array.from({ length: region.lessonCount }, (_, i) => `${region.id}-l${i + 1}`);

// Each lesson lights one part of its landscape, independently of answer accuracy.
function Landscape({ region, completed }: { region: RegionMeta; completed: boolean[] }) {
  return (
    <svg className="island-landscape" viewBox="0 0 360 180" aria-hidden="true">
      <ellipse cx="180" cy="145" rx="163" ry="29" fill="#52b6bd" />
      <path d="M20 132 Q12 102 58 90 Q72 35 133 56 Q180 13 231 57 Q302 35 312 92 Q358 116 339 137 Q287 174 180 164 Q61 173 20 132Z" fill="#e8d5a8" stroke="#876c42" strokeWidth="3" />
      <path d="M42 120 Q61 91 91 95 Q98 60 147 77 Q184 43 225 78 Q280 58 299 106 Q327 121 305 135 Q181 164 54 137Z" fill={region.color === 'sand' ? '#f8e9b3' : '#b9d58c'} />
      <path d="M88 114 Q135 153 174 114 T292 118" fill="none" stroke="#fff7e6" strokeWidth="10" strokeDasharray="5 8" strokeLinecap="round" />
      {completed.map((lit, i) => {
        const x = 66 + i * (228 / Math.max(1, completed.length - 1));
        return (
          <g key={i} transform={`translate(${x} ${i % 2 ? 70 : 88})`}>
            {lit && <circle r="34" fill="#fff2a0" opacity="0.75" />}
            <g className={lit ? 'landmark lit' : 'landmark'}>
              {region.color === 'sand' ? <>
                <path d="M-22 0 Q0 -38 22 0Z" fill="#ed8762" stroke="#68533c" strokeWidth="2" />
                <path d="M0 0V25M-16 26H16" stroke="#68533c" strokeWidth="4" />
              </> : region.color === 'forest' ? <>
                <path d="M0 2V30" stroke="#78513b" strokeWidth="7" />
                <path d="M0 -32L-23 7H-15L-26 20H26L15 7H23Z" fill="#4f863d" stroke="#365a32" strokeWidth="2" />
              </> : region.color === 'river' ? <>
                <path d="M-28 22Q0 10 28 22M-28 31Q0 19 28 31" fill="none" stroke="#228d9e" strokeWidth="5" />
                <path d="M-22 5H22L12 17H-12Z" fill="#bd713e" />
                <path d="M0 4V-30L20 0H0" fill="#fff7e6" stroke="#68533c" strokeWidth="2" />
              </> : <>
                <rect x="-22" y="-8" width="44" height="38" rx="3" fill={region.color === 'library' ? '#e9bd75' : '#e79373'} stroke="#68533c" strokeWidth="2" />
                <path d="M-28 -8L0 -31L28 -8Z" fill="#788ca2" stroke="#68533c" strokeWidth="2" />
                <rect x="-7" y="9" width="14" height="21" rx="2" fill="#fff1aa" />
                <text y="5" textAnchor="middle" fontSize="14" fontWeight="800" fill="#3e2723">{region.color === 'library' ? 'ABC' : 'Aa'}</text>
              </>}
            </g>
            <circle cx="0" cy="42" r="11" fill={lit ? '#ffe16b' : '#fff7e6'} stroke="#68533c" strokeWidth="2" />
            <text x="0" y="47" textAnchor="middle" fontSize="14" fontWeight="800" fill="#3e2723">{lit ? '✓' : i + 1}</text>
          </g>
        );
      })}
    </svg>
  );
}

export default function Map({ profileId, profiles, onLesson, onAdult, onExit }: Props) {
  const [regions, setRegions] = useState<RegionMeta[]>([]);
  const [progress, setProgress] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [reload, setReload] = useState(0);
  const activeProfile = profiles.find((p) => p.id === profileId);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(false);
    (async () => {
      try {
        const [idx, lp] = await Promise.all([loadRegionIndex(), getLessonProgress(profileId)]);
        if (!idx.length) throw new Error('El índice del mapa está vacío');
        if (!alive) return;
        setRegions(idx);
        setProgress(Object.fromEntries(lp.map((lesson) => [lesson.lessonId, lesson.completed])));
      } catch {
        if (alive) setError(true);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [profileId, reload]);

  const orderedLessons = regions.flatMap(lessonIdsFor);
  const isUnlocked = (id: string) => {
    const index = orderedLessons.indexOf(id);
    return !!progress[id] || index === 0 || (index > 0 && !!progress[orderedLessons[index - 1]]);
  };
  const nextLesson = orderedLessons.find((id) => !progress[id] && isUnlocked(id));
  const totalDone = orderedLessons.filter((id) => progress[id]).length;

  return (
    <div className="screen map-screen">
      <div className="topbar">
        <button className="btn ghost" onClick={onExit} aria-label="Salir al inicio">←</button>
        <h2>Tu mapa</h2>
        <button className="btn ghost" onClick={onAdult} aria-label="Para adultos">⚙</button>
      </div>
      <p className="muted" style={{ textAlign: 'center', margin: '0 0 8px' }}>
        {activeProfile ? `${activeProfile.displayName ?? activeProfile.avatarId} ${activeProfile.avatarId}` : ''}
      </p>
      {loading ? <p role="status">Encendiendo el mapa…</p> : error ? (
        <div className="map-notice">
          <p role="alert">No pudimos cargar tu mapa. Tu progreso no se ha borrado.</p>
          <button className="btn" onClick={() => setReload((value) => value + 1)}>Intentar de nuevo</button>
        </div>
      ) : <>
        <div className="map-intro">
          <p>{totalDone === orderedLessons.length ? '¡Iluminaste toda la isla!' : 'Cada lección enciende un rincón de tu isla.'}</p>
          <p className="map-count">{totalDone} de {orderedLessons.length} rincones iluminados</p>
          {nextLesson && <button className="btn big map-continue" onClick={() => onLesson(nextLesson)}>Continuar →</button>}
        </div>
        <div className="island-map" aria-label="Regiones de tu isla">
          {regions.map((region, regionIndex) => {
            const ids = lessonIdsFor(region);
            const done = ids.filter((id) => progress[id]).length;
            const locked = !ids.some(isUnlocked);
            return (
              <section key={region.id} className={`island-region${done ? ' illuminated' : ''}`} aria-labelledby={`region-${region.id}`}>
                <h3 id={`region-${region.id}`}><span className="region-number">{regionIndex + 1}</span> {region.name}</h3>
                <Landscape region={region} completed={ids.map((id) => !!progress[id])} />
                <p className="region-status">{locked ? 'Completá la región anterior para llegar.' : `${done} de ${ids.length} rincones iluminados`}</p>
                <div className="map-lessons">
                  {ids.map((id, i) => (
                    <button
                      key={id}
                      className={`map-lesson${progress[id] ? ' completed' : ''}`}
                      disabled={!isUnlocked(id)}
                      aria-current={id === nextLesson ? 'step' : undefined}
                      aria-label={
                        progress[id]
                          ? `${region.name}, lección ${i + 1}: repetir para practicar`
                          : isUnlocked(id)
                            ? `Comenzar ${region.name}, lección ${i + 1}`
                            : `${region.name}, lección ${i + 1}: bloqueada`
                      }
                      onClick={() => onLesson(id)}
                    >
                      <strong>{progress[id] ? '✓' : i + 1}</strong>
                      <span>{progress[id] ? 'Repetir' : isUnlocked(id) ? 'Comenzar' : 'Luego'}</span>
                    </button>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      </>}
    </div>
  );
}
