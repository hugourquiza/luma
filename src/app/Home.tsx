import { messages } from '../i18n/messages';

interface Props {
  onPlay: () => void;
  onAdult: () => void;
}

export default function Home({ onPlay, onAdult }: Props) {
  return (
    <div className="screen">
      <div style={{ fontSize: 84, marginTop: 20 }} aria-hidden="true">🏝️</div>
      <h1>Isla de las Letras</h1>
      <p className="muted" style={{ textAlign: 'center', maxWidth: 460 }}>
        Ayudá a Luma, la luciérnaga, a iluminar la isla palabra por palabra.
      </p>
      <button className="btn big" onClick={onPlay} style={{ marginTop: 24 }}>
        {messages.play}
      </button>
      <div className="spacer" />
      <button className="btn ghost" onClick={onAdult} style={{ marginTop: 8 }}>
        {messages.forAdults}
      </button>
    </div>
  );
}
