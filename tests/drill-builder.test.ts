/* @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { mountDrillBuilder, targetTimesFromPro } from "../src/drill-builder";
import type { Drill } from "../src/types";

const actions = [
  { id: "select_villager", label: "Select villager", stringId: 1 },
  { id: "build_house", label: "Build house", stringId: 2 },
  { id: "select_house", label: "Select house", stringId: 3 },
];

function changeInput(root: HTMLElement, selector: string, value: string): void {
  const input = root.querySelector<HTMLInputElement | HTMLTextAreaElement>(selector);
  if (!input) throw new Error(`Missing input: ${selector}`);
  input.value = value;
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

function click(root: HTMLElement, selector: string): void {
  const button = root.querySelector<HTMLButtonElement>(selector);
  if (!button) throw new Error(`Missing button: ${selector}`);
  button.click();
}

function pressKey(root: HTMLElement, selector: string, key: string): void {
  const input = root.querySelector<HTMLInputElement>(selector);
  if (!input) throw new Error(`Missing input: ${selector}`);
  input.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key }));
}

describe("drill builder", () => {
  let root: HTMLDivElement;

  beforeEach(() => {
    vi.useFakeTimers();
    HTMLElement.prototype.scrollIntoView = vi.fn();
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    root = document.createElement("div");
    document.body.replaceChildren(root);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("creates sequences with click and searchable hotkey steps", () => {
    const onSave = vi.fn();
    const onBack = vi.fn();
    mountDrillBuilder(root, {
      actions,
      bindingForAction: (id) => id === "select_villager" ? "V" : "Q",
      onBack,
      onSave,
    });

    expect(root.querySelector(".zone-layout-editor")).toBeNull();
    click(root, "#builder-back");
    expect(onBack).toHaveBeenCalledOnce();

    click(root, "#save-drill");
    expect(root.textContent).toContain("Enter a drill name");

    changeInput(root, "#drill-name", "House practice");
    expect(root.querySelector(".builder-details__name")?.textContent).toBe("House practice");
    changeInput(root, "#drill-description", "Place houses");
    expect(root.querySelector("#drill-duration")).toBeNull();
    expect(root.querySelector("#toggle-drill-details")?.getAttribute("aria-label"))
      .toBe("Collapse drill details");
    click(root, "#toggle-drill-details");
    expect(root.querySelector("#toggle-drill-details")?.getAttribute("aria-label"))
      .toBe("Expand drill details");
    expect(root.querySelector("#drill-name")).toBeNull();
    expect(root.querySelector(".builder-details__summary")?.textContent).toContain("House practice");
    expect(root.querySelector(".builder-details__summary")?.textContent).toContain("Place houses");
    expect(document.activeElement).toBe(root.querySelector("#sequence-name"));
    changeInput(root, "#sequence-name", "House");
    expect(root.querySelector(".sequence-tab--active")?.textContent).toBe("1. House");
    const startingSelection = root.querySelector<HTMLInputElement>("#sequence-starting-selection");
    if (!startingSelection) throw new Error("Starting selection is missing.");
    expect(root.querySelectorAll(".field-info__button")).toHaveLength(4);
    expect([...root.querySelectorAll<HTMLButtonElement>(".field-info__button")]
      .every((item) => item.tabIndex === -1)).toBe(true);
    startingSelection.focus();
    expect(root.querySelectorAll("[data-select-starting-selection]")).toHaveLength(26);
    expect(root.querySelector(".selection-result--selected")?.textContent).toContain("Nothing selected");
    pressKey(root, "#sequence-starting-selection", "ArrowDown");
    expect(root.querySelector(".action-result--active")?.textContent).toContain("Barracks");
    pressKey(root, "#sequence-starting-selection", "Enter");
    expect(root.querySelector<HTMLInputElement>("#sequence-starting-selection")?.value).toBe("Barracks");

    root.querySelector<HTMLInputElement>("#sequence-starting-selection")?.focus();
    changeInput(root, "#sequence-starting-selection", "vill");
    expect(root.querySelectorAll("[data-select-starting-selection]")).toHaveLength(1);
    expect(root.textContent).toContain("Villager");
    pressKey(root, "#sequence-starting-selection", "Escape");
    expect(root.querySelector<HTMLInputElement>("#sequence-starting-selection")?.value).toBe("Barracks");

    changeInput(root, "#sequence-pro-target", "0.9");
    expect(root.querySelectorAll(".target-times__grid")).toHaveLength(0);

    changeInput(root, "#step-search", "left click");
    click(root, `[data-add-step="__left_click__"]`);
    expect(root.querySelectorAll(".zone-choice")).toHaveLength(0);
    expect(root.textContent).toContain("Left click anywhere");
    expect(root.textContent).toContain("Left click");
    expect(root.querySelector<HTMLInputElement>("#step-search")?.value).toBe("");
    expect(document.activeElement).toBe(root.querySelector("#step-search"));

    expect(root.querySelector("[data-step-tip]")).toBeNull();
    expect(root.querySelector("[data-step-failure]")).toBeNull();
    expect(root.textContent).not.toContain("On incorrect input");

    changeInput(root, "#step-search", "house");
    expect(root.querySelector(".action-result--active")?.textContent).toContain("Build house");
    changeInput(root, "#step-search", "lect");
    expect(root.querySelector(".action-result--active")?.textContent).toContain("Select villager");
    changeInput(root, "#step-search", "Select");
    expect(root.textContent).toContain("Select villager");
    expect(root.querySelector(".action-result--active")?.textContent).toContain("Select villager");
    pressKey(root, "#step-search", "ArrowDown");
    expect(root.querySelector(".action-result--active")?.textContent).toContain("Select house");
    pressKey(root, "#step-search", "ArrowUp");
    pressKey(root, "#step-search", "Enter");

    click(root, "#save-drill");
    expect(onSave).toHaveBeenCalledOnce();
    expect(onSave.mock.calls[0]?.[0]).toMatchObject({
      name: "House practice",
      description: "Place houses",
      sequences: [{
        name: "House",
        startingSelection: { type: "building", id: "barracks" },
        targetTimeMs: [3600, 2700, 2250, 1800, 1350, 1150, 900],
        steps: [
          { type: "click", label: "Left click anywhere" },
          { type: "hotkey", action: "select_villager" },
        ],
      }],
    });
  });

  it("supports inline search, step deletion, and sequence navigation", () => {
    mountDrillBuilder(root, {
      actions,
      bindingForAction: () => "Unmapped",
      onBack: vi.fn(),
      onSave: vi.fn(),
    });

    expect(root.querySelector(".builder-modal")).toBeNull();
    pressKey(root, "#step-search", "Enter");
    pressKey(root, "#step-search", "Escape");
    pressKey(root, "#step-search", "ArrowDown");
    changeInput(root, "#step-search", "map");
    expect(root.querySelectorAll(".action-result")).toHaveLength(3);
    changeInput(root, "#step-search", "nothing matches");
    pressKey(root, "#step-search", "Enter");
    expect(root.textContent).toContain("No actions match");
    pressKey(root, "#step-search", "Escape");
    expect(root.textContent).not.toContain("No actions match");

    changeInput(root, "#step-search", "left");
    pressKey(root, "#step-search", "Enter");
    click(root, '[data-delete-step="0"]');
    expect(root.querySelectorAll(".builder-step")).toHaveLength(0);

    click(root, "#add-sequence");
    expect(root.textContent).toContain("Sequence 2 of 2");
    expect(root.querySelectorAll("[data-sequence-index]")).toHaveLength(2);
    expect(document.activeElement).toBe(root.querySelector("#sequence-name"));
    expect(root.querySelector("#add-sequence kbd")?.textContent).toBe("Ctrl/⌘ + Enter");
    expect(root.querySelector(".sequence-navigation-shortcut kbd")?.textContent)
      .toBe("Ctrl/⌘ + Shift + ←/→");
    root.querySelector<HTMLInputElement>("#sequence-name")?.dispatchEvent(new KeyboardEvent(
      "keydown",
      { bubbles: true, key: "Enter", metaKey: true },
    ));
    expect(root.textContent).toContain("Sequence 3 of 3");
    root.querySelector<HTMLInputElement>("#sequence-name")?.dispatchEvent(new KeyboardEvent(
      "keydown",
      { bubbles: true, ctrlKey: true, key: "ArrowLeft", shiftKey: true },
    ));
    expect(root.textContent).toContain("Sequence 2 of 3");
    const scrollIntoView = vi.mocked(HTMLElement.prototype.scrollIntoView);
    scrollIntoView.mockClear();
    click(root, "#delete-sequence");
    expect(root.textContent).toContain("Sequence 2 of 2");
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", inline: "nearest" });

    root.querySelector<HTMLInputElement>("#sequence-name")?.dispatchEvent(new KeyboardEvent(
      "keydown",
      { bubbles: true, ctrlKey: true, key: "Enter" },
    ));
    expect(root.textContent).toContain("Sequence 3 of 3");
    expect(document.activeElement).toBe(root.querySelector("#sequence-name"));
    const sequenceIds = [...root.querySelectorAll<HTMLElement>("[data-sequence-id]")]
      .map((tab) => tab.dataset.sequenceId);
    expect(sequenceIds).toEqual(["sequence-1", "sequence-3", "sequence-2"]);
    expect(new Set(sequenceIds)).toHaveLength(3);
  });

  it("inherits starting selection without activating search results on the add-sequence shortcut", () => {
    mountDrillBuilder(root, {
      actions,
      bindingForAction: () => "Q",
      onBack: vi.fn(),
      onSave: vi.fn(),
    });

    root.querySelector<HTMLInputElement>("#sequence-starting-selection")?.focus();
    pressKey(root, "#sequence-starting-selection", "ArrowDown");
    pressKey(root, "#sequence-starting-selection", "Enter");
    expect(root.querySelector<HTMLInputElement>("#sequence-starting-selection")?.value)
      .toBe("Barracks");

    changeInput(root, "#step-search", "house");
    root.querySelector<HTMLInputElement>("#step-search")?.dispatchEvent(new KeyboardEvent(
      "keydown",
      { bubbles: true, ctrlKey: true, key: "Enter" },
    ));

    expect(root.textContent).toContain("Sequence 2 of 2");
    expect(root.querySelector<HTMLInputElement>("#sequence-starting-selection")?.value)
      .toBe("Barracks");
    click(root, '[data-sequence-index="0"]');
    expect(root.querySelectorAll(".builder-step")).toHaveLength(0);
    click(root, '[data-sequence-index="1"]');

    root.querySelector<HTMLInputElement>("#sequence-starting-selection")?.focus();
    changeInput(root, "#sequence-starting-selection", "stable");
    root.querySelector<HTMLInputElement>("#sequence-starting-selection")?.dispatchEvent(new KeyboardEvent(
      "keydown",
      { bubbles: true, metaKey: true, key: "Enter" },
    ));

    expect(root.textContent).toContain("Sequence 3 of 3");
    expect(root.querySelector<HTMLInputElement>("#sequence-starting-selection")?.value)
      .toBe("Barracks");
  });

  it("edits and deletes an existing drill", () => {
    const drill: Drill = {
      id: "existing",
      name: "Existing drill",
      description: "Existing description",
      sequences: [{
        id: "one",
        name: "One",
        startingSelection: { type: "none" },
        targetTimeMs: [7000, 6000, 5000, 4000, 3000, 2000, 1000],
        steps: [{ type: "click", label: "Left click anywhere" }],
      }],
    };
    const onDelete = vi.fn();
    const onSave = vi.fn();
    mountDrillBuilder(root, {
      actions,
      initialDrill: drill,
      bindingForAction: () => "Q",
      onBack: vi.fn(),
      onDelete,
      onSave,
    });

    expect(root.textContent).toContain("Edit custom drill");
    expect(root.querySelector("#drill-name")).toBeNull();
    expect(root.querySelector(".builder-details__summary")?.textContent).toContain("Existing drill");
    click(root, "#toggle-drill-details");
    expect(document.activeElement).toBe(root.querySelector("#drill-name"));
    click(root, "#toggle-drill-details");
    expect(root.textContent).toContain("Left click anywhere");
    expect(root.textContent).not.toContain("Zone 18");
    expect(root.querySelector<HTMLInputElement>("#sequence-starting-selection")?.value).toBe("Nothing selected");
    click(root, "#delete-drill");
    expect(onDelete).toHaveBeenCalledOnce();
    click(root, "#save-drill");
    expect(onSave.mock.calls[0]?.[0]).toMatchObject({ id: "existing" });
  });

  it("limits inline results and ignores stale defensive controls", () => {
    const manyActions = Array.from({ length: 60 }, (_, index) => ({
      id: `action_${index}`,
      label: `Action ${index}`,
      stringId: index + 1,
    }));
    mountDrillBuilder(root, {
      actions: manyActions,
      bindingForAction: () => "Q",
      onBack: vi.fn(),
      onSave: vi.fn(),
    });

    changeInput(root, "#step-search", "Action");
    expect(root.querySelectorAll(".action-result")).toHaveLength(8);
    const invalidAction = root.querySelector<HTMLButtonElement>("[data-add-step]");
    if (!invalidAction) throw new Error("Action result is missing.");
    invalidAction.dataset.addStep = "missing";
    invalidAction.click();
    expect(root.querySelectorAll(".builder-step")).toHaveLength(0);
    delete invalidAction.dataset.addStep;
    invalidAction.click();

    changeInput(root, "#step-search", "Action 0");
    pressKey(root, "#step-search", "Enter");
    const staleDelete = root.querySelector<HTMLButtonElement>('[data-delete-step="0"]');
    if (!staleDelete) throw new Error("Step controls are missing.");
    click(root, '[data-delete-step="0"]');
    staleDelete.click();

    const deleteOnlySequence = root.querySelector<HTMLButtonElement>("#delete-sequence");
    if (!deleteOnlySequence) throw new Error("Delete sequence button is missing.");
    deleteOnlySequence.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(root.textContent).toContain("Sequence 1 of 1");
  });

  it("validates incomplete sequences before saving", () => {
    mountDrillBuilder(root, {
      actions,
      bindingForAction: () => "Q",
      onBack: vi.fn(),
      onSave: vi.fn(),
    });
    changeInput(root, "#drill-name", "Invalid drill");
    changeInput(root, "#sequence-name", "Incomplete");
    click(root, "#save-drill");
    expect(root.textContent).toContain("Complete the name, starting selection, steps, and Pro target time");
  });

  it("derives all difficulty targets from the Pro target", () => {
    expect(targetTimesFromPro(900)).toEqual([3600, 2700, 2250, 1800, 1350, 1150, 900]);
    expect(targetTimesFromPro(1)).toEqual([50, 50, 50, 50, 50, 50, 50]);
  });

  it("supports complete keyboard, click, and focus behavior in the selection search", async () => {
    mountDrillBuilder(root, {
      actions,
      bindingForAction: () => "Q",
      onBack: vi.fn(),
      onSave: vi.fn(),
    });

    root.querySelector<HTMLInputElement>("#sequence-starting-selection")?.focus();
    pressKey(root, "#sequence-starting-selection", "ArrowUp");
    expect(root.querySelector(".action-result--active")?.textContent).toContain("Transport Ship");
    pressKey(root, "#sequence-starting-selection", "Enter");
    expect(root.querySelector<HTMLInputElement>("#sequence-starting-selection")?.value).toBe("Transport Ship");

    root.querySelector<HTMLInputElement>("#sequence-starting-selection")?.focus();
    changeInput(root, "#sequence-starting-selection", "no selection matches");
    expect(root.textContent).toContain("No selections match");
    pressKey(root, "#sequence-starting-selection", "ArrowDown");
    pressKey(root, "#sequence-starting-selection", "ArrowUp");
    pressKey(root, "#sequence-starting-selection", "Enter");
    pressKey(root, "#sequence-starting-selection", "ArrowRight");
    pressKey(root, "#sequence-starting-selection", "Escape");
    expect(root.querySelector<HTMLInputElement>("#sequence-starting-selection")?.value).toBe("Transport Ship");

    changeInput(root, "#sequence-starting-selection", "b");
    expect([...root.querySelectorAll("[data-select-starting-selection]")].slice(0, 2)
      .map((item) => item.textContent)).toEqual([
      expect.stringContaining("Barracks"),
      expect.stringContaining("Blacksmith"),
    ]);

    changeInput(root, "#sequence-starting-selection", "");
    const staleControl = root.querySelector<HTMLElement>(".selection-search");
    changeInput(root, "#sequence-starting-selection", "");
    staleControl?.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    await Promise.resolve();
    const barracks = [...root.querySelectorAll<HTMLButtonElement>("[data-select-starting-selection]")]
      .find((item) => item.textContent?.includes("Barracks"));
    if (!barracks) throw new Error("Barracks result is missing.");
    barracks.focus();
    barracks.click();
    expect(root.querySelector<HTMLInputElement>("#sequence-starting-selection")?.value).toBe("Barracks");

    changeInput(root, "#sequence-starting-selection", "");
    const invalid = root.querySelector<HTMLButtonElement>("[data-select-starting-selection]");
    if (!invalid) throw new Error("Selection result is missing.");
    delete invalid.dataset.selectStartingSelection;
    invalid.click();
    expect(root.querySelector(".selection-results")).not.toBeNull();

    const outside = document.createElement("button");
    document.body.append(outside);
    changeInput(root, "#sequence-starting-selection", "unfinished");
    outside.focus();
    await Promise.resolve();
    expect(root.querySelector(".selection-results")).toBeNull();
    expect(root.querySelector<HTMLInputElement>("#sequence-starting-selection")?.value).toBe("Barracks");
  });

  it("loads initial hotkey steps and rejects an invalid empty sequence collection", () => {
    const hotkeyDrill: Drill = {
      id: "hotkey",
      name: "Hotkey",
      description: "Hotkey",
      sequences: [{
        id: "one",
        name: "One",
        startingSelection: { type: "unit", id: "villager" },
        targetTimeMs: [7000, 6000, 5000, 4000, 3000, 2000, 1000],
        steps: [{ type: "hotkey", action: "select_villager", label: "Select villager" }],
      }],
    };
    mountDrillBuilder(root, {
      actions,
      initialDrill: hotkeyDrill,
      bindingForAction: () => "V",
      onBack: vi.fn(),
      onSave: vi.fn(),
    });
    expect(root.textContent).toContain("Hotkey action");

    expect(() => mountDrillBuilder(root, {
      actions,
      initialDrill: {
        ...hotkeyDrill,
        sequences: [{
          ...hotkeyDrill.sequences[0]!,
          startingSelection: { type: "building", id: "missing" } as unknown as Drill["sequences"][number]["startingSelection"],
        }],
      },
      bindingForAction: () => "V",
      onBack: vi.fn(),
      onSave: vi.fn(),
    })).not.toThrow();
    expect(root.querySelector<HTMLInputElement>("#sequence-starting-selection")?.value).toBe("Nothing selected");

    expect(() => mountDrillBuilder(root, {
      actions,
      initialDrill: { ...hotkeyDrill, sequences: [] },
      bindingForAction: () => "V",
      onBack: vi.fn(),
      onSave: vi.fn(),
    })).toThrow("No sequence is selected");
  });
});
