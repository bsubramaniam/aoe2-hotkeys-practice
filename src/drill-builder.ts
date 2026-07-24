import type { HotkeyActionDefinition } from "./hotkey-actions";
import {
  BUILDING_SELECTION_OPTIONS,
  startingSelectionKey,
  UNIT_SELECTION_OPTIONS,
} from "./selection-context";
import type { Drill, StartingSelection, Step } from "./types";

interface DraftSequence {
  id: string;
  name: string;
  startingSelection: StartingSelection;
  startingSelectionText: string;
  steps: Step[];
  proTargetMs: number;
}

interface BuilderOptions {
  actions: HotkeyActionDefinition[];
  initialDrill?: Drill;
  bindingForAction: (actionId: string) => string;
  onBack: () => void;
  onDelete?: () => void;
  onSave: (drill: Drill) => void;
}

interface PreparedAction {
  id: string;
  label: string;
  binding: string;
  searchText: string;
  type: "hotkey" | "click";
}

const DEFAULT_PRO_TARGET_MS = 1500;
const TARGET_MULTIPLIERS = [4, 3, 2.5, 2, 1.5, 1.25, 1] as const;
const MAX_VISIBLE_ACTIONS = 8;
const LEFT_CLICK_CHOICE_ID = "__left_click__";
const STARTING_SELECTION_CHOICES: Array<{
  group: "Building" | "Unit" | "General";
  label: string;
  selection: StartingSelection;
}> = [
  { group: "General", label: "Nothing selected", selection: { type: "none" } },
  ...BUILDING_SELECTION_OPTIONS.map((option) => ({ group: "Building" as const, ...option })),
  ...UNIT_SELECTION_OPTIONS.map((option) => ({ group: "Unit" as const, ...option })),
];

export function targetTimesFromPro(
  proTargetMs: number,
): [number, number, number, number, number, number, number] {
  return TARGET_MULTIPLIERS.map((multiplier) =>
    Math.max(50, Math.round((proTargetMs * multiplier) / 50) * 50)
  ) as [number, number, number, number, number, number, number];
}

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  options: { className?: string; id?: string; text?: string } = {},
): HTMLElementTagNameMap[K] {
  const result = document.createElement(tag);
  if (options.className) result.className = options.className;
  if (options.id) result.id = options.id;
  if (options.text !== undefined) result.textContent = options.text;
  return result;
}

function button(text: string, className: string, id?: string): HTMLButtonElement {
  const result = element("button", { className, text, ...(id ? { id } : {}) });
  result.type = "button";
  return result;
}

function selectedAtStartLabel(selection: StartingSelection): string {
  return STARTING_SELECTION_CHOICES.find((choice) =>
    startingSelectionKey(choice.selection) === startingSelectionKey(selection)
  )?.label ?? "Nothing selected";
}

function fieldLabel(text: string, forId: string, explanation: string): HTMLDivElement {
  const wrap = element("div", { className: "field-label" });
  const label = element("label", { text });
  label.htmlFor = forId;
  const info = element("span", { className: "field-info" });
  const trigger = button("i", "field-info__button");
  trigger.tabIndex = -1;
  const tooltipId = `${forId}-help`;
  trigger.setAttribute("aria-label", `About ${text}`);
  trigger.setAttribute("aria-describedby", tooltipId);
  const tooltip = element("span", {
    className: "field-info__tooltip",
    id: tooltipId,
    text: explanation,
  });
  tooltip.setAttribute("role", "tooltip");
  info.append(trigger, tooltip);
  wrap.append(label, info);
  return wrap;
}

function newSequence(number: number): DraftSequence {
  return {
    id: `sequence-${number}`,
    name: "",
    startingSelection: { type: "none" },
    startingSelectionText: "Nothing selected",
    steps: [],
    proTargetMs: DEFAULT_PRO_TARGET_MS,
  };
}

function nextSequenceNumber(sequences: readonly DraftSequence[]): number {
  const ids = new Set(sequences.map((sequence) => sequence.id));
  let number = 1;
  while (ids.has(`sequence-${number}`)) number += 1;
  return number;
}

