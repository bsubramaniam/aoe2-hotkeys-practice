import { getHotkeyAction } from "./hotkey-actions";
import type { Drill, FailureHandling, SequenceTemplate } from "./types";

export const CUSTOM_DRILL_STORAGE_KEY = "aoe2-hotkey-practice.custom-drills.v2";

interface CustomHotkeyStepFile {
  type: "hotkey";
  action: string;
  tip?: string;
  onFailure: FailureHandling;
}

interface CustomClickStepFile {
  type: "click";
  tip?: string;
  onFailure: FailureHandling;
}

type CustomStepFile = CustomHotkeyStepFile | CustomClickStepFile;

export interface CustomSequenceFile {
  id: string;
  name: string;
  sequence: CustomStepFile[];
  targetTimeMs: [number, number, number, number, number, number, number];
}

export interface CustomDrillFile {
  schemaVersion: 2;
  name: string;
  description: string;
  totalTimeMs: number;
  sequences: CustomSequenceFile[];
}

interface StoredCustomDrillFile extends CustomDrillFile {
  id: string;
}

export interface StoredDrills {
  drills: Drill[];
  storageAvailable: boolean;
}

export interface UpsertedDrill {
  drills: Drill[];
  index: number;
}

export function friendlyCustomDrillId(name: string, existingIds: Iterable<string> = []): string {
  const base = name
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "custom-drill";
  const existing = new Set(existingIds);
  if (!existing.has(base)) return base;
  let suffix = 2;
  while (existing.has(`${base}-${suffix}`)) suffix += 1;
  return `${base}-${suffix}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredText(value: unknown, path: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${path} must be a non-empty string.`);
  }
  return value.trim();
}

function optionalText(value: unknown, path: string): string | undefined {
  if (value === undefined || value === "") return undefined;
  if (typeof value !== "string") throw new Error(`${path} must be a string.`);
  return value.trim() || undefined;
}

function positiveInteger(value: unknown, path: string): number {
  if (!Number.isInteger(value) || (value as number) <= 0) {
    throw new Error(`${path} must be a positive integer.`);
  }
  return value as number;
}

function failureHandling(value: unknown, path: string): FailureHandling {
  if (value !== "wait" && value !== "restart_sequence") {
    throw new Error(`${path} must be "wait" or "restart_sequence".`);
  }
  return value;
}

function parseSequence(value: unknown, index: number): SequenceTemplate {
  const path = `sequences[${index}]`;
  if (!isRecord(value)) throw new Error(`${path} must be an object.`);
  if (!Array.isArray(value.targetTimeMs) || value.targetTimeMs.length !== 7) {
    throw new Error(`${path}.targetTimeMs must contain exactly seven values.`);
  }
  const targetTimeMs = value.targetTimeMs.map((time, timeIndex) =>
    positiveInteger(time, `${path}.targetTimeMs[${timeIndex}]`),
  ) as [number, number, number, number, number, number, number];
  if (!Array.isArray(value.sequence) || value.sequence.length === 0) {
    throw new Error(`${path}.sequence must contain at least one step.`);
  }
  const steps = value.sequence.map((step, stepIndex) => {
    const stepPath = `${path}.sequence[${stepIndex}]`;
    if (!isRecord(step)) throw new Error(`${stepPath} must be an object.`);
    const onFailure = failureHandling(step.onFailure, `${stepPath}.onFailure`);
    const tip = optionalText(step.tip, `${stepPath}.tip`);
    if (step.type === "hotkey") {
      const action = requiredText(step.action, `${stepPath}.action`);
      const definition = getHotkeyAction(action);
      if (!definition) throw new Error(`${stepPath}.action is not supported.`);
      return { type: "hotkey" as const, action, label: definition.label, onFailure, ...(tip ? { tip } : {}) };
    }
    if (step.type === "click") {
      if (step.zone !== undefined) throw new Error(`${stepPath}.zone is not supported.`);
      return { type: "click" as const, label: "Left click anywhere", onFailure, ...(tip ? { tip } : {}) };
    }
    throw new Error(`${stepPath}.type must be "hotkey" or "click".`);
  });
  return {
    id: requiredText(value.id, `${path}.id`),
    name: requiredText(value.name, `${path}.name`),
    steps,
    targetTimeMs,
  };
}

