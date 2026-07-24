import { renderCommandPanel, renderSequenceTarget } from "./command-panel";
import { customDrillFilename, drillToCustomFile, friendlyCustomDrillId, loadCustomDrills, parseCustomDrill, persistCustomDrills, upsertCustomDrill } from "./custom-drills";
import { createDefaultProfile } from "./default-profile";
import { mountDrillBuilder } from "./drill-builder";
import { BUILTIN_DRILLS, getRequiredActions } from "./drills";
import { actionsForStringIds, getHotkeyAction } from "./hotkey-actions";
import { eventMatchesBinding, formatBinding, isModifierOnly, isWheelBinding, MAX_HOTKEY_FILE_BYTES, MAX_HOTKEY_FILES, parseHotkeyFiles, wheelEventMatchesBinding, type HotkeyBinding, type HotkeyProfile, type NamedBuffer } from "./hotkey-file";
import { createSession, exitSession, getDrillElapsedMs, getSequenceElapsedMs, submitAttempt, tickSession, togglePause } from "./trainer";
import { DIFFICULTIES, type Drill, type Session, type Step } from "./types";

type Screen = "setup" | "drills" | "builder" | "practice" | "results";
type FeedbackKind = "correct" | "incorrect" | "neutral";

const appElement = document.querySelector<HTMLDivElement>("#app");
if (!appElement) throw new Error("App root was not found.");
const app = appElement;

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

function navigate(path: string, replace = false): void {
  if (replace) location.replace(path);
  else location.assign(path);
}

function initialScreen(): Screen {
  const path = location.pathname.replace(/\/+$/, "") || "/";
  if (path === "/drills") return "drills";
  if (path === "/drills/create") return "builder";
  if (path === "/drills/edit") return new URLSearchParams(location.search).has("drillId") ? "builder" : "drills";
  return path.startsWith("/drills/") ? "drills" : "setup";
}

let screen: Screen = initialScreen();
let selectedDrillIndex = 0;
let selectedDifficultyIndex = 2;
let hotkeySource: "default" | "custom" = "default";
const loadedCustomDrills = loadCustomDrills();
let customDrills = loadedCustomDrills.drills;
const requestedDrillId = new URLSearchParams(location.search).get("drillId");
const requestedIndex = [...BUILTIN_DRILLS, ...customDrills].findIndex((drill) => drill.id === requestedDrillId);
if (requestedIndex >= 0) selectedDrillIndex = requestedIndex;
let drillMessage = customDrills.length > 0
  ? `${customDrills.length} custom drill${customDrills.length === 1 ? "" : "s"} restored from this browser.`
  : "Create a drill here or upload a custom-drill JSON file.";
let drillMessageError = false;
let profile: HotkeyProfile | null = createDefaultProfile();
const uploadedHotkeyFiles = new Map<"profile" | "base", NamedBuffer>();
let session: Session | null = null;
let uploadMessage = "Choose both Hotkeys.hkp and Base.hkp from the same AoE II hotkey profile.";
let uploadError = false;
let feedback: { kind: FeedbackKind; text: string } = { kind: "neutral", text: "Waiting for your input…" };

function allDrills(): Drill[] { return [...BUILTIN_DRILLS, ...customDrills]; }

function selectedDrill(): Drill {
  const drill = allDrills()[selectedDrillIndex];
  if (!drill) throw new Error("No drill is selected.");
  return drill;
}

function bindingsForAction(actionId: string): HotkeyBinding[] {
  const action = getHotkeyAction(actionId);
  return profile && action ? profile.bindings.get(action.stringId) ?? [] : [];
}

function missingActions(drill: Drill): string[] {
  return getRequiredActions(drill).filter((action) => (profile?.bindings.get(action.stringId)?.length ?? 0) === 0).map((action) => action.label);
}

function hasHotkeyFilePair(): boolean { return uploadedHotkeyFiles.has("profile") && uploadedHotkeyFiles.has("base"); }
function hotkeyProfileReady(): boolean { return hotkeySource === "default" || hasHotkeyFilePair(); }
function formatBindingList(bindings: HotkeyBinding[]): string { return bindings.length > 0 ? bindings.map(formatBinding).join(" / ") : "Unmapped"; }

