import type { HotkeyActionDefinition } from "./hotkey-actions";
import { DIFFICULTIES, type Drill, type FailureHandling, type Step } from "./types";

interface DraftSequence {
  id: string;
  name: string;
  steps: Step[];
  targetTimeMs: [number, number, number, number, number, number, number];
}

interface BuilderOptions {
  actions: HotkeyActionDefinition[];
  initialDrill?: Drill;
  bindingForAction: (actionId: string) => string;
  onBack: () => void;
  onDelete?: () => void;
  onSave: (drill: Drill) => void;
}

const DEFAULT_TARGETS: DraftSequence["targetTimeMs"] = [6500, 5200, 4200, 3300, 2600, 2000, 1500];
const MAX_VISIBLE_ACTIONS = 50;

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

function labelledControl(text: string, control: HTMLElement): HTMLLabelElement {
  const label = element("label", { text });
  label.append(control);
  return label;
}

function newSequence(number: number): DraftSequence {
  return { id: `sequence-${number}`, name: "", steps: [], targetTimeMs: [...DEFAULT_TARGETS] };
}

export function mountDrillBuilder(root: HTMLElement, options: BuilderOptions): void {
  const initial = options.initialDrill;
  const draftId = initial?.id ?? `custom-${Date.now()}`;
  let name = initial?.name ?? "";
  let description = initial?.description ?? "";
  let totalTimeMs = initial?.totalTimeMs ?? 60_000;
  let sequences: DraftSequence[] = initial?.sequences.map((sequence) => ({
    id: sequence.id,
    name: sequence.name,
    steps: sequence.steps.map((step): Step => step.type === "hotkey"
      ? { ...step }
      : { ...step, label: "Left click anywhere" }),
    targetTimeMs: [...sequence.targetTimeMs],
  })) ?? [newSequence(1)];
  let sequenceIndex = 0;
  let modalOpen = false;
  let modalLoading = false;
  let preparedActions: Array<HotkeyActionDefinition & { binding: string; searchText: string }> | null = null;
  let searchQuery = "";
  let errorMessage = "";

  function currentSequence(): DraftSequence {
    const sequence = sequences[sequenceIndex];
    if (!sequence) throw new Error("No sequence is selected.");
    return sequence;
  }

  function renderStep(step: Step, index: number): HTMLElement {
    const article = element("article", { className: "builder-step" });
    const summary = element("div", { className: "builder-step__summary" });
    summary.append(element("span", { className: "builder-step__number", text: `${index + 1}.` }));

    const stepLabel = button("", "builder-step__label");
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

    const fields = element("div", { className: "builder-step__fields" });
    const tip = element("input");
    tip.dataset.stepTip = String(index);
    tip.value = step.tip ?? "";
    tip.placeholder = "Optional explanation";
    tip.setAttribute("aria-label", `Optional tip for step ${index + 1}`);
    fields.append(labelledControl("Tip", tip));

    const failure = element("select");
    failure.dataset.stepFailure = String(index);
    failure.setAttribute("aria-label", `Failure handling for step ${index + 1}`);
    const wait = element("option", { text: "Wait" });
    wait.value = "wait";
    const restart = element("option", { text: "Restart sequence" });
    restart.value = "restart_sequence";
    failure.append(wait, restart);
    failure.value = step.onFailure;
    fields.append(labelledControl("On incorrect input", failure));
    article.append(fields);
    return article;
  }

  function modalHeader(): HTMLElement {
    const header = element("div", { className: "builder-modal__header" });
    const copy = element("div");
    copy.append(element("p", { className: "eyebrow", text: "Add hotkey step" }), element("h2", { id: "hotkey-dialog-title", text: "Choose an action" }));
    const close = button("×", "icon-button", "close-hotkey-modal");
    close.setAttribute("aria-label", "Close action search");
    header.append(copy, close);
    return header;
  }

  function renderModal(): HTMLElement | null {
    if (!modalOpen) return null;
    const backdrop = element("div", { className: "builder-modal" });
    backdrop.dataset.modalBackdrop = "";
    backdrop.setAttribute("role", "presentation");
    const dialog = element("section", { className: "builder-modal__dialog" });
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.setAttribute("aria-labelledby", "hotkey-dialog-title");
    dialog.append(modalHeader());
    backdrop.append(dialog);

    if (modalLoading) {
      dialog.setAttribute("aria-busy", "true");
      const loading = element("div", { className: "action-loading" });
      loading.setAttribute("role", "status");
      const spinner = element("span", { className: "loading-spinner" });
      spinner.setAttribute("aria-hidden", "true");
      loading.append(spinner, element("p", { text: "Loading hotkey actions…" }));
      dialog.append(loading);
      return backdrop;
    }

    const searchLabel = element("label", { className: "search-field", text: "Search by action or hotkey" });
    searchLabel.htmlFor = "action-search";
    const search = element("input", { id: "action-search" });
    search.type = "search";
    search.value = searchQuery;
    search.placeholder = "Example: mining camp or E";
    search.autocomplete = "off";
    dialog.append(searchLabel, search);

    const normalized = searchQuery.trim().toLowerCase();
    const matches = (preparedActions ?? []).filter((action) => action.searchText.includes(normalized));
    const visibleMatches = matches.slice(0, MAX_VISIBLE_ACTIONS);
    const countText = matches.length > visibleMatches.length
      ? `Showing ${visibleMatches.length} of ${matches.length} matches. Refine your search to see more.`
      : `${matches.length} matching action${matches.length === 1 ? "" : "s"}.`;
    dialog.append(element("p", { className: "action-results__count", text: countText }));
    const results = element("div", { className: "action-results" });
    results.setAttribute("role", "listbox");
    if (visibleMatches.length === 0) {
      results.append(element("p", { className: "empty-state", text: "No actions match this search." }));
    } else {
      for (const action of visibleMatches) {
        const result = button("", "action-result");
        result.dataset.addAction = action.id;
        result.setAttribute("role", "option");
        const copy = element("span");
        copy.append(element("strong", { text: action.label }), element("small", { text: action.id }));
        result.append(copy, element("kbd", { text: action.binding }));
        results.append(result);
      }
    }
    dialog.append(results);
    return backdrop;
  }

  function render(): void {
    const sequence = currentSequence();
    const builder = element("section", { className: "builder" });
    builder.setAttribute("aria-labelledby", "builder-title");

    const topbar = element("div", { className: "builder__topbar" });
    topbar.append(button("← Back", "button button--text", "builder-back"));
    topbar.append(element("p", { className: "eyebrow", id: "builder-title", text: initial ? "Edit custom drill" : "Create custom drill" }));
    const topActions = element("div", { className: "builder__topbar-actions" });
    if (initial) topActions.append(button("Delete drill", "button button--danger", "delete-drill"));
    topActions.append(button("Save drill", "button button--secondary", "save-drill"));
    topbar.append(topActions);
    builder.append(topbar);

    const metadata = element("div", { className: "builder__metadata" });
    const nameLabel = element("label", { text: "Drill name" });
    nameLabel.htmlFor = "drill-name";
    const nameInput = element("input", { id: "drill-name" });
    nameInput.value = name;
    nameInput.placeholder = "Villager Building Placement";
    const descriptionLabel = element("label", { text: "Description" });
    descriptionLabel.htmlFor = "drill-description";
    const descriptionInput = element("textarea", { id: "drill-description" });
    descriptionInput.rows = 2;
    descriptionInput.value = description;
    descriptionInput.placeholder = "Practice villager building-placement sequences";
    const durationLabel = element("label", { text: "Total drill time" });
    durationLabel.htmlFor = "drill-duration";
    const duration = element("div", { className: "duration-field" });
    const durationInput = element("input", { id: "drill-duration" });
    durationInput.type = "number";
    durationInput.min = "1";
    durationInput.step = "1";
    durationInput.value = String(Math.round(totalTimeMs / 1000));
    duration.append(durationInput, element("span", { text: "seconds" }));
    metadata.append(nameLabel, nameInput, descriptionLabel, descriptionInput, durationLabel, duration);
    builder.append(metadata);

    const editor = element("section", { className: "sequence-editor" });
    editor.setAttribute("aria-labelledby", "sequence-heading");
    const editorHeader = element("div", { className: "sequence-editor__header" });
    editorHeader.append(element("p", { className: "eyebrow", id: "sequence-heading", text: `Sequence ${sequenceIndex + 1} of ${sequences.length}` }));
    const deleteSequence = button("×", "icon-button", "delete-sequence");
    deleteSequence.disabled = sequences.length === 1;
    deleteSequence.setAttribute("aria-label", `Delete sequence ${sequenceIndex + 1}`);
    editorHeader.append(deleteSequence);
    editor.append(editorHeader);

    const sequenceLabel = element("label", { text: "Name" });
    sequenceLabel.htmlFor = "sequence-name";
    const sequenceName = element("input", { id: "sequence-name" });
    sequenceName.value = sequence.name;
    sequenceName.placeholder = "Mining Camp";
    editor.append(sequenceLabel, sequenceName);

    const targetFieldset = element("fieldset", { className: "target-times" });
    targetFieldset.append(element("legend", { text: "Target time" }), element("p", { text: "Completion time for each difficulty." }));
    const targetGrid = element("div", { className: "target-times__grid" });
    DIFFICULTIES.forEach((difficulty, index) => {
      const input = element("input");
      input.dataset.targetTime = String(index);
      input.type = "number";
      input.min = "1";
      input.step = "100";
      input.value = String(sequence.targetTimeMs[index]);
      const value = element("span");
      value.append(input, element("small", { text: "ms" }));
      const label = element("label", { text: difficulty });
      label.append(value);
      targetGrid.append(label);
    });
    targetFieldset.append(targetGrid);
    editor.append(targetFieldset);

    const steps = element("div", { className: "builder-steps" });
    if (sequence.steps.length === 0) steps.append(element("p", { className: "empty-state", text: "Add the first hotkey or left-click step for this sequence." }));
    else sequence.steps.forEach((step, index) => steps.append(renderStep(step, index)));
    editor.append(steps);

    const addActions = element("div", { className: "add-step-actions" });
    addActions.append(button("+ Add hotkey step", "button button--secondary", "add-hotkey-step"), button("+ Add left-click step", "button button--secondary", "add-click-step"));
    editor.append(addActions);
    const navigation = element("div", { className: "sequence-navigation" });
    const previous = button("← Prev sequence", "button button--text", "previous-sequence");
    previous.disabled = sequenceIndex === 0;
    const addSequence = button("+ Add another sequence", "button button--secondary", "add-sequence");
    const next = button("Next sequence →", "button button--text", "next-sequence");
    next.disabled = sequenceIndex === sequences.length - 1;
    navigation.append(previous, addSequence, next);
    editor.append(navigation);
    builder.append(editor);
    if (errorMessage) {
      const error = element("p", { className: "builder-error", text: errorMessage });
      error.setAttribute("role", "alert");
      builder.append(error);
    }

    const modal = renderModal();
    root.replaceChildren(builder, ...(modal ? [modal] : []));
    bindEvents();
  }

  function bindEvents(): void {
    root.querySelector<HTMLButtonElement>("#builder-back")?.addEventListener("click", options.onBack);
    root.querySelector<HTMLButtonElement>("#delete-drill")?.addEventListener("click", () => options.onDelete?.());
    root.querySelector<HTMLInputElement>("#drill-name")?.addEventListener("input", (event) => { name = (event.currentTarget as HTMLInputElement).value; });
    root.querySelector<HTMLTextAreaElement>("#drill-description")?.addEventListener("input", (event) => { description = (event.currentTarget as HTMLTextAreaElement).value; });
    root.querySelector<HTMLInputElement>("#drill-duration")?.addEventListener("input", (event) => { totalTimeMs = Number((event.currentTarget as HTMLInputElement).value) * 1000; });
    root.querySelector<HTMLInputElement>("#sequence-name")?.addEventListener("input", (event) => { currentSequence().name = (event.currentTarget as HTMLInputElement).value; });
    root.querySelectorAll<HTMLInputElement>("[data-target-time]").forEach((input) => input.addEventListener("input", () => { currentSequence().targetTimeMs[Number(input.dataset.targetTime)] = Number(input.value); }));
    root.querySelectorAll<HTMLInputElement>("[data-step-tip]").forEach((input) => input.addEventListener("input", () => { const step = currentSequence().steps[Number(input.dataset.stepTip)]; if (step) step.tip = input.value; }));
    root.querySelectorAll<HTMLSelectElement>("[data-step-failure]").forEach((select) => select.addEventListener("change", () => { const step = currentSequence().steps[Number(select.dataset.stepFailure)]; if (step) step.onFailure = select.value as FailureHandling; }));
    root.querySelectorAll<HTMLButtonElement>("[data-delete-step]").forEach((item) => item.addEventListener("click", () => { currentSequence().steps.splice(Number(item.dataset.deleteStep), 1); render(); }));
    root.querySelector<HTMLButtonElement>("#add-hotkey-step")?.addEventListener("click", openHotkeyModal);
    root.querySelector<HTMLButtonElement>("#add-click-step")?.addEventListener("click", () => { currentSequence().steps.push({ type: "click", label: "Left click anywhere", onFailure: "wait" }); render(); });
    root.querySelector<HTMLInputElement>("#action-search")?.addEventListener("input", (event) => { searchQuery = (event.currentTarget as HTMLInputElement).value; render(); const input = root.querySelector<HTMLInputElement>("#action-search"); input?.focus(); input?.setSelectionRange(searchQuery.length, searchQuery.length); });
    root.querySelector<HTMLButtonElement>("#close-hotkey-modal")?.addEventListener("click", closeModal);
    root.querySelector<HTMLElement>("[data-modal-backdrop]")?.addEventListener("click", (event) => { if (event.target === event.currentTarget) closeModal(); });
    root.querySelectorAll<HTMLButtonElement>("[data-add-action]").forEach((item) => item.addEventListener("click", () => { const action = options.actions.find((candidate) => candidate.id === item.dataset.addAction); if (!action) return; currentSequence().steps.push({ type: "hotkey", action: action.id, label: action.label, onFailure: "wait" }); modalOpen = false; render(); }));
    root.querySelector<HTMLButtonElement>("#previous-sequence")?.addEventListener("click", () => { sequenceIndex -= 1; render(); });
    root.querySelector<HTMLButtonElement>("#next-sequence")?.addEventListener("click", () => { sequenceIndex += 1; render(); });
    root.querySelector<HTMLButtonElement>("#add-sequence")?.addEventListener("click", () => { sequences.push(newSequence(sequences.length + 1)); sequenceIndex = sequences.length - 1; render(); });
    root.querySelector<HTMLButtonElement>("#delete-sequence")?.addEventListener("click", () => { if (sequences.length === 1) return; sequences.splice(sequenceIndex, 1); sequenceIndex = Math.min(sequenceIndex, sequences.length - 1); render(); });
    root.querySelector<HTMLButtonElement>("#save-drill")?.addEventListener("click", save);
  }

  function openHotkeyModal(): void {
    modalOpen = true;
    searchQuery = "";
    if (preparedActions) { modalLoading = false; render(); root.querySelector<HTMLInputElement>("#action-search")?.focus(); return; }
    modalLoading = true;
    render();
    window.requestAnimationFrame(() => window.setTimeout(() => {
      if (!modalOpen) return;
      preparedActions ??= options.actions.map((action) => {
        const binding = options.bindingForAction(action.id);
        return { ...action, binding, searchText: `${action.label} ${binding}`.toLowerCase() };
      });
      modalLoading = false;
      render();
      root.querySelector<HTMLInputElement>("#action-search")?.focus();
    }, 0));
  }

  function closeModal(): void { modalOpen = false; modalLoading = false; render(); }

  function save(): void {
    errorMessage = "";
    if (name.trim() === "") errorMessage = "Enter a drill name.";
    else if (!Number.isInteger(totalTimeMs) || totalTimeMs <= 0) errorMessage = "Total drill time must be a positive number of seconds.";
    else {
      const invalidSequence = sequences.findIndex((sequence) => sequence.name.trim() === "" || sequence.steps.length === 0 || sequence.targetTimeMs.some((time) => !Number.isInteger(time) || time <= 0));
      if (invalidSequence >= 0) errorMessage = `Complete the name, steps, and seven target times for sequence ${invalidSequence + 1}.`;
    }
    if (errorMessage) { render(); root.querySelector<HTMLElement>(".builder-error")?.scrollIntoView({ block: "center" }); return; }
    options.onSave({
      id: draftId,
      name: name.trim(),
      description: description.trim() || "Custom drill",
      totalTimeMs,
      sequences: sequences.map((sequence) => ({ id: sequence.id, name: sequence.name.trim(), steps: sequence.steps.map((step) => ({ ...step })), targetTimeMs: [...sequence.targetTimeMs] })),
    });
  }

  render();
}
