import { Inflate } from "fflate";

export interface NamedBuffer {
  name: string;
  buffer: ArrayBuffer;
}

export interface HotkeyBinding {
  key: string;
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
}

export interface HotkeyProfile {
  files: string[];
  bindings: Map<number, HotkeyBinding[]>;
}

interface ParsedHotkey extends HotkeyBinding {
  stringId: number;
}

const MAX_MENUS = 100;
const MAX_HOTKEYS_PER_MENU = 2_000;
export const MAX_HOTKEY_FILES = 2;
export const MAX_HOTKEY_FILE_BYTES = 64 * 1024;
export const MAX_DECOMPRESSED_HOTKEY_BYTES = 512 * 1024;
const DECOMPRESSION_CHUNK_BYTES = 256;
const GROUP_HEADER_GUARD = new TextEncoder().encode("GroupHeaderGuard");
const HANDLER_BASE_GROUP_END = new TextEncoder().encode("HandlerBaseGroupEnd");

class HotkeyFileLimitError extends Error {}

const virtualKeyNames = new Map<number, string>([
  [8, "Backspace"],
  [9, "Tab"],
  [13, "Enter"],
  [19, "Pause"],
  [27, "Escape"],
  [32, "Space"],
  [33, "PageUp"],
  [34, "PageDown"],
  [35, "End"],
  [36, "Home"],
  [37, "ArrowLeft"],
  [38, "ArrowUp"],
  [39, "ArrowRight"],
  [40, "ArrowDown"],
  [45, "Insert"],
  [46, "Delete"],
  [186, ";"],
  [187, "="],
  [188, ","],
  [189, "-"],
  [190, "."],
  [191, "/"],
  [192, "`"],
  [219, "["],
  [220, "\\"],
  [221, "]"],
  [222, "'"],
  [254, "WheelDown"],
  [255, "WheelUp"],
]);

class Reader {
  private readonly view: DataView;
  offset: number;

  constructor(buffer: ArrayBuffer, offset = 0) {
    this.view = new DataView(buffer);
    this.offset = offset;
  }

  get length(): number {
    return this.view.byteLength;
  }

  uint32(): number {
    this.ensure(4);
    const value = this.view.getUint32(this.offset, true);
    this.offset += 4;
    return value;
  }

  int32(): number {
    this.ensure(4);
    const value = this.view.getInt32(this.offset, true);
    this.offset += 4;
    return value;
  }

  uint8(): number {
    this.ensure(1);
    const value = this.view.getUint8(this.offset);
    this.offset += 1;
    return value;
  }

  private ensure(bytes: number): void {
    if (this.offset + bytes > this.view.byteLength) {
      throw new Error("The hotkey file ended unexpectedly.");
    }
  }
}

function keyNameFromCode(keyCode: number): string | null {
  if ((keyCode >= 48 && keyCode <= 57) || (keyCode >= 65 && keyCode <= 90)) {
    return String.fromCharCode(keyCode);
  }
  if (keyCode >= 96 && keyCode <= 105) {
    return `Numpad${keyCode - 96}`;
  }
  if (keyCode >= 112 && keyCode <= 123) {
    return `F${keyCode - 111}`;
  }
  return virtualKeyNames.get(keyCode) ?? null;
}

function readMenu(reader: Reader): ParsedHotkey[] {
  const count = reader.uint32();
  if (count > MAX_HOTKEYS_PER_MENU) {
    throw new Error("The hotkey file contains an invalid menu.");
  }

  const hotkeys: ParsedHotkey[] = [];
  for (let index = 0; index < count; index += 1) {
    const keyCode = reader.int32();
    const stringId = reader.int32();
    const ctrl = reader.uint8() !== 0;
    const alt = reader.uint8() !== 0;
    const shift = reader.uint8() !== 0;
    const mouse = reader.uint8() !== 0;
    const key = keyNameFromCode(keyCode);
    if (key && (!mouse || key === "WheelUp" || key === "WheelDown")) {
      hotkeys.push({
        key,
        stringId,
        ctrl: key.startsWith("Wheel") ? false : ctrl,
        alt: key.startsWith("Wheel") ? false : alt,
        shift: key.startsWith("Wheel") ? false : shift,
      });
    }
  }
  return hotkeys;
}