function formatDuration(milliseconds: number): string {
  const safe = Math.max(0, milliseconds);
  return safe < 10_000 ? `${Math.round(safe)} ms` : `${(safe / 1000).toFixed(1)} s`;
}

function formatClock(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1000));
  return `${Math.floor(totalSeconds / 60)}:${(totalSeconds % 60).toString().padStart(2, "0")}`;
}

function accuracy(correct: number, total: number): number { return total === 0 ? 0 : (correct / total) * 100; }

function mappingRow(actionId: string, label: string): HTMLLIElement {
  const bindings = bindingsForAction(actionId);
  const row = element("li", { className: `mapping-row${bindings.length === 0 ? " mapping-row--missing" : ""}` });
  row.append(element("span", { text: label }), element("kbd", { text: formatBindingList(bindings) }));
  return row;
}

function mappingRows(drill: Drill): HTMLLIElement[] {
  return getRequiredActions(drill).map((action) => mappingRow(action.id, action.label));
}

let setupBound = false;
function renderSetup(): void {
  const drill = selectedDrill();
  const missing = missingActions(drill);
  const drillSelect = app.querySelector<HTMLSelectElement>("#drill-select");
  const difficultySelect = app.querySelector<HTMLSelectElement>("#difficulty-select");
  if (!drillSelect || !difficultySelect) return;

  const drillOptions = allDrills().map((item, index) => {
    const option = element("option", { text: `${index >= BUILTIN_DRILLS.length ? "Custom: " : ""}${item.name}` });
    option.value = String(index);
    option.selected = index === selectedDrillIndex;
    return option;
  });
  drillSelect.replaceChildren(...drillOptions);
  difficultySelect.value = String(selectedDifficultyIndex);
  const duration = app.querySelector<HTMLElement>("#drill-duration");
  const sequences = app.querySelector<HTMLElement>("#drill-sequences");
  if (duration) duration.textContent = formatClock(drill.totalTimeMs);
  if (sequences) sequences.textContent = String(drill.sequences.length);

  const warning = app.querySelector<HTMLElement>("#mapping-warning");
  if (warning) {
    warning.hidden = !(profile && missing.length > 0);
    const title = warning.querySelector("strong");
    if (title) title.textContent = `${missing.length} required hotkey${missing.length === 1 ? " is" : "s are"} missing.`;
  }
  const start = app.querySelector<HTMLButtonElement>("#start-button");
  if (start) start.disabled = !(profile && hotkeyProfileReady() && missing.length === 0);

  const profileSource = app.querySelector<HTMLSelectElement>("#profile-source");
  if (profileSource) profileSource.value = hotkeySource;
  const profileStatus = app.querySelector<HTMLElement>("#profile-status");
  if (profileStatus) {
    const ready = hotkeyProfileReady();
    profileStatus.textContent = ready ? "Ready" : "Required";
    profileStatus.classList.toggle("status-pill--ready", ready);
  }
  const uploadTitle = app.querySelector<HTMLElement>("#profile-upload-title");
  if (uploadTitle) uploadTitle.textContent = uploadedHotkeyFiles.size > 0 ? "Replace custom files" : "Upload custom files";
  const message = app.querySelector<HTMLElement>("#upload-message");
  if (message) { message.textContent = uploadMessage; message.classList.toggle("upload-message--error", uploadError); }
  const chips = app.querySelector<HTMLElement>("#file-chips");
  if (chips) {
    chips.hidden = uploadedHotkeyFiles.size === 0;
    chips.replaceChildren(...[...uploadedHotkeyFiles.values()].map((file) => element("span", { text: file.name })));
  }
  const actionCount = app.querySelector<HTMLElement>("#mapping-action-count");
  if (actionCount) actionCount.textContent = `${getRequiredActions(drill).length} actions`;
  app.querySelector<HTMLElement>("#mapping-list")?.replaceChildren(...mappingRows(drill));

  if (!setupBound) { bindSetup(); setupBound = true; }
}

