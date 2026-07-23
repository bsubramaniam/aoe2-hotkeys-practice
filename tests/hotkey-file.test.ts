import { describe, expect, it } from "vitest";
import { deflateSync } from "fflate";

import { bindingSignature, eventMatchesBinding, formatBinding, isModifierOnly, MAX_DECOMPRESSED_HOTKEY_BYTES, MAX_HOTKEY_FILE_BYTES, parseHotkeyFiles } from "../src/hotkey-file";

interface FixtureHotkey {
  keyCode: number;
  stringId: number;
  ctrl?: boolean;
  alt?: boolean;
  shift?: boolean;
}

function makeMenu(hotkeys: FixtureHotkey[]): Uint8Array {
  const buffer = new ArrayBuffer(4 + hotkeys.length * 12);
  const view = new DataView(buffer);
  view.setUint32(0, hotkeys.length, true);
  hotkeys.forEach((hotkey, index) => {
    const offset = 4 + index * 12;
    view.setInt32(offset, hotkey.keyCode, true);
    view.setInt32(offset + 4, hotkey.stringId, true);
    view.setUint8(offset + 8, hotkey.ctrl ? 1 : 0);
    view.setUint8(offset + 9, hotkey.alt ? 1 : 0);
    view.setUint8(offset + 10, hotkey.shift ? 1 : 0);
    view.setUint8(offset + 11, 0);
  });
  return new Uint8Array(buffer);
}

function combine(parts: Uint8Array[]): ArrayBuffer {
  const output = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output.buffer;
}

function uint32(value: number): Uint8Array {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, value, true);
  return bytes;
}

