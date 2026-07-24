import { describe, expect, it } from "vitest";

import { HOTKEY_ACTIONS } from "../src/hotkey-actions";
import {
  BUILDING_SELECTION_OPTIONS,
  contextAfterAction,
  contextForStartingSelection,
  isBuildingSelectionId,
  isUnitSelectionId,
  STARTING_SELECTION_OPTIONS,
  startingSelectionFromKey,
  startingSelectionKey,
  UNIT_SELECTION_OPTIONS,
} from "../src/selection-context";

describe("selection context", () => {
  it("provides the exact author-facing building and unit choices", () => {
    expect(BUILDING_SELECTION_OPTIONS).toHaveLength(15);
    expect(UNIT_SELECTION_OPTIONS).toHaveLength(10);
    expect(STARTING_SELECTION_OPTIONS).toHaveLength(26);
    expect(STARTING_SELECTION_OPTIONS[0]).toEqual({
      label: "Nothing selected",
      selection: { type: "none" },
    });
    expect(BUILDING_SELECTION_OPTIONS.map(({ label }) => label)).toContain("Siege Workshop");
    expect(UNIT_SELECTION_OPTIONS.map(({ label }) => label)).toEqual([
      "Villager",
      "Infantry",
      "Archer",
      "Cavalry",
      "Siege Unit",
      "Monk",
      "Trebuchet",
      "Fishing Ship",
      "Trade Cog",
      "Transport Ship",
    ]);
  });

  it("validates and round-trips selection keys", () => {
    expect(isBuildingSelectionId("barracks")).toBe(true);
    expect(isBuildingSelectionId("house")).toBe(false);
    expect(isBuildingSelectionId(3)).toBe(false);
    expect(isUnitSelectionId("monk")).toBe(true);
    expect(isUnitSelectionId("ship")).toBe(false);
    expect(isUnitSelectionId(null)).toBe(false);

    expect(startingSelectionKey({ type: "none" })).toBe("none");
    expect(startingSelectionKey({ type: "building", id: "dock" })).toBe("building:dock");
    expect(startingSelectionKey({ type: "unit", id: "archer" })).toBe("unit:archer");
    expect(startingSelectionFromKey("none")).toEqual({ type: "none" });
    expect(startingSelectionFromKey("building:dock")).toEqual({ type: "building", id: "dock" });
    expect(startingSelectionFromKey("unit:archer")).toEqual({ type: "unit", id: "archer" });
    expect(startingSelectionFromKey("building:house")).toBeNull();
    expect(startingSelectionFromKey("unit:ship")).toBeNull();
    expect(startingSelectionFromKey("group:army")).toBeNull();
    expect(startingSelectionFromKey("unit:monk:extra")).toBeNull();
  });

  it("maps starting selections and selection hotkeys to command contexts", () => {
    expect(contextForStartingSelection({ type: "none" })).toBe("none");
    expect(contextForStartingSelection({ type: "building", id: "market" })).toBe("market");
    expect(UNIT_SELECTION_OPTIONS.map(({ selection }) => contextForStartingSelection(selection)))
      .toEqual([
        "villager",
        "military-unit",
        "military-unit",
        "military-unit",
        "siege-unit",
        "monk-unit",
        "trebuchet-unit",
        "fishing-ship",
        "trade-cog",
        "transport-ship",
      ]);

    const selectionActions = [
      ["select_villager", "villager"],
      ["select_all_idle_villagers", "villager"],
      ["select_all_military_units", "military-unit"],
      ["select_all_military_buildings", "none"],
      ["select_all_docks", "dock"],
      ["select_all_barracks", "barracks"],
      ["select_all_archery_ranges", "archery-range"],
      ["select_all_stables", "stable"],
      ["select_all_siege_workshops", "siege-workshop"],
      ["select_all_castles", "castle"],
      ["select_all_monasteries", "monastery"],
      ["select_all_town_centers", "town-center"],
      ["select_all_markets", "market"],
      ["select_all_blacksmiths", "blacksmith"],
      ["select_all_universities", "university"],
      ["hotkey_19068", "military-unit"],
      ["hotkey_19078", "military-unit"],
      ["hotkey_19140", "military-unit"],
      ["hotkey_19079", "trade-cog"],
      ["hotkey_19139", "trade-cog"],
      ["hotkey_19155", "mill"],
      ["hotkey_19156", "mining-camp"],
      ["hotkey_19157", "lumber-camp"],
    ] as const;
    for (const [action, expected] of selectionActions) {
      expect(contextAfterAction("none", action)).toBe(expected);
    }

    expect(contextAfterAction("barracks", "open_economic_buildings")).toBe("barracks");
    expect(contextAfterAction("villager", "open_economic_buildings")).toBe("economic");
    expect(contextAfterAction("villager", "open_military_buildings")).toBe("military");
    expect(contextAfterAction("villager", "unknown")).toBe("villager");
    expect(contextAfterAction("barracks", "hotkey_419068")).toBe("none");
    expect(contextAfterAction("barracks", "hotkey_19254")).toBe("barracks");

    const selectAllActions = [...HOTKEY_ACTIONS.values()]
      .filter(({ label }) => label.startsWith("Select all "));
    expect(selectAllActions.length).toBeGreaterThan(20);
    for (const action of selectAllActions) {
      expect(contextAfterAction("economic", action.id), action.label).not.toBe("economic");
    }
  });
});