function bindSetup(): void {
  const fileInput = app.querySelector<HTMLInputElement>("#hotkey-files");
  fileInput?.addEventListener("change", () => { if (fileInput.files) void loadFiles([...fileInput.files]); });
  app.querySelector<HTMLSelectElement>("#profile-source")?.addEventListener("change", (event) => {
    hotkeySource = (event.currentTarget as HTMLSelectElement).value === "custom" ? "custom" : "default";
    if (hotkeySource === "default") {
      profile = createDefaultProfile(); uploadError = false; uploadMessage = "Using the built-in AoE II: Definitive Edition default hotkeys.";
    } else {
      profile = uploadedHotkeyFiles.size > 0 ? parseHotkeyFiles([...uploadedHotkeyFiles.values()]) : null;
      uploadMessage = hasHotkeyFilePair() ? "Using the uploaded Hotkeys.hkp and Base.hkp files." : "Choose both Hotkeys.hkp and Base.hkp for a custom profile.";
    }
    renderSetup();
  });
  const dropZone = app.querySelector<HTMLElement>("[data-drop-zone]");
  dropZone?.addEventListener("dragover", (event) => { event.preventDefault(); dropZone.classList.add("drop-zone--active"); });
  dropZone?.addEventListener("dragleave", () => dropZone.classList.remove("drop-zone--active"));
  dropZone?.addEventListener("drop", (event) => { event.preventDefault(); dropZone.classList.remove("drop-zone--active"); if (event.dataTransfer?.files) void loadFiles([...event.dataTransfer.files]); });
  app.querySelector<HTMLSelectElement>("#drill-select")?.addEventListener("change", (event) => { selectedDrillIndex = Number((event.currentTarget as HTMLSelectElement).value); renderSetup(); });
  app.querySelector<HTMLSelectElement>("#difficulty-select")?.addEventListener("change", (event) => { selectedDifficultyIndex = Number((event.currentTarget as HTMLSelectElement).value); renderSetup(); });
  app.querySelector<HTMLButtonElement>("#start-button")?.addEventListener("click", startPractice);
}

function drillCard(drill: Drill, index: number): HTMLElement {
  const customIndex = index - BUILTIN_DRILLS.length;
  const isCustom = customIndex >= 0;
  const card = element("article", { className: "drill-card" });
  const select = button("", "drill-card__select");
  select.dataset.selectDrill = String(index);
  select.dataset.drillId = drill.id;
  select.setAttribute("aria-label", `Select ${drill.name}`);
  const titleRow = element("div", { className: "drill-card__title-row" });
  titleRow.append(element("h3", { text: drill.name }), element("span", { className: `status-pill${isCustom ? " status-pill--custom" : ""}`, text: isCustom ? "Custom" : "Built-in" }));
  const metadata = element("dl", { className: "drill-card__meta" });
  for (const [term, value] of [["Duration", formatClock(drill.totalTimeMs)], ["Sequences", String(drill.sequences.length)]]) {
    const item = element("div"); item.append(element("dt", { text: term }), element("dd", { text: value })); metadata.append(item);
  }
  select.append(titleRow, element("p", { text: drill.description }), metadata);
  card.append(select);
  if (isCustom) {
    const menuRoot = element("div", { className: "drill-menu" });
    const trigger = button("…", "drill-menu__trigger");
    trigger.dataset.drillMenuTrigger = String(customIndex);
    trigger.setAttribute("aria-label", `Actions for ${drill.name}`);
    trigger.setAttribute("aria-haspopup", "menu");
    trigger.setAttribute("aria-expanded", "false");
    const menu = element("div", { className: "drill-menu__popover" });
    menu.dataset.drillMenu = String(customIndex); menu.setAttribute("role", "menu"); menu.hidden = true;
    const edit = button("Edit drill", ""); edit.dataset.editDrill = String(customIndex); edit.setAttribute("role", "menuitem");
    const remove = button("Delete drill", "drill-menu__delete"); remove.dataset.deleteDrill = String(customIndex); remove.setAttribute("role", "menuitem");
    const exportButton = button("Export JSON", ""); exportButton.dataset.exportDrill = String(customIndex); exportButton.setAttribute("role", "menuitem");
    menu.append(edit, remove, exportButton); menuRoot.append(trigger, menu); card.append(menuRoot);
  }
  return card;
}