function readMenus(reader: Reader, count: number): ParsedHotkey[] {
  if (count > MAX_MENUS) {
    throw new Error("The hotkey file contains too many menus.");
  }
  const hotkeys: ParsedHotkey[] = [];
  for (let index = 0; index < count; index += 1) {
    hotkeys.push(...readMenu(reader));
  }
  return hotkeys;
}

function parseStandard(buffer: ArrayBuffer): ParsedHotkey[] {
  const reader = new Reader(buffer);
  reader.uint32();
  const hotkeys = readMenus(reader, reader.uint32());
  if (reader.offset !== reader.length) {
    throw new Error("Unexpected trailing data in hotkey file.");
  }
  return hotkeys;
}

function parseBase(buffer: ArrayBuffer): ParsedHotkey[] {
  const reader = new Reader(buffer);
  reader.uint32();
  const hotkeys = [
    ...readMenu(reader),
    ...readMenu(reader),
    ...readMenu(reader),
  ];
  hotkeys.push(...readMenus(reader, reader.uint32()));
  if (reader.offset !== reader.length) {
    throw new Error("Unexpected trailing data in Base hotkey file.");
  }
  return hotkeys;
}

function bytesMatch(bytes: Uint8Array, offset: number, expected: Uint8Array): boolean {
  if (offset + expected.length > bytes.length) {
    return false;
  }
  return expected.every((value, index) => bytes[offset + index] === value);
}

function findBytes(bytes: Uint8Array, expected: Uint8Array, fromIndex: number): number {
  for (let offset = fromIndex; offset <= bytes.length - expected.length; offset += 1) {
    if (bytesMatch(bytes, offset, expected)) {
      return offset;
    }
  }
  return -1;
}

function parseTagged(buffer: ArrayBuffer): ParsedHotkey[] {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  const hotkeys: ParsedHotkey[] = [];
  let searchFrom = 4;

  while (searchFrom < bytes.length) {
    const markerOffset = findBytes(bytes, GROUP_HEADER_GUARD, searchFrom);
    if (markerOffset === -1) {
      break;
    }

    const recordOffset = markerOffset + GROUP_HEADER_GUARD.length;
    const recordEnd = recordOffset + 12;
    if (recordEnd > bytes.length || !bytesMatch(bytes, recordEnd, HANDLER_BASE_GROUP_END)) {
      searchFrom = recordOffset;
      continue;
    }

    const keyCode = view.getInt32(recordOffset, true);
    const stringId = view.getInt32(recordOffset + 4, true);
    const ctrl = view.getUint8(recordOffset + 8) !== 0;
    const alt = view.getUint8(recordOffset + 9) !== 0;
    const shift = view.getUint8(recordOffset + 10) !== 0;
    const key = keyNameFromCode(keyCode);
    if (key) {
      hotkeys.push({
        key,
        stringId,
        ctrl: key.startsWith("Wheel") ? false : ctrl,
        alt: key.startsWith("Wheel") ? false : alt,
        shift: key.startsWith("Wheel") ? false : shift,
      });
    }
    searchFrom = recordEnd + HANDLER_BASE_GROUP_END.length;
  }

  if (hotkeys.length === 0) {
    throw new Error("No tagged hotkey records were found.");
  }
  return hotkeys;
}

function inflateIfNeeded(buffer: ArrayBuffer): ArrayBuffer {
  const compressed = new Uint8Array(buffer);
  const chunks: Uint8Array[] = [];
  let outputLength = 0;
  try {
    const inflater = new Inflate((chunk) => {
      outputLength += chunk.length;
      if (outputLength > MAX_DECOMPRESSED_HOTKEY_BYTES) {
        throw new HotkeyFileLimitError("The decompressed hotkey file exceeds the 512 KiB limit.");
      }
      chunks.push(Uint8Array.from(chunk));
    });
    for (let offset = 0; offset < compressed.length; offset += DECOMPRESSION_CHUNK_BYTES) {
      const end = Math.min(offset + DECOMPRESSION_CHUNK_BYTES, compressed.length);
      inflater.push(compressed.subarray(offset, end), end === compressed.length);
    }
  } catch (error) {
    if (error instanceof HotkeyFileLimitError) throw error;
    return buffer;
  }
  const output = new Uint8Array(outputLength);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }
  return output.buffer;
}

