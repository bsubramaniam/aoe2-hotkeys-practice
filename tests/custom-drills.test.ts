import { describe, expect, it } from "vitest";

import { customDrillFilename, drillToCustomFile, friendlyCustomDrillId, loadCustomDrills, parseCustomDrill, persistCustomDrills, upsertCustomDrill } from "../src/custom-drills";

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();

  get length(): number { return this.values.size; }
  clear(): void { this.values.clear(); }
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  key(index: number): string | null { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string): void { this.values.delete(key); }
  setItem(key: string, value: string): void { this.values.set(key, value); }
}

function validDrillFile(): Record<string, unknown> {
  return {
    schemaVersion: 1,
    name: "Mining Camp Practice",
    description: "Practice placing a mining camp.",
    totalTimeMs: 60_000,
    sequences: [{
      id: "mining-camp",
      name: "Mining Camp",
      targetTimeMs: [6500, 5200, 4200, 3300, 2600, 2000, 1500],
      sequence: [
        { type: "hotkey", action: "open_economic_buildings", onFailure: "wait", tip: "Open the build menu." },
        { type: "hotkey", action: "build_mining_camp", onFailure: "restart_sequence" },
        { type: "click", zone: 8, onFailure: "wait" },
      ],
    }],
  };
}

describe("custom drill files", () => {
  it("parses a drill and preserves step tips", () => {
    const drill = parseCustomDrill(validDrillFile());

    expect(drill.id).toBe("mining-camp-practice");
    expect(drill.sequences[0]?.steps[0]).toMatchObject({
      type: "hotkey",
      action: "open_economic_buildings",
      tip: "Open the build menu.",
    });
  });

  it("rejects portable drill files containing a top-level ID", () => {
    expect(() => parseCustomDrill({ ...validDrillFile(), id: "legacy-id" }))
      .toThrow("id is not supported");
  });

  it("ignores obsolete per-drill click-zone layout data", () => {
    const file = validDrillFile();
    file.clickZones = [{ id: 99, xPercent: -1, yPercent: 400 }];

    expect(() => parseCustomDrill(file)).not.toThrow();
    expect(drillToCustomFile(parseCustomDrill(file))).not.toHaveProperty("clickZones");
  });

  it("rejects unsupported logical hotkey actions", () => {
    const file = validDrillFile();
    const sequences = file.sequences as Array<Record<string, unknown>>;
    const sequence = sequences[0];
    if (!sequence) throw new Error("Fixture sequence is missing.");
    sequence.sequence = [{ type: "hotkey", action: "unknown_action", onFailure: "wait" }];

    expect(() => parseCustomDrill(file)).toThrow("action is not supported");
  });

  it("serializes a parsed drill back to the upload format", () => {
    const drill = parseCustomDrill(validDrillFile());
    const serialized = drillToCustomFile(drill);

    expect(serialized.schemaVersion).toBe(1);
    expect(serialized).not.toHaveProperty("id");
    expect(serialized.sequences[0]?.sequence).toHaveLength(3);
    expect(() => parseCustomDrill(serialized)).not.toThrow();
  });

  it("covers optional text, click serialization, and invalid stored entries", () => {
    const file = validDrillFile();
    delete file.description;
    const sequence = (file.sequences as Array<Record<string, unknown>>)[0];
    if (!sequence) throw new Error("Fixture sequence is missing.");
    sequence.sequence = [
      { type: "click", zone: 4, onFailure: "wait", tip: "   " },
      { type: "click", zone: 5, onFailure: "wait", tip: "Use the center." },
    ];

    const parsed = parseCustomDrill(file);
    expect(parsed.description).toBe("Custom drill");
    expect(parsed.sequences[0]?.steps[0]).not.toHaveProperty("tip");
    expect(parsed.sequences[0]?.steps[1]).toHaveProperty("tip", "Use the center.");

    const serialized = drillToCustomFile({
      ...parsed,
      sequences: [{
        ...parsed.sequences[0]!,
        steps: [
          { type: "click", zone: "random", label: "Random", onFailure: "wait", tip: "Anywhere" },
          { type: "click", zone: 5, label: "Five", onFailure: "wait" },
        ],
      }],
    });
    expect(serialized.sequences[0]?.sequence).toEqual([
      { type: "click", zone: 1, onFailure: "wait", tip: "Anywhere" },
      { type: "click", zone: 5, onFailure: "wait" },
    ]);

    const storage = new MemoryStorage();
    storage.setItem("aoe2-hotkey-practice.custom-drills.v1", JSON.stringify([null, { ...validDrillFile(), id: "valid" }]));
    expect(loadCustomDrills(storage).drills).toHaveLength(1);
  });

  it("updates an edited drill under the same stable ID without duplicating it", () => {
    const drill = parseCustomDrill(validDrillFile());
    const edited = { ...drill, name: "Edited Mining Camp Practice" };
    const result = upsertCustomDrill([drill], edited);

    expect(result.index).toBe(0);
    expect(result.drills).toHaveLength(1);
    expect(result.drills[0]?.name).toBe("Edited Mining Camp Practice");
  });

  it("adds a new drill when its ID is not already stored", () => {
    const drill = parseCustomDrill(validDrillFile());
    const added = { ...drill, id: "second" };
    const result = upsertCustomDrill([drill], added);

    expect(result.index).toBe(1);
    expect(result.drills).toHaveLength(2);
  });

  it("creates a filesystem-safe JSON export filename", () => {
    expect(customDrillFilename({ id: "fallback", name: "TC + Villager: Pro!" }))
      .toBe("tc-villager-pro.json");
    expect(customDrillFilename({ id: "fallback-id", name: "!!!" })).toBe("fallback-id.json");
  });

  it("generates friendly collision-safe local IDs", () => {
    expect(friendlyCustomDrillId("Villager Building Placement")).toBe("villager-building-placement");
    expect(friendlyCustomDrillId("Villager Building Placement", ["villager-building-placement"]))
      .toBe("villager-building-placement-2");
    expect(friendlyCustomDrillId("Villager Building Placement", [
      "villager-building-placement",
      "villager-building-placement-2",
    ])).toBe("villager-building-placement-3");
    expect(friendlyCustomDrillId("!!!")).toBe("custom-drill");
  });

  it("restores created and uploaded drills from browser storage", () => {
    const storage = new MemoryStorage();
    const drill = parseCustomDrill(validDrillFile());

    expect(persistCustomDrills([drill], storage)).toBe(true);
    expect(loadCustomDrills(storage)).toMatchObject({
      storageAvailable: true,
      drills: [{ id: "mining-camp-practice", name: "Mining Camp Practice" }],
    });
  });

  it("handles unavailable, empty, malformed, and partially invalid storage", () => {
    expect(loadCustomDrills(undefined)).toEqual({ drills: [], storageAvailable: false });
    expect(loadCustomDrills(new MemoryStorage())).toEqual({ drills: [], storageAvailable: true });

    const malformed = new MemoryStorage();
    malformed.setItem("aoe2-hotkey-practice.custom-drills.v1", "not json");
    expect(loadCustomDrills(malformed)).toEqual({ drills: [], storageAvailable: false });

    const nonArray = new MemoryStorage();
    nonArray.setItem("aoe2-hotkey-practice.custom-drills.v1", "{}");
    expect(loadCustomDrills(nonArray)).toEqual({ drills: [], storageAvailable: true });

    const mixed = new MemoryStorage();
    mixed.setItem("aoe2-hotkey-practice.custom-drills.v1", JSON.stringify([{}, { ...validDrillFile(), id: "stored-id" }]));
    expect(loadCustomDrills(mixed).drills).toHaveLength(1);
    expect(persistCustomDrills([], undefined)).toBe(false);

    const throwingStorage = {
      getItem: () => { throw new Error("blocked"); },
      setItem: () => { throw new Error("blocked"); },
    } as unknown as Storage;
    expect(loadCustomDrills(throwingStorage)).toEqual({ drills: [], storageAvailable: false });
    expect(persistCustomDrills([], throwingStorage)).toBe(false);
  });

  it("validates every custom drill field and step variant", () => {
    const cases: Array<[unknown, string]> = [
      [null, "JSON object"],
      [{}, "schemaVersion"],
      [{ schemaVersion: 1, totalTimeMs: 0 }, "positive integer"],
      [{ ...validDrillFile(), sequences: [] }, "at least one sequence"],
      [{ ...validDrillFile(), sequences: [null] }, "must be an object"],
    ];
    for (const [value, message] of cases) {
      expect(() => parseCustomDrill(value)).toThrow(message);
    }

    const mutateSequence = (changes: Record<string, unknown>): Record<string, unknown> => {
      const file = validDrillFile();
      file.sequences = [{ ...(file.sequences as Array<Record<string, unknown>>)[0], ...changes }];
      return file;
    };
    expect(() => parseCustomDrill(mutateSequence({ targetTimeMs: [1] }))).toThrow("exactly seven");
    expect(() => parseCustomDrill(mutateSequence({ targetTimeMs: [1, 1, 1, 1, 1, 1, 0] }))).toThrow("positive integer");
    expect(() => parseCustomDrill(mutateSequence({ sequence: [] }))).toThrow("at least one step");
    expect(() => parseCustomDrill(mutateSequence({ sequence: [null] }))).toThrow("must be an object");
    expect(() => parseCustomDrill(mutateSequence({ sequence: [{ type: "click", zone: 1, onFailure: "stop" }] }))).toThrow("onFailure");
    expect(() => parseCustomDrill(mutateSequence({ sequence: [{ type: "click", zone: 1, onFailure: "wait", tip: 4 }] }))).toThrow("tip");
    expect(() => parseCustomDrill(mutateSequence({ sequence: [{ type: "click", zone: 21, onFailure: "wait" }] }))).toThrow("1 through 20");
    expect(() => parseCustomDrill(mutateSequence({ sequence: [{ type: "other", onFailure: "wait" }] }))).toThrow("type");
    expect(() => parseCustomDrill(mutateSequence({ id: "" }))).toThrow("non-empty string");

    const duplicate = validDrillFile();
    duplicate.sequences = [
      ...(duplicate.sequences as unknown[]),
      { ...(duplicate.sequences as Array<Record<string, unknown>>)[0] },
    ];
    expect(() => parseCustomDrill(duplicate)).toThrow("unique");

    const badDescription = validDrillFile();
    badDescription.description = 3;
    expect(() => parseCustomDrill(badDescription)).toThrow("description");
  });
});