function renderDrills(): void {
  app.querySelector<HTMLElement>("#drill-list")?.replaceChildren(...allDrills().map(drillCard));
  const message = app.querySelector<HTMLElement>("#drill-message");
  if (message) { message.textContent = drillMessage; message.classList.toggle("upload-message--error", drillMessageError); }
  bindDrillEvents();
}

function bindDrillEvents(): void {
  const create = app.querySelector<HTMLElement>("#create-drill-button");
  create?.addEventListener("click", (event) => { event.preventDefault(); navigate("/drills/create"); }, { once: true });
  const input = app.querySelector<HTMLInputElement>("#drill-json-file");
  input?.addEventListener("change", () => { const file = input.files?.[0]; if (file) void loadDrillFile(file); }, { once: true });
  app.querySelectorAll<HTMLButtonElement>("[data-select-drill]").forEach((item) => item.addEventListener("click", () => navigate(`/?drillId=${encodeURIComponent(item.dataset.drillId ?? "")}`)));
  app.querySelectorAll<HTMLButtonElement>("[data-drill-menu-trigger]").forEach((item) => item.addEventListener("click", (event) => {
    event.stopPropagation();
    const menu = app.querySelector<HTMLElement>(`[data-drill-menu="${item.dataset.drillMenuTrigger}"]`);
    const open = menu?.hidden ?? false;
    app.querySelectorAll<HTMLElement>("[data-drill-menu]").forEach((candidate) => { candidate.hidden = true; });
    app.querySelectorAll<HTMLButtonElement>("[data-drill-menu-trigger]").forEach((candidate) => candidate.setAttribute("aria-expanded", "false"));
    if (menu && open) { menu.hidden = false; item.setAttribute("aria-expanded", "true"); menu.querySelector<HTMLButtonElement>("[role=menuitem]")?.focus(); document.addEventListener("click", () => { menu.hidden = true; item.setAttribute("aria-expanded", "false"); }, { once: true }); }
  }));
  app.querySelectorAll<HTMLButtonElement>("[data-edit-drill]").forEach((item) => item.addEventListener("click", () => { const drill = customDrills[Number(item.dataset.editDrill)]; if (drill) navigate(`/drills/edit?drillId=${encodeURIComponent(drill.id)}`); }));
  app.querySelectorAll<HTMLButtonElement>("[data-delete-drill]").forEach((item) => item.addEventListener("click", () => { if (deleteCustomDrill(Number(item.dataset.deleteDrill))) renderDrills(); }));
  app.querySelectorAll<HTMLButtonElement>("[data-export-drill]").forEach((item) => item.addEventListener("click", () => { const drill = customDrills[Number(item.dataset.exportDrill)]; if (drill) exportDrill(drill); }));
}

function deleteCustomDrill(customIndex: number): boolean {
  const drill = customDrills[customIndex];
  if (!drill || !window.confirm(`Delete "${drill.name}"? This cannot be undone.`)) return false;
  const absoluteIndex = BUILTIN_DRILLS.length + customIndex;
  customDrills = customDrills.filter((_, index) => index !== customIndex);
  if (selectedDrillIndex === absoluteIndex) selectedDrillIndex = 0;
  else if (selectedDrillIndex > absoluteIndex) selectedDrillIndex -= 1;
  const persisted = loadedCustomDrills.storageAvailable && persistCustomDrills(customDrills);
  drillMessageError = false;
  drillMessage = persisted ? `${drill.name} deleted from this browser.` : `${drill.name} deleted for this page session. Browser storage is unavailable.`;
  return true;
}

