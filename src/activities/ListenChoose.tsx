import { useRef, useState } from 'react';
import type { ListenChooseActivity } from '../content/types';
import PlayButton from '../components/PlayButton';

interface Props {
  activity: ListenChooseActivity;
  muted: boolean;
  volume: number;
  play: (audioId: string) => void;
  onAnswered: (args: { correct: boolean; assisted: boolean }) => void;
}

export default function ListenChoose({ activity, muted, volume, play, onAnswered }: Props) {
  // one selection possible before feedback resolves; disable after answered
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [answered, setAnswered] = useState(false);
  const [state, setState] = useState<'idle' | 'correct' | 'wrong'>('idle');
  const busy = useRef(false);

  const pick = (choiceId: string) => {
    if (answered || busy.current) return;
    setSelectedId(choiceId);
    setAnswered(true);
    busy.current = true;
    const choice = activity.choices.find((c) => c.id === choiceId);
    const correct = !!choice?.correct;
    setState(correct ? 'correct' : 'wrong');
    // debounce double-click during feedback
    window.setTimeout(() => {
      busy.current = false;
      onAnswered({ correct, assisted: false });
    }, 250);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
      <PlayButton
        audioId={activity.stimulusAudioId}
        label="escuchar"
        muted={muted}
        volume={volume}
        play={play}
        big
      />
      <div className="choices one">
        {activity.choices.map((c) => (
          <button
            key={c.id}
            className={`card${selectedId === c.id && state === 'correct' ? ' correct' : ''}${
              selectedId === c.id && state === 'wrong' ? ' incorrect' : ''
            }`}
            onClick={() => pick(c.id)}
            aria-pressed={selectedId === c.id}
          >
            {c.imageId ? (
              <img src={`./images/${c.imageId}.svg`} alt="" aria-hidden="true" />
            ) : c.text ? (
              <span className="word">{c.text}</span>
            ) : null}
          </button>
        ))}
      </div>
    </div>
  );
}
