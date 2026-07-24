import { describe, expect, it } from "vitest";

/* @vitest-environment jsdom */

import { BUILTIN_COMMAND_PANEL_BY_DRILL_ID } from "../src/builtin-command-panels";
import {
  commandPanelState,
  renderCommandPanel,
  renderSequenceTarget,
  sequenceTargetState,
} from "../src/command-panel";
import type { Sequence, Session } from "../src/types";

const targetTimeMs = [7000, 6000, 5000, 4000, 3000, 2000, 1000] as const;

function sequence(steps: Sequence["steps"]): Sequence {
  return {
    id: "test",
    name: "Test",
    steps,
    targetTimeMs,
  };
}

function session(currentSequence: Sequence, stepIndex: number, drillId = "villager-building-placement"): Session {
  return {
    correctTries: 0,
    currentSequence,
    currentSequenceIndex: 0,
    difficultyIndex: 0,
    drill: {
      description: "Test",
      id: drillId,
      name: "Test",
      sequences: [],
      totalTimeMs: 60_000,
    },
    drillPausedMs: 0,
    finishReason: null,
    pausedAt: null,
    results: [],
    sequencePausedMs: 0,
    sequenceStartedAt: 0,
    startedAt: 0,
    status: "running",
    stepIndex,
    totalTries: 0,
  };
}