function text(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

describe("hotkey file parser", () => {
  it("parses a standard HKI/HKP structure", () => {
    const file = combine([
      uint32(0x40400000),
      uint32(1),
      makeMenu([{ keyCode: 81, stringId: 19214, ctrl: true }]),
    ]);

    const profile = parseHotkeyFiles([{ name: "profile.hki", buffer: file }]);
    const binding = profile.bindings.get(19214)?.[0];

    expect(binding).toBeDefined();
    expect(binding && formatBinding(binding)).toBe("Ctrl + Q");
  });

  it("parses the three base menus in Base.hkp", () => {
    const file = combine([
      uint32(0x86406666),
      makeMenu([]),
      makeMenu([]),
      makeMenu([]),
      uint32(1),
      makeMenu([{ keyCode: 87, stringId: 19215, shift: true }]),
    ]);

    const profile = parseHotkeyFiles([{ name: "Base.hkp", buffer: file }]);
    const binding = profile.bindings.get(19215)?.[0];

    expect(binding).toBeDefined();
    expect(binding && formatBinding(binding)).toBe("Shift + W");
  });

  it("inflates and parses the current tagged HKP structure", () => {
    const record = combine([
      text("HandlerBaseGroupBegin"),
      uint32(0x00100a60),
      text("GroupHeaderGuard"),
      makeMenu([{ keyCode: 81, stringId: 19214 }]).slice(4),
      text("HandlerBaseGroupEnd"),
    ]);
    const tagged = combine([
      uint32(0x408a3d71),
      text("additionalHotkeysBegin"),
      new Uint8Array(record),
      text("additionalHotkeysEnd"),
    ]);
    const compressed = Uint8Array.from(deflateSync(new Uint8Array(tagged))).buffer;

    const profile = parseHotkeyFiles([{ name: "Hotkeys.hkp", buffer: compressed }]);
    const binding = profile.bindings.get(19214)?.[0];

    expect(binding).toBeDefined();
    expect(binding && formatBinding(binding)).toBe("Q");
  });

  it("rejects unsupported files", () => {
    expect(() => parseHotkeyFiles([{ name: "hotkeys.txt", buffer: new ArrayBuffer(0) }]))
      .toThrow("is not an .hki or .hkp file");
    expect(() => parseHotkeyFiles([])).toThrow("Choose at least one");
    expect(() => parseHotkeyFiles([{ name: "broken.hkp", buffer: new ArrayBuffer(2) }]))
      .toThrow("Could not read broken.hkp");
  });

  it("rejects oversized input, excess files, and excessive decompressed output", () => {
    expect(() => parseHotkeyFiles([{ name: "large.hkp", buffer: new ArrayBuffer(MAX_HOTKEY_FILE_BYTES + 1) }]))
      .toThrow("exceeds the 64 KiB file limit");
    expect(() => parseHotkeyFiles([
      { name: "one.hkp", buffer: new ArrayBuffer(0) },
      { name: "two.hkp", buffer: new ArrayBuffer(0) },
      { name: "three.hkp", buffer: new ArrayBuffer(0) },
    ])).toThrow("no more than 2 hotkey files");

    const compressed = Uint8Array.from(deflateSync(new Uint8Array(MAX_DECOMPRESSED_HOTKEY_BYTES + 1))).buffer;
    expect(() => parseHotkeyFiles([{ name: "expanded.hkp", buffer: compressed }]))
      .toThrow("decompressed hotkey file exceeds the 512 KiB limit");
  });

  it("bounds menu structures and rejects trailing or malformed tagged data", () => {
    expect(() => parseHotkeyFiles([{
      name: "too-many-hotkeys.hki",
      buffer: combine([uint32(0), uint32(1), uint32(2_001)]),
    }])).toThrow("Could not read too-many-hotkeys.hki");
    expect(() => parseHotkeyFiles([{
      name: "too-many-menus.hki",
      buffer: combine([uint32(0), uint32(101)]),
    }])).toThrow("Could not read too-many-menus.hki");
    expect(() => parseHotkeyFiles([{
      name: "trailing.hki",
      buffer: combine([uint32(0), uint32(0), new Uint8Array([1])]),
    }])).toThrow("Could not read trailing.hki");
    expect(() => parseHotkeyFiles([{
      name: "Base.hkp",
      buffer: combine([uint32(0), makeMenu([]), makeMenu([]), makeMenu([]), uint32(0), new Uint8Array([1])]),
    }])).toThrow("Could not read Base.hkp");

    const truncatedTagged = combine([uint32(0), text("GroupHeaderGuard")]);
    expect(() => parseHotkeyFiles([{ name: "truncated.hkp", buffer: truncatedTagged }]))
      .toThrow("Could not read truncated.hkp");

    const invalidTaggedEnd = combine([
      uint32(0),
      text("GroupHeaderGuard"),
      new Uint8Array(12),
      text("NotHandlerBaseGroupEnd"),
    ]);
    expect(() => parseHotkeyFiles([{ name: "invalid-end.hkp", buffer: invalidTaggedEnd }]))
      .toThrow("Could not read invalid-end.hkp");

    const unsupportedTaggedKey = combine([
      uint32(0),
      text("GroupHeaderGuard"),
      makeMenu([{ keyCode: 999, stringId: 1 }]).slice(4),
      text("HandlerBaseGroupEnd"),
    ]);
    expect(() => parseHotkeyFiles([{ name: "unsupported-key.hkp", buffer: unsupportedTaggedKey }]))
      .toThrow("Could not read unsupported-key.hkp");
  });

  it("decodes numpad and function keys and formats Alt bindings", () => {
    const file = combine([
      uint32(0),
      uint32(1),
      makeMenu([
        { keyCode: 96, stringId: 1 },
        { keyCode: 105, stringId: 2 },
        { keyCode: 112, stringId: 3 },
        { keyCode: 123, stringId: 4 },
      ]),
    ]);
    const profile = parseHotkeyFiles([{ name: "keys.hki", buffer: file }]);

    expect(profile.bindings.get(1)?.[0]?.key).toBe("Numpad0");
    expect(profile.bindings.get(2)?.[0]?.key).toBe("Numpad9");
    expect(profile.bindings.get(3)?.[0]?.key).toBe("F1");
    expect(profile.bindings.get(4)?.[0]?.key).toBe("F12");
    expect(formatBinding({ key: "A", ctrl: false, alt: true, shift: false })).toBe("Alt + A");
  });

  it("deduplicates identical bindings across files", () => {
    const file = combine([uint32(0x40400000), uint32(1), makeMenu([{ keyCode: 81, stringId: 12 }])]);
    const profile = parseHotkeyFiles([
      { name: "one.hki", buffer: file },
      { name: "two.hki", buffer: file },
    ]);
    expect(profile.files).toEqual(["one.hki", "two.hki"]);
    expect(profile.bindings.get(12)).toHaveLength(1);
  });

  it("normalizes keyboard events, modifiers, digits, numpad, and punctuation", () => {
    const event = (values: Partial<KeyboardEvent>): KeyboardEvent => ({
      key: "",
      code: "",
      ctrlKey: false,
      altKey: false,
      shiftKey: false,
      metaKey: false,
      ...values,
    }) as KeyboardEvent;

    expect(bindingSignature({ key: " ", ctrl: false, alt: false, shift: false })).toBe("Space");
    expect(eventMatchesBinding(event({ key: "a", code: "KeyA" }), { key: "A", ctrl: false, alt: false, shift: false })).toBe(true);
    expect(eventMatchesBinding(event({ key: "1", code: "Digit1" }), { key: "1", ctrl: false, alt: false, shift: false })).toBe(true);
    expect(eventMatchesBinding(event({ key: "2", code: "Numpad2" }), { key: "Numpad2", ctrl: false, alt: false, shift: false })).toBe(true);
    expect(eventMatchesBinding(event({ key: ":", code: "Semicolon" }), { key: ";", ctrl: false, alt: false, shift: false })).toBe(true);
    expect(eventMatchesBinding(event({ key: "x", code: "", metaKey: true }), { key: "X", ctrl: false, alt: false, shift: false })).toBe(false);
    expect(isModifierOnly(event({ key: "Control" }))).toBe(true);
    expect(isModifierOnly(event({ key: "A" }))).toBe(false);
  });
});
