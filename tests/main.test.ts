/* @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import createHtml from "../drills/create.html?raw";
import editHtml from "../drills/edit.html?raw";
import drillsHtml from "../drills.html?raw";
import indexHtml from "../index.html?raw";
import { MAX_HOTKEY_FILE_BYTES } from "../src/hotkey-file";

const STORAGE_KEY = "aoe2-hotkey-practice.custom-drills.v1";
const targetTimes = [7000, 6000, 5000, 4000, 3000, 2000, 1000];

function customDrill(id: string, step: Record<string, unknown>): Record<string, unknown> {
  return {
    schemaVersion: 1,
    id,
    name: `${id} name`,
    description: `${id} description`,
    totalTimeMs: 60_000,
    sequences: [{ id: `${id}-sequence`, name: `${id} sequence`, targetTimeMs: targetTimes, sequence: [step] }],
  };
}

const clickDrill = customDrill("click-drill", { type: "click", zone: 2, onFailure: "wait" });
const hotkeyDrill = customDrill("hotkey-drill", { type: "hotkey", action: "select_villager", onFailure: "wait" });
const branchingDrill = {
  schemaVersion: 1,
  id: "branching-drill",
  name: "Branching drill",
  description: "Exercises multi-step practice feedback.",
  totalTimeMs: 60_000,
  sequences: [
    {
      id: "multi-step",
      name: "Multi-step",
      targetTimeMs: [60_000, 60_000, 60_000, 60_000, 60_000, 60_000, 60_000],
      sequence: [
        { type: "click", zone: 1, tip: "First", onFailure: "wait" },
        { type: "click", zone: 2, onFailure: "restart_sequence" },
      ],
    },
    {
      id: "over-target",
      name: "Over target",
      targetTimeMs: [1, 1, 1, 1, 1, 1, 1],
      sequence: [{ type: "click", zone: 3, onFailure: "wait" }],
    },
    {
      id: "not-completed",
      name: "Not completed",
      targetTimeMs: targetTimes,
      sequence: [{ type: "click", zone: 4, onFailure: "wait" }],
    },
  ],
};

function loadPage(relativePath: string): void {
  const html = {
    "index.html": indexHtml,
    "drills.html": drillsHtml,
    "drills/create.html": createHtml,
    "drills/edit.html": editHtml,
  }[relativePath];
  if (html === undefined) throw new Error(`Unknown test page: ${relativePath}`);
  const body = html.match(/<body[^>]*>([\s\S]*)<\/body>/i)?.[1];
  if (body === undefined) throw new Error(`Missing body in ${relativePath}`);
  document.body.innerHTML = body;
}

function standardHotkeyFile(stringId: number): ArrayBuffer {
  const buffer = new ArrayBuffer(24);
  const view = new DataView(buffer);
  view.setUint32(0, 0x40400000, true);
  view.setUint32(4, 1, true);
  view.setUint32(8, 1, true);
  view.setInt32(12, 81, true);
  view.setInt32(16, stringId, true);
  return buffer;
}

function selectValue(selector: string, value: string): void {
  const select = document.querySelector<HTMLSelectElement>(selector);
  if (!select) throw new Error(`Missing select: ${selector}`);
  select.value = value;
  select.dispatchEvent(new Event("change", { bubbles: true }));
}

function click(selector: string): void {
  const button = document.querySelector<HTMLElement>(selector);
  if (!button) throw new Error(`Missing element: ${selector}`);
  button.click();
}

describe("application pages", () => {
  let frames: FrameRequestCallback[];

  beforeEach(() => {
    vi.resetModules();
    const virtualConsole = (window as unknown as {
      _virtualConsole?: { removeAllListeners: (event: string) => void };
    })._virtualConsole;
    virtualConsole?.removeAllListeners("jsdomError");
    frames = [];
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      frames.push(callback);
      return frames.length;
    });
    HTMLElement.prototype.scrollIntoView = vi.fn();
    loadPage("index.html");
    localStorage.clear();
    localStorage.setItem(STORAGE_KEY, JSON.stringify([clickDrill, hotkeyDrill]));
    history.replaceState(null, "", "/");
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("runs click sessions through completion, exit, and timeout results", async () => {
    await import("../src/main");
    expect(document.body.dataset.screen).toBe("setup");
    expect(document.querySelectorAll("#drill-select option")).toHaveLength(3);
    frames.shift()?.(performance.now());

    selectValue("#profile-source", "custom");
    expect(document.body.textContent).toContain("Choose both Hotkeys.hkp");
    selectValue("#profile-source", "default");
    selectValue("#difficulty-select", "6");
    selectValue("#drill-select", "1");

    click("#start-button");
    expect(document.body.dataset.screen).toBe("practice");
    expect(document.querySelectorAll("[style]")).toHaveLength(0);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "q", code: "KeyQ" }));
    document.querySelector("#drill-time")?.remove();
    document.querySelector("#sequence-time")?.remove();
    document.querySelector("#sequence-progress-bar")?.remove();
    frames.shift()?.(performance.now() + 100);
    click("#pause-button");
    expect(document.body.textContent).toContain("Practice paused");
    click("#pause-button");

    frames.shift()?.(performance.now() + 20_000);
    expect(document.querySelector<HTMLProgressElement>("#sequence-progress-bar")?.value).toBe(100);
    click('[data-zone="1"]');
    expect(document.body.textContent).toContain("Incorrect");
    click('[data-zone="2"]');
    expect(document.body.dataset.screen).toBe("results");
    expect(document.body.textContent).toContain("Drill complete");

    click("#again-button");
    click("#start-button");
    click("#exit-button");
    expect(document.body.textContent).toContain("Session ended");

    click("#setup-button");
    click("#start-button");
    frames.shift()?.(performance.now() + 70_000);
    expect(document.body.dataset.screen).toBe("results");
    expect(document.body.textContent).toContain("Time is up");
  });

  it("keeps detached practice controls and missing setup panels safe", async () => {
    await import("../src/main");
    selectValue("#drill-select", "1");
    click("#start-button");
    const oldPause = document.querySelector<HTMLButtonElement>("#pause-button");
    const oldExit = document.querySelector<HTMLButtonElement>("#exit-button");
    click('[data-zone="2"]');
    const setupButton = document.querySelector<HTMLButtonElement>("#setup-button");
    if (!setupButton) throw new Error("Setup button is missing.");
    document.querySelector("#setup-screen")?.remove();
    document.querySelector("#practice-screen")?.remove();
    document.querySelector("#results-screen")?.remove();
    setupButton.click();
    oldPause?.click();
    oldExit?.click();
    expect(document.body.dataset.screen).toBe("setup");
  });

  it("accepts the selected profile hotkey during practice", async () => {
    const { createDefaultProfile } = await import("../src/default-profile");
    const { getHotkeyAction } = await import("../src/hotkey-actions");
    const action = getHotkeyAction("select_villager");
    const binding = action ? createDefaultProfile().bindings.get(action.stringId)?.[0] : undefined;
    if (!binding) throw new Error("The default select-villager binding is missing.");

    await import("../src/main");
    selectValue("#drill-select", "2");
    click("#start-button");
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Shift", code: "ShiftLeft", shiftKey: true }));
    window.dispatchEvent(new KeyboardEvent("keydown", { key: binding.key, code: `Key${binding.key.toUpperCase()}`, repeat: true }));
    window.dispatchEvent(new KeyboardEvent("keydown", {
      key: binding.key,
      code: binding.key.length === 1 ? `Key${binding.key.toUpperCase()}` : binding.key,
      ctrlKey: binding.ctrl,
      altKey: binding.alt,
      shiftKey: binding.shift,
    }));
    expect(document.body.dataset.screen).toBe("results");
  });

  it("renders every sequence state, feedback outcome, and result status", async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([branchingDrill]));
    await import("../src/main");
    selectValue("#drill-select", "1");
    click("#start-button");

    expect(document.querySelectorAll(".sequence-step--active")).toHaveLength(1);
    expect(document.querySelectorAll(".sequence-step--pending")).toHaveLength(1);
    click('[data-zone="5"]');
    expect(document.body.textContent).toContain("Try this step again");
    click('[data-zone="1"]');
    expect(document.body.textContent).toContain("Correct. Next step");
    expect(document.querySelectorAll(".sequence-step--complete")).toHaveLength(1);
    click('[data-zone="5"]');
    expect(document.body.textContent).toContain("Sequence restarted");
    click('[data-zone="1"]');
    click('[data-zone="2"]');
    expect(document.body.textContent).toContain("Sequence complete");
    click('[data-zone="3"]');
    click("#exit-button");

    expect(document.body.textContent).toContain("On target");
    expect(document.body.textContent).toContain("Over target");
    expect(document.body.textContent).toContain("Not completed");
  });

  it("loads hotkey files and handles profile drag states and errors", async () => {
    const { getHotkeyAction } = await import("../src/hotkey-actions");
    const stringId = getHotkeyAction("select_villager")?.stringId;
    if (!stringId) throw new Error("Select-villager action is missing.");
    await import("../src/main");
    selectValue("#drill-select", "2");

    const upload = async (name: string, buffer: ArrayBuffer): Promise<void> => {
      const input = document.querySelector<HTMLInputElement>("#hotkey-files");
      if (!input) throw new Error("Hotkey upload input is missing.");
      Object.defineProperty(input, "files", {
        configurable: true,
        value: [{ name, arrayBuffer: async () => buffer }],
      });
      input.dispatchEvent(new Event("change", { bubbles: true }));
    };

    await upload("Hotkeys.hkp", standardHotkeyFile(stringId));
    await vi.waitFor(() => expect(document.body.textContent).toContain("One file loaded"));
    selectValue("#profile-source", "default");
    selectValue("#profile-source", "custom");
    await upload("Base.hkp", standardHotkeyFile(stringId));
    await vi.waitFor(() => expect(document.body.textContent).toContain("This drill is ready"));
    selectValue("#profile-source", "default");
    selectValue("#profile-source", "custom");
    expect(document.querySelectorAll(".file-chips span")).toHaveLength(2);

    const dropZone = document.querySelector<HTMLElement>("[data-drop-zone]");
    if (!dropZone) throw new Error("Drop zone is missing.");
    dropZone.dispatchEvent(new Event("dragover", { bubbles: true, cancelable: true }));
    expect(dropZone.classList.contains("drop-zone--active")).toBe(true);
    dropZone.dispatchEvent(new Event("dragleave", { bubbles: true }));
    expect(dropZone.classList.contains("drop-zone--active")).toBe(false);
    const drop = new Event("drop", { bubbles: true, cancelable: true });
    Object.defineProperty(drop, "dataTransfer", {
      value: { files: [{ name: "bad.txt", arrayBuffer: async () => new ArrayBuffer(0) }] },
    });
    dropZone.dispatchEvent(drop);
    await vi.waitFor(() => expect(document.body.textContent).toContain("is not an .hki or .hkp file"));

    const oversizedInput = document.querySelector<HTMLInputElement>("#hotkey-files");
    if (!oversizedInput) throw new Error("Replacement hotkey upload input is missing.");
    const readOversizedFile = vi.fn(async () => new ArrayBuffer(0));
    Object.defineProperty(oversizedInput, "files", {
      configurable: true,
      value: [{ name: "oversized.hkp", size: MAX_HOTKEY_FILE_BYTES + 1, arrayBuffer: readOversizedFile }],
    });
    oversizedInput.dispatchEvent(new Event("change", { bubbles: true }));
    await vi.waitFor(() => expect(document.body.textContent).toContain("exceeds the 64 KiB file limit"));
    expect(readOversizedFile).not.toHaveBeenCalled();
  });

  it("handles absent uploads, incomplete mappings, file-count limits, and non-error failures", async () => {
    const warningTitle = document.querySelector("#mapping-warning strong");
    warningTitle?.remove();
    const { getHotkeyAction } = await import("../src/hotkey-actions");
    const stringId = getHotkeyAction("select_villager")?.stringId;
    if (!stringId) throw new Error("Select-villager action is missing.");
    await import("../src/main");
    selectValue("#drill-select", "2");

    const input = document.querySelector<HTMLInputElement>("#hotkey-files");
    if (input) Object.defineProperty(input, "files", { configurable: true, value: null });
    input?.dispatchEvent(new Event("change", { bubbles: true }));
    const dropZone = document.querySelector<HTMLElement>("[data-drop-zone]");
    dropZone?.dispatchEvent(new Event("drop", { bubbles: true, cancelable: true }));

    const incompleteInput = document.querySelector<HTMLInputElement>("#hotkey-files");
    if (!incompleteInput) throw new Error("Hotkey input is missing.");
    Object.defineProperty(incompleteInput, "files", {
      configurable: true,
      value: [
        { name: "Hotkeys.hkp", size: 24, arrayBuffer: async () => standardHotkeyFile(stringId + 100_000) },
        { name: "Base.hkp", size: 24, arrayBuffer: async () => standardHotkeyFile(stringId + 100_000) },
      ],
    });
    incompleteInput.dispatchEvent(new Event("change", { bubbles: true }));
    await vi.waitFor(() => expect(document.body.textContent).toContain("1 required command is missing"));
    const warning = document.querySelector("#mapping-warning");
    warning?.prepend(document.createElement("strong"));
    selectValue("#profile-source", "default");
    selectValue("#profile-source", "custom");
    expect(warning?.textContent).toContain("1 required hotkey is missing");

    selectValue("#drill-select", "0");
    const pluralInput = document.querySelector<HTMLInputElement>("#hotkey-files");
    if (!pluralInput) throw new Error("Replacement hotkey input is missing.");
    Object.defineProperty(pluralInput, "files", {
      configurable: true,
      value: [{ name: "Hotkeys.hkp", size: 24, arrayBuffer: async () => standardHotkeyFile(stringId + 100_001) }],
    });
    pluralInput.dispatchEvent(new Event("change", { bubbles: true }));
    await vi.waitFor(() => expect(document.body.textContent).toContain("required commands are missing"));

    const tooManyInput = document.querySelector<HTMLInputElement>("#hotkey-files");
    if (!tooManyInput) throw new Error("Replacement hotkey input is missing.");
    Object.defineProperty(tooManyInput, "files", {
      configurable: true,
      value: [
        { name: "one.hkp", size: 0, arrayBuffer: async () => new ArrayBuffer(0) },
        { name: "two.hkp", size: 0, arrayBuffer: async () => new ArrayBuffer(0) },
        { name: "three.hkp", size: 0, arrayBuffer: async () => new ArrayBuffer(0) },
      ],
    });
    tooManyInput.dispatchEvent(new Event("change", { bubbles: true }));
    await vi.waitFor(() => expect(document.body.textContent).toContain("no more than 2"));

    const unreadableInput = document.querySelector<HTMLInputElement>("#hotkey-files");
    if (!unreadableInput) throw new Error("Replacement hotkey input is missing.");
    Object.defineProperty(unreadableInput, "files", {
      configurable: true,
      value: [{ name: "Hotkeys.hkp", size: 1, arrayBuffer: async () => Promise.reject("unreadable") }],
    });
    unreadableInput.dispatchEvent(new Event("change", { bubbles: true }));
    await vi.waitFor(() => expect(document.body.textContent).toContain("could not be read"));
  });

  it("ignores zone attempts while a hotkey step is active or practice is paused", async () => {
    await import("../src/main");
    selectValue("#drill-select", "2");
    click("#start-button");
    const runningZone = document.querySelector<HTMLButtonElement>('[data-zone="1"]');
    runningZone?.dispatchEvent(new Event("click", { bubbles: true }));
    click("#pause-button");
    const pausedZone = document.querySelector<HTMLButtonElement>('[data-zone="1"]');
    pausedZone?.dispatchEvent(new Event("click", { bubbles: true }));
    expect(document.body.textContent).toContain("Practice paused");
  });

  it("renders the drill library and handles menu, export, deletion, and uploads", async () => {
    loadPage("drills.html");
    history.replaceState(null, "", "/drills");
    const confirm = vi.fn().mockReturnValueOnce(false).mockReturnValueOnce(true);
    vi.stubGlobal("confirm", confirm);
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn(() => "blob:test") });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);

    await import("../src/main");
    expect(document.body.dataset.screen).toBe("drills");
    expect(document.querySelectorAll(".drill-card")).toHaveLength(3);
    click('[data-drill-menu-trigger="0"]');
    expect(document.querySelector<HTMLElement>('[data-drill-menu="0"]')?.hidden).toBe(false);
    click('[data-export-drill="0"]');
    expect(URL.createObjectURL).toHaveBeenCalledOnce();
    click('[data-edit-drill="0"]');
    click("#create-drill-button");
    click('[data-select-drill="0"]');
    click('[data-delete-drill="0"]');
    expect(confirm).toHaveBeenCalledOnce();
    click('[data-delete-drill="0"]');
    expect(document.querySelectorAll(".drill-card")).toHaveLength(2);

    const validInput = document.querySelector<HTMLInputElement>("#drill-json-file");
    if (!validInput) throw new Error("Upload input is missing.");
    const uploadedDrill = customDrill("uploaded", { type: "click", zone: 3, onFailure: "wait" });
    delete uploadedDrill.id;
    Object.defineProperty(validInput, "files", {
      configurable: true,
      value: [{ name: "uploaded.json", text: async () => JSON.stringify(uploadedDrill) }],
    });
    validInput.dispatchEvent(new Event("change", { bubbles: true }));
    await vi.waitFor(() => expect(document.body.textContent).toContain("uploaded name uploaded"));

    const invalidInput = document.querySelector<HTMLInputElement>("#drill-json-file");
    if (!invalidInput) throw new Error("Replacement upload input is missing.");
    Object.defineProperty(invalidInput, "files", {
      configurable: true,
      value: [{ name: "bad.json", text: async () => "not json" }],
    });
    invalidInput.dispatchEvent(new Event("change", { bubbles: true }));
    await vi.waitFor(() => expect(document.body.textContent).toContain("Unexpected token"));
  });

  it("keeps malformed drill-library controls and unavailable storage safe", async () => {
    loadPage("drills.html");
    history.replaceState(null, "", "/drills");
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });
    vi.stubGlobal("confirm", vi.fn(() => true));
    await import("../src/main");

    const validInput = document.querySelector<HTMLInputElement>("#drill-json-file");
    if (!validInput) throw new Error("Upload input is missing.");
    const createdDrill = customDrill("created", { type: "click", zone: 1, onFailure: "wait" });
    delete createdDrill.id;
    Object.defineProperty(validInput, "files", {
      configurable: true,
      value: [{ name: "created.json", text: async () => JSON.stringify(createdDrill) }],
    });
    validInput.dispatchEvent(new Event("change", { bubbles: true }));
    await vi.waitFor(() => expect(document.body.textContent).toContain("page session only"));

    const nonErrorInput = document.querySelector<HTMLInputElement>("#drill-json-file");
    if (!nonErrorInput) throw new Error("Replacement upload input is missing.");
    Object.defineProperty(nonErrorInput, "files", {
      configurable: true,
      value: [{ name: "unreadable.json", text: async () => Promise.reject("unreadable") }],
    });
    nonErrorInput.dispatchEvent(new Event("change", { bubbles: true }));
    await vi.waitFor(() => expect(document.body.textContent).toContain("could not be read"));

    const emptyInput = document.querySelector<HTMLInputElement>("#drill-json-file");
    if (emptyInput) Object.defineProperty(emptyInput, "files", { configurable: true, value: null });
    emptyInput?.dispatchEvent(new Event("change", { bubbles: true }));
    document.querySelector("#drill-message")?.remove();

    const select = document.querySelector<HTMLElement>("[data-select-drill]");
    select?.removeAttribute("data-drill-id");
    select?.click();

    const trigger = document.querySelector<HTMLElement>('[data-drill-menu-trigger="0"]');
    document.querySelector('[data-drill-menu="0"]')?.remove();
    trigger?.click();
    trigger?.click();

    const edit = document.querySelector<HTMLElement>("[data-edit-drill]");
    if (edit) edit.dataset.editDrill = "999";
    edit?.click();
    const exportButton = document.querySelector<HTMLElement>("[data-export-drill]");
    if (exportButton) exportButton.dataset.exportDrill = "999";
    exportButton?.click();
    const remove = document.querySelector<HTMLElement>("[data-delete-drill]");
    if (remove) remove.dataset.deleteDrill = "999";
    remove?.click();
  });

  it("reports unavailable storage when a custom drill is deleted", async () => {
    loadPage("drills.html");
    history.replaceState(null, "", "/drills");
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });
    vi.stubGlobal("confirm", vi.fn(() => true));
    await import("../src/main");
    click('[data-delete-drill="0"]');
    expect(document.body.textContent).toContain("deleted for this page session");
  });

  it("keeps the selected custom drill stable as earlier drills are deleted", async () => {
    loadPage("drills.html");
    history.replaceState(null, "", "/drills?drillId=hotkey-drill");
    vi.stubGlobal("confirm", vi.fn(() => true));
    await import("../src/main");
    click('[data-delete-drill="0"]');
    click('[data-delete-drill="0"]');
    expect(document.querySelectorAll(".drill-card")).toHaveLength(1);
  });

  it("renders create, edit, and missing-edit routes", async () => {
    loadPage("drills/create.html");
    history.replaceState(null, "", "/drills/create");
    await import("../src/main");
    expect(document.body.textContent).toContain("Create custom drill");
    changeBuilderInput("#drill-name", "Created in page");
    changeBuilderInput("#sequence-name", "One");
    click("#add-click-step");
    click("#save-drill");

    vi.resetModules();
    loadPage("drills/edit.html");
    history.replaceState(null, "", "/drills/edit?drillId=click-drill");
    await import("../src/main");
    expect(document.body.textContent).toContain("Edit custom drill");
    expect(document.body.textContent).toContain("Delete drill");
    vi.stubGlobal("confirm", vi.fn(() => false));
    click("#delete-drill");
    click("#save-drill");
    click("#builder-back");

    vi.resetModules();
    loadPage("drills/edit.html");
    history.replaceState(null, "", "/drills/edit?drillId=missing");
    await import("../src/main");
    expect(location.pathname).toBe("/drills/edit");
  });

  it("deletes from the edit route and rejects a missing builder root", async () => {
    loadPage("drills/edit.html");
    history.replaceState(null, "", "/drills/edit?drillId=click-drill");
    vi.stubGlobal("confirm", vi.fn(() => true));
    await import("../src/main");
    click("#delete-drill");

    vi.resetModules();
    loadPage("drills/create.html");
    document.querySelector("#drill-builder-root")?.remove();
    history.replaceState(null, "", "/drills/create");
    await expect(import("../src/main")).rejects.toThrow("custom drill creator could not be opened");
  });

  it("runs route fallbacks", async () => {
    await import("../src/main");

    vi.resetModules();
    loadPage("drills.html");
    history.replaceState(null, "", "/drills/edit");
    await import("../src/main");
    expect(document.body.dataset.screen).toBe("drills");

    vi.resetModules();
    document.body.innerHTML = "";
    await expect(import("../src/main")).rejects.toThrow("App root was not found");

    vi.resetModules();
    loadPage("drills.html");
    history.replaceState(null, "", "/drills/unknown");
    await import("../src/main");
    expect(document.body.dataset.screen).toBe("drills");
  });

  it("guards disabled starts and an invalid drill selection", async () => {
    await import("../src/main");
    selectValue("#profile-source", "custom");
    const start = document.querySelector<HTMLButtonElement>("#start-button");
    start?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(document.body.dataset.screen).toBe("setup");

    const drillSelect = document.querySelector<HTMLSelectElement>("#drill-select");
    if (!drillSelect) throw new Error("Drill select is missing.");
    const preventError = (event: ErrorEvent): void => event.preventDefault();
    window.addEventListener("error", preventError, { once: true });
    const invalidOption = document.createElement("option");
    invalidOption.value = "999";
    drillSelect.append(invalidOption);
    drillSelect.value = "999";
    drillSelect.dispatchEvent(new Event("change", { bubbles: true }));
  });

  it("renders empty and singular custom-drill library messages", async () => {
    localStorage.clear();
    loadPage("drills.html");
    history.replaceState(null, "", "/drills");
    await import("../src/main");
    expect(document.body.textContent).toContain("Create a drill here");

    vi.resetModules();
    loadPage("index.html");
    localStorage.setItem(STORAGE_KEY, JSON.stringify([clickDrill]));
    history.replaceState(null, "", "/?drillId=click-drill");
    await import("../src/main");
    expect(document.querySelectorAll("#drill-select option")).toHaveLength(2);
    expect(document.querySelector<HTMLSelectElement>("#drill-select")?.value).toBe("1");
  });

  it("keeps setup initialization safe when optional authored status elements are absent", async () => {
    for (const selector of [
      "#drill-duration",
      "#drill-sequences",
      "#drill-zones",
      "#mapping-warning",
      "#start-button",
      "#profile-source",
      "#profile-status",
      "#profile-upload-title",
      "#upload-message",
      "#file-chips",
      "#mapping-action-count",
      "#mapping-list",
      "#hotkey-files",
      "[data-drop-zone]",
    ]) {
      document.querySelector(selector)?.remove();
    }

    await expect(import("../src/main")).resolves.toBeDefined();
    expect(document.body.dataset.screen).toBe("setup");

    vi.resetModules();
    loadPage("index.html");
    document.querySelector("#drill-select")?.remove();
    await expect(import("../src/main")).resolves.toBeDefined();
  });
});

function changeBuilderInput(selector: string, value: string): void {
  const input = document.querySelector<HTMLInputElement>(selector);
  if (!input) throw new Error(`Missing builder input: ${selector}`);
  input.value = value;
  input.dispatchEvent(new Event("input", { bubbles: true }));
}
