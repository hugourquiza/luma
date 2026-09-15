import { useCallback, useEffect, useRef, useState } from 'react';
import type { Activity } from '../content/types';
import { loadRegion } from '../content/loader';
import { audioManager } from '../audio/audio';
import {
  saveSessionProgress, saveLessonProgress, addSticker,
  type Session,
} from '../storage/db';
import { getResumeSession, saveCheckpointRemote, completeLessonRemote } from '../api/repository';
import type { SaveCheckpointRequest, CompleteLessonRequest } from '../shared/schema';
import ActivityRenderer from '../activities/ActivityRenderer';
import { messages } from '../i18n/messages';

interface Props {
  regionId: string;
  lessonId: string;
  profileId: string;
  storageOk: boolean;
  onExit: () => void;
  onComplete: () => void;
}

interface ActivityResult {
  activityId: string;
  independent: boolean;
  assisted: boolean;
  error: boolean;
  /** id estable del intento (sobrevive reintentos de cierre). */
  attemptId?: string;
}

type Outcome = { kind: 'idle' } | { kind: 'correct'; assisted: boolean } | { kind: 'wrong' };

const RESUME_KEY = 'isla-resume:'; // + sessionId → JSON session snapshot (synchronous local mirror)

function makeAttemptId(sessionId: string, activityId: string, seq: number): string {
  // Estable para la misma sesión+actividad+secuencia → idempotencia parcial.
  return `${sessionId}-${activityId}-${seq}`.replace(/[^a-zA-Z0-9-]/g, '');
}

interface ResumeSnapshot {
  id: string; profileId: string; regionId: string; lessonId: string;
  activityOrder: string[]; currentIndex: number; startedAt: number;
}

function saveResumeMirror(s: ResumeSnapshot): void {
  try { localStorage.setItem(`${RESUME_KEY}${s.profileId}:${s.lessonId}`, JSON.stringify(s)); } catch { /* sin localStorage */ }
}

