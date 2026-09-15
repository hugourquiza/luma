import { useState } from 'react';
import type { ReadRelateActivity } from '../content/types';

interface Props {
  activity: ReadRelateActivity;
  muted: boolean;
  volume: number;
  play: (audioId: string) => void;
  onAnswered: (args: { correct: boolean; assisted: boolean }) => void;
}

export default function ReadRelate({ activity, onAnswered }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [state, setState] = useState<'idle' | 'correct' | 'wrong'>('idle');
  const [answered, setAnswered] = useState(false);
  const [usedAssist, setUsedAssist] = useState(false);

  const check = (choiceId: string) => {
    if (answered) return;
    setSelectedId(choiceId);
    setAnswered(true);
    const c = activity.choices.find((x) => x.id === choiceId);
    const correct = !!c?.correct;
    setState(correct ? 'correct' : 'wrong');
    onAnswered({ correct, assisted: usedAssist });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
      <div className="word" style={{ fontSize: 44, fontWeight: 800, letterSpacing: '0.12em' }}>
        {activity.targetText}
      </div>
      {activity.sceneText && <p className="muted">{activity.sceneText}</p>}

      <button
        className="btn ghost"
        onClick={() => {
          setUsedAssist(true);
          // Reading assist reads the target (§5.3); this marks the answer assisted.
        }}
        aria-label="Ayuda: leer la palabra"
      >
        Ayuda
      </button>

      <div className="choices">
        {activity.choices.map((c) => (
          <button
            key={c.id}
            className={`card${selectedId === c.id && state === 'correct' ? ' correct' : ''}${
              selectedId === c.id && state === 'wrong' ? ' incorrect' : ''
            }`}
            onClick={() => check(c.id)}
            aria-pressed={selectedId === c.id}
          >
            {c.imageId ? <img src={`./images/${c.imageId}.svg`} alt="" aria-hidden="true" /> : null}
          </button>
        ))}
      </div>
      {(state === 'correct' || state === 'wrong') && (
        <p className={`feedback ${state === 'correct' ? 'good' : 'bad'}`} aria-live="polite">
          {state === 'correct' ? '¡Muy bien!' : 'Probemos otra vez'}
        </p>
      )}
    </div>
  );
}
