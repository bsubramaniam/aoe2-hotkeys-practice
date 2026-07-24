import { formatBinding, type HotkeyBinding } from "./hotkey-file";
import {
  BUILTIN_COMMAND_PANEL_BY_ID,
  type BuiltinCommandPanelEntry,
} from "./builtin-command-panels";
import {
  contextAfterAction,
  contextForStartingSelection,
  type CommandContextId,
} from "./selection-context";
import type { Sequence, Session } from "./types";

export type CommandPanelEntry = BuiltinCommandPanelEntry;

export interface CommandPanelState {
  activeAction: string | null;
  entries: readonly CommandPanelEntry[];
  label: string;
  menu: CommandContextId;
}

export interface SequenceTargetState {
  asset: string;
  category: string;
  label: string;
  slot: number;
}

const GAME_CONTENT_ASSET_ROOT = "/assets/microsoft-game-content";
const VILLAGER_PANEL_ASSET = "villager-command-panel.png";
const ECONOMIC_PANEL_ASSET = "economic-buildings-panel.png";
const MILITARY_PANEL_ASSET = "military-buildings-panel.png";

const ROOT_ENTRIES: readonly CommandPanelEntry[] = [
  { action: "open_economic_buildings", label: "Economic Buildings", slot: 0 },
  { action: "open_military_buildings", label: "Military Buildings", slot: 1 },
];

const ECONOMIC_ENTRIES: readonly CommandPanelEntry[] = [
  { action: "build_house", label: "House", slot: 0 },
  { action: "build_mill", label: "Mill", slot: 1 },
  { action: "build_mining_camp", label: "Mining Camp", slot: 2 },
  { action: "build_lumber_camp", label: "Lumber Camp", slot: 3 },
  { action: "build_dock", label: "Dock", slot: 4 },
  { action: "build_farm", label: "Farm", slot: 5 },
  { action: "build_blacksmith", label: "Blacksmith", slot: 6 },
  { action: "build_market", label: "Market", slot: 7 },
  { action: "build_monastery", label: "Monastery", slot: 8 },
  { action: "build_university", label: "University", slot: 9 },
  { action: "build_town_center", label: "Town Center", slot: 10 },
];

const MILITARY_ENTRIES: readonly CommandPanelEntry[] = [
  { action: "build_barracks", label: "Barracks", slot: 0 },
  { action: "build_archery_range", label: "Archery Range", slot: 1 },
  { action: "build_stable", label: "Stable", slot: 2 },
  { action: "build_siege_workshop", label: "Siege Workshop", slot: 3 },
  { action: "build_outpost", label: "Outpost", slot: 5 },
  { action: "build_palisade_wall", label: "Palisade Wall", slot: 6 },
  { action: "build_stone_wall", label: "Stone Wall", slot: 7 },
  { action: "build_gate", label: "Gate", slot: 10 },
  { action: "build_palisade_gate", label: "Palisade Gate", slot: 11 },
  { action: "build_castle", label: "Castle", slot: 12 },
];

interface ContextDefinition {
  asset?: string;
  category: string;
  entries: readonly CommandPanelEntry[];
  label: string;
}

function contextDefinition(context: CommandContextId): ContextDefinition | null {
  if (context === "none") {
    return {
      category: "No unit selected",
      entries: [],
      label: "No unit selected",
    };
  }
  if (context === "villager") {
    return {
      asset: VILLAGER_PANEL_ASSET,
      category: "Villager commands",
      entries: ROOT_ENTRIES,
      label: "Villager commands",
    };
  }
  if (context === "economic") {
    return {
      asset: ECONOMIC_PANEL_ASSET,
      category: "Economic building",
      entries: ECONOMIC_ENTRIES,
      label: "Economic buildings",
    };
  }
  if (context === "military") {
    return {
      asset: MILITARY_PANEL_ASSET,
      category: "Military building",
      entries: MILITARY_ENTRIES,
      label: "Military buildings",
    };
  }
  const panel = BUILTIN_COMMAND_PANEL_BY_ID.get(context);
  return panel
    ? {
        asset: panel.asset,
        category: panel.name,
        entries: panel.entries,
        label: panel.name,
      }
    : null;
}

function entryForAction(
  definition: ContextDefinition | null,
  action: string,
): CommandPanelEntry | undefined {
  return definition?.entries.find((entry) => entry.action === action);
}

