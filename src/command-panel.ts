import { formatBinding, type HotkeyBinding } from "./hotkey-file";
import {
  BUILTIN_COMMAND_PANEL_BY_DRILL_ID,
  type BuiltinCommandPanelDefinition,
  type BuiltinCommandPanelEntry,
} from "./builtin-command-panels";
import type { Sequence, Session, Step } from "./types";

export type CommandPanelMenu = "economic" | "military" | BuiltinCommandPanelDefinition["id"];
export type CommandPanelEntry = BuiltinCommandPanelEntry;

export interface CommandPanelState {
  activeAction: string | null;
  entries: readonly CommandPanelEntry[];
  label: string;
  menu: "none" | "villager" | CommandPanelMenu;
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
const VILLAGER_BUILDING_DRILL_IDS = new Set(["villager-building-placement", "quick-walling"]);

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

const buildEntryByAction = new Map(
  [...ECONOMIC_ENTRIES, ...MILITARY_ENTRIES].map((entry) => [entry.action, entry]),
);

function lastHotkeyEntry(
  sequence: Sequence,
  entries: readonly CommandPanelEntry[],
): CommandPanelEntry | undefined {
  for (let index = sequence.steps.length - 1; index >= 0; index -= 1) {
    const step = sequence.steps[index];
    if (step?.type !== "hotkey") continue;
    const entry = entries.find((candidate) => candidate.action === step.action);
    if (entry) return entry;
  }
  return undefined;
}

function buildActionBefore(sequence: Sequence, stepIndex: number): string | null {
  for (let index = stepIndex; index >= 0; index -= 1) {
    const step = sequence.steps[index];
    if (step?.type === "hotkey" && buildEntryByAction.has(step.action)) return step.action;
  }
  return null;
}

function panelActionBefore(
  panel: BuiltinCommandPanelDefinition,
  sequence: Sequence,
  stepIndex: number,
): string | null {
  for (let index = stepIndex; index >= 0; index -= 1) {
    const step = sequence.steps[index];
    if (step?.type === "hotkey" && panel.entries.some((entry) => entry.action === step.action)) {
      return step.action;
    }
  }
  return null;
}

export function commandPanelState(
  drillId: string,
  sequence: Sequence,
  stepIndex: number,
): CommandPanelState | null {
  const step: Step | undefined = sequence.steps[stepIndex];
  if (!step) return null;

  const capturedPanel = BUILTIN_COMMAND_PANEL_BY_DRILL_ID.get(drillId);
  if (capturedPanel) {
    const activeAction = panelActionBefore(capturedPanel, sequence, stepIndex);
    if (!activeAction) return null;
    return {
      activeAction,
      entries: capturedPanel.entries,
      label: capturedPanel.name,
      menu: capturedPanel.id,
    };
  }

  if (!VILLAGER_BUILDING_DRILL_IDS.has(drillId)) return null;
  if (step.type === "hotkey" && step.action === "select_villager") {
    return { activeAction: null, entries: [], label: "No unit selected", menu: "none" };
  }
  if (step.type === "hotkey" && ROOT_ENTRIES.some((entry) => entry.action === step.action)) {
    return {
      activeAction: step.action,
      entries: ROOT_ENTRIES,
      label: "Villager commands",
      menu: "villager",
    };
  }

  const buildAction = buildActionBefore(sequence, stepIndex);
  const entry = buildAction ? buildEntryByAction.get(buildAction) : undefined;
  if (!entry) return null;
  const menu: CommandPanelMenu = ECONOMIC_ENTRIES.includes(entry) ? "economic" : "military";
  return {
    activeAction: buildAction,
    entries: menu === "economic" ? ECONOMIC_ENTRIES : MILITARY_ENTRIES,
    label: menu === "economic" ? "Economic buildings" : "Military buildings",
    menu,
  };
}

export function sequenceTargetState(
  drillId: string,
  sequence: Sequence,
): SequenceTargetState | null {
  const capturedPanel = BUILTIN_COMMAND_PANEL_BY_DRILL_ID.get(drillId);
  if (capturedPanel) {
    const entry = lastHotkeyEntry(sequence, capturedPanel.entries);
    return entry
      ? { asset: capturedPanel.asset, category: capturedPanel.name, label: entry.label, slot: entry.slot }
      : null;
  }

  const buildEntry = lastHotkeyEntry(sequence, [...ECONOMIC_ENTRIES, ...MILITARY_ENTRIES]);
  if (buildEntry) {
    const economic = ECONOMIC_ENTRIES.includes(buildEntry);
    return {
      asset: economic ? ECONOMIC_PANEL_ASSET : MILITARY_PANEL_ASSET,
      category: economic ? "Economic building" : "Military building",
      label: buildEntry.label,
      slot: buildEntry.slot,
    };
  }

  for (let index = sequence.steps.length - 1; index >= 0; index -= 1) {
    const step = sequence.steps[index];
    if (step?.type !== "hotkey") continue;
    for (const panel of BUILTIN_COMMAND_PANEL_BY_DRILL_ID.values()) {
      const entry = panel.entries.find((candidate) => candidate.action === step.action);
      if (entry) {
        return { asset: panel.asset, category: panel.name, label: entry.label, slot: entry.slot };
      }
    }
  }

  const rootEntry = lastHotkeyEntry(sequence, ROOT_ENTRIES);
  return rootEntry
    ? {
        asset: VILLAGER_PANEL_ASSET,
        category: "Villager commands",
        label: rootEntry.label,
        slot: rootEntry.slot,
      }
    : null;
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
  const state = sequenceTargetState(current.drill.id, current.currentSequence);
  const target = element("div", { className: "sequence-target" });
  target.setAttribute("aria-label", `Target: ${current.currentSequence.name}`);
  target.append(element("span", {
    className: "sequence-target__category",
    text: state?.category ?? "Sequence target",
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

  target.append(element("strong", { text: current.currentSequence.name }));
  const step = current.currentSequence.steps[current.stepIndex];
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
    current.drill.id,
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