export function mountDrillBuilder(root: HTMLElement, options: BuilderOptions): void {
  const initial = options.initialDrill;
  const draftId = initial?.id ?? `custom-${Date.now()}`;
  let name = initial?.name ?? "";
  let description = initial?.description ?? "";
  let sequences: DraftSequence[] = initial?.sequences.map((sequence) => ({
    id: sequence.id,
    name: sequence.name,
    startingSelection: { ...sequence.startingSelection },
    startingSelectionText: selectedAtStartLabel(sequence.startingSelection),
    steps: sequence.steps.map((step): Step => step.type === "hotkey"
      ? { ...step }
      : { ...step, label: "Left click anywhere" }),
    proTargetMs: sequence.targetTimeMs[6],
  })) ?? [newSequence(1)];
  let sequenceIndex = 0;
  let searchQuery = "";
  let stepActiveIndex = 0;
  let selectionSearchOpen = false;
  let selectionFiltering = false;
  let selectionActiveIndex = 0;
  let suppressSelectionOpenOnce = false;
  let detailsExpanded = !initial;
  let errorMessage = "";

  const preparedActions: PreparedAction[] = [
    {
      id: LEFT_CLICK_CHOICE_ID,
      label: "Left click anywhere",
      binding: "Left click",
      searchText: "left click anywhere mouse",
      type: "click",
    },
    ...options.actions.map((action) => {
      const binding = options.bindingForAction(action.id);
      return {
        id: action.id,
        label: action.label,
        binding,
        searchText: `${action.label} ${binding}`.toLowerCase(),
        type: "hotkey" as const,
      };
    }),
  ];

  function currentSequence(): DraftSequence {
    const sequence = sequences[sequenceIndex];
    if (!sequence) throw new Error("No sequence is selected.");
    return sequence;
  }

  function renderStep(step: Step, index: number): HTMLElement {
    const article = element("article", { className: "builder-step" });
    const summary = element("div", { className: "builder-step__summary" });
    summary.append(element("span", { className: "builder-step__number", text: `${index + 1}.` }));

    const stepLabel = element("div", { className: "builder-step__label" });
    stepLabel.append(
      element("strong", { text: step.label }),
      element("small", { text: step.type === "hotkey" ? "Hotkey action" : "Left-click action" }),
    );
    summary.append(stepLabel);

    const detail = step.type === "hotkey" ? options.bindingForAction(step.action) : "Left click";
    summary.append(element("kbd", { text: detail }));
    const remove = button("×", "icon-button");
    remove.dataset.deleteStep = String(index);
    remove.setAttribute("aria-label", `Delete step ${index + 1}`);
    summary.append(remove);
    article.append(summary);
    return article;
  }

  function matchingActions(): PreparedAction[] {
    const normalized = searchQuery.trim().toLowerCase();
    if (normalized === "") return [];
    return preparedActions
      .filter((action) => action.searchText.includes(normalized))
      .map((action, index) => {
        const label = action.label.toLowerCase();
        const binding = action.binding.toLowerCase();
        const score = binding === normalized
          ? 0
          : label.startsWith(normalized)
            ? 1
            : label.split(/\s+/).some((word) => word.startsWith(normalized))
              ? 2
              : label.includes(normalized)
                ? 3
                : 4;
        return { action, index, score };
      })
      .sort((left, right) => left.score - right.score || left.index - right.index)
      .map(({ action }) => action)
      .slice(0, MAX_VISIBLE_ACTIONS);
  }

  function matchingSelections(): typeof STARTING_SELECTION_CHOICES {
    if (!selectionSearchOpen) return [];
    const normalized = currentSequence().startingSelectionText.trim().toLowerCase();
    if (!selectionFiltering || normalized === "") return STARTING_SELECTION_CHOICES;
    return STARTING_SELECTION_CHOICES
      .filter((choice) =>
        choice.label.toLowerCase().includes(normalized)
        || choice.group.toLowerCase() === normalized
      )
      .map((choice, index) => ({
        choice,
        index,
        score: choice.label.toLowerCase().startsWith(normalized) ? 0 : 1,
      }))
      .sort((left, right) => left.score - right.score || left.index - right.index)
      .map(({ choice }) => choice);
  }

  function moveActiveIndex(current: number, direction: -1 | 1, length: number): number {
    if (length === 0) return 0;
    return (current + direction + length) % length;
  }

  function renderStepSearch(): HTMLElement {
    const field = element("div", { className: "step-search-field" });
    const label = fieldLabel(
      "Add step",
      "step-search",
      "Search for each action in the order the player should perform it. Left Click is included.",
    );

    const control = element("div", { className: "step-search" });
    const search = element("input", { id: "step-search" });
    search.type = "search";
    search.value = searchQuery;
    search.placeholder = "Search actions, hotkeys, or left click";
    search.autocomplete = "off";
    search.setAttribute("role", "combobox");
    search.setAttribute("aria-autocomplete", "list");
    search.setAttribute("aria-controls", "step-search-results");
    search.setAttribute("aria-expanded", searchQuery.trim() === "" ? "false" : "true");
    const matches = matchingActions();
    if (matches.length > 0) {
      search.setAttribute("aria-activedescendant", `step-search-option-${stepActiveIndex}`);
    }
    control.append(search);

    const results = element("div", { className: "action-results", id: "step-search-results" });
    results.setAttribute("role", "listbox");
    if (searchQuery.trim() !== "" && matches.length === 0) {
      results.append(element("p", { className: "empty-state", text: "No actions match this search." }));
    } else {
      matches.forEach((action, index) => {
        const result = button("", `action-result${index === stepActiveIndex ? " action-result--active" : ""}`);
        result.id = `step-search-option-${index}`;
        result.dataset.addStep = action.id;
        result.setAttribute("role", "option");
        result.setAttribute("aria-selected", String(index === stepActiveIndex));
        result.append(
          element("strong", { text: action.label }),
          element("kbd", { text: action.binding }),
        );
        results.append(result);
      });
    }
    if (results.childElementCount > 0) control.append(results);
    field.append(label, control);
    return field;
  }

  function render(): void {
    const sequence = currentSequence();
    const builder = element("section", { className: "builder" });
    builder.setAttribute("aria-labelledby", "builder-title");

    const topbar = element("div", { className: "builder__topbar" });
    topbar.append(button("← Back", "button button--text", "builder-back"));
    topbar.append(element("p", {
      className: "eyebrow",
      id: "builder-title",
      text: initial ? "Edit custom drill" : "Create custom drill",
    }));
    const topActions = element("div", { className: "builder__topbar-actions" });
    if (initial) topActions.append(button("Delete drill", "button button--danger", "delete-drill"));
    topActions.append(button("Save drill", "button button--secondary", "save-drill"));
    topbar.append(topActions);
    builder.append(topbar);

    const details = element("section", {
      className: `builder-details${detailsExpanded ? " builder-details--expanded" : ""}`,
    });
    const detailsSummary = element("div", { className: "builder-details__summary" });
    const detailsCopy = element("div");
    detailsCopy.append(
      element("span", { text: "Drill details" }),
      element("strong", {
        className: "builder-details__name",
        text: name.trim() || "Untitled drill",
      }),
    );
    if (!detailsExpanded && description.trim()) {
      detailsCopy.append(element("small", { text: description.trim() }));
    }
    const detailsToggle = button("", "icon-button builder-details__toggle", "toggle-drill-details");
    const chevron = element("span", { className: "builder-details__chevron" });
    chevron.setAttribute("aria-hidden", "true");
    detailsToggle.append(chevron);
    detailsToggle.setAttribute(
      "aria-label",
      detailsExpanded ? "Collapse drill details" : "Expand drill details",
    );
    detailsToggle.setAttribute("aria-expanded", String(detailsExpanded));
    detailsToggle.setAttribute("aria-controls", "drill-details-fields");
    detailsSummary.append(detailsCopy, detailsToggle);
    details.append(detailsSummary);

    if (detailsExpanded) {
      const metadata = element("div", {
        className: "builder__metadata",
        id: "drill-details-fields",
      });
      const nameLabel = fieldLabel(
        "Drill name",
        "drill-name",
        "The name players see when choosing this drill.",
      );
      const nameInput = element("input", { id: "drill-name" });
      nameInput.value = name;
      nameInput.placeholder = "Villager Building Placement";
      const descriptionLabel = fieldLabel(
        "Description",
        "drill-description",
        "A short explanation of what the drill helps players practise.",
      );
      const descriptionInput = element("textarea", { id: "drill-description" });
      descriptionInput.rows = 2;
      descriptionInput.value = description;
      descriptionInput.placeholder = "Practice villager building-placement sequences";
      metadata.append(
        nameLabel,
        nameInput,
        descriptionLabel,
        descriptionInput,
      );
      details.append(metadata);
    }
    builder.append(details);

    const switcher = element("nav", { className: "sequence-switcher" });
    switcher.setAttribute("aria-label", "Drill sequences");
    const sequenceTabs = element("div", { className: "sequence-tabs" });
    sequenceTabs.setAttribute("role", "tablist");
    sequences.forEach((item, index) => {
      const selected = index === sequenceIndex;
      const tab = button(
        `${index + 1}. ${item.name.trim() || "Untitled sequence"}`,
        `sequence-tab${selected ? " sequence-tab--active" : ""}`,
      );
      tab.dataset.sequenceIndex = String(index);
      tab.dataset.sequenceId = item.id;
      tab.setAttribute("role", "tab");
      tab.setAttribute("aria-selected", String(selected));
      tab.tabIndex = selected ? 0 : -1;
      sequenceTabs.append(tab);
    });
    const addSequence = button("+ Add sequence", "button button--secondary sequence-add", "add-sequence");
    addSequence.append(element("kbd", { text: "Ctrl/⌘ + Enter" }));
    const navigationShortcut = element("span", { className: "sequence-navigation-shortcut" });
    navigationShortcut.setAttribute(
      "aria-label",
      "Previous or next sequence: Control or Command plus Shift plus left or right arrow",
    );
    navigationShortcut.append(element("kbd", { text: "Ctrl/⌘ + Shift + ←/→" }));
    switcher.append(sequenceTabs, navigationShortcut, addSequence);
    builder.append(switcher);

    const editor = element("section", { className: "sequence-editor" });
    editor.setAttribute("aria-labelledby", "sequence-heading");
    const editorHeader = element("div", { className: "sequence-editor__header" });
    editorHeader.append(element("p", {
      className: "eyebrow",
      id: "sequence-heading",
      text: `Sequence ${sequenceIndex + 1} of ${sequences.length}`,
    }));
    const deleteSequence = button("×", "icon-button", "delete-sequence");
    deleteSequence.disabled = sequences.length === 1;
    deleteSequence.setAttribute("aria-label", `Delete sequence ${sequenceIndex + 1}`);
    editorHeader.append(deleteSequence);
    editor.append(editorHeader);

    const sequenceFields = element("div", { className: "sequence-fields" });
    const sequenceLabel = fieldLabel(
      "Sequence name",
      "sequence-name",
      "The objective title shown while the player performs this sequence.",
    );
    const sequenceName = element("input", { id: "sequence-name" });
    sequenceName.value = sequence.name;
    sequenceName.placeholder = "Mining Camp";
    sequenceFields.append(sequenceLabel, sequenceName);

    const selectionLabel = fieldLabel(
      "Selected at start",
      "sequence-starting-selection",
      "Tells the trainer which unit or building menu should be visible before the first step.",
    );
    const selectionControl = element("div", { className: "selection-search" });
    const selection = element("input", { id: "sequence-starting-selection" });
    selection.type = "search";
    selection.autocomplete = "off";
    selection.value = sequence.startingSelectionText;
    selection.placeholder = "Search units or buildings";
    selection.setAttribute("role", "combobox");
    selection.setAttribute("aria-autocomplete", "list");
    selection.setAttribute("aria-controls", "sequence-starting-selection-results");
    selection.setAttribute("aria-expanded", String(selectionSearchOpen));
    const selectionMatches = matchingSelections();
    if (selectionMatches.length > 0) {
      selection.setAttribute(
        "aria-activedescendant",
        `sequence-starting-selection-option-${selectionActiveIndex}`,
      );
    }
    selectionControl.append(selection);
    if (selectionSearchOpen) {
      const results = element("div", {
        className: "action-results selection-results",
        id: "sequence-starting-selection-results",
      });
      results.setAttribute("role", "listbox");
      if (selectionMatches.length === 0) {
        results.append(element("p", { className: "empty-state", text: "No selections match this search." }));
      } else {
        selectionMatches.forEach((choice, index) => {
          const isSelected = startingSelectionKey(choice.selection)
            === startingSelectionKey(sequence.startingSelection);
          const result = button(
            "",
            `action-result selection-result${index === selectionActiveIndex ? " action-result--active" : ""}${isSelected ? " selection-result--selected" : ""}`,
          );
          result.id = `sequence-starting-selection-option-${index}`;
          result.dataset.selectStartingSelection = startingSelectionKey(choice.selection);
          result.setAttribute("role", "option");
          result.setAttribute("aria-selected", String(isSelected));
          const copy = element("span");
          copy.append(
            element("strong", { text: choice.label }),
            element("small", { text: choice.group }),
          );
          result.append(copy);
          if (isSelected) result.append(element("small", { className: "selection-result__current", text: "Selected" }));
          results.append(result);
        });
      }
      selectionControl.append(results);
    }
    sequenceFields.append(selectionLabel, selectionControl);

    const proTargetLabel = fieldLabel(
      "Pro target time",
      "sequence-pro-target",
      "The expert completion goal. The trainer calculates all easier difficulty targets automatically.",
    );
    const proTarget = element("div", { className: "duration-field" });
    const proTargetInput = element("input", { id: "sequence-pro-target" });
    proTargetInput.type = "number";
    proTargetInput.min = "0.05";
    proTargetInput.step = "0.05";
    proTargetInput.value = String(sequence.proTargetMs / 1000);
    proTarget.append(proTargetInput, element("span", { text: "seconds" }));
    sequenceFields.append(proTargetLabel, proTarget);
    editor.append(sequenceFields);

    const steps = element("div", { className: "builder-steps" });
    sequence.steps.forEach((step, index) => steps.append(renderStep(step, index)));
    editor.append(steps, renderStepSearch());
    builder.append(editor);

    if (errorMessage) {
      const error = element("p", { className: "builder-error", text: errorMessage });
      error.setAttribute("role", "alert");
      builder.append(error);
    }

    root.replaceChildren(builder);
    bindEvents();
  }

  function renderAndRestoreSearchFocus(): void {
    render();
    const search = root.querySelector<HTMLInputElement>("#step-search");
    search?.focus();
    search?.setSelectionRange(searchQuery.length, searchQuery.length);
    root.querySelector<HTMLElement>(`#step-search-option-${stepActiveIndex}`)
      ?.scrollIntoView({ block: "nearest" });
  }

  function renderAndRestoreSelectionFocus(selectText = false): void {
    if (!selectionSearchOpen) suppressSelectionOpenOnce = true;
    render();
    const search = root.querySelector<HTMLInputElement>("#sequence-starting-selection");
    search?.focus();
    if (selectText) search?.select();
    else search?.setSelectionRange(search.value.length, search.value.length);
    root.querySelector<HTMLElement>(`#sequence-starting-selection-option-${selectionActiveIndex}`)
      ?.scrollIntoView({ block: "nearest" });
  }

  function renderAndFocusSequenceName(): void {
    render();
    root.querySelector<HTMLInputElement>("#sequence-name")?.focus();
    root.querySelector<HTMLElement>(".sequence-tab--active")
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }

  function addStep(choiceId: string): void {
    const choice = preparedActions.find((candidate) => candidate.id === choiceId);
    if (!choice) return;
    if (choice.type === "click") {
      currentSequence().steps.push({ type: "click", label: "Left click anywhere" });
    } else {
      currentSequence().steps.push({ type: "hotkey", action: choice.id, label: choice.label });
    }
    searchQuery = "";
    stepActiveIndex = 0;
    renderAndRestoreSearchFocus();
  }

  function chooseStartingSelection(selectionKey: string): void {
    const choice = STARTING_SELECTION_CHOICES.find((candidate) =>
      startingSelectionKey(candidate.selection) === selectionKey
    );
    if (!choice) return;
    const sequence = currentSequence();
    sequence.startingSelection = { ...choice.selection };
    sequence.startingSelectionText = choice.label;
    selectionSearchOpen = false;
    selectionFiltering = false;
    selectionActiveIndex = 0;
    renderAndRestoreSelectionFocus();
  }

  function switchSequence(nextIndex: number, focusName = false): void {
    sequenceIndex = nextIndex;
    searchQuery = "";
    stepActiveIndex = 0;
    selectionSearchOpen = false;
    selectionFiltering = false;
    selectionActiveIndex = 0;
    if (focusName) renderAndFocusSequenceName();
    else render();
  }

  function addSequence(): void {
    sequences.push(newSequence(nextSequenceNumber(sequences)));
    switchSequence(sequences.length - 1, true);
  }

  function bindEvents(): void {
    root.querySelector<HTMLElement>(".builder")?.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        addSequence();
        return;
      }
      if (
        (!event.ctrlKey && !event.metaKey)
        || !event.shiftKey
        || (event.key !== "ArrowLeft" && event.key !== "ArrowRight")
      ) return;
      event.preventDefault();
      const direction = event.key === "ArrowLeft" ? -1 : 1;
      const nextIndex = sequenceIndex + direction;
      if (nextIndex >= 0 && nextIndex < sequences.length) {
        switchSequence(nextIndex, true);
      }
    });
    root.querySelector<HTMLButtonElement>("#builder-back")?.addEventListener("click", options.onBack);
    root.querySelector<HTMLButtonElement>("#delete-drill")?.addEventListener("click", () => options.onDelete?.());
    root.querySelector<HTMLButtonElement>("#toggle-drill-details")?.addEventListener("click", () => {
      detailsExpanded = !detailsExpanded;
      render();
      if (detailsExpanded) root.querySelector<HTMLInputElement>("#drill-name")?.focus();
      else root.querySelector<HTMLInputElement>("#sequence-name")?.focus();
    });
    root.querySelector<HTMLInputElement>("#drill-name")?.addEventListener("input", (event) => {
      name = (event.currentTarget as HTMLInputElement).value;
      const summaryName = root.querySelector<HTMLElement>(".builder-details__name");
      if (summaryName) summaryName.textContent = name.trim() || "Untitled drill";
    });
    root.querySelector<HTMLTextAreaElement>("#drill-description")?.addEventListener("input", (event) => {
      description = (event.currentTarget as HTMLTextAreaElement).value;
    });
    root.querySelector<HTMLInputElement>("#sequence-name")?.addEventListener("input", (event) => {
      const sequenceName = (event.currentTarget as HTMLInputElement).value;
      currentSequence().name = sequenceName;
      const activeTab = root.querySelector<HTMLButtonElement>(".sequence-tab--active");
      if (activeTab) {
        activeTab.textContent = `${sequenceIndex + 1}. ${sequenceName.trim() || "Untitled sequence"}`;
      }
    });
    root.querySelector<HTMLInputElement>("#sequence-starting-selection")?.addEventListener("focus", () => {
      if (suppressSelectionOpenOnce) {
        suppressSelectionOpenOnce = false;
        return;
      }
      if (selectionSearchOpen) return;
      selectionSearchOpen = true;
      selectionFiltering = false;
      selectionActiveIndex = Math.max(0, STARTING_SELECTION_CHOICES.findIndex((choice) =>
        startingSelectionKey(choice.selection) === startingSelectionKey(currentSequence().startingSelection)
      ));
      renderAndRestoreSelectionFocus(true);
    });
    root.querySelector<HTMLInputElement>("#sequence-starting-selection")?.addEventListener("input", (event) => {
      currentSequence().startingSelectionText = (event.currentTarget as HTMLInputElement).value;
      selectionSearchOpen = true;
      selectionFiltering = true;
      selectionActiveIndex = 0;
      renderAndRestoreSelectionFocus();
    });
    root.querySelector<HTMLInputElement>("#sequence-starting-selection")?.addEventListener("keydown", (event) => {
      const matches = matchingSelections();
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        selectionSearchOpen = true;
        selectionActiveIndex = moveActiveIndex(
          selectionActiveIndex,
          event.key === "ArrowDown" ? 1 : -1,
          matches.length,
        );
        renderAndRestoreSelectionFocus();
      } else if (event.key === "Enter") {
        const choice = matches[selectionActiveIndex];
        if (choice) {
          event.preventDefault();
          chooseStartingSelection(startingSelectionKey(choice.selection));
        }
      } else if (event.key === "Escape" && selectionSearchOpen) {
        event.preventDefault();
        const sequence = currentSequence();
        sequence.startingSelectionText = selectedAtStartLabel(sequence.startingSelection);
        selectionSearchOpen = false;
        selectionFiltering = false;
        selectionActiveIndex = 0;
        renderAndRestoreSelectionFocus();
      }
    });
    root.querySelector<HTMLElement>(".selection-search")?.addEventListener("focusout", (event) => {
      const control = event.currentTarget as HTMLElement;
      const nextTarget = event.relatedTarget;
      queueMicrotask(() => {
        if (!control.isConnected) return;
        if (nextTarget instanceof Node && control.contains(nextTarget)) return;
        const sequence = currentSequence();
        sequence.startingSelectionText = selectedAtStartLabel(sequence.startingSelection);
        selectionSearchOpen = false;
        selectionFiltering = false;
        selectionActiveIndex = 0;
        control.querySelector(".selection-results")?.remove();
        const input = control.querySelector<HTMLInputElement>("#sequence-starting-selection");
        if (input) {
          input.value = sequence.startingSelectionText;
          input.setAttribute("aria-expanded", "false");
          input.removeAttribute("aria-activedescendant");
        }
      });
    });
    root.querySelectorAll<HTMLButtonElement>("[data-select-starting-selection]").forEach((item) =>
      item.addEventListener("click", () =>
        chooseStartingSelection(item.dataset.selectStartingSelection ?? "")
      )
    );
    root.querySelector<HTMLInputElement>("#sequence-pro-target")?.addEventListener("input", (event) => {
      currentSequence().proTargetMs = Math.round(
        Number((event.currentTarget as HTMLInputElement).value) * 1000,
      );
    });
    root.querySelectorAll<HTMLButtonElement>("[data-delete-step]").forEach((item) =>
      item.addEventListener("click", () => {
        currentSequence().steps.splice(Number(item.dataset.deleteStep), 1);
        render();
      })
    );
    root.querySelector<HTMLInputElement>("#step-search")?.addEventListener("input", (event) => {
      searchQuery = (event.currentTarget as HTMLInputElement).value;
      stepActiveIndex = 0;
      renderAndRestoreSearchFocus();
    });
    root.querySelector<HTMLInputElement>("#step-search")?.addEventListener("keydown", (event) => {
      const matches = matchingActions();
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        stepActiveIndex = moveActiveIndex(
          stepActiveIndex,
          event.key === "ArrowDown" ? 1 : -1,
          matches.length,
        );
        renderAndRestoreSearchFocus();
      } else if (event.key === "Enter") {
        const activeMatch = matches[stepActiveIndex];
        if (activeMatch) {
          event.preventDefault();
          addStep(activeMatch.id);
        }
      } else if (event.key === "Escape" && searchQuery !== "") {
        searchQuery = "";
        stepActiveIndex = 0;
        renderAndRestoreSearchFocus();
      }
    });
    root.querySelectorAll<HTMLButtonElement>("[data-add-step]").forEach((item) =>
      item.addEventListener("click", () => addStep(item.dataset.addStep ?? ""))
    );
    root.querySelectorAll<HTMLButtonElement>("[data-sequence-index]").forEach((item) =>
      item.addEventListener("click", () => switchSequence(Number(item.dataset.sequenceIndex)))
    );
    root.querySelector<HTMLButtonElement>("#add-sequence")?.addEventListener("click", addSequence);
    root.querySelector<HTMLButtonElement>("#delete-sequence")?.addEventListener("click", () => {
      if (sequences.length === 1) return;
      sequences.splice(sequenceIndex, 1);
      switchSequence(Math.min(sequenceIndex, sequences.length - 1));
      root.querySelector<HTMLElement>(".sequence-tab--active")
        ?.scrollIntoView({ block: "nearest", inline: "nearest" });
    });
    root.querySelector<HTMLButtonElement>("#save-drill")?.addEventListener("click", save);
  }

  function save(): void {
    errorMessage = "";
    if (name.trim() === "") {
      errorMessage = "Enter a drill name.";
    } else {
      const invalidSequence = sequences.findIndex((sequence) =>
        sequence.name.trim() === ""
        || sequence.steps.length === 0
        || !Number.isInteger(sequence.proTargetMs)
        || sequence.proTargetMs <= 0
        || selectedAtStartLabel(sequence.startingSelection).toLowerCase()
          !== sequence.startingSelectionText.trim().toLowerCase()
      );
      if (invalidSequence >= 0) {
        errorMessage = `Complete the name, starting selection, steps, and Pro target time for sequence ${invalidSequence + 1}.`;
      }
    }
    if (errorMessage) {
      render();
      root.querySelector<HTMLElement>(".builder-error")?.scrollIntoView({ block: "center" });
      return;
    }

    options.onSave({
      id: draftId,
      name: name.trim(),
      description: description.trim() || "Custom drill",
      sequences: sequences.map((sequence) => ({
        id: sequence.id,
        name: sequence.name.trim(),
        startingSelection: { ...sequence.startingSelection },
        steps: sequence.steps.map((step) => ({ ...step })),
        targetTimeMs: targetTimesFromPro(sequence.proTargetMs),
      })),
    });
  }

  render();
}
