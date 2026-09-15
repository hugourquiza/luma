import { useMemo, useRef, useState } from 'react';
import type { WriteWordActivity } from '../content/types';
import PlayButton from '../components/PlayButton';
import { compareAnswer } from '../engine/normalize';

interface Props {
  activity: WriteWordActivity;
  muted: boolean;
  volume: number;
  play: (audioId: string) => void;
  onAnswered: (args: { correct: boolean; assisted: boolean }) => void;
}

export default function WriteWord({ activity, muted, volume, play, onAnswered }: Props) {
  const [value, setValue] = useState('');
  const [state, setState] = useState<'idle' | 'correct' | 'wrong' | 'accent'>('idle');
  const [answered, setAnswered] = useState(false);
  const [usedAssist, setUsedAssist] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // For 'complete' mode build a masked model, e.g. "PAPA_" with blank.
  const placeholder = useMemo(() => {
    if (activity.mode === 'copy') return '';
    if (activity.mode === 'complete' && activity.blankPattern) return activity.blankPattern.replace(/_/g, '  ');
    return '';
  }, [activity]);

  const confirm = () => {
    if (answered || value.trim() === '') return;
    setAnswered(true);
    const res = compareAnswer(value, activity.acceptedAnswers);
    if (res.ok) {
      setState('correct');
      onAnswered({ correct: true, assisted: usedAssist });
    } else if (res.onlyMissingAccent) {
      // §5.4: mostrar modelo, permitir corregir, registrar apoyo.
      setState('accent');
      setAnswered(false); // seguir permitiendo editar
      onAnswered({ correct: false, assisted: true });
    } else {
      setState('wrong');
      onAnswered({ correct: false, assisted: usedAssist });
    }
  };

  const completionChoices = activity.completionChoices ?? [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
      {activity.mode === 'dictation' && (
        <PlayButton audioId={activity.stimulusAudioId} label="escuchar" muted={muted} volume={volume} play={play} />
      )}
      {activity.mode !== 'dictation' && (
        <button className="btn ghost" onClick={() => setUsedAssist(true)} aria-label="Ayuda: ver el modelo">
          Ayuda
        </button>
      )}

      {activity.mode === 'copy' && activity.model && (
        <div className="word" style={{ fontSize: 40, fontWeight: 800, letterSpacing: '0.12em', marginBottom: 8 }}>
          {activity.model}
        </div>
      )}

      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        inputMode="text"
        style={{
          fontSize: 34,
          textAlign: 'center',
          letterSpacing: '0.15em',
          padding: '12px 16px',
          borderRadius: 14,
          border: `2px solid ${state === 'accent' ? 'orange' : state === 'wrong' ? 'var(--coral)' : 'var(--sand)'}`,
          width: '100%',
          maxWidth: 320,
          fontFamily: 'inherit',
          background: '#fff',
        }}
        aria-label="Escribí acá tu respuesta"
        disabled={answered}
      />

      {activity.mode === 'complete' && completionChoices.length > 0 && (
        <div className="row" style={{ marginTop: 10 }}>
          {completionChoices.map((ch, i) => (
            <button
              key={i}
              className="card"
              style={{ width: 52, height: 52 }}
              onClick={() => {
                // append the chosen letter to fill the blank (simple heuristic)
                if (value.includes('__') || /\s{2}/.test(value)) {
                  setValue((v) => v.replace(/\s{2}/, ` ${ch} `));
                }
              }}
              aria-label={`Letra ${ch}`}
            >
              {ch}
            </button>
          ))}
        </div>
      )}

      {state === 'accent' && (
        <p className="feedback bad" aria-live="assertive">
          Falta una tilde: mirá dónde va. {activity.model && <span>(modelo abajo)</span>}
        </p>
      )}

      <div className="row" style={{ marginTop: 20 }}>
        <button className="btn" onClick={confirm} disabled={answered}>
          Listo
        </button>
        {state === 'accent' && !answered && (
          <button className="btn secondary" onClick={() => { setState('idle'); setAnswered(false); }}>
            Corregir
          </button>
        )}
      </div>
    </div>
  );
}
