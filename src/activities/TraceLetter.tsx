import { useRef, useState } from 'react';
import type { TraceLetterActivity } from '../content/types';
import { evaluateTrace, type Point } from '../engine/trace';

interface Props {
  activity: TraceLetterActivity;
  muted: boolean;
  volume: number;
  play?: (audioId: string) => void;
  onAnswered: (args: { correct: boolean; assisted: boolean }) => void;
}

const VIEW = 200;

export default function TraceLetter({ activity, onAnswered }: Props) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [points, setPoints] = useState<Point[]>([]);
  const [drawing, setDrawing] = useState(false);
  const [state, setState] = useState<'idle' | 'correct' | 'wrong' | 'assist'>('idle');
  const [answered, setAnswered] = useState(false);
  const [assist, setAssist] = useState(false);

  // normalized coordinate from pointer event relative to canvas box
  const norm = (e: React.PointerEvent): Point => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height)),
    };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (answered) return;
    e.preventDefault();
    (canvasRef.current as HTMLDivElement).setPointerCapture(e.pointerId);
    setDrawing(true);
    setPoints([norm(e)]);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drawing || answered) return;
    e.preventDefault();
    setPoints((p) => [...p, norm(e)]);
  };
  const onPointerUp = (e: React.PointerEvent) => {
    if (!drawing) return;
    e.preventDefault();
    setDrawing(false);
    if ((e.target as HTMLElement).hasPointerCapture?.(e.pointerId)) {
      try { (e.target as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* ok */ }
    }
  };

  const check = () => {
    if (points.length === 0 || answered) return;
    setAnswered(true);
    // single-stroke model: combine all strokes into one ideal path for v1
    const ideal = activity.strokes.flatMap((s) => s.points);
    const res = evaluateTrace(points, ideal, assist ? { corridor: 0.14, startTolerance: 0.16 } : {});
    const ok = res.pass;
    // If assist mode is on, allow a more permissive pass but mark assisted.
    if (ok) {
      setState('correct');
      onAnswered({ correct: true, assisted: assist });
    } else {
      setState('wrong');
      onAnswered({ correct: false, assisted: assist });
    }
  };

  const reset = () => {
    setPoints([]);
    setAnswered(false);
    setState('idle');
  };

  const toSvgCoord = (p: Point) => ({ x: p.x * VIEW, y: p.y * VIEW });

  // ideal glyph for visual guide
  const guideStart = toSvgCoord(activity.start);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
      <div
        ref={canvasRef}
        className="trace-wrap"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        style={{ touchAction: 'none' }}
        role="application"
        aria-label={`Dibujá la letra ${activity.letter} en la zona de trazado`}
      >
        <svg viewBox={`0 0 ${VIEW} ${VIEW}`} className="trace-canvas">
          {/* guide glyph faint */}
          {activity.strokes.map((stroke, si) => (
            <path
              key={si}
              d={'M' + stroke.points.map((p) => `${p.x * VIEW} ${p.y * VIEW}`).join(' L')}
              fill="none"
              stroke="#E0D5C4"
              strokeWidth={assist ? 22 : 10}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}
          {/* start dot */}
          <circle cx={guideStart.x} cy={guideStart.y} r={6} fill="#FF6F61" />
          {/* direction arrows (first stroke) */}
          {activity.strokes[0]?.points.map((p, i) => {
            const next = activity.strokes[0].points[i + 1];
            if (!next) return null;
            const a = toSvgCoord(p);
            const b = toSvgCoord(next);
            return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#FF6F61" strokeWidth={2} strokeDasharray="2 4" opacity={0.6} />;
          })}
          {/* user strokes */}
          <polyline
            points={points.map((p) => `${p.x * VIEW},${p.y * VIEW}`).join(' ')}
            fill="none"
            stroke="#7CB342"
            strokeWidth={10}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>

      {state === 'wrong' && !answered && <p className="feedback bad">{activity.hint ?? 'Probemos otra vez'}</p>}
      {state === 'correct' && <p className="feedback good" aria-live="polite">¡Muy bien!</p>}
      {state === 'wrong' && answered && <p className="feedback bad" aria-live="polite">Probemos otra vez</p>}

      <div className="row" style={{ marginTop: 16 }}>
        <button className="btn ghost" onClick={reset} disabled={answered}>
          Borrar
        </button>
        <button
          className={`btn${assist ? ' secondary' : ''}`}
          onClick={() => setAssist((a) => !a)}
          disabled={answered}
          aria-pressed={assist}
        >
          {assist ? 'Practicar con ayuda' : 'Practicar con ayuda'}
        </button>
        <button className="btn" onClick={check} disabled={points.length === 0 || answered}>
          Listo
        </button>
      </div>

      {/* Accessible alternative (§5.5): a child or adult may skip tracing
          without blocking the path; recorded as assisted practice. */}
      <button
        className="btn ghost"
        style={{ marginTop: 12 }}
        onClick={() => {
          if (answered) return;
          setAnswered(true);
          setState('correct');
          onAnswered({ correct: true, assisted: true }); // assisted, never independent
        }}
        disabled={answered}
        aria-label="Omitir el trazado (practicar con ayuda)"
      >
        Omitir trazado
      </button>
    </div>
  );
}
