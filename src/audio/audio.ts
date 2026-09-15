// Audio playback manager (§8). Local bundled MP3/`audio-*` ids loaded on
// demand. No speechSynthesis for evaluated activities. Activates after a user
// gesture, handles play() rejection, single-at-a-time playback.

export type AudioState = {
  available: boolean; // audio actually playable in this browser
  muted: boolean;
  volume: number;
};

// Registry of local audio ids → resolved public URL.
// The build copies public/audio/*.mp3; ids map to those filenames.
const AUDIO_BASE = './audio/';

class AudioManager {
  private ctx: AudioContext | null = null;
  private state: AudioState = { available: typeof Audio !== 'undefined', muted: false, volume: 1 };
  private current: HTMLAudioElement | null = null;

  setState(state: Partial<AudioState>) {
    this.state = { ...this.state, ...state };
  }

  resume() {
    // Called from a user gesture to unlock autoplay-restricted context (§8).
    if (!this.state.available) return;
    try {
      const Ctor = (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext) as typeof AudioContext;
      if (!this.ctx) this.ctx = new Ctor();
      if (this.ctx.state === 'suspended') void this.ctx.resume();
    } catch {
      /* no audio context available */
    }
  }

  /** Map an audioId to a URL. audioId 'word-mapa' → './audio/word-mapa.mp3'. */
  url(audioId: string): string {
    return `${AUDIO_BASE}${audioId}.mp3`;
  }

  stop() {
    if (this.current) {
      this.current.pause();
      this.current.src = '';
      this.current = null;
    }
  }

  /**
   * Play a local audio id. Resolves true if playback started, false if it
   * failed (missing/unavailable audio). Never auto-plays the answer before
   * responding for evaluated reading/listening.
   */
  play(audioId: string): Promise<boolean> {
    if (!audioId) return Promise.resolve(false);
    if (!this.state.available || this.state.muted) return Promise.resolve(false);
    this.stop();
    return new Promise((resolve) => {
      const el = new Audio();
      this.current = el;
      const done = (ok: boolean) => {
        el.removeEventListener('ended', onEnd);
        el.removeEventListener('error', onErr);
        resolve(ok);
      };
      const onEnd = () => done(true);
      const onErr = () => done(false);
      el.addEventListener('ended', onEnd);
      el.addEventListener('error', onErr);
      el.volume = this.state.volume;
      el.src = this.url(audioId);
      el.load();
      // Note: play() may reject if user hasn't interacted; that's handled by
      // callers via a gesture-gated flow. We swallow the rejection here.
      el.play().catch(() => {
        // Try again on next user gesture — handled by resume()
        done(false);
      });
      // guard: if it loads and isn't playing immediately
      setTimeout(() => {
        if (!this.current || this.current === el) {
          // still fine either way
        }
      }, 0);
    });
  }

  /** Try to play; if unavailable resolve false without throwing. */
  tryPlay(audioId: string): Promise<boolean> {
    return this.play(audioId);
  }
}

export const audioManager = new AudioManager();
