import { useState } from 'react';
import type { SentenceStoryActivity } from '../content/types';

interface Props {
  activity: SentenceStoryActivity;
  muted: boolean;
  volume: number;
  play: (audioId: string) => void;
  onAnswered: (args: { correct: boolean; assisted: boolean }) => void;
}

export default function SentenceStory({ activity, play, onAnswered }: Props) {
  const [assisted, setAssisted] = useState(false);
  const [answered, setAnswered] = useState(false);
  const [state, setState] = useState<'idle' | 'correct' | 'wrong'>('idle');
  // order state
  const [selected, setSelected] = useState<string[]>([]);
  const [pool, setPool] = useState(() => (activity.kind === 'order' ? activity.wordTiles : []));
  const [writeVal, setWriteVal] = useState('');

  const onAssist = () => {
    setAssisted(true);
    if (activity.storyAudioId) play(activity.storyAudioId);
  };

  // ---- order ----
  const tapWord = (tileId: string) => {
    if (answered) return;
    // remove if already selected → return to pool
    if (selected.includes(tileId)) {
      setSelected((s) => s.filter((x) => x !== tileId));
      setPool((p) => [...p, activity.wordTiles.find((t) => t.id === tileId)!]);
      return;
    }
    setSelected((s) => [...s, tileId]);
    const tile = activity.wordTiles.find((t) => t.id === tileId)!;
    setPool((p) => p.filter((t) => t.id !== tileId));
    void tile;
  };
  const confirmOrder = () => {
    if (answered) return;
    if (selected.length !== activity.solutionWordIds.length) return;
    setAnswered(true);
    const correct = selected.every((id, i) => id === activity.solutionWordIds[i]);
    setState(correct ? 'correct' : 'wrong');
    onAnswered({ correct, assisted });
  };

  // ---- comprehension ----
  const pick = (choiceId: string) => {
    if (answered) return;
    setAnswered(true);
    const c = activity.choices?.find((x) => x.id === choiceId);
    const correct = !!c?.correct;
    setState(correct ? 'correct' : 'wrong');
    onAnswered({ correct, assisted });
  };

  // ---- write ----
  const confirmWrite = () => {
    if (answered || writeVal.trim() === '') return;
    setAnswered(true);
    const correct =
      writeVal.toLowerCase().replace(/\s+/g, '') === (activity.wordToWrite ?? '').toLowerCase();
    setState(correct ? 'correct' : 'wrong');
    onAnswered({ correct, assisted });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
      {activity.storyText && (
        <p className="muted" style={{ textAlign: 'center', maxWidth: 480 }}>{activity.storyText}</p>
      )}
      <button className="btn ghost" onClick={onAssist} aria-label="Escuchar la historia">
        Escuchar historia
      </button>

      {activity.kind === 'order' && (
        <>
          <div className="row" style={{ marginTop: 16, minHeight: 56, maxWidth: 500 }}>
            {selected.map((id) => (
              <button key={id} className="card" style={{ padding: '8px 14px', fontSize: 26 }} onClick={() => tapWord(id)} aria-label={`palabra`}>
                {activity.wordTiles.find((t) => t.id === id)?.text}
              </button>
            ))}
          </div>
          <div className="row" style={{ marginTop: 16 }}>
            {pool.map((t) => (
              <button key={t.id} className="card" style={{ padding: '8px 14px', fontSize: 26 }} onClick={() => tapWord(t.id)} aria-label={t.text}>
                {t.text}
              </button>
            ))}
          </div>
          <button className="btn" style={{ marginTop: 16 }} onClick={confirmOrder} disabled={selected.length !== activity.solutionWordIds.length || answered}>
            Listo
          </button>
        </>
      )}

      {activity.kind === 'comprehension' && (
        <>
          <p style={{ fontWeight: '700', textAlign: 'center' }}>{activity.question}</p>
          <div className="choices one">
            {activity.choices?.map((c) => (
              <button
                key={c.id}
                className={`card${state !== 'idle' && c.correct && state === 'correct' ? ' correct' : ''}${state !== 'idle' && !c.correct && state === 'wrong' && c.id === selected[0] ? ' incorrect' : ''}`}
                onClick={() => { setSelected([c.id]); pick(c.id); }}
                aria-pressed={selected[0] === c.id}
              >
                <span className="word">{c.text}</span>
              </button>
            ))}
          </div>
        </>
      )}

      {activity.kind === 'write' && (
        <>
          <input
            type="text"
            value={writeVal}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            onChange={(e) => setWriteVal(e.target.value)}
            placeholder="Escribí una palabra de la frase"
            aria-label="Escribí la palabra"
            style={{ fontSize: 34, textAlign: 'center', padding: '12px', borderRadius: 14, border: '2px solid var(--sand)', maxWidth: 320, fontFamily: 'inherit' }}
            disabled={answered}
          />
          <button className="btn" style={{ marginTop: 16 }} onClick={confirmWrite} disabled={answered}>
            Listo
          </button>
        </>
      )}

      {state !== 'idle' && (
        <p className={`feedback ${state === 'correct' ? 'good' : 'bad'}`} aria-live="polite">
          {state === 'correct' ? '¡Muy bien!' : 'Probemos otra vez'}
        </p>
      )}
    </div>
  );
}
