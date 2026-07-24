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

export interface HotkeyStep {
  type: "hotkey";
  action: string;
  label: string;
  tip?: string;
}

export interface ClickStep {
  type: "click";
  label: string;
  tip?: string;
}

export type Step = HotkeyStep | ClickStep;

export type BuildingSelectionId =
  | "archery-range"
  | "barracks"
  | "blacksmith"
  | "castle"
  | "dock"
  | "gate"
  | "lumber-camp"
  | "market"
  | "mill"
  | "mining-camp"
  | "monastery"
  | "siege-workshop"
  | "stable"
  | "town-center"
  | "university";

export type UnitSelectionId =
  | "archer"
  | "cavalry"
  | "fishing-ship"
  | "infantry"
  | "monk"
  | "siege-unit"
  | "trade-cog"
  | "transport-ship"
  | "trebuchet"
  | "villager";

export type StartingSelection =
  | { type: "none" }
  | { type: "building"; id: BuildingSelectionId }
  | { type: "unit"; id: UnitSelectionId };

export interface SequenceTemplate {
  id: string;
  name: string;
  startingSelection: StartingSelection;
  steps: ReadonlyArray<Step>;
  targetTimeMs: readonly [number, number, number, number, number, number, number];
}

export interface Sequence {
  id: string;
  name: string;
  startingSelection: StartingSelection;
  steps: Step[];
  targetTimeMs: SequenceTemplate["targetTimeMs"];
}

export interface Drill {
  id: string;
  name: string;
  description: string;
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