function readResumeMirror(profileId: string, lessonId: string): ResumeSnapshot | null {
  try {
    const raw = localStorage.getItem(`${RESUME_KEY}${profileId}:${lessonId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ResumeSnapshot;
    if (!parsed || typeof parsed.id !== 'string' || !Array.isArray(parsed.activityOrder)) return null;
    return parsed;
  } catch { return null; }
}


export default function LessonRun({ regionId, lessonId, profileId, storageOk, onExit, onComplete }: Props) {
  const [lesson, setLesson] = useState<{ activities: Activity[] } | null>(null);
  const [order, setOrder] = useState<string[]>([]);
  const [idx, setIdx] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [phase, setPhase] = useState<'playing' | 'finish'>('playing');
  const [outcome, setOutcome] = useState<Outcome>({ kind: 'idle' });
  const [errors, setErrors] = useState(0);
  const [feedback, setFeedback] = useState<{ text: string; kind: 'bad' | 'hint' | 'solution' } | null>(null);
  const [attemptSeq, setAttemptSeq] = useState(0); // remount key for retry
  const [results, setResults] = useState<ActivityResult[]>([]);
  const [stickerEarned, setStickerEarned] = useState(false);
  const [sessionId, setSessionId] = useState<string>(() => crypto.randomUUID());
  const [startedAt, setStartedAt] = useState(() => Date.now());
  const [noStorage] = useState(!storageOk);
  const [finishError, setFinishError] = useState(false);

  const resultsRef = useRef<ActivityResult[]>([]);
  useEffect(() => { resultsRef.current = results; }, [results]);
  const orderRef = useRef<string[]>([]);
  useEffect(() => { orderRef.current = order; }, [order]);
  const idxRef = useRef(0);
  useEffect(() => { idxRef.current = idx; }, [idx]);
  const sessionIdRef = useRef(sessionId);
  useEffect(() => { sessionIdRef.current = sessionId; }, [sessionId]);
  const stateRef = useRef({ regionId, lessonId, profileId, storageOk, startedAt });
  useEffect(() => { stateRef.current = { regionId, lessonId, profileId, storageOk, startedAt }; }, [regionId, lessonId, profileId, storageOk, startedAt]);

  const seqRef = useRef(0);

  // --- load lesson; restore a resumable session for this profile+lesson ---
  useEffect(() => {
    let alive = true;
    (async () => {
      const region = await loadRegion(regionId);
      const ls = region.lessons.find((l) => l.id === lessonId);
      if (!ls) return;
      if (!alive) return;
      setLesson(ls);
      const defaultOrder = ls.activities.map((a) => a.id);
      setOrder(defaultOrder);
      let resumeIdx = 0;
      if (storageOk) {
        // Espejo local síncrono (localStorage): primera fuente, sobrevive a un
        // reload inmediato sin esperar el commit asíncrono de IndexedDB.
        const mirror = readResumeMirror(profileId, lessonId);
        const known = new Set(defaultOrder);
        const { session } = await getResumeSession(profileId, lessonId);
        // El espejo síncrono (localStorage) es la fuente de verdad local para
        // reanudar inmediato tras un reload; el session (IDB/API) solo lo
        // complementa con los checkpointAttempts ya persistidos.
        const effective = mirror ? {
          ...(session && session.id === mirror.id ? { checkpointAttempts: session.checkpointAttempts } : { checkpointAttempts: [] }),
          id: mirror.id, profileId, regionId: mirror.regionId, lessonId: mirror.lessonId,
          activityOrder: mirror.activityOrder, currentIndex: mirror.currentIndex, status: 'active' as const,
          startedAt: mirror.startedAt, updatedAt: Date.now(),
        } : session;
        if (effective) {
          const validOrder = effective.activityOrder.filter((id) => known.has(id));
          if (validOrder.length > 0 && effective.currentIndex < validOrder.length) {
            setOrder(validOrder);
            setSessionId(effective.id);
            setStartedAt(effective.startedAt || Date.now());
            resumeIdx = effective.currentIndex;
            if (effective.checkpointAttempts?.length) {
              const restored = effective.checkpointAttempts
                .filter((a) => known.has(a.activityId))
                .map((a) => ({
                  activityId: a.activityId,
                  independent: a.outcome === 'independent',
                  assisted: a.outcome === 'assisted',
                  error: a.outcome === 'error',
                  attemptId: a.id,
                }));
              if (restored.length) {
                resultsRef.current = restored;
                setResults(restored);
                seqRef.current = restored.length;
              }
            }
          }
        }
      }
      if (alive) {
        setIdx(resumeIdx);
        setLoaded(true);
      }
    })();
    return () => { alive = false; audioManager.stop(); };
  }, [regionId, lessonId, profileId, storageOk]);

  const play = useCallback((audioId: string) => {
    audioManager.resume();
    void audioManager.tryPlay(audioId);
  }, []);

  const activity = loaded && lesson ? lesson.activities[idx] : null;

  const buildCheckpointAttempts = useCallback((resultsList: ActivityResult[], sid: string): SaveCheckpointRequest['attempts'] => {
    return resultsList.map((r) => {
      const id = r.attemptId ?? makeAttemptId(sid, r.activityId, resultsList.indexOf(r));
      return {
        id, profileId: profileId, sessionId: sid, activityId: r.activityId,
        outcome: r.error ? 'error' : r.assisted ? 'assisted' : 'independent',
        retries: 0, assists: r.assisted ? 1 : 0, timestamp: Date.now(),
      };
    });
  }, [profileId]);

  // persist local session + remote checkpoint; local es await (debe sobrevivir
  // a un reload inmediato), remoto es fire-and-forget (la cola lo reenvía).
  const persist = useCallback(async (resultsList: ActivityResult[]) => {
    const { regionId, lessonId, profileId } = stateRef.current;
    const sid = sessionIdRef.current;
    // La última respuesta ya está registrada; el índice pendiente es el
    // siguiente (no se debe re-mostrar la actividad ya respondida).
    const nextIndex = Math.min(idxRef.current + 1, orderRef.current.length);
    const s: Session = {
      id: sid, profileId, regionId, lessonId,
      activityOrder: orderRef.current, currentIndex: nextIndex,
      startedAt: startedAt, updatedAt: Date.now(),
    };
    try { await saveSessionProgress(profileId, s, []); } catch { /* sin IndexedDB */ }
    saveResumeMirror({ id: sid, profileId, regionId, lessonId, activityOrder: orderRef.current, currentIndex: nextIndex, startedAt });
    const req: SaveCheckpointRequest = {
      sessionId: sid, regionId, lessonId,
      activityOrder: orderRef.current, currentIndex: nextIndex,
      attempts: buildCheckpointAttempts(resultsList, sid),
      opId: `chk:${sid}:${resultsList.length}:${startedAt}`,
    };
    void saveCheckpointRemote(profileId, req).catch(() => {});
  }, [buildCheckpointAttempts, startedAt]);

  // ---- feedback ladder (§6) ----
  const handleAnswered = useCallback(async (correct: boolean, assisted: boolean) => {
    if (!correct) {
      const next = errors + 1;
      setErrors(next);
      if (next === 1) setFeedback({ text: 'Probemos otra vez', kind: 'bad' });
      else if (next === 2) setFeedback({ text: 'Pista: mirá con atención', kind: 'hint' });
      else {
        setFeedback({ text: 'Mirá cómo se hace y repetí', kind: 'solution' });
        const actId = orderRef.current[idxRef.current];
        seqRef.current += 1;
        const r: ActivityResult = { activityId: actId, independent: false, assisted: true, error: false, attemptId: makeAttemptId(sessionIdRef.current, actId, seqRef.current) };
        const nextArr = [...resultsRef.current, r];
        resultsRef.current = nextArr; setResults(nextArr);
        setErrors(0);
        setOutcome({ kind: 'correct', assisted: true });
        await persist(nextArr);
      }
      return;
    }
    const actId = orderRef.current[idxRef.current];
    seqRef.current += 1;
    const r: ActivityResult = { activityId: actId, independent: !assisted, assisted, error: false, attemptId: makeAttemptId(sessionIdRef.current, actId, seqRef.current) };
    const nextArr = [...resultsRef.current, r];
    resultsRef.current = nextArr; setResults(nextArr);
    setErrors(0);
    setFeedback(null);
    setOutcome({ kind: 'correct', assisted });
    // Espera el checkpoint local (IndexedDB) antes de que el dot.done permita
    // un reload/test: la sesión debe sobrevivir aunque el usuario cierre ya.
    await persist(nextArr);
  }, [errors, persist]);

  // retry remount after 1st/2nd error
  useEffect(() => {
    if (errors === 1 || errors === 2) {
      const t = window.setTimeout(() => { setAttemptSeq((s) => s + 1); setOutcome({ kind: 'idle' }); }, 900);
      return () => window.clearTimeout(t);
    }
  }, [errors]);

  // advance
  useEffect(() => {
    if (outcome.kind === 'correct') {
      const t = window.setTimeout(() => {
        if (idxRef.current + 1 >= orderRef.current.length) void finishRun();
        else { setIdx((i) => i + 1); setAttemptSeq((s) => s + 1); }
        setOutcome({ kind: 'idle' });
      }, 1400);
      return () => window.clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outcome]);

  // ---- finish: atomic, idempotent close ----
  const finishRun = useCallback(async () => {
    setPhase('finish');
    const all = resultsRef.current;
    const { regionId, lessonId, profileId } = stateRef.current;
    const region = await loadRegion(regionId);
    const ls = region.lessons.find((l) => l.id === lessonId);
    if (!ls) return;
    const now = Date.now();
    const sid = sessionIdRef.current;
    const attemptDTOs = buildCheckpointAttempts(all, sid);

    if (storageOk) {
      await saveLessonProgress({ lessonId, profileId, completed: true, lastCompletedAt: now, independentCount: all.filter((r) => r.independent).length });
      await addSticker(profileId, `sticker-${lessonId}`, now);
      setStickerEarned(true);
      // Sesión completada: limpiar el espejo de reanudación (practicar de nuevo
      // empieza desde cero, como dicta el diseño de "Repetir").
      try { localStorage.removeItem(`${RESUME_KEY}${profileId}:${lessonId}`); } catch { /* sin localStorage */ }

      const skillAgg: CompleteLessonRequest['skillProgress'] = [];
      for (const r of all) {
        const a = ls.activities.find((x) => x.id === r.activityId);
        if (!a) continue;
        for (const skillId of a.skillIds) {
          const existing = skillAgg.find((s) => s.skillId === skillId);
          if (existing) {
            existing.independent += r.independent ? 1 : 0;
            existing.assisted += r.assisted ? 1 : 0;
            existing.errors += r.error ? 1 : 0;
          } else {
            skillAgg.push({ skillId, independent: r.independent ? 1 : 0, assisted: r.assisted ? 1 : 0, errors: r.error ? 1 : 0, last5: [r.independent], sessionsIn: [sid] });
          }
        }
      }

      // Cierre remoto atómico e idempotente.
      const completeReq: CompleteLessonRequest = {
        sessionId: sid, regionId, lessonId,
        activityOrder: orderRef.current, currentIndex: orderRef.current.length,
        attempts: attemptDTOs, results: attemptDTOs,
        skillProgress: skillAgg,
        lessonProgress: { lessonId, completed: true, lastCompletedAt: now, independentCount: all.filter((r) => r.independent).length },
        sticker: { stickerId: `sticker-${lessonId}` },
        opId: `cmp:${sid}:${now}`,
      };
      try {
        await completeLessonRemote(profileId, completeReq);
        setFinishError(false);
      } catch {
        setFinishError(true);
      }
    }
  }, [buildCheckpointAttempts, storageOk]);

  if (!loaded || !activity) return <div className="screen"><p>Cargando lección...</p></div>;

  if (phase === 'finish') {
    return (
      <div className="screen" style={{ justifyContent: 'center', textAlign: 'center' }}>
        <h2>{messages.lessonComplete}</h2>
        {stickerEarned && <div className="sticker-grid" aria-hidden="true"><span className="sticker">⭐</span></div>}
        <p className="muted">¡Luma encendió otra parte de la isla!</p>
        {finishError && <p className="feedback bad" aria-live="polite">{messages.pendingOffline}</p>}
        <div className="row" style={{ marginTop: 24 }}>
          <button className="btn big" onClick={onComplete}>{messages.backToMap}</button>
          <button className="btn secondary" onClick={() => window.location.reload()}>{messages.practiceAgain}</button>
        </div>
        <p className="muted" style={{ marginTop: 16 }}>{messages.pause}</p>
      </div>
    );
  }

  return (
    <div className="screen">
      <div className="topbar">
        <button className="icon-btn" onClick={onExit} aria-label={messages.backToMap}>←</button>
        <div className="progress" aria-label="Progreso de la lección">
          {order.map((_, i) => <span key={i} className={`dot${i < idx ? ' done' : ''}`} aria-hidden="true" />)}
        </div>
        <span aria-hidden="true" style={{ width: 48 }} />
      </div>
      {feedback && <p className={`feedback ${feedback.kind}`} aria-live="polite">{feedback.text}</p>}
      <ActivityRenderer
        key={attemptSeq}
        activity={activity}
        muted={false}
        volume={1}
        play={play}
        onAnswered={(res) => handleAnswered(res.correct, res.assisted)}
      />
      {noStorage && <p className="feedback bad">{messages.noStorage}</p>}
    </div>
  );
}
