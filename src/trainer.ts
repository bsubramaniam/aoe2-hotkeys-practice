import type { Drill, Sequence, SequenceTemplate, Session, Step } from "./types";

function sequenceAt(drill: Drill, index: number): { sequence: Sequence; index: number } {
  if (drill.sequences.length === 0) {
    throw new Error("A drill must contain at least one sequence.");
  }
  const template = drill.sequences[index];
  if (!template) throw new Error("Unable to select a drill sequence.");
  return { sequence: materializeSequence(template), index };
}

function materializeSequence(template: SequenceTemplate): Sequence {
  const steps: Step[] = template.steps.map((step) =>
    step.type === "click"
      ? { ...step, label: "Left click anywhere" }
      : { ...step }
  );

  return {
    id: template.id,
    name: template.name,
    startingSelection: template.startingSelection,
    steps,
    targetTimeMs: template.targetTimeMs,
  };
}

export function getDrillTargetTimeMs(drill: Drill, difficultyIndex: number): number {
  return drill.sequences.reduce((total, sequence) => {
    const target = sequence.targetTimeMs[difficultyIndex];
    if (target === undefined) {
      throw new Error("The selected difficulty has no target time.");
    }
    return total + target;
  }, 0);
}

export function createSession(
  drill: Drill,
  difficultyIndex: number,
  now: number,
): Session {
  const selected = sequenceAt(drill, 0);
  return {
    drill,
    difficultyIndex,
    status: "running",
    finishReason: null,
    startedAt: now,
    pausedAt: null,
    drillPausedMs: 0,
    sequenceStartedAt: now,
    sequencePausedMs: 0,
    currentSequence: selected.sequence,
    currentSequenceIndex: selected.index,
    stepIndex: 0,
    correctTries: 0,
    totalTries: 0,
    results: [],
  };
}

export function getDrillElapsedMs(session: Session, now: number): number {
  const currentPause = session.pausedAt === null ? 0 : now - session.pausedAt;
  return Math.max(0, now - session.startedAt - session.drillPausedMs - currentPause);
}

export function getSequenceElapsedMs(session: Session, now: number): number {
  const currentPause = session.pausedAt === null ? 0 : now - session.pausedAt;
  return Math.max(0, now - session.sequenceStartedAt - session.sequencePausedMs - currentPause);
}

export function tickSession(session: Session, now: number): Session {
  if (
    session.status === "finished"
    || getDrillElapsedMs(session, now) < getDrillTargetTimeMs(session.drill, session.difficultyIndex)
  ) {
    return session;
  }
  return { ...session, status: "finished", finishReason: "time", pausedAt: null };
}

export function togglePause(session: Session, now: number): Session {
  if (session.status === "finished") {
    return session;
  }
  if (session.status === "running") {
    return { ...session, status: "paused", pausedAt: now };
  }
  if (session.pausedAt === null) {
    return session;
  }
  const pauseDuration = now - session.pausedAt;
  return {
    ...session,
    status: "running",
    pausedAt: null,
    drillPausedMs: session.drillPausedMs + pauseDuration,
    sequencePausedMs: session.sequencePausedMs + pauseDuration,
  };
}

export function exitSession(session: Session): Session {
  return { ...session, status: "finished", finishReason: "exit", pausedAt: null };
}

export function submitAttempt(
  session: Session,
  correct: boolean,
  now: number,
): Session {
  if (session.status !== "running") {
    return session;
  }

  const activeStep = session.currentSequence.steps[session.stepIndex];
  if (!activeStep) {
    return session;
  }

  const attempted: Session = {
    ...session,
    totalTries: session.totalTries + 1,
    correctTries: session.correctTries + (correct ? 1 : 0),
  };

  if (!correct) {
    return attempted;
  }

  const nextStepIndex = session.stepIndex + 1;
  if (nextStepIndex < session.currentSequence.steps.length) {
    return { ...attempted, stepIndex: nextStepIndex };
  }

  const elapsedMs = getSequenceElapsedMs(session, now);
  const targetMs = session.currentSequence.targetTimeMs[session.difficultyIndex];
  if (targetMs === undefined) {
    throw new Error("The selected difficulty has no target time.");
  }
  const result = {
    id: session.currentSequence.id,
    name: session.currentSequence.name,
    elapsedMs,
    targetMs,
    metTarget: elapsedMs <= targetMs,
  };
  const nextIndex = session.currentSequenceIndex + 1;
  if (nextIndex >= session.drill.sequences.length) {
    return {
      ...attempted,
      status: "finished",
      finishReason: "complete",
      pausedAt: null,
      stepIndex: 0,
      results: [...session.results, result],
    };
  }
  const selected = sequenceAt(session.drill, nextIndex);

  return {
    ...attempted,
    currentSequence: selected.sequence,
    currentSequenceIndex: selected.index,
    stepIndex: 0,
    sequenceStartedAt: now,
    sequencePausedMs: 0,
    results: [
      ...session.results,
      result,
    ],
  };
}
