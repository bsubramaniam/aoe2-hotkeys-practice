import { describe, expect, it } from "vitest";

import { createSession, exitSession, getSequenceElapsedMs, submitAttempt, tickSession, togglePause } from "../src/trainer";
import type { Drill } from "../src/types";

const drill: Drill = {
  id: "test-drill",
  name: "Test drill",
  description: "Test",
  totalTimeMs: 10_000,
  sequences: [{
    id: "test-sequence",
    name: "Test sequence",
    targetTimeMs: [5_000, 4_000, 3_000, 2_500, 2_000, 1_500, 1_000],
    steps: [
      { type: "hotkey", action: "first", label: "First", onFailure: "wait" },
      { type: "hotkey", action: "second", label: "Second", onFailure: "restart_sequence" },
    ],
  }],
};

describe("trainer session", () => {
  it("waits on the same step when wait handling fails", () => {
    const session = createSession(drill, 2, 0);
    const failed = submitAttempt(session, false, 500);

    expect(failed.stepIndex).toBe(0);
    expect(failed.totalTries).toBe(1);
    expect(failed.correctTries).toBe(0);
  });

  it("restarts the sequence after a restart_sequence failure", () => {
    let session = createSession(drill, 2, 0);
    session = submitAttempt(session, true, 300);
    expect(session.stepIndex).toBe(1);

    session = submitAttempt(session, false, 700);
    expect(session.stepIndex).toBe(0);
    expect(session.totalTries).toBe(2);
  });

  it("records sequence time against the selected target", () => {
    let session = createSession(drill, 2, 0);
    session = submitAttempt(session, true, 500);
    session = submitAttempt(session, true, 2_500);

    expect(session.results).toHaveLength(1);
    expect(session.results[0]).toMatchObject({ elapsedMs: 2_500, targetMs: 3_000, metTarget: true });
    expect(session.stepIndex).toBe(0);
    expect(session.status).toBe("finished");
    expect(session.finishReason).toBe("complete");
  });

  it("runs authored sequences once in order and stops after the final sequence", () => {
    const orderedDrill: Drill = {
      ...drill,
      sequences: [
        { ...drill.sequences[0]!, id: "first", name: "First" },
        { ...drill.sequences[0]!, id: "second", name: "Second" },
      ],
    };
    let session = createSession(orderedDrill, 2, 0);
    expect(session.currentSequence.id).toBe("first");

    session = submitAttempt(session, true, 100);
    session = submitAttempt(session, true, 200);
    expect(session.currentSequence.id).toBe("second");
    expect(session.status).toBe("running");

    session = submitAttempt(session, true, 300);
    session = submitAttempt(session, true, 400);
    expect(session.status).toBe("finished");
    expect(session.finishReason).toBe("complete");
    expect(session.results.map((result) => result.id)).toEqual(["first", "second"]);
  });

  it("excludes paused time from drill and sequence timers", () => {
    let session = createSession(drill, 2, 0);
    session = togglePause(session, 1_000);
    session = togglePause(session, 4_000);

    expect(getSequenceElapsedMs(session, 5_000)).toBe(2_000);
    expect(tickSession(session, 12_000).status).toBe("running");
    expect(tickSession(session, 13_000).status).toBe("finished");
  });

  it("covers finished, idle, invalid, and click-label normalization branches", () => {
    expect(() => createSession({ ...drill, sequences: [] }, 0, 0)).toThrow("at least one sequence");

    const session = createSession(drill, 0, 0);
    expect(tickSession(session, 100)).toBe(session);
    const exited = exitSession(session);
    expect(exited.finishReason).toBe("exit");
    expect(tickSession(exited, 20_000)).toBe(exited);
    expect(togglePause(exited, 1)).toBe(exited);
    expect(submitAttempt(exited, true, 1)).toBe(exited);

    const pausedWithoutTime = { ...session, status: "paused" as const, pausedAt: null };
    expect(togglePause(pausedWithoutTime, 2)).toBe(pausedWithoutTime);
    const noStep = { ...session, currentSequence: { ...session.currentSequence, steps: [] } };
    expect(submitAttempt(noStep, true, 1)).toBe(noStep);
    expect(() => submitAttempt({ ...session, difficultyIndex: 99, stepIndex: 1 }, true, 1)).toThrow("no target time");

    const clickDrill: Drill = {
      ...drill,
      sequences: [{
        ...drill.sequences[0]!,
        steps: [{ type: "click", label: "Confirm", onFailure: "wait" }],
      }],
    };
    expect(createSession(clickDrill, 0, 0).currentSequence.steps[0]).toEqual({
      type: "click",
      label: "Left click anywhere",
      onFailure: "wait",
    });
  });
});
