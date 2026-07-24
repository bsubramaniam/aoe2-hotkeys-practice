export const DIFFICULTIES = [
  "Easiest",
  "Standard",
  "Moderate",
  "Hard",
  "Hardest",
  "Extreme",
  "Pro",
] as const;

export type Difficulty = (typeof DIFFICULTIES)[number];
export type FailureHandling = "wait" | "restart_sequence";

export interface HotkeyStep {
  type: "hotkey";
  action: string;
  label: string;
  tip?: string;
  onFailure: FailureHandling;
}

export interface ClickStep {
  type: "click";
  label: string;
  tip?: string;
  onFailure: FailureHandling;
}

export type Step = HotkeyStep | ClickStep;

export interface SequenceTemplate {
  id: string;
  name: string;
  steps: ReadonlyArray<Step>;
  targetTimeMs: readonly [number, number, number, number, number, number, number];
}

export interface Sequence {
  id: string;
  name: string;
  steps: Step[];
  targetTimeMs: SequenceTemplate["targetTimeMs"];
}

export interface Drill {
  id: string;
  name: string;
  description: string;
  totalTimeMs: number;
  sequences: SequenceTemplate[];
}

export interface SequenceResult {
  id: string;
  name: string;
  elapsedMs: number;
  targetMs: number;
  metTarget: boolean;
}

export type SessionStatus = "running" | "paused" | "finished";
export type FinishReason = "time" | "complete" | "exit" | null;

export interface Session {
  drill: Drill;
  difficultyIndex: number;
  status: SessionStatus;
  finishReason: FinishReason;
  startedAt: number;
  pausedAt: number | null;
  drillPausedMs: number;
  sequenceStartedAt: number;
  sequencePausedMs: number;
  currentSequence: Sequence;
  currentSequenceIndex: number;
  stepIndex: number;
  correctTries: number;
  totalTries: number;
  results: SequenceResult[];
}
