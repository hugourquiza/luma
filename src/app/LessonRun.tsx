import { useCallback, useEffect, useRef, useState } from 'react';
import type { Activity } from '../content/types';
import { loadRegion } from '../content/loader';
import { audioManager } from '../audio/audio';
import {
  getSession, saveSessionProgress, saveLessonProgress, addSticker,
  getSkillProgress, saveSkillProgress, type Session,
} from '../storage/db';
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
}

type Outcome = { kind: 'idle' } | { kind: 'correct'; assisted: boolean } | { kind: 'wrong' };

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
  const [sessionId] = useState(() => crypto.randomUUID());
  const [noStorage] = useState(!storageOk);

  // refs for the finish callback to read current results without stale closures
  const resultsRef = useRef<ActivityResult[]>([]);
  useEffect(() => {
    resultsRef.current = results;
  }, [results]);
  const orderRef = useRef<string[]>([]);
  useEffect(() => {
    orderRef.current = order;
  }, [order]);

  // --- load lesson; restore or default order (§6: persist selection) ---
  useEffect(() => {
    let alive = true;
    (async () => {
      const region = await loadRegion(regionId);
      const ls = region.lessons.find((l) => l.id === lessonId);
      if (!ls) return;
      if (!alive) return;
      setLesson(ls);
      setOrder(ls.activities.map((a) => a.id));
      // resume an in-progress session for this profile+lesson
      let resumeIdx = 0;
      if (storageOk) {
        const existing = await getSession(profileId);
        if (existing && existing.lessonId === lessonId && existing.currentIndex < existing.activityOrder.length) {
          resumeIdx = existing.currentIndex;
          setOrder(existing.activityOrder);
        }
      }
      if (alive) {
        setIdx(resumeIdx);
        setLoaded(true);
      }
    })();
    return () => {
      alive = false;
      audioManager.stop();
    };
  }, [regionId, lessonId, profileId, storageOk]);

  // persist session on activity change (§11, §14 survive reload)
  useEffect(() => {
    if (!loaded || !order.length) return;
    const s: Session = {
      id: sessionId, profileId, regionId, lessonId,
      activityOrder: order, currentIndex: idx,
      startedAt: Date.now(), updatedAt: Date.now(),
    };
    if (storageOk) void saveSessionProgress(profileId, s, []);
  }, [loaded, idx, order, profileId, lessonId, regionId, sessionId, storageOk]);

  const play = useCallback((audioId: string) => {
    audioManager.resume();
    void audioManager.tryPlay(audioId);
  }, []);

  const activity = loaded && lesson ? lesson.activities[idx] : null;

  // ---- feedback ladder (§6): error1 kind, error2 hint, error3 demonstrate ----
  const handleAnswered = useCallback((correct: boolean, assisted: boolean) => {
    if (!correct) {
      const next = errors + 1;
      setErrors(next);
      if (next === 1) setFeedback({ text: 'Probemos otra vez', kind: 'bad' });
      else if (next === 2) setFeedback({ text: 'Pista: mirá con atención', kind: 'hint' });
      else {
        // demonstrate solution and let them repeat; register as assisted (§6)
        setFeedback({ text: 'Mirá cómo se hace y repetí', kind: 'solution' });
        const actId = orderRef.current[idxRef.current];
        resultsRef.current = [...resultsRef.current, { activityId: actId, independent: false, assisted: true, error: false }];
        setResults(resultsRef.current);
        setErrors(0);
        setOutcome({ kind: 'correct', assisted: true }); // reveal + advance
      }
      return;
    }
    // correct → record and advance after observation
    const actId = orderRef.current[idxRef.current];
    resultsRef.current = [...resultsRef.current, { activityId: actId, independent: !assisted, assisted, error: false }];
    setResults(resultsRef.current);
    setErrors(0);
    setFeedback(null);
    setOutcome({ kind: 'correct', assisted });
  }, [errors]);

  // After the 1st/2nd error, remount the child so the child can retry (§6 retry).
  useEffect(() => {
    if (errors === 1 || errors === 2) {
      const t = window.setTimeout(() => {
        setAttemptSeq((s) => s + 1);
        setOutcome({ kind: 'idle' });
      }, 900);
      return () => window.clearTimeout(t);
    }
  }, [errors]);

  const idxRef = useRef(0);
  useEffect(() => {
    idxRef.current = idx;
  }, [idx]);

  // ---- advance when outcome is correct after a beat to let child observe ----
  useEffect(() => {
    if (outcome.kind === 'correct') {
      const t = window.setTimeout(() => {
        if (idxRef.current + 1 >= orderRef.current.length) {
          void finishRun();
        } else {
          setIdx((i) => i + 1);
          setAttemptSeq((s) => s + 1);
        }
        setOutcome({ kind: 'idle' });
      }, 1400);
      return () => window.clearTimeout(t);
    }
  }, [outcome]);

  // ---- finish: save lesson progress + sticker; separate progress from rewards ----
  const finishRun = useCallback(async () => {
    setPhase('finish');
    const all = resultsRef.current;
    const region = await loadRegion(regionId);
    const ls = region.lessons.find((l) => l.id === lessonId);
    if (!ls) return;

    if (storageOk) {
      // §6: completing 6 enables next lesson; no perfection required
      await saveLessonProgress({ lessonId, profileId, completed: true, lastCompletedAt: Date.now(), independentCount: all.filter((r) => r.independent).length });
      const sticker = `sticker-${lessonId}`;
      await addSticker(profileId, sticker, Date.now()); // no dup (§6)
      setStickerEarned(true);

      // skill progress; separate learning data from rewards (§2)
      for (const r of all) {
        const a = ls.activities.find((x) => x.id === r.activityId);
        if (!a) continue;
        for (const skillId of a.skillIds) {
          const list = await getSkillProgress(profileId);
          const cur = list.find((s) => s.skillId === skillId);
          const last5 = [...(cur?.last5 ?? [])];
          last5.push(r.independent);
          while (last5.length > 5) last5.shift();
          await saveSkillProgress({
            skillId, profileId,
            independent: (cur?.independent ?? 0) + (r.independent ? 1 : 0),
            assisted: (cur?.assisted ?? 0) + (r.assisted ? 1 : 0),
            errors: (cur?.errors ?? 0) + (r.error ? 1 : 0),
            last5,
            sessions: new Set([...(cur?.sessions ?? []), sessionId]),
          });
        }
      }

      // mark session consumed
      const s: Session = {
        id: sessionId, profileId, regionId, lessonId,
        activityOrder: orderRef.current, currentIndex: orderRef.current.length,
        startedAt: Date.now(), updatedAt: Date.now(),
      };
      await saveSessionProgress(profileId, s, []);
    }
  }, [profileId, regionId, lessonId, sessionId, storageOk]);

  if (!loaded || !activity) {
    return <div className="screen"><p>Cargando lección...</p></div>;
  }

  if (phase === 'finish') {
    return (
      <div className="screen" style={{ justifyContent: 'center', textAlign: 'center' }}>
        <h2>{messages.lessonComplete}</h2>
        {stickerEarned && (
          <div className="sticker-grid" aria-hidden="true">
            <span className="sticker">⭐</span>
          </div>
        )}
        <p className="muted">¡Luma encendió otra parte de la isla!</p>
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
          {order.map((_, i) => (
            <span key={i} className={`dot${i < idx ? ' done' : ''}`} aria-hidden="true" />
          ))}
        </div>
        <span aria-hidden="true" style={{ width: 48 }} />
      </div>

      {feedback && (
        <p className={`feedback ${feedback.kind}`} aria-live="polite">
          {feedback.text}
        </p>
      )}

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
