import { useMemo, useState } from 'react';
import type { BuildWordActivity } from '../content/types';
import PlayButton from '../components/PlayButton';

interface Props {
  activity: BuildWordActivity;
  muted: boolean;
  volume: number;
  play: (audioId: string) => void;
  onAnswered: (args: { correct: boolean; assisted: boolean }) => void;
}

interface Slot {
  tileId: string | null;
}

export default function BuildWord({ activity, muted, volume, play, onAnswered }: Props) {
  const solution = activity.solutionTileIds;
  const [slots, setSlots] = useState<Slot[]>(() => solution.map(() => ({ tileId: null })));
  const [history, setHistory] = useState<Slot[][]>([]);
  const [answered, setAnswered] = useState(false);
  const [state, setState] = useState<'idle' | 'correct' | 'wrong'>('idle');
  // map tileId -> slot index currently occupied
  const [pos, setPos] = useState<Record<string, number>>({});

  // tiles not yet placed, preserving original order
  const pool = useMemo(
    () => activity.tiles.filter((t) => !(t.id in pos)),
    [activity.tiles, pos],
  );

  const placeTile = (tileId: string) => {
    if (answered) return;
    const firstEmpty = slots.findIndex((s) => s.tileId === null);
    if (firstEmpty === -1) return;
    setHistory((h) => [...h, slots]);
    setSlots((s) => {
      const next = [...s];
      next[firstEmpty] = { tileId };
      return next;
    });
    setPos((p) => ({ ...p, [tileId]: firstEmpty }));
  };

  const moveSlot = (tileId: string, target: number) => {
    if (answered) return;
    const from = pos[tileId];
    if (from === undefined || from === target) return;
    if (slots[target].tileId !== null) return; // occupied
    setHistory((h) => [...h, slots]);
    setSlots((s) => {
      const next = [...s];
      next[from] = { tileId: null };
      next[target] = { tileId };
      return next;
    });
    setPos((p) => ({ ...p, [tileId]: target }));
  };

  const undo = () => {
    if (answered || history.length === 0) return;
    const prev = history[history.length - 1];
    setHistory((h) => h.slice(0, -1));
    setSlots(prev);
    setPos(buildPos(prev));
  };

  const clear = () => {
    if (answered) return;
    setHistory((h) => [...h, slots]);
    setSlots(solution.map(() => ({ tileId: null })));
    setPos({});
  };

  const confirm = () => {
    if (answered) return;
    const filled = slots.every((s) => s.tileId !== null);
    if (!filled) return;
    setAnswered(true);
    const correct = slots.every((s, i) => s.tileId === solution[i]);
    setState(correct ? 'correct' : 'wrong');
    onAnswered({ correct, assisted: false });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
      <PlayButton audioId={activity.stimulusAudioId} label="escuchar" muted={muted} volume={volume} play={play} />
      {activity.imageId && <img src={`./images/${activity.imageId}.svg`} alt="" width={110} aria-hidden="true" />}

      {/* target slots */}
      <div className="row" style={{ marginTop: 16, minHeight: 64 }}>
        {slots.map((s, i) => (
          <button
            key={i}
            className="card"
            style={{ width: 68, height: 64, fontSize: 26 }}
            onClick={() => s.tileId && moveSlot(s.tileId, i)}
            aria-label={s.tileId ? `posición ${i + 1}: ${s.tileId}` : `ranura ${i + 1} vacía`}
            aria-hidden={false}
          >
            {s.tileId ? activity.tiles.find((t) => t.id === s.tileId)?.text ?? '' : ''}
          </button>
        ))}
      </div>

      {/* tile pool */}
      <div className="row" style={{ marginTop: 20 }}>
        {pool.map((t) => (
          <button
            key={t.id}
            className="card"
            style={{ width: 68, height: 64, fontSize: 26 }}
            onClick={() => placeTile(t.id)}
            aria-label={t.text}
          >
            {t.text}
          </button>
        ))}
      </div>

      {/* actions */}
      <div className="row" style={{ marginTop: 20 }}>
        <button className={`btn${answered && state === 'correct' ? '' : ''}`} onClick={undo} disabled={answered}>
          Deshacer
        </button>
        <button className="btn secondary" onClick={clear} disabled={answered}>
          Borrar
        </button>
        <button className="btn" onClick={confirm} disabled={answered || !slots.every((s) => s.tileId !== null)}>
          Listo
        </button>
      </div>

      {/* after answer, show the full word */}
      {answered && (
        <p className="word" style={{ fontSize: 44, fontWeight: 800, letterSpacing: '0.1em', marginTop: 12 }}>
          {activity.word}
        </p>
      )}
    </div>
  );
}

function buildPos(slots: { tileId: string | null }[]): Record<string, number> {
  const p: Record<string, number> = {};
  slots.forEach((s, i) => {
    if (s.tileId) p[s.tileId] = i;
  });
  return p;
}
