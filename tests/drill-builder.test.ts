/* @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { mountDrillBuilder } from "../src/drill-builder";
import type { Drill } from "../src/types";

const actions = [
  { id: "select_villager", label: "Select villager", stringId: 1 },
  { id: "build_house", label: "Build house", stringId: 2 },
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
    changeInput(root, "#drill-description", "Place houses");
    changeInput(root, "#drill-duration", "45");
    changeInput(root, "#sequence-name", "House");

    click(root, "#add-click-step");
    expect(root.querySelectorAll(".zone-choice")).toHaveLength(20);
    click(root, '[data-select-step-zone="20"]');
    expect(root.textContent).toContain("Click zone 20");

    const tip = root.querySelector<HTMLInputElement>('[data-step-tip="0"]');
    const failure = root.querySelector<HTMLSelectElement>('[data-step-failure="0"]');
    if (!tip || !failure) throw new Error("Step fields are missing.");
    tip.value = "Bottom right";
    tip.dispatchEvent(new Event("input", { bubbles: true }));
    failure.value = "restart_sequence";
    failure.dispatchEvent(new Event("change", { bubbles: true }));

    click(root, "#add-hotkey-step");
    expect(root.textContent).toContain("Loading hotkey actions");
    vi.runAllTimers();
    expect(root.querySelectorAll(".action-result")).toHaveLength(2);
    changeInput(root, "#action-search", "V");
    expect(root.textContent).toContain("Select villager");
    click(root, '[data-add-action="select_villager"]');

    click(root, "#save-drill");
    expect(onSave).toHaveBeenCalledOnce();
    expect(onSave.mock.calls[0]?.[0]).toMatchObject({
      name: "House practice",
      description: "Place houses",
      totalTimeMs: 45_000,
      sequences: [{
        name: "House",
        steps: [
          { type: "click", zone: 20, tip: "Bottom right", onFailure: "restart_sequence" },
          { type: "hotkey", action: "select_villager" },
        ],
      }],
    });
  });

  it("supports modal closing, step deletion, and sequence navigation", () => {
    mountDrillBuilder(root, {
      actions,
      bindingForAction: () => "Unmapped",
      onBack: vi.fn(),
      onSave: vi.fn(),
    });

    click(root, "#add-hotkey-step");
    click(root, "#close-hotkey-modal");
    expect(root.querySelector(".builder-modal")).toBeNull();

    click(root, "#add-hotkey-step");
    vi.runAllTimers();
    changeInput(root, "#action-search", "nothing matches");
    expect(root.textContent).toContain("No actions match");
    click(root, "#close-hotkey-modal");

    click(root, "#add-click-step");
    click(root, '[data-expand-click="0"]');
    click(root, '[data-expand-click="0"]');
    click(root, '[data-delete-step="0"]');
    expect(root.textContent).toContain("Add the first hotkey");

    click(root, "#add-sequence");
    expect(root.textContent).toContain("Sequence 2 of 2");
    click(root, "#previous-sequence");
    click(root, "#next-sequence");
    click(root, "#delete-sequence");
    expect(root.textContent).toContain("Sequence 1 of 1");
  });

  it("edits and deletes an existing drill", () => {
    const drill: Drill = {
      id: "existing",
      name: "Existing drill",
      description: "Existing description",
      totalTimeMs: 30_000,
      sequences: [{
        id: "one",
        name: "One",
        targetTimeMs: [7000, 6000, 5000, 4000, 3000, 2000, 1000],
        steps: [{ type: "click", zone: "random", label: "Random zone", onFailure: "wait" }],
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
    click(root, "#delete-drill");
    expect(onDelete).toHaveBeenCalledOnce();
    click(root, "#save-drill");
    expect(onSave.mock.calls[0]?.[0]).toMatchObject({ id: "existing" });
  });

  it("handles cached action search and stale defensive controls", () => {
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

    click(root, "#add-hotkey-step");
    click(root, "#close-hotkey-modal");
    vi.runAllTimers();
    expect(root.querySelector(".builder-modal")).toBeNull();

    click(root, "#add-hotkey-step");
    vi.runAllTimers();
    expect(root.textContent).toContain("Showing 50 of 60 matches");
    const invalidAction = root.querySelector<HTMLButtonElement>("[data-add-action]");
    if (!invalidAction) throw new Error("Action result is missing.");
    invalidAction.dataset.addAction = "missing";
    invalidAction.click();
    expect(root.querySelector(".builder-modal")).not.toBeNull();

    const backdrop = root.querySelector<HTMLElement>("[data-modal-backdrop]");
    if (!backdrop) throw new Error("Modal backdrop is missing.");
    backdrop.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(root.querySelector(".builder-modal")).toBeNull();

    click(root, "#add-hotkey-step");
    expect(root.textContent).toContain("Showing 50 of 60 matches");
    click(root, "#close-hotkey-modal");

    click(root, "#add-click-step");
    const staleTip = root.querySelector<HTMLInputElement>('[data-step-tip="0"]');
    const staleFailure = root.querySelector<HTMLSelectElement>('[data-step-failure="0"]');
    const staleZone = root.querySelector<HTMLButtonElement>("[data-select-step-zone]");
    if (!staleTip || !staleFailure || !staleZone) throw new Error("Step controls are missing.");
    staleZone.dataset.stepIndex = "99";
    staleZone.click();
    click(root, '[data-delete-step="0"]');
    staleTip.dispatchEvent(new Event("input", { bubbles: true }));
    staleFailure.dispatchEvent(new Event("change", { bubbles: true }));

    const deleteOnlySequence = root.querySelector<HTMLButtonElement>("#delete-sequence");
    if (!deleteOnlySequence) throw new Error("Delete sequence button is missing.");
    deleteOnlySequence.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(root.textContent).toContain("Sequence 1 of 1");
  });

  it("validates duration and incomplete sequences before saving", () => {
    mountDrillBuilder(root, {
      actions,
      bindingForAction: () => "Q",
      onBack: vi.fn(),
      onSave: vi.fn(),
    });
    changeInput(root, "#drill-name", "Invalid drill");
    changeInput(root, "#drill-duration", "0");
    click(root, "#save-drill");
    expect(root.textContent).toContain("positive number of seconds");

    changeInput(root, "#drill-duration", "60");
    changeInput(root, "#sequence-name", "Incomplete");
    click(root, "#save-drill");
    expect(root.textContent).toContain("Complete the name, steps, and seven target times");
  });

  it("loads initial hotkey steps and rejects an invalid empty sequence collection", () => {
    const hotkeyDrill: Drill = {
      id: "hotkey",
      name: "Hotkey",
      description: "Hotkey",
      totalTimeMs: 30_000,
      sequences: [{
        id: "one",
        name: "One",
        targetTimeMs: [7000, 6000, 5000, 4000, 3000, 2000, 1000],
        steps: [{ type: "hotkey", action: "select_villager", label: "Select villager", onFailure: "wait" }],
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
      initialDrill: { ...hotkeyDrill, sequences: [] },
      bindingForAction: () => "V",
      onBack: vi.fn(),
      onSave: vi.fn(),
    })).toThrow("No sequence is selected");
  });
});
