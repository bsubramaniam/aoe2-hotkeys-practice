import type { Drill, HotkeyStep, SequenceTemplate } from "./types";
import { BUILTIN_COMMAND_PANELS } from "./builtin-command-panels";
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
const COMMAND_TARGET_TIMES = [3500, 2800, 2200, 1800, 1400, 1100, 850] as const;
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
      label: "Left click anywhere",
      onFailure: "wait",
    },
  ],
  targetTimeMs: TARGET_TIMES,
}));

const quickWallSequences: SequenceTemplate[] = Array.from({ length: 10 }, (_, index) => {
  const stone = index % 2 === 1;
  const wallName = stone ? "Stone Wall" : "Palisade Wall";
  return {
    id: `quick-wall-${index + 1}`,
    name: `${wallName} ${Math.floor(index / 2) + 1} of 5`,
    steps: [
      hotkeyStep("open_military_buildings", "wait"),
      hotkeyStep(stone ? "build_stone_wall" : "build_palisade_wall", "restart_sequence"),
      { type: "click", label: "Place wall", onFailure: "wait" },
    ],
    targetTimeMs: TARGET_TIMES,
  };
});

const commandDrills: Drill[] = BUILTIN_COMMAND_PANELS.map((panel) => ({
  id: panel.drillId,
  name: panel.name,
  description: panel.description,
  totalTimeMs: panel.entries.length * 4000,
  sequences: panel.entries.map((panelEntry) => ({
    id: `${panel.id}-${panelEntry.action.replaceAll("_", "-")}`,
    name: panelEntry.label,
    steps: [{ ...hotkeyStep(panelEntry.action, "restart_sequence"), label: panelEntry.label }],
    targetTimeMs: COMMAND_TARGET_TIMES,
  })),
}));

export const BUILTIN_DRILLS: Drill[] = [
  {
    id: "villager-building-placement",
    name: "Villager Building Placement",
    description: "Open the correct build menu, choose the requested building, then confirm it with a left click.",
    totalTimeMs: 137_000,
    sequences,
  },
  {
    id: "quick-walling",
    name: "Quick Walling",
    description: "Repeat Palisade and Stone Wall hotkeys, then confirm each placement with one click.",
    totalTimeMs: 65_000,
    sequences: quickWallSequences,
  },
  ...commandDrills,
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