describe("built-in command panel", () => {
  it("renders no selection followed by the villager menu", () => {
    const current = sequence([
      { type: "hotkey", action: "select_villager", label: "Select Villager", onFailure: "wait" },
      { type: "hotkey", action: "open_economic_buildings", label: "Economic Buildings", onFailure: "wait" },
    ]);

    expect(commandPanelState("villager-building-placement", current, 0)).toEqual({
      activeAction: null,
      entries: [],
      label: "No unit selected",
      menu: "none",
    });
    const root = commandPanelState("villager-building-placement", current, 1);
    expect(root).toMatchObject({
      activeAction: "open_economic_buildings",
      label: "Villager commands",
      menu: "villager",
    });
    expect(root?.entries.map((entry) => entry.slot)).toEqual([0, 1]);
  });

  it("keeps the selected economic building visible during placement", () => {
    const current = sequence([
      { type: "hotkey", action: "open_economic_buildings", label: "Economic Buildings", onFailure: "wait" },
      { type: "hotkey", action: "build_university", label: "University", onFailure: "restart_sequence" },
      { type: "click", label: "Place building", onFailure: "wait" },
    ]);

    const building = commandPanelState("villager-building-placement", current, 1);
    const placement = commandPanelState("villager-building-placement", current, 2);
    expect(building).toMatchObject({
      activeAction: "build_university",
      label: "Economic buildings",
      menu: "economic",
    });
    expect(building?.entries).toHaveLength(11);
    expect(building?.entries.find((entry) => entry.action === "build_university")?.slot).toBe(9);
    expect(placement).toEqual(building);
  });

  it("uses the fixed military slots and rejects unsupported contexts", () => {
    const current = sequence([
      { type: "hotkey", action: "open_military_buildings", label: "Military Buildings", onFailure: "wait" },
      { type: "hotkey", action: "build_castle", label: "Castle", onFailure: "restart_sequence" },
    ]);

    const military = commandPanelState("villager-building-placement", current, 1);
    expect(military).toMatchObject({
      activeAction: "build_castle",
      label: "Military buildings",
      menu: "military",
    });
    expect(military?.entries).toHaveLength(10);
    expect(military?.entries.find((entry) => entry.action === "build_castle")?.slot).toBe(12);
    expect(commandPanelState("custom-drill", current, 1)).toBeNull();
    expect(commandPanelState("villager-building-placement", current, 99)).toBeNull();
    expect(commandPanelState(
      "villager-building-placement",
      sequence([{ type: "click", label: "Click", onFailure: "wait" }]),
      0,
    )).toBeNull();
  });

  it("renders captured building and unit panels for their permanent built-in drills", () => {
    const barracks = BUILTIN_COMMAND_PANEL_BY_DRILL_ID.get("barracks-commands");
    const current = sequence([
      { type: "hotkey", action: "hotkey_19035", label: "Militia", onFailure: "restart_sequence" },
      { type: "click", label: "Continue", onFailure: "wait" },
    ]);

    expect(commandPanelState("barracks-commands", current, 0)).toEqual({
      activeAction: "hotkey_19035",
      entries: barracks?.entries,
      label: "Barracks Commands",
      menu: "barracks",
    });
    expect(commandPanelState("barracks-commands", current, 1)).toMatchObject({
      activeAction: "hotkey_19035",
      menu: "barracks",
    });
    expect(commandPanelState(
      "barracks-commands",
      sequence([{ type: "hotkey", action: "select_villager", label: "Select", onFailure: "wait" }]),
      0,
    )).toBeNull();

    const panel = renderCommandPanel(
      session(current, 0, "barracks-commands"),
      (action) => action === "hotkey_19035"
        ? [{ key: "Q", ctrl: false, alt: false, shift: false }]
        : [],
    );
    expect(panel?.classList.contains("command-panel--barracks")).toBe(true);
    expect(panel?.getAttribute("aria-label")).toContain("Barracks Commands");
    expect(panel?.querySelector(".command-tile--active kbd")?.textContent).toBe("Q");
  });

  it("maps the corrected Siege Workshop upgrades and archery icon", () => {
    const siege = BUILTIN_COMMAND_PANEL_BY_DRILL_ID.get("siege-workshop-commands");
    const archery = BUILTIN_COMMAND_PANEL_BY_DRILL_ID.get("archery-range-commands");

    expect(siege?.entries.find((entry) => entry.action === "hotkey_19475")).toMatchObject({
      label: "Tech: Capped, Siege Ram",
      slot: 5,
    });
    expect(siege?.entries.find((entry) => entry.action === "hotkey_19476")).toMatchObject({
      label: "Tech: (Siege) Onager, Heavy Rocket Cart",
      slot: 6,
    });
    expect(siege?.entries.find((entry) => entry.action === "hotkey_19047")).toMatchObject({
      label: "Traction Trebuchet",
      slot: 11,
    });
    expect(siege?.entries.find((entry) => entry.action === "hotkey_19477")).toMatchObject({
      label: "Tech: Heavy Scorpion",
      slot: 7,
    });
    expect(siege?.entries.some((entry) => entry.action === "hotkey_19146")).toBe(false);
    expect(archery?.entries.find((entry) => entry.action === "hotkey_19149")).toMatchObject({
      label: "Tech: Elite Bolas Rider",
      slot: 11,
    });
    expect(archery?.entries.some((entry) => entry.slot === 14)).toBe(false);
    expect(BUILTIN_COMMAND_PANEL_BY_DRILL_ID.get("castle-commands")?.entries.find(
      (entry) => entry.action === "hotkey_19084",
    )).toMatchObject({
      label: "Tech: Sappers",
      slot: 11,
    });

    const siegePanel = renderCommandPanel(
      session(
        sequence([{ type: "hotkey", action: "hotkey_19476", label: "Onager", onFailure: "wait" }]),
        0,
        "siege-workshop-commands",
      ),
      () => [{ key: "S", ctrl: false, alt: false, shift: false }],
    );
    const archeryPanel = renderCommandPanel(
      session(
        sequence([{ type: "hotkey", action: "hotkey_19149", label: "Elite", onFailure: "wait" }]),
        0,
        "archery-range-commands",
      ),
      () => [{ key: "D", ctrl: false, alt: false, shift: false }],
    );
    expect(siegePanel?.querySelector(".command-tile--slot-6 kbd")?.textContent).toBe("S");
    expect(archeryPanel?.querySelector(".command-tile--slot-11 kbd")?.textContent).toBe("D");
  });

  it("uses the Dravidian Dock commands and the shared Gate icon for rotation", () => {
    const dock = BUILTIN_COMMAND_PANEL_BY_DRILL_ID.get("dock-commands");
    expect(dock?.entries.find((entry) => entry.action === "hotkey_19002")).toMatchObject({
      label: "Set Gather Point",
      slot: 4,
    });
    expect(dock?.entries.find((entry) => entry.action === "hotkey_19358")).toMatchObject({
      label: "Thirisadai",
      slot: 14,
    });
    expect(dock?.entries.some((entry) => entry.action === "hotkey_19217")).toBe(false);

    const gate = BUILTIN_COMMAND_PANEL_BY_DRILL_ID.get("gate-commands");
    expect(gate?.entries.map((entry) => [entry.action, entry.slot])).toEqual([
      ["hotkey_19122", 0],
      ["hotkey_19331", 0],
      ["hotkey_19332", 0],
    ]);
    const gatePanel = renderCommandPanel(
      session(
        sequence([{
          type: "hotkey",
          action: "hotkey_19331",
          label: "Rotate Gate Clockwise",
          onFailure: "wait",
        }]),
        0,
        "gate-commands",
      ),
      (action) => action === "hotkey_19331"
        ? [{ key: "Mouse Wheel Up", ctrl: false, alt: false, shift: false }]
        : [],
    );
    expect(gatePanel?.querySelector(".command-tile--slot-0")?.getAttribute("aria-label"))
      .toContain("Rotate Gate Clockwise");
  });

  it("maps the captured siege and ship unit panels", () => {
    expect(BUILTIN_COMMAND_PANEL_BY_DRILL_ID.get("siege-unit-commands")?.entries).toHaveLength(9);
    expect(BUILTIN_COMMAND_PANEL_BY_DRILL_ID.get("fishing-ship-commands")?.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ action: "hotkey_19202", label: "Fish Trap", slot: 0 }),
        expect.objectContaining({ action: "hotkey_400017", label: "Seek Shelter", slot: 8 }),
        expect.objectContaining({ action: "hotkey_19123", label: "Rebuild Fish Trap", slot: 10 }),
        expect.objectContaining({ action: "hotkey_19101", slot: 11 }),
      ]),
    );
    expect(BUILTIN_COMMAND_PANEL_BY_DRILL_ID.get("trade-cog-commands")?.entries).toEqual([
      expect.objectContaining({ action: "hotkey_419057", label: "Toggle Trading Ratio", slot: 2 }),
    ]);
    expect(BUILTIN_COMMAND_PANEL_BY_DRILL_ID.get("transport-ship-commands")?.entries).toEqual([
      expect.objectContaining({ action: "hotkey_19225", label: "Unload", slot: 0 }),
      expect.objectContaining({ action: "hotkey_19216", label: "Stop", slot: 9 }),
    ]);
  });

  it("accounts for audited visible commands and explicit visual alternatives", () => {
    const auditedVisibleSlots = new Map<string, number[]>([
      ["mill-commands", [0, 3, 4]],
      ["mining-camp-commands", [0, 1]],
      ["lumber-camp-commands", [0]],
      ["gate-commands", [0]],
      ["blacksmith-commands", [0, 1, 2, 5, 6]],
      ["market-commands", [0, 1, 2, 3, 4, 6, 7, 8, 11, 12, 13]],
      ["university-commands", [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]],
      ["monastery-commands", [0, 1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 12]],
      ["dock-commands", [0, 1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 12, 13, 14]],
      ["barracks-commands", [0, 1, 3, 4, 5, 6, 8, 10, 11, 12, 14]],
      ["archery-range-commands", [0, 1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 12, 13]],
      ["stable-commands", [0, 1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 14]],
      ["siege-workshop-commands", [0, 1, 2, 3, 4, 5, 6, 7, 11, 13, 14]],
      ["town-center-commands", [0, 4, 5, 6, 7, 10, 13, 14]],
      ["castle-commands", [0, 1, 2, 4, 5, 6, 7, 10, 11, 12, 13]],
      ["military-unit-commands", [0, 1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 12, 13]],
      ["siege-unit-commands", [0, 1, 2, 3, 4, 5, 6, 7, 8]],
      ["fishing-ship-commands", [0, 4, 8, 9, 10, 11]],
      ["trade-cog-commands", [0, 1, 2]],
      ["transport-ship-commands", [0, 9]],
      ["monk-unit-commands", [0, 1, 2, 4, 10, 11, 12, 13]],
      ["trebuchet-unit-commands", [0, 5, 8, 10, 11, 12, 13]],
    ]);
    expect([...auditedVisibleSlots.keys()]).toEqual(
      [...BUILTIN_COMMAND_PANEL_BY_DRILL_ID.keys()],
    );
    for (const panel of BUILTIN_COMMAND_PANEL_BY_DRILL_ID.values()) {
      const coveredSlots = new Set([
        ...panel.entries.map((entry) => entry.slot),
        ...(panel.visualAlternatives ?? []).map((alternative) => alternative.slot),
      ]);
      expect([...coveredSlots].sort((left, right) => left - right), panel.drillId)
        .toEqual(auditedVisibleSlots.get(panel.drillId));
    }

    const gatherPointPanels = [
      "monastery-commands",
      "dock-commands",
      "barracks-commands",
      "archery-range-commands",
      "stable-commands",
      "siege-workshop-commands",
      "town-center-commands",
      "castle-commands",
    ];
    for (const drillId of gatherPointPanels) {
      expect(BUILTIN_COMMAND_PANEL_BY_DRILL_ID.get(drillId)?.entries).toContainEqual(
        expect.objectContaining({ action: "hotkey_19002", label: "Set Gather Point", slot: 4 }),
      );
    }

    for (const drillId of ["military-unit-commands", "monk-unit-commands"]) {
      expect(BUILTIN_COMMAND_PANEL_BY_DRILL_ID.get(drillId)?.entries).toContainEqual(
        expect.objectContaining({ action: "hotkey_400017", label: "Seek Shelter", slot: 4 }),
      );
    }

    expect(BUILTIN_COMMAND_PANEL_BY_DRILL_ID.get("university-commands")?.entries.slice(-4))
      .toEqual([
        expect.objectContaining({ action: "hotkey_19342", slot: 10 }),
        expect.objectContaining({ action: "hotkey_19356", slot: 11 }),
        expect.objectContaining({ action: "hotkey_19343", slot: 12 }),
        expect.objectContaining({ action: "hotkey_19357", slot: 13 }),
      ]);

    const alternatives = [...BUILTIN_COMMAND_PANEL_BY_DRILL_ID.values()]
      .filter((panel) => panel.visualAlternatives);
    expect(alternatives.map((panel) => [
      panel.drillId,
      panel.visualAlternatives?.map((alternative) => alternative.slot),
    ])).toEqual([
      ["siege-workshop-commands", [3]],
      ["trade-cog-commands", [0, 1]],
    ]);
    for (const panel of alternatives) {
      for (const alternative of panel.visualAlternatives ?? []) {
        expect(alternative.reason.trim()).not.toBe("");
        expect(panel.entries.some((entry) => entry.slot === alternative.slot)).toBe(false);
      }
    }
  });

  it("keeps valid shortcuts usable when no simulated menu is defined", () => {
    const current = sequence([
      { type: "hotkey", action: "hotkey_19035", label: "Militia-line", onFailure: "wait" },
    ]);

    expect(commandPanelState("custom-drill", current, 0)).toBeNull();
    expect(renderCommandPanel(session(current, 0, "custom-drill"), () => [
      { key: "Q", ctrl: false, alt: false, shift: false },
    ])).toBeNull();
  });

  it("resolves a centered target from captured, building, custom, and villager menus", () => {
    expect(sequenceTargetState(
      "barracks-commands",
      sequence([{ type: "hotkey", action: "hotkey_19035", label: "Militia", onFailure: "wait" }]),
    )).toMatchObject({
      asset: "barracks-panel.png",
      category: "Barracks Commands",
      label: "Militia-line",
      slot: 0,
    });
    expect(sequenceTargetState(
      "barracks-commands",
      sequence([{ type: "hotkey", action: "select_villager", label: "Select", onFailure: "wait" }]),
    )).toBeNull();

    expect(sequenceTargetState(
      "custom",
      sequence([{ type: "hotkey", action: "build_university", label: "University", onFailure: "wait" }]),
    )).toMatchObject({
      asset: "economic-buildings-panel.png",
      category: "Economic building",
      slot: 9,
    });
    expect(sequenceTargetState(
      "custom",
      sequence([{ type: "hotkey", action: "build_castle", label: "Castle", onFailure: "wait" }]),
    )).toMatchObject({
      asset: "military-buildings-panel.png",
      category: "Military building",
      slot: 12,
    });

    expect(sequenceTargetState(
      "custom",
      sequence([
        { type: "hotkey", action: "hotkey_19035", label: "Militia", onFailure: "wait" },
        { type: "click", label: "Continue", onFailure: "wait" },
      ]),
    )).toMatchObject({
      asset: "barracks-panel.png",
      category: "Barracks Commands",
      slot: 0,
    });
    expect(sequenceTargetState(
      "custom",
      sequence([{
        type: "hotkey",
        action: "open_military_buildings",
        label: "Military Buildings",
        onFailure: "wait",
      }]),
    )).toMatchObject({
      asset: "villager-command-panel.png",
      category: "Villager commands",
      slot: 1,
    });
    expect(sequenceTargetState(
      "custom",
      sequence([{ type: "click", label: "Continue", onFailure: "wait" }]),
    )).toBeNull();
  });

  it("renders the game icon and left-click instruction for the sequence target", () => {
    const current = sequence([
      { type: "hotkey", action: "hotkey_19035", label: "Militia", onFailure: "wait" },
      { type: "click", label: "Continue", onFailure: "wait" },
    ]);
    const target = renderSequenceTarget(session(current, 1, "barracks-commands"));

    expect(target.getAttribute("aria-label")).toBe("Target: Test");
    expect(target.querySelector(".sequence-target__category")?.textContent).toBe("Barracks Commands");
    expect(target.querySelector("strong")?.textContent).toBe("Test");
    expect(target.querySelector("small")?.textContent).toBe("Left-click anywhere");
    expect(target.querySelector("img")?.getAttribute("src")).toBe(
      "/assets/microsoft-game-content/barracks-panel.png",
    );
    expect(target.querySelector("img")?.classList.contains("sequence-target__sprite--slot-0")).toBe(true);

    const fallback = renderSequenceTarget(session(
      sequence([{ type: "hotkey", action: "unknown", label: "Unknown", onFailure: "wait" }]),
      0,
      "custom",
    ));
    expect(fallback.querySelector("img")).toBeNull();
    expect(fallback.querySelector(".sequence-target__category")?.textContent).toBe("Sequence target");
    expect(fallback.querySelector("small")?.classList.contains("sequence-target__instruction--reserved")).toBe(true);
    expect(fallback.querySelector("small")?.getAttribute("aria-hidden")).toBe("true");
  });

  it("renders empty, active, mapped, and unmapped tiles accessibly", () => {
    const selection = sequence([
      { type: "hotkey", action: "select_villager", label: "Select Villager", onFailure: "wait" },
    ]);
    const empty = renderCommandPanel(session(selection, 0), () => []);
    expect(empty?.classList.contains("command-panel--none")).toBe(true);
    expect(empty?.textContent).toContain("Awaiting selection");
    expect(empty?.querySelectorAll(".command-tile--empty")).toHaveLength(15);

    const rootSequence = sequence([
      { type: "hotkey", action: "open_military_buildings", label: "Military Buildings", onFailure: "wait" },
    ]);
    const root = renderCommandPanel(session(rootSequence, 0), (action) =>
      action === "open_military_buildings"
        ? [{ key: "W", ctrl: false, alt: false, shift: false }]
        : []
    );
    expect(root?.querySelector(".command-tile--active")?.getAttribute("aria-label")).toBe("Military Buildings, shortcut W");
    expect(root?.querySelector('[aria-label="Economic Buildings, unmapped"] kbd')?.textContent).toBe("—");
    expect(root?.querySelector("svg")).toBeNull();
    expect(renderCommandPanel(session(rootSequence, 0, "custom"), () => [])).toBeNull();
  });
});
