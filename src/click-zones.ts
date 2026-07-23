import type { ClickZone } from "./types";

export const CLICK_ZONES: readonly ClickZone[] = Array.from({ length: 20 }, (_, index) => ({
  id: index + 1,
  xPercent: 10 + (index % 5) * 20,
  yPercent: 12.5 + Math.floor(index / 5) * 25,
}));
