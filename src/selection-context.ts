import { getHotkeyAction } from "./hotkey-actions";
import type {
  BuildingSelectionId,
  StartingSelection,
  UnitSelectionId,
} from "./types";

export interface SelectionOption<T extends StartingSelection = StartingSelection> {
  label: string;
  selection: T;
}

export const BUILDING_SELECTION_OPTIONS: readonly SelectionOption<{
  type: "building";
  id: BuildingSelectionId;
}>[] = [
  { label: "Barracks", selection: { type: "building", id: "barracks" } },
  { label: "Archery Range", selection: { type: "building", id: "archery-range" } },
  { label: "Stable", selection: { type: "building", id: "stable" } },
  { label: "Siege Workshop", selection: { type: "building", id: "siege-workshop" } },
  { label: "Castle", selection: { type: "building", id: "castle" } },
  { label: "Town Center", selection: { type: "building", id: "town-center" } },
  { label: "Mill", selection: { type: "building", id: "mill" } },
  { label: "Mining Camp", selection: { type: "building", id: "mining-camp" } },
  { label: "Lumber Camp", selection: { type: "building", id: "lumber-camp" } },
  { label: "Blacksmith", selection: { type: "building", id: "blacksmith" } },
  { label: "Market", selection: { type: "building", id: "market" } },
  { label: "University", selection: { type: "building", id: "university" } },
  { label: "Monastery", selection: { type: "building", id: "monastery" } },
  { label: "Dock", selection: { type: "building", id: "dock" } },
  { label: "Gate", selection: { type: "building", id: "gate" } },
];

export const UNIT_SELECTION_OPTIONS: readonly SelectionOption<{
  type: "unit";
  id: UnitSelectionId;
}>[] = [
  { label: "Villager", selection: { type: "unit", id: "villager" } },
  { label: "Infantry", selection: { type: "unit", id: "infantry" } },
  { label: "Archer", selection: { type: "unit", id: "archer" } },
  { label: "Cavalry", selection: { type: "unit", id: "cavalry" } },
  { label: "Siege Unit", selection: { type: "unit", id: "siege-unit" } },
  { label: "Monk", selection: { type: "unit", id: "monk" } },
  { label: "Trebuchet", selection: { type: "unit", id: "trebuchet" } },
  { label: "Fishing Ship", selection: { type: "unit", id: "fishing-ship" } },
  { label: "Trade Cog", selection: { type: "unit", id: "trade-cog" } },
  { label: "Transport Ship", selection: { type: "unit", id: "transport-ship" } },
];

export const STARTING_SELECTION_OPTIONS: readonly SelectionOption[] = [
  { label: "Nothing selected", selection: { type: "none" } },
  ...BUILDING_SELECTION_OPTIONS,
  ...UNIT_SELECTION_OPTIONS,
];

const BUILDING_IDS = new Set(BUILDING_SELECTION_OPTIONS.map(({ selection }) => selection.id));
const UNIT_IDS = new Set(UNIT_SELECTION_OPTIONS.map(({ selection }) => selection.id));

export function isBuildingSelectionId(value: unknown): value is BuildingSelectionId {
  return typeof value === "string" && BUILDING_IDS.has(value as BuildingSelectionId);
}

export function isUnitSelectionId(value: unknown): value is UnitSelectionId {
  return typeof value === "string" && UNIT_IDS.has(value as UnitSelectionId);
}

export function startingSelectionKey(selection: StartingSelection): string {
  return selection.type === "none" ? "none" : `${selection.type}:${selection.id}`;
}

export function startingSelectionFromKey(key: string): StartingSelection | null {
  if (key === "none") return { type: "none" };
  const [type, id, extra] = key.split(":");
  if (extra !== undefined) return null;
  if (type === "building" && isBuildingSelectionId(id)) return { type, id };
  if (type === "unit" && isUnitSelectionId(id)) return { type, id };
  return null;
}

export type CommandContextId =
  | "none"
  | "villager"
  | "economic"
  | "military"
  | BuildingSelectionId
  | "military-unit"
  | "siege-unit"
  | "monk-unit"
  | "trebuchet-unit"
  | "fishing-ship"
  | "trade-cog"
  | "transport-ship";

const UNIT_CONTEXT_BY_ID: Readonly<Record<UnitSelectionId, CommandContextId>> = {
  archer: "military-unit",
  cavalry: "military-unit",
  "fishing-ship": "fishing-ship",
  infantry: "military-unit",
  monk: "monk-unit",
  "siege-unit": "siege-unit",
  "trade-cog": "trade-cog",
  "transport-ship": "transport-ship",
  trebuchet: "trebuchet-unit",
  villager: "villager",
};

export function contextForStartingSelection(selection: StartingSelection): CommandContextId {
  if (selection.type === "none") return "none";
  return selection.type === "building" ? selection.id : UNIT_CONTEXT_BY_ID[selection.id];
}

const SELECT_ACTION_CONTEXT = new Map<string, CommandContextId>([
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
]);

export function contextAfterAction(context: CommandContextId, action: string): CommandContextId {
  const selected = SELECT_ACTION_CONTEXT.get(action);
  if (selected) return selected;
  if (getHotkeyAction(action)?.label.startsWith("Select all ")) return "none";
  if (context !== "villager") return context;
  if (action === "open_economic_buildings") return "economic";
  if (action === "open_military_buildings") return "military";
  return context;
}
