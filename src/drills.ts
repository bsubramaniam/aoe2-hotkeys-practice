import type { Drill, HotkeyStep, SequenceTemplate } from "./types";
import { getHotkeyAction, type HotkeyActionDefinition } from "./hotkey-actions";

interface BuildingDefinition {
  id: string;
  name: string;
  menu: "economic" | "military";
}

const buildings: BuildingDefinition[] = [
  { id: "archery_range", name: "Archery Range", menu: "military" },
  { id: "barracks", name: "Barracks", menu: "military" },
  { id: "blacksmith", name: "Blacksmith", menu: "economic" },
  { id: "castle", name: "Castle", menu: "military" },
  { id: "dock", name: "Dock", menu: "economic" },
  { id: "farm", name: "Farm", menu: "economic" },
  { id: "gate", name: "Gate", menu: "military" },
  { id: "house", name: "House", menu: "economic" },
  { id: "lumber_camp", name: "Lumber Camp", menu: "economic" },
  { id: "market", name: "Market", menu: "economic" },
  { id: "mill", name: "Mill", menu: "economic" },
  { id: "mining_camp", name: "Mining Camp", menu: "economic" },
  { id: "monastery", name: "Monastery", menu: "economic" },
  { id: "outpost", name: "Outpost", menu: "military" },
  { id: "palisade_gate", name: "Palisade Gate", menu: "military" },
  { id: "palisade_wall", name: "Palisade Wall", menu: "military" },
  { id: "siege_workshop", name: "Siege Workshop", menu: "military" },
  { id: "stable", name: "Stable", menu: "military" },
  { id: "stone_wall", name: "Stone Wall", menu: "military" },
  { id: "town_center", name: "Town Center", menu: "economic" },
  { id: "university", name: "University", menu: "economic" },
];

const TARGET_TIMES = [6500, 5200, 4200, 3300, 2600, 2000, 1500] as const;
const VILLAGER_SELECTION_SEQUENCE_COUNT = 4;

export function hotkeyStep(action: string, onFailure: HotkeyStep["onFailure"]): HotkeyStep {
  const definition = getHotkeyAction(action);
  if (!definition) {
    throw new Error(`Unknown hotkey action: ${action}`);
  }
  return { type: "hotkey", action, label: definition.label, onFailure };
}

const sequences: SequenceTemplate[] = buildings.map((building, index) => ({
  id: `build-${building.id.replaceAll("_", "-")}`,
  name: building.name,
  steps: [
    ...(index >= buildings.length - VILLAGER_SELECTION_SEQUENCE_COUNT
      ? [hotkeyStep("select_villager", "wait")]
      : []),
    hotkeyStep(`open_${building.menu}_buildings`, "wait"),
    hotkeyStep(`build_${building.id}`, "restart_sequence"),
    {
      type: "click",
      zone: "random",
      label: "Place building",
      onFailure: "wait",
    },
  ],
  targetTimeMs: TARGET_TIMES,
}));

export const BUILTIN_DRILLS: Drill[] = [
  {
    id: "villager-building-placement",
    name: "Villager Building Placement",
    description: "Open the correct build menu, choose the requested building, then place it in the marked zone.",
    totalTimeMs: 137_000,
    sequences,
  },
];

export function getRequiredActions(drill: Drill): HotkeyActionDefinition[] {
  const required = new Set<string>();
  for (const sequence of drill.sequences) {
    for (const step of sequence.steps) {
      if (step.type === "hotkey") {
        required.add(step.action);
      }
    }
  }
  return [...required]
    .map((id) => getHotkeyAction(id))
    .filter((action): action is HotkeyActionDefinition => action !== undefined);
}