export function parseCustomDrill(value: unknown): Drill {
  if (!isRecord(value)) throw new Error("The drill file must contain a JSON object.");
  if (value.id !== undefined) throw new Error("id is not supported in custom drill files.");
  if (value.clickZones !== undefined) throw new Error("clickZones is not supported in custom drill files.");
  if (value.schemaVersion !== 2) throw new Error("schemaVersion must be 2.");
  const totalTimeMs = positiveInteger(value.totalTimeMs, "totalTimeMs");
  if (!Array.isArray(value.sequences) || value.sequences.length === 0) {
    throw new Error("sequences must contain at least one sequence.");
  }
  const sequences = value.sequences.map(parseSequence);
  const sequenceIds = new Set(sequences.map((sequence) => sequence.id));
  if (sequenceIds.size !== sequences.length) throw new Error("Every sequence ID must be unique.");
  const name = requiredText(value.name, "name");
  return {
    id: friendlyCustomDrillId(name),
    name,
    description: optionalText(value.description, "description") ?? "Custom drill",
    totalTimeMs,
    sequences,
  };
}

export function drillToCustomFile(drill: Drill): CustomDrillFile {
  return {
    schemaVersion: 2,
    name: drill.name,
    description: drill.description,
    totalTimeMs: drill.totalTimeMs,
    sequences: drill.sequences.map((sequence) => ({
      id: sequence.id,
      name: sequence.name,
      sequence: sequence.steps.map((step) => step.type === "hotkey"
        ? { type: "hotkey", action: step.action, onFailure: step.onFailure, ...(step.tip ? { tip: step.tip } : {}) }
        : { type: "click", onFailure: step.onFailure, ...(step.tip ? { tip: step.tip } : {}) }),
      targetTimeMs: [...sequence.targetTimeMs] as CustomSequenceFile["targetTimeMs"],
    })),
  };
}

function drillToStoredFile(drill: Drill): StoredCustomDrillFile {
  return { ...drillToCustomFile(drill), id: drill.id };
}

export function upsertCustomDrill(drills: Drill[], drill: Drill): UpsertedDrill {
  const existingIndex = drills.findIndex((item) => item.id === drill.id);
  if (existingIndex >= 0) {
    return {
      drills: drills.map((item, index) => index === existingIndex ? drill : item),
      index: existingIndex,
    };
  }
  return { drills: [...drills, drill], index: drills.length };
}

export function customDrillFilename(drill: Pick<Drill, "id" | "name">): string {
  const safeName = drill.name
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || drill.id;
  return `${safeName}.json`;
}

export function loadCustomDrills(storage: Storage | undefined = globalThis.localStorage): StoredDrills {
  if (!storage) return { drills: [], storageAvailable: false };
  try {
    const saved = storage.getItem(CUSTOM_DRILL_STORAGE_KEY);
    if (!saved) return { drills: [], storageAvailable: true };
    const values: unknown = JSON.parse(saved);
    if (!Array.isArray(values)) return { drills: [], storageAvailable: true };
    const drills: Drill[] = [];
    for (const value of values) {
      try {
        if (!isRecord(value)) continue;
        const id = requiredText(value.id, "id");
        const portableValue = { ...value };
        delete portableValue.id;
        drills.push({ ...parseCustomDrill(portableValue), id });
      } catch {
        // Ignore stale or invalid entries without losing the valid local drills.
      }
    }
    return { drills, storageAvailable: true };
  } catch {
    return { drills: [], storageAvailable: false };
  }
}

export function persistCustomDrills(drills: Drill[], storage: Storage | undefined = globalThis.localStorage): boolean {
  if (!storage) return false;
  try {
    storage.setItem(CUSTOM_DRILL_STORAGE_KEY, JSON.stringify(drills.map(drillToStoredFile)));
    return true;
  } catch {
    return false;
  }
}