export function commandPanelState(sequence: Sequence, stepIndex: number): CommandPanelState | null {
  const step = sequence.steps[stepIndex];
  if (!step) return null;

  let context = contextForStartingSelection(sequence.startingSelection);
  let lastPanelAction: string | null = null;
  for (let index = 0; index < stepIndex; index += 1) {
    const completedStep = sequence.steps[index];
    if (completedStep?.type !== "hotkey") continue;
    const definition = contextDefinition(context);
    lastPanelAction = entryForAction(definition, completedStep.action)?.action ?? lastPanelAction;
    const nextContext = contextAfterAction(context, completedStep.action);
    if (nextContext !== context) {
      context = nextContext;
      lastPanelAction = null;
    }
  }

  const definition = contextDefinition(context);
  if (!definition) return null;
  const activeEntry = step.type === "hotkey"
    ? entryForAction(definition, step.action)
    : undefined;
  if (context === "none") {
    const changesSelection = step.type === "hotkey"
      && contextAfterAction(context, step.action) !== context;
    if (!changesSelection) return null;
  }
  return {
    activeAction: activeEntry?.action ?? (step.type === "click" ? lastPanelAction : null),
    entries: definition.entries,
    label: definition.label,
    menu: context,
  };
}

export function sequenceTargetState(
  sequence: Sequence,
  stepIndex: number,
): SequenceTargetState | null {
  let context = contextForStartingSelection(sequence.startingSelection);
  let target: SequenceTargetState | null = null;
  for (let index = 0; index <= stepIndex; index += 1) {
    const step = sequence.steps[index];
    if (!step) break;
    if (step.type !== "hotkey") continue;
    const definition = contextDefinition(context);
    const entry = entryForAction(definition, step.action);
    if (entry && definition?.asset) {
      target = {
        asset: definition.asset,
        category: definition.category,
        label: entry.label,
        slot: entry.slot,
      };
    }
    const nextContext = contextAfterAction(context, step.action);
    if (nextContext !== context && !entry) target = null;
    context = nextContext;
  }
  return target;
}

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  options: { className?: string; text?: string } = {},
): HTMLElementTagNameMap[K] {
  const result = document.createElement(tag);
  if (options.className) result.className = options.className;
  if (options.text !== undefined) result.textContent = options.text;
  return result;
}

export function renderSequenceTarget(current: Session): HTMLElement {
  const state = sequenceTargetState(current.currentSequence, current.stepIndex);
  const step = current.currentSequence.steps[current.stepIndex];
  const currentLabel = step?.type === "click"
    ? state?.label ?? step.label
    : step?.label ?? current.currentSequence.name;
  const target = element("div", { className: "sequence-target" });
  target.setAttribute("aria-label", `Current step: ${currentLabel}`);
  target.append(element("span", {
    className: "sequence-target__category",
    text: state?.category ?? "Current step",
  }));

  if (state) {
    const icon = element("span", { className: "sequence-target__icon" });
    icon.setAttribute("aria-hidden", "true");
    const sprite = element("img", {
      className: `sequence-target__sprite sequence-target__sprite--slot-${state.slot}`,
    });
    sprite.src = `${GAME_CONTENT_ASSET_ROOT}/${state.asset}`;
    sprite.alt = "";
    sprite.draggable = false;
    icon.append(sprite);
    target.append(icon);
  }

  target.append(element("strong", { text: currentLabel }));
  const clickInstruction = element("small", {
    className: `sequence-target__instruction${step?.type === "click" ? "" : " sequence-target__instruction--reserved"}`,
    text: step?.type === "click" ? "Left-click anywhere" : "\u00a0",
  });
  if (step?.type !== "click") clickInstruction.setAttribute("aria-hidden", "true");
  target.append(clickInstruction);
  return target;
}

export function renderCommandPanel(
  current: Session,
  bindingsForAction: (actionId: string) => HotkeyBinding[],
): HTMLElement | null {
  const state = commandPanelState(
    current.currentSequence,
    current.stepIndex,
  );
  if (!state) return null;

  const panel = element("aside", { className: `command-panel command-panel--${state.menu}` });
  panel.setAttribute("aria-label", `Simulated command panel: ${state.label}`);
  const heading = element("div", { className: "command-panel__heading" });
  heading.append(
    element("span", { text: state.menu === "none" ? "Awaiting selection" : "Command panel" }),
    element("strong", { text: state.label }),
  );
  panel.append(heading);

  const grid = element("div", { className: "command-panel__grid" });
  grid.setAttribute("aria-label", "Five-column by three-row command grid");
  for (let slot = 0; slot < 15; slot += 1) {
    const entry = state.entries.find(
      (candidate) => candidate.slot === slot && candidate.action === state.activeAction,
    ) ?? state.entries.find((candidate) => candidate.slot === slot);
    const tile = element("div", {
      className: `command-tile command-tile--slot-${slot}${entry ? "" : " command-tile--empty"}${entry?.action === state.activeAction ? " command-tile--active" : ""}`,
    });
    if (!entry) {
      tile.setAttribute("aria-hidden", "true");
    } else {
      const binding = bindingsForAction(entry.action)[0];
      const shortcut = binding ? formatBinding(binding) : "—";
      tile.setAttribute("aria-label", `${entry.label}, ${binding ? `shortcut ${shortcut}` : "unmapped"}`);
      tile.append(
        element("span", { className: "command-tile__name", text: entry.label }),
        element("kbd", { text: shortcut }),
      );
    }
    grid.append(tile);
  }
  panel.append(grid);
  return panel;
}
