import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { BUILTIN_COMMAND_PANELS } from "../src/builtin-command-panels";
import { commandPanelState } from "../src/command-panel";
import { createDefaultProfile } from "../src/default-profile";
import { BUILTIN_DRILLS, getRequiredActions, hotkeyStep } from "../src/drills";
import { actionsForStringIds, getHotkeyAction, HOTKEY_ACTIONS } from "../src/hotkey-actions";
import { getDrillTargetTimeMs } from "../src/trainer";

describe("built-in drill", () => {
  it("calculates total time as the sum of sequence targets for each difficulty", () => {
    const drill = BUILTIN_DRILLS[0];
    expect(getDrillTargetTimeMs(drill!, 0)).toBe(
      drill!.sequences.reduce((sum, sequence) => sum + sequence.targetTimeMs[0], 0),
    );
    expect(getDrillTargetTimeMs(drill!, 6)).toBe(
      drill!.sequences.reduce((sum, sequence) => sum + sequence.targetTimeMs[6], 0),
    );
  });

  it("ends every building-placement sequence with a left click anywhere", () => {
    const placementSteps = BUILTIN_DRILLS[0]?.sequences.map((sequence) => sequence.steps.at(-1));
    expect(placementSteps).toHaveLength(21);
    expect(placementSteps?.every((step) =>
      step?.type === "click" && step.label === "Left click anywhere"
    )).toBe(true);
  });

  it("starts only the final four building sequences by selecting a villager", () => {
    const drill = BUILTIN_DRILLS[0];
    const simpleSequences = drill?.sequences.slice(0, -4) ?? [];
    const villagerSequences = drill?.sequences.slice(-4) ?? [];

    expect(simpleSequences.every((sequence) =>
      sequence.steps[0]?.type === "hotkey"
      && sequence.steps[0].action.startsWith("open_")
    )).toBe(true);
    expect(villagerSequences.map((sequence) => sequence.name)).toEqual([
      "Stable",
      "Stone Wall",
      "Town Center",
      "University",
    ]);
    expect(villagerSequences.every((sequence) =>
      sequence.steps[0]?.type === "hotkey" && sequence.steps[0].action === "select_villager"
    )).toBe(true);
  });

  it("includes one permanent built-in drill for every captured building and unit panel", () => {
    expect(BUILTIN_DRILLS).toHaveLength(2 + BUILTIN_COMMAND_PANELS.length);
    expect(BUILTIN_COMMAND_PANELS).toHaveLength(22);
    expect(BUILTIN_DRILLS.slice(2).map((drill) => drill.id)).toEqual(
      BUILTIN_COMMAND_PANELS.map((panel) => panel.drillId),
    );

    for (const [index, panel] of BUILTIN_COMMAND_PANELS.entries()) {
      const drill = BUILTIN_DRILLS[index + 2];
      expect(drill).toMatchObject({
        description: panel.description,
        id: panel.drillId,
        name: panel.name,
      });
      expect(drill?.sequences.map((sequence) => sequence.steps[0])).toEqual(
        panel.entries.map((entry) => ({
          action: entry.action,
          label: entry.label,
          type: "hotkey",
        })),
      );
      for (const sequence of drill?.sequences ?? []) {
        expect(commandPanelState({ ...sequence, steps: [...sequence.steps] }, 0)?.menu)
          .toBe(panel.id);
      }
      expect(getDrillTargetTimeMs(drill!, 0)).toBe(
        drill!.sequences.reduce((sum, sequence) => sum + sequence.targetTimeMs[0], 0),
      );
    }
  });

  it("repeats Palisade and Stone Wall placement five times each", () => {
    const drill = BUILTIN_DRILLS.find((candidate) => candidate.id === "quick-walling");
    expect(drill).toMatchObject({
      name: "Quick Walling",
    });
    expect(drill?.sequences).toHaveLength(10);
    expect(drill?.sequences.filter((sequence) => sequence.name.startsWith("Palisade Wall"))).toHaveLength(5);
    expect(drill?.sequences.filter((sequence) => sequence.name.startsWith("Stone Wall"))).toHaveLength(5);
    for (const sequence of drill?.sequences ?? []) {
      expect(sequence.steps.map((step) => step.type)).toEqual(["hotkey", "hotkey", "click"]);
      expect(sequence.steps.at(-1)?.label).toBe("Place wall");
    }
  });

  it("maps every captured command-panel action in the default profile", () => {
    const profile = createDefaultProfile();
    const actions = new Set(
      BUILTIN_COMMAND_PANELS.flatMap((panel) => panel.entries.map((entry) => entry.action)),
    );

    for (const action of actions) {
      const definition = getHotkeyAction(action);
      expect(definition, action).toBeDefined();
      expect(profile.bindings.get(definition!.stringId), action).toBeDefined();
    }
  });

  it("provides the complete named action catalogue and common selection actions", () => {
    expect(HOTKEY_ACTIONS.size).toBeGreaterThanOrEqual(500);
    expect(getHotkeyAction("select_all_stables")).toMatchObject({ stringId: 19016 });
    expect(getHotkeyAction("select_all_town_centers")).toMatchObject({ stringId: 19021 });
  });

  it("gives every searchable action a unique context-aware label", () => {
    const actions = [...HOTKEY_ACTIONS.values()];
    const normalizedLabels = actions.map((action) => action.label.trim().toLowerCase());

    expect(new Set(normalizedLabels).size).toBe(normalizedLabels.length);
    expect(getHotkeyAction("hotkey_19043")?.label).toBe("Skirmisher — Archery Range");
    expect(getHotkeyAction("hotkey_19179")?.label).toBe("Skirmisher — Settlement");
    expect(getHotkeyAction("hotkey_19087")?.label).toBe("Zoom In — Mouse wheel");
    expect(getHotkeyAction("hotkey_19089")?.label).toBe("Zoom In — Keyboard");
  });

  it("supports dynamic numeric action IDs and rejects malformed IDs", () => {
    expect(getHotkeyAction("hotkey_999999")).toEqual({
      id: "hotkey_999999",
      label: "Hotkey action 999999",
      stringId: 999999,
    });
    expect(getHotkeyAction("not-an-action")).toBeUndefined();
    expect(getHotkeyAction("hotkey_0")).toBeUndefined();
    expect(getHotkeyAction("hotkey_999999999999999999999")).toBeUndefined();

    const actions = actionsForStringIds([999999, 999999, 1]);
    expect(actions.filter((action) => action.stringId === 999999)).toHaveLength(1);
  });

  it("deduplicates required actions and ignores unsupported IDs", () => {
    const drill = {
      id: "requirements",
      name: "Requirements",
      description: "Test",
      sequences: [{
        id: "one",
        name: "One",
        startingSelection: { type: "none" as const },
        targetTimeMs: [1, 1, 1, 1, 1, 1, 1] as const,
        steps: [
          { type: "hotkey" as const, action: "select_villager", label: "Select" },
          { type: "hotkey" as const, action: "select_villager", label: "Select" },
          { type: "hotkey" as const, action: "invalid", label: "Invalid" },
          { type: "click" as const, label: "Click" },
        ],
      }],
    };
    expect(getRequiredActions(drill).map((action) => action.id)).toEqual(["select_villager"]);
    expect(() => hotkeyStep("invalid")).toThrow("Unknown hotkey action");
  });

  it("uses current installed-game labels for newer profile actions", () => {
    const actions = actionsForStringIds([419232]);
    expect(actions).toContainEqual({
      id: "hotkey_419232",
      label: "Scenario 13: Hire Cavalry",
      stringId: 419232,
    });
    expect(actions.length).toBeGreaterThanOrEqual(630);
  });

  it("loads the complete reset default profile instead of a small manual subset", () => {
    const profile = createDefaultProfile();
    const actions = actionsForStringIds(profile.bindings.keys());

    expect(profile.bindings.size).toBeGreaterThan(600);
    expect(actions.length).toBeGreaterThan(600);
    expect(profile.bindings.get(19021)).toBeDefined();
  });

  it("stores only generated functional bindings, not embedded profile binaries", () => {
    const source = readFileSync("src/default-profile.ts", "utf8");

    expect(source).toContain("Generated by npm run generate:default-profile");
    expect(source).not.toMatch(/\b(?:BASE|HOTKEYS)_HKP\b|atob\s*\(/);
    expect(source).not.toMatch(/[A-Za-z0-9+/]{200,}={0,2}/);
  });
});
