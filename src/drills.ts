import type { Drill, HotkeyStep, SequenceTemplate, StartingSelection } from "./types";
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
const VILLAGER_SELECTED = { type: "unit", id: "villager" } as const;
const NOTHING_SELECTED = { type: "none" } as const;

const PANEL_STARTING_SELECTIONS = new Map<string, StartingSelection>([
  ["mill", { type: "building", id: "mill" }],
  ["mining-camp", { type: "building", id: "mining-camp" }],
  ["lumber-camp", { type: "building", id: "lumber-camp" }],
  ["gate", { type: "building", id: "gate" }],
  ["blacksmith", { type: "building", id: "blacksmith" }],
  ["market", { type: "building", id: "market" }],
  ["university", { type: "building", id: "university" }],
  ["monastery", { type: "building", id: "monastery" }],
  ["dock", { type: "building", id: "dock" }],
  ["barracks", { type: "building", id: "barracks" }],
  ["archery-range", { type: "building", id: "archery-range" }],
  ["stable", { type: "building", id: "stable" }],
  ["siege-workshop", { type: "building", id: "siege-workshop" }],
  ["town-center", { type: "building", id: "town-center" }],
  ["castle", { type: "building", id: "castle" }],
  ["military-unit", { type: "unit", id: "infantry" }],
  ["siege-unit", { type: "unit", id: "siege-unit" }],
  ["fishing-ship", { type: "unit", id: "fishing-ship" }],
  ["trade-cog", { type: "unit", id: "trade-cog" }],
  ["transport-ship", { type: "unit", id: "transport-ship" }],
  ["monk-unit", { type: "unit", id: "monk" }],
  ["trebuchet-unit", { type: "unit", id: "trebuchet" }],
]);

export function hotkeyStep(action: string): HotkeyStep {
  const definition = getHotkeyAction(action);
  if (!definition) {
    throw new Error(`Unknown hotkey action: ${action}`);
  }
  return { type: "hotkey", action, label: definition.label };
}

const sequences: SequenceTemplate[] = buildings.map((building, index) => ({
  id: `build-${building.id.replaceAll("_", "-")}`,
  name: building.name,
  startingSelection: index >= buildings.length - VILLAGER_SELECTION_SEQUENCE_COUNT
    ? NOTHING_SELECTED
    : VILLAGER_SELECTED,
  steps: [
    ...(index >= buildings.length - VILLAGER_SELECTION_SEQUENCE_COUNT
      ? [hotkeyStep("select_villager")]
      : []),
    hotkeyStep(`open_${building.menu}_buildings`),
    hotkeyStep(`build_${building.id}`),
    {
      type: "click",
      label: "Left click anywhere",
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
    startingSelection: VILLAGER_SELECTED,
    steps: [
      hotkeyStep("open_military_buildings"),
      hotkeyStep(stone ? "build_stone_wall" : "build_palisade_wall"),
      { type: "click", label: "Place wall" },
    ],
    targetTimeMs: TARGET_TIMES,
  };
});

const commandDrills: Drill[] = BUILTIN_COMMAND_PANELS.map((panel) => ({
  id: panel.drillId,
  name: panel.name,
  description: panel.description,
  sequences: panel.entries.map((panelEntry) => ({
    id: `${panel.id}-${panelEntry.action.replaceAll("_", "-")}`,
    name: panelEntry.label,
    startingSelection: PANEL_STARTING_SELECTIONS.get(panel.id)!,
    steps: [{ ...hotkeyStep(panelEntry.action), label: panelEntry.label }],
    targetTimeMs: COMMAND_TARGET_TIMES,
  })),
}));

export const BUILTIN_DRILLS: Drill[] = [
  {
    id: "villager-building-placement",
    name: "Villager Building Placement",
    description: "Open the correct build menu, choose the requested building, then confirm it with a left click.",
    sequences,
  },
  {
    id: "quick-walling",
    name: "Quick Walling",
    description: "Repeat Palisade and Stone Wall hotkeys, then confirm each placement with one click.",
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
