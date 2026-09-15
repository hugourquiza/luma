// Activity dispatcher — renders the six mechanics (§5) with feedback handling.
import type { Activity } from '../content/types';
import ListenChoose from './ListenChoose';
import BuildWord from './BuildWord';
import ReadRelate from './ReadRelate';
import WriteWord from './WriteWord';
import TraceLetter from './TraceLetter';
import SentenceStory from './SentenceStory';

export type Feedback = { kind: 'good' | 'bad' | 'hint' | 'solution'; message?: string };

export interface ActivityHandle {
  /** Report a confirmed answer. Returns 'resolved' when the activity is done. */
  onResult: (outcome: 'independent' | 'assisted' | 'error', retries: number, assists: number) => void;
}

// Each sub-component receives: activity, settings (muted/volume), and a
// resolver that the lesson runner plugs into global feedback/retry flow.

interface ActivityProps {
  activity: Activity;
  muted: boolean;
  volume: number;
  /** Ask the parent to show feedback and coordinate retry. */
  onAnswered: (args: {
    correct: boolean;
    assisted: boolean;
    /** optional spoken confirmation already handled */
    reveal?: boolean;
  }) => void;
  /** Ask to play an audioId (managed by runner for gesture-gating). */
  play: (audioId: string) => void;
}

export default function ActivityRenderer({ activity, ...rest }: ActivityProps) {
  switch (activity.type) {
    case 'listen-choose':
      return <ListenChoose activity={activity} {...rest} />;
    case 'build-word':
      return <BuildWord activity={activity} {...rest} />;
    case 'read-relate':
      return <ReadRelate activity={activity} {...rest} />;
    case 'write-word':
      return <WriteWord activity={activity} {...rest} />;
    case 'trace-letter':
      return <TraceLetter activity={activity} {...rest} />;
    case 'sentence-story':
      return <SentenceStory activity={activity} {...rest} />;
    default:
      return <p>Actividad desconocida</p>;
  }
}
