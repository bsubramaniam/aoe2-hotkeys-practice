import { describe, expect, it } from "vitest";

/* @vitest-environment jsdom */

import { BUILTIN_COMMAND_PANELS } from "../src/builtin-command-panels";
import {
  commandPanelState,
  renderCommandPanel,
  renderSequenceTarget,
  sequenceTargetState,
} from "../src/command-panel";
import type { Sequence, Session, StartingSelection } from "../src/types";

const targetTimeMs = [7000, 6000, 5000, 4000, 3000, 2000, 1000] as const;

function sequence(
  steps: Sequence["steps"],
  startingSelection: StartingSelection = { type: "unit", id: "villager" },
): Sequence {
  return {
    id: "test",
    name: "Test",
    startingSelection,
    steps,
    targetTimeMs,
  };
}

function panelForDrill(drillId: string) {
  return BUILTIN_COMMAND_PANELS.find((panel) => panel.drillId === drillId);
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
      { type: "hotkey", action: "select_villager", label: "Select Villager" },
      { type: "hotkey", action: "open_economic_buildings", label: "Economic Buildings" },
    ], { type: "none" });

    expect(commandPanelState(current, 0)).toEqual({
      activeAction: null,
      entries: [],
      label: "No unit selected",
      menu: "none",
    });
    const root = commandPanelState(current, 1);
    expect(root).toMatchObject({
      activeAction: "open_economic_buildings",
      label: "Villager commands",
      menu: "villager",
    });
    expect(root?.entries.map((entry) => entry.slot)).toEqual([0, 1]);
  });

  it("keeps the selected economic building visible during placement", () => {
    const current = sequence([
      { type: "hotkey", action: "open_economic_buildings", label: "Economic Buildings" },
      { type: "hotkey", action: "build_university", label: "University" },
      { type: "click", label: "Place building" },
    ]);

    const building = commandPanelState(current, 1);
    const placement = commandPanelState(current, 2);
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
      { type: "hotkey", action: "open_military_buildings", label: "Military Buildings" },
      { type: "hotkey", action: "build_castle", label: "Castle" },
    ]);

    const military = commandPanelState(current, 1);
    expect(military).toMatchObject({
      activeAction: "build_castle",
      label: "Military buildings",
      menu: "military",
    });
    expect(military?.entries).toHaveLength(10);
    expect(military?.entries.find((entry) => entry.action === "build_castle")?.slot).toBe(12);
    expect(commandPanelState(current, 1)).toMatchObject({ menu: "military" });
    expect(commandPanelState(current, 99)).toBeNull();
    expect(commandPanelState(
      sequence(
        [{ type: "click", label: "Click" }],
        { type: "none" },
      ),
      0,
    )).toBeNull();
  });

  it("renders captured building and unit panels for their permanent built-in drills", () => {
    const barracks = panelForDrill("barracks-commands");
    const current = sequence([
      { type: "hotkey", action: "hotkey_19035", label: "Militia" },
      { type: "click", label: "Continue" },
    ], { type: "building", id: "barracks" });

    expect(commandPanelState(current, 0)).toEqual({
      activeAction: "hotkey_19035",
      entries: barracks?.entries,
      label: "Barracks Commands",
      menu: "barracks",
    });
    expect(commandPanelState(current, 1)).toMatchObject({
      activeAction: "hotkey_19035",
      menu: "barracks",
    });
    expect(commandPanelState(
      sequence(
        [{ type: "hotkey", action: "select_villager", label: "Select" }],
        { type: "building", id: "barracks" },
      ),
      0,
    )).toMatchObject({ activeAction: null, menu: "barracks" });

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
    const siege = panelForDrill("siege-workshop-commands");
    const archery = panelForDrill("archery-range-commands");

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
    expect(panelForDrill("castle-commands")?.entries.find(
      (entry) => entry.action === "hotkey_19084",
    )).toMatchObject({
      label: "Tech: Sappers",
      slot: 11,
    });

    const siegePanel = renderCommandPanel(
      session(
        sequence(
          [{ type: "hotkey", action: "hotkey_19476", label: "Onager" }],
          { type: "building", id: "siege-workshop" },
        ),
        0,
        "siege-workshop-commands",
      ),
      () => [{ key: "S", ctrl: false, alt: false, shift: false }],
    );
    const archeryPanel = renderCommandPanel(
      session(
        sequence(
          [{ type: "hotkey", action: "hotkey_19149", label: "Elite" }],
          { type: "building", id: "archery-range" },
        ),
        0,
        "archery-range-commands",
      ),
      () => [{ key: "D", ctrl: false, alt: false, shift: false }],
    );
    expect(siegePanel?.querySelector(".command-tile--slot-6 kbd")?.textContent).toBe("S");
    expect(archeryPanel?.querySelector(".command-tile--slot-11 kbd")?.textContent).toBe("D");
  });

  it("uses the Dravidian Dock commands and the shared Gate icon for rotation", () => {
    const dock = panelForDrill("dock-commands");
    expect(dock?.entries.find((entry) => entry.action === "hotkey_19002")).toMatchObject({
      label: "Set Gather Point",
      slot: 4,
    });
    expect(dock?.entries.find((entry) => entry.action === "hotkey_19358")).toMatchObject({
      label: "Thirisadai",
      slot: 14,
    });
    expect(dock?.entries.some((entry) => entry.action === "hotkey_19217")).toBe(false);

    const gate = panelForDrill("gate-commands");
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
        }], { type: "building", id: "gate" }),
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
    expect(panelForDrill("siege-unit-commands")?.entries).toHaveLength(9);
    expect(panelForDrill("fishing-ship-commands")?.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ action: "hotkey_19202", label: "Fish Trap", slot: 0 }),
        expect.objectContaining({ action: "hotkey_400017", label: "Seek Shelter", slot: 8 }),
        expect.objectContaining({ action: "hotkey_19123", label: "Rebuild Fish Trap — Dock", slot: 10 }),
        expect.objectContaining({ action: "hotkey_19101", slot: 11 }),
      ]),
    );
    expect(panelForDrill("trade-cog-commands")?.entries).toEqual([
      expect.objectContaining({ action: "hotkey_419057", label: "Toggle Trading Ratio", slot: 2 }),
    ]);
    expect(panelForDrill("transport-ship-commands")?.entries).toEqual([
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
      BUILTIN_COMMAND_PANELS.map((panel) => panel.drillId),
    );
    for (const panel of BUILTIN_COMMAND_PANELS) {
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
      expect(panelForDrill(drillId)?.entries).toContainEqual(
        expect.objectContaining({ action: "hotkey_19002", label: "Set Gather Point", slot: 4 }),
      );
    }

    for (const drillId of ["military-unit-commands", "monk-unit-commands"]) {
      expect(panelForDrill(drillId)?.entries).toContainEqual(
        expect.objectContaining({ action: "hotkey_400017", label: "Seek Shelter", slot: 4 }),
      );
    }

    expect(panelForDrill("university-commands")?.entries.slice(-4))
      .toEqual([
        expect.objectContaining({ action: "hotkey_19342", slot: 10 }),
        expect.objectContaining({ action: "hotkey_19356", slot: 11 }),
        expect.objectContaining({ action: "hotkey_19343", slot: 12 }),
        expect.objectContaining({ action: "hotkey_19357", slot: 13 }),
      ]);

    const alternatives = BUILTIN_COMMAND_PANELS
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
      { type: "hotkey", action: "hotkey_19035", label: "Militia-line" },
    ], { type: "none" });

    expect(commandPanelState(current, 0)).toBeNull();
    expect(renderCommandPanel(session(current, 0, "custom-drill"), () => [
      { key: "Q", ctrl: false, alt: false, shift: false },
    ])).toBeNull();
  });

  it("uses deterministic representatives for mixed Select all actions", () => {
    const idleMilitary = sequence([
      { type: "hotkey", action: "hotkey_19140", label: "Select all idle military units" },
      { type: "hotkey", action: "hotkey_19312", label: "Move" },
    ], { type: "none" });
    expect(commandPanelState(idleMilitary, 0)).toMatchObject({ menu: "none" });
    expect(commandPanelState(idleMilitary, 1)).toMatchObject({
      activeAction: "hotkey_19312",
      menu: "military-unit",
    });

    const unsupportedGroup = sequence([
      { type: "hotkey", action: "hotkey_419068", label: "Select all naval heroes" },
      { type: "click", label: "Continue" },
    ], { type: "building", id: "barracks" });
    expect(commandPanelState(unsupportedGroup, 1)).toBeNull();
  });

  it("resolves targets from explicit context without guessing shared actions", () => {
    expect(sequenceTargetState(
      sequence(
        [{ type: "hotkey", action: "hotkey_19035", label: "Militia" }],
        { type: "building", id: "barracks" },
      ),
    )).toMatchObject({
      asset: "barracks-panel.png",
      category: "Barracks Commands",
      label: "Militia-line",
      slot: 0,
    });
    expect(sequenceTargetState(
      sequence(
        [{ type: "hotkey", action: "select_villager", label: "Select" }],
        { type: "none" },
      ),
    )).toBeNull();

    expect(sequenceTargetState(
      sequence([
        { type: "hotkey", action: "open_economic_buildings", label: "Economic" },
        { type: "hotkey", action: "build_university", label: "University" },
      ]),
    )).toMatchObject({
      asset: "economic-buildings-panel.png",
      category: "Economic building",
      slot: 9,
    });
    expect(sequenceTargetState(
      sequence([
        { type: "hotkey", action: "open_military_buildings", label: "Military" },
        { type: "hotkey", action: "build_castle", label: "Castle" },
      ]),
    )).toMatchObject({
      asset: "military-buildings-panel.png",
      category: "Military building",
      slot: 12,
    });

    expect(sequenceTargetState(
      sequence([
        { type: "hotkey", action: "hotkey_19035", label: "Militia" },
        { type: "click", label: "Continue" },
      ], { type: "building", id: "barracks" }),
    )).toMatchObject({
      asset: "barracks-panel.png",
      category: "Barracks Commands",
      slot: 0,
    });
    expect(sequenceTargetState(
      sequence([{
        type: "hotkey",
        action: "open_military_buildings",
        label: "Military Buildings",
      }]),
    )).toMatchObject({
      asset: "villager-command-panel.png",
      category: "Villager commands",
      slot: 1,
    });
    expect(sequenceTargetState(
      sequence(
        [{ type: "click", label: "Continue" }],
        { type: "none" },
      ),
    )).toBeNull();

    const sharedAction = "hotkey_19002";
    expect(sequenceTargetState(sequence(
      [{ type: "hotkey", action: sharedAction, label: "Set Gather Point" }],
      { type: "building", id: "barracks" },
    ))?.asset).toBe("barracks-panel.png");
    expect(sequenceTargetState(sequence(
      [{ type: "hotkey", action: sharedAction, label: "Set Gather Point" }],
      { type: "building", id: "dock" },
    ))?.asset).toBe("dock-panel.png");
    expect(sequenceTargetState(sequence(
      [{ type: "hotkey", action: sharedAction, label: "Set Gather Point" }],
      { type: "none" },
    ))).toBeNull();
  });

  it("renders the game icon and left-click instruction for the sequence target", () => {
    const current = sequence([
      { type: "hotkey", action: "hotkey_19035", label: "Militia" },
      { type: "click", label: "Continue" },
    ], { type: "building", id: "barracks" });
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
      sequence([{ type: "hotkey", action: "unknown", label: "Unknown" }]),
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
      { type: "hotkey", action: "select_villager", label: "Select Villager" },
    ], { type: "none" });
    const empty = renderCommandPanel(session(selection, 0), () => []);
    expect(empty?.classList.contains("command-panel--none")).toBe(true);
    expect(empty?.textContent).toContain("Awaiting selection");
    expect(empty?.querySelectorAll(".command-tile--empty")).toHaveLength(15);

    const rootSequence = sequence([
      { type: "hotkey", action: "open_military_buildings", label: "Military Buildings" },
    ]);
    const root = renderCommandPanel(session(rootSequence, 0), (action) =>
      action === "open_military_buildings"
        ? [{ key: "W", ctrl: false, alt: false, shift: false }]
        : []
    );
    expect(root?.querySelector(".command-tile--active")?.getAttribute("aria-label")).toBe("Military Buildings, shortcut W");
    expect(root?.querySelector('[aria-label="Economic Buildings, unmapped"] kbd')?.textContent).toBe("—");
    expect(root?.querySelector("svg")).toBeNull();
    expect(renderCommandPanel(session(rootSequence, 0, "custom"), () => [])).not.toBeNull();
  });
});