function addCustomDrill(drill: Drill, source: "created" | "uploaded" | "updated"): void {
  const localDrill = source === "updated" ? drill : { ...drill, id: friendlyCustomDrillId(drill.name, customDrills.map((item) => item.id)) };
  const upserted = upsertCustomDrill(customDrills, localDrill);
  customDrills = upserted.drills;
  selectedDrillIndex = BUILTIN_DRILLS.length + upserted.index;
  const persisted = loadedCustomDrills.storageAvailable && persistCustomDrills(customDrills);
  drillMessageError = false;
  drillMessage = persisted ? `${localDrill.name} ${source} and saved in this browser.` : `${localDrill.name} ${source}. Browser storage is unavailable, so it will remain for this page session only.`;
}

async function loadDrillFile(file: File): Promise<void> {
  try { addCustomDrill(parseCustomDrill(JSON.parse(await file.text()) as unknown), "uploaded"); }
  catch (error) { drillMessageError = true; drillMessage = error instanceof Error ? error.message : "The custom drill could not be read."; }
  renderDrills();
}

function exportDrill(drill: Drill): void {
  const blob = new Blob([JSON.stringify(drillToCustomFile(drill), null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a"); link.href = url; link.download = customDrillFilename(drill); link.click(); URL.revokeObjectURL(url);
}

function renderBuilder(): void {
  const root = app.querySelector<HTMLElement>("#drill-builder-root");
  if (!root) throw new Error("The custom drill creator could not be opened.");
  const editingId = location.pathname.replace(/\/+$/, "") === "/drills/edit" ? new URLSearchParams(location.search).get("drillId") : null;
  const editingDrill = editingId ? customDrills.find((drill) => drill.id === editingId) : undefined;
  if (editingId && !editingDrill) { drillMessageError = true; drillMessage = "That custom drill is no longer available in this browser."; navigate("/drills", true); return; }
  mountDrillBuilder(root, {
    actions: actionsForStringIds(profile?.bindings.keys() ?? []),
    ...(editingDrill ? { initialDrill: editingDrill } : {}),
    bindingForAction: (actionId) => formatBindingList(bindingsForAction(actionId)),
    onBack: () => navigate("/drills", true),
    ...(editingDrill ? { onDelete: () => { const index = customDrills.findIndex((drill) => drill.id === editingDrill.id); if (deleteCustomDrill(index)) navigate("/drills", true); } } : {}),
    onSave: (drill) => { addCustomDrill(drill, editingDrill ? "updated" : "created"); navigate("/drills", true); },
  });
}

function hotkeyFileKind(name: string): "profile" | "base" { return name.split(/[\\/]/).pop()?.toLowerCase() === "base.hkp" ? "base" : "profile"; }

async function loadFiles(files: File[]): Promise<void> {
  try {
    if (files.length > MAX_HOTKEY_FILES) throw new Error(`Choose no more than ${MAX_HOTKEY_FILES} hotkey files.`);
    const oversized = files.find((file) => file.size > MAX_HOTKEY_FILE_BYTES);
    if (oversized) throw new Error(`${oversized.name} exceeds the 64 KiB file limit.`);
    const named = await Promise.all(files.map(async (file) => ({ name: file.name, buffer: await file.arrayBuffer() })));
    named.forEach((file) => uploadedHotkeyFiles.set(hotkeyFileKind(file.name), file));
    hotkeySource = "custom"; profile = parseHotkeyFiles([...uploadedHotkeyFiles.values()]);
    const missing = missingActions(selectedDrill());
    uploadMessage = !hasHotkeyFilePair() ? "One file loaded. Add the other file to complete the hotkey profile." : missing.length === 0 ? `${profile.bindings.size} commands loaded. This drill is ready.` : `${profile.bindings.size} commands loaded; ${missing.length} required command${missing.length === 1 ? " is" : "s are"} missing.`;
    uploadError = hasHotkeyFilePair() && missing.length > 0;
  } catch (error) { uploadError = true; uploadMessage = error instanceof Error ? error.message : "The hotkey file could not be read."; }
  renderSetup();
}

function activeStep(current: Session): Step {
  const step = current.currentSequence.steps[current.stepIndex];
  if (!step) throw new Error("The active sequence has no current step.");
  return step;
}
function stepDisplay(step: Step): string { return step.type === "hotkey" ? step.label : "Left click anywhere"; }
function stepKey(step: Step): string {
  if (step.type === "click") return "Click";
  return formatBindingList(bindingsForAction(step.action)).split(" / ")[0]!;
}

function startPractice(): void {
  if (!profile || !hotkeyProfileReady() || missingActions(selectedDrill()).length > 0) return;
  session = createSession(selectedDrill(), selectedDifficultyIndex, performance.now());
  feedback = { kind: "neutral", text: "Waiting for your input…" };
  screen = "practice";
  document.body.dataset.screen = screen;
  renderPractice();
  app.querySelector<HTMLElement>("#practice-board")?.focus();
}

function sequenceShortcutNode(step: Step, index: number, current: Session): HTMLLIElement {
  const state = index < current.stepIndex ? "complete" : index === current.stepIndex ? "active" : "pending";
  const item = element("li", { className: `sequence-shortcut sequence-shortcut--${state}` });
  if (state === "active") item.setAttribute("aria-current", "step");
  item.setAttribute("aria-label", `${stepDisplay(step)}, ${state}`);
  item.title = stepDisplay(step);
  item.append(element("kbd", { text: stepKey(step) }));
  return item;
}

function renderPractice(): void {
  if (!session) { navigate("/"); return; }
  const current = session;
  document.body.dataset.screen = "practice";
  const step = activeStep(current);
  const targetMs = current.currentSequence.targetTimeMs[current.difficultyIndex] ?? 0;
  app.querySelector<HTMLElement>("#setup-screen")?.setAttribute("hidden", "");
  app.querySelector<HTMLElement>("#results-screen")?.setAttribute("hidden", "");
  const practice = app.querySelector<HTMLElement>("#practice-screen");
  if (!practice) throw new Error("Practice screen was not found.");
  practice.hidden = false;

  const shell = element("div", { className: "practice-shell" });
  const hud = element("header", { className: "practice-hud" });
  const identity = element("div", { className: "practice-hud__identity" });
  identity.append(
    element("p", { className: "eyebrow", text: `Sequence ${current.currentSequenceIndex + 1} of ${current.drill.sequences.length} · ${DIFFICULTIES[current.difficultyIndex]}` }),
    element("h1", { id: "sequence-title", text: current.currentSequence.name }),
  );
  const shortcutList = element("ol", { className: "sequence-shortcuts" });
  shortcutList.setAttribute("aria-label", "Sequence shortcuts");
  shortcutList.append(...current.currentSequence.steps.map((item, index) => sequenceShortcutNode(item, index, current)));
  const metrics = element("div", { className: "practice-hud__metrics" });
  const drillMetric = element("div");
  drillMetric.append(element("span", { text: "Time left" }), element("strong", { id: "drill-time", text: formatClock(current.drill.totalTimeMs - getDrillElapsedMs(current, performance.now())) }));
  const sequenceMetric = element("div");
  sequenceMetric.append(element("span", { text: "Sequence" }), element("strong", { id: "sequence-time", text: formatDuration(getSequenceElapsedMs(current, performance.now())) }), element("small", { text: `/ ${formatDuration(targetMs)}` }));
  metrics.append(drillMetric, sequenceMetric);
  const actions = element("div", { className: "practice-actions" });
  actions.append(button(current.status === "paused" ? "Resume" : "Pause", "button button--secondary", "pause-button"), button("Exit", "button button--text", "exit-button"));
  hud.append(identity, shortcutList, metrics, actions);

  const board = element("section", { className: "practice-board", id: "practice-board" }); board.tabIndex = -1; board.setAttribute("aria-labelledby", "sequence-title");
  const progress = element("progress", { className: "sequence-progress", id: "sequence-progress-bar" }); progress.max = 100; progress.value = 0; progress.setAttribute("aria-hidden", "true"); board.append(progress);
  const panel = renderCommandPanel(current, bindingsForAction);
  const clickSurface = element("div", { className: `click-surface${panel ? " click-surface--command-panel" : ""}` });
  clickSurface.setAttribute("aria-label", "Practice map");
  const clickActive = step.type === "click";
  if (clickActive) {
    const clickTarget = button("", "click-anywhere-target", "click-anywhere-target");
    clickTarget.disabled = current.status !== "running";
    clickTarget.setAttribute("aria-label", "Left click anywhere to continue");
    clickSurface.append(clickTarget);
  }
  clickSurface.append(renderSequenceTarget(current));
  if (panel) clickSurface.append(panel);
  const feedbackNode = element("p", { className: `input-feedback input-feedback--${feedback.kind}` }); feedbackNode.setAttribute("role", "status"); feedbackNode.setAttribute("aria-live", "polite"); const feedbackMark = element("span", { text: feedback.kind === "correct" ? "✓" : feedback.kind === "incorrect" ? "!" : "•" }); feedbackMark.setAttribute("aria-hidden", "true"); feedbackNode.append(feedbackMark, document.createTextNode(current.status === "paused" ? "Practice paused" : feedback.text));
  clickSurface.append(feedbackNode);
  board.append(clickSurface);
  shell.append(hud, board);
  practice.replaceChildren(shell);
  app.querySelector<HTMLButtonElement>("#pause-button")?.addEventListener("click", () => { if (!session) return; session = togglePause(session, performance.now()); feedback = { kind: "neutral", text: "Waiting for your input…" }; renderPractice(); });
  app.querySelector<HTMLButtonElement>("#exit-button")?.addEventListener("click", () => { if (!session) return; session = exitSession(session); screen = "results"; renderResults(); });
  app.querySelector<HTMLButtonElement>("#click-anywhere-target")?.addEventListener("click", () => handleAttempt(true));
}

function handleAttempt(correct: boolean): void {
  if (!session || session.status !== "running") return;
  const before = session; const step = activeStep(before); session = submitAttempt(before, correct, performance.now());
  if (correct) feedback = session.results.length > before.results.length ? { kind: "correct", text: `Sequence complete in ${formatDuration(session.results.at(-1)?.elapsedMs ?? 0)}` } : { kind: "correct", text: "Correct. Next step." };
  else feedback = step.onFailure === "restart_sequence" ? { kind: "incorrect", text: "Incorrect. Sequence restarted." } : { kind: "incorrect", text: "Incorrect. Try this step again." };
  if (session.status === "finished") { screen = "results"; renderResults(); } else renderPractice();
}

function resultCell(text: string): HTMLTableCellElement { return element("td", { text }); }

function renderResults(): void {
  if (!session) { navigate("/"); return; }
  const current = session; const completed = current.results.length; const averageMs = completed === 0 ? 0 : current.results.reduce((sum, result) => sum + result.elapsedMs, 0) / completed; const targetHits = current.results.filter((result) => result.metTarget).length;
  document.body.dataset.screen = "results";
  app.querySelector<HTMLElement>("#setup-screen")?.setAttribute("hidden", ""); app.querySelector<HTMLElement>("#practice-screen")?.setAttribute("hidden", "");
  const results = app.querySelector<HTMLElement>("#results-screen"); if (!results) throw new Error("Results screen was not found."); results.hidden = false;
  const content = element("div", { className: "results" }); content.append(element("p", { className: "eyebrow", text: current.finishReason === "time" ? "Time is up" : current.finishReason === "complete" ? "Drill complete" : "Session ended" }), element("h1", { id: "results-title", text: "Practice complete." }), element("p", { className: "results__lede", text: `${current.drill.name} · ${DIFFICULTIES[current.difficultyIndex]}` }));
  const grid = element("div", { className: "result-grid" });
  for (const [label, value, detail] of [["Accuracy", `${accuracy(current.correctTries, current.totalTries).toFixed(1)}%`, `${current.correctTries} correct / ${current.totalTries} tries`], ["Average sequence", completed > 0 ? formatDuration(averageMs) : "—", `Across ${completed} completed`], ["Target hit rate", completed > 0 ? `${Math.round((targetHits / completed) * 100)}%` : "—", `${targetHits} of ${completed} on pace`], ["Sequences", String(completed), "Finished this session"]]) { const card = element("article"); card.append(element("span", { text: label }), element("strong", { text: value }), element("small", { text: detail })); grid.append(card); }
  content.append(grid);
  const wrap = element("div", { className: "results-table-wrap" }); const table = element("table", { className: "results-table" }); table.append(element("caption", { text: "All drill sequences" })); const head = element("thead"); const headRow = element("tr"); ["Sequence", "Best time", "Target", "Result"].forEach((label) => headRow.append(element("th", { text: label }))); head.append(headRow); table.append(head); const body = element("tbody");
  current.drill.sequences.forEach((sequence) => { const attempts = current.results.filter((result) => result.id === sequence.id); const best = attempts.reduce<typeof current.results[number] | null>((candidate, result) => candidate === null || result.elapsedMs < candidate.elapsedMs ? result : candidate, null); const target = sequence.targetTimeMs[current.difficultyIndex]; if (target === undefined) throw new Error("The selected difficulty has no target time."); const row = element("tr"); row.append(resultCell(sequence.name), resultCell(best ? formatDuration(best.elapsedMs) : "—"), resultCell(formatDuration(target))); const statusCell = element("td"); statusCell.append(element("span", { className: `result-chip${best?.metTarget ? " result-chip--met" : ""}`, text: best ? best.metTarget ? "On target" : "Over target" : "Not completed" })); row.append(statusCell); body.append(row); }); table.append(body); wrap.append(table); content.append(wrap);
  const actions = element("div", { className: "results-actions" }); actions.append(button("Practice again →", "button button--start", "again-button"), button("Back to setup", "button button--secondary", "setup-button")); content.append(actions); results.replaceChildren(content);
  app.querySelector<HTMLButtonElement>("#again-button")?.addEventListener("click", showSetup); app.querySelector<HTMLButtonElement>("#setup-button")?.addEventListener("click", showSetup);
}

function showSetup(): void {
  session = null;
  screen = "setup";
  document.body.dataset.screen = screen;
  const setup = app.querySelector<HTMLElement>("#setup-screen");
  const practice = app.querySelector<HTMLElement>("#practice-screen");
  const results = app.querySelector<HTMLElement>("#results-screen");
  if (setup) setup.hidden = false;
  if (practice) practice.hidden = true;
  if (results) results.hidden = true;
  renderSetup();
}

window.addEventListener("keydown", (event) => {
  if (screen !== "practice" || !session || session.status !== "running" || event.repeat || isModifierOnly(event)) return;
  const step = activeStep(session); if (step.type === "hotkey") { event.preventDefault(); handleAttempt(bindingsForAction(step.action).some((binding) => eventMatchesBinding(event, binding))); }
});

window.addEventListener("wheel", (event) => {
  if (screen !== "practice" || !session || session.status !== "running") return;
  const step = activeStep(session);
  if (step.type !== "hotkey") return;
  const bindings = bindingsForAction(step.action);
  if (!bindings.some(isWheelBinding)) return;
  event.preventDefault();
  handleAttempt(bindings.some((binding) => wheelEventMatchesBinding(event, binding)));
}, { passive: false });

function animationFrame(now: number): void {
  if (screen === "practice" && session) {
    const previous = session.status; session = tickSession(session, now);
    if (previous !== "finished" && session.status === "finished") { screen = "results"; renderResults(); }
    else if (session.status !== "finished") {
      const target = session.currentSequence.targetTimeMs[session.difficultyIndex] ?? 1; const elapsed = getSequenceElapsedMs(session, now);
      const drillTime = app.querySelector<HTMLElement>("#drill-time"); if (drillTime) drillTime.textContent = formatClock(session.drill.totalTimeMs - getDrillElapsedMs(session, now));
      const sequenceTime = app.querySelector<HTMLElement>("#sequence-time"); if (sequenceTime) sequenceTime.textContent = formatDuration(elapsed);
      const progress = app.querySelector<HTMLProgressElement>("#sequence-progress-bar"); if (progress) progress.value = Math.min(100, (elapsed / target) * 100);
    }
  }
  requestAnimationFrame(animationFrame);
}

document.body.dataset.screen = screen;
if (screen === "setup") renderSetup();
else if (screen === "drills") renderDrills();
else if (screen === "builder") renderBuilder();
requestAnimationFrame(animationFrame);