function parseOne(file: NamedBuffer): ParsedHotkey[] {
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (extension !== "hki" && extension !== "hkp") {
    throw new Error(`${file.name} is not an .hki or .hkp file.`);
  }
  if (file.buffer.byteLength > MAX_HOTKEY_FILE_BYTES) {
    throw new Error(`${file.name} exceeds the 64 KiB file limit.`);
  }

  const buffer = inflateIfNeeded(file.buffer);
  const baseName = file.name.split(/[\\/]/).pop()?.toLowerCase();
  const parsers = baseName === "base.hkp" || baseName === "pompeii.hkp"
    ? [parseTagged, parseBase, parseStandard]
    : [parseTagged, parseStandard, parseBase];

  let lastError: unknown;
  for (const parser of parsers) {
    try {
      return parser(buffer);
    } catch (error) {
      lastError = error;
    }
  }
  const message = lastError instanceof Error ? lastError.message : "Unknown hotkey format.";
  throw new Error(`Could not read ${file.name}: ${message}`);
}

export function parseHotkeyFiles(files: NamedBuffer[]): HotkeyProfile {
  if (files.length === 0) {
    throw new Error("Choose at least one .hki or .hkp file.");
  }
  if (files.length > MAX_HOTKEY_FILES) {
    throw new Error(`Choose no more than ${MAX_HOTKEY_FILES} hotkey files.`);
  }

  const bindings = new Map<number, HotkeyBinding[]>();
  for (const file of files) {
    for (const hotkey of parseOne(file)) {
      const binding: HotkeyBinding = {
        key: hotkey.key,
        ctrl: hotkey.ctrl,
        alt: hotkey.alt,
        shift: hotkey.shift,
      };
      const existing = bindings.get(hotkey.stringId) ?? [];
      const signature = bindingSignature(binding);
      if (!existing.some((item) => bindingSignature(item) === signature)) {
        existing.push(binding);
        bindings.set(hotkey.stringId, existing);
      }
    }
  }

  return { files: files.map((file) => file.name), bindings };
}

function normalizeKey(key: string): string {
  if (key === " ") {
    return "Space";
  }
  if (key.length === 1) {
    return key.toUpperCase();
  }
  return key;
}

const eventCodeKeys = new Map<string, string>([
  ["Semicolon", ";"],
  ["Equal", "="],
  ["Comma", ","],
  ["Minus", "-"],
  ["Period", "."],
  ["Slash", "/"],
  ["Backquote", "`"],
  ["BracketLeft", "["],
  ["Backslash", "\\"],
  ["BracketRight", "]"],
  ["Quote", "'"],
]);

function keyFromEvent(event: KeyboardEvent): string {
  if (/^Key[A-Z]$/.test(event.code)) {
    return event.code.slice(3);
  }
  if (/^Digit[0-9]$/.test(event.code)) {
    return event.code.slice(5);
  }
  if (/^Numpad[0-9]$/.test(event.code)) {
    return event.code;
  }
  return eventCodeKeys.get(event.code) ?? normalizeKey(event.key);
}

export function bindingSignature(binding: HotkeyBinding): string {
  return [
    binding.ctrl ? "Ctrl" : "",
    binding.alt ? "Alt" : "",
    binding.shift ? "Shift" : "",
    normalizeKey(binding.key),
  ].filter(Boolean).join("+");
}

export function eventMatchesBinding(event: KeyboardEvent, binding: HotkeyBinding): boolean {
  return keyFromEvent(event) === normalizeKey(binding.key)
    && event.ctrlKey === binding.ctrl
    && event.altKey === binding.alt
    && event.shiftKey === binding.shift
    && !event.metaKey;
}

export function isWheelBinding(binding: HotkeyBinding): boolean {
  return binding.key === "WheelUp" || binding.key === "WheelDown";
}

export function wheelEventMatchesBinding(event: WheelEvent, binding: HotkeyBinding): boolean {
  const key = event.deltaY < 0 ? "WheelUp" : event.deltaY > 0 ? "WheelDown" : null;
  return key === binding.key
    && event.ctrlKey === binding.ctrl
    && event.altKey === binding.alt
    && event.shiftKey === binding.shift;
}

export function formatBinding(binding: HotkeyBinding): string {
  return bindingSignature(binding).replaceAll("+", " + ");
}

export function isModifierOnly(event: KeyboardEvent): boolean {
  return ["Control", "Alt", "Shift", "Meta"].includes(event.key);
}
