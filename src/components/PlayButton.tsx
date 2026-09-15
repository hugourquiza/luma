// Reusable play/repeat audio button (§5.1, §5.4). Triggers a user gesture to
// unlock playback on that action.
interface Props {
  audioId?: string;
  label?: string;
  big?: boolean;
  muted: boolean;
  volume: number;
  play: (audioId: string) => void;
}

export default function PlayButton({ audioId, label = 'Escuchar', big, muted, play }: Props) {
  if (!audioId) return null;
  return (
    <button
      className={`btn${big ? ' big' : ''}`}
      onClick={() => play(audioId)}
      disabled={muted}
      aria-label={label}
    >
      {muted ? '🔇' : '🔊'} {label || ''}
    </button>
  );
}
