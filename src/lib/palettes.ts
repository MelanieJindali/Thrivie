/** Colour themes people can pick in Settings. "thrivie" is the default and sets no attribute. */
export const PALETTES = [
  { id: "thrivie", name: "Thrivie", swatch: ["#1E3A64", "#A9D3C7", "#C46D4E"] },
  { id: "golden", name: "Golden Hour", swatch: ["#2F5E9E", "#FFC93C", "#F47B20"] },
  { id: "lavender", name: "Lavender Dusk", swatch: ["#6B3FA0", "#3F7CC4", "#E9A8A0"] },
  { id: "ember", name: "Ember", swatch: ["#8E2A1C", "#E8604A", "#2F4A3C"] },
  { id: "pastel", name: "Pastel Shore", swatch: ["#4F7385", "#C9C6EC", "#E7B5DC"] },
  { id: "clay", name: "Desert Clay", swatch: ["#3E5241", "#C97B3A", "#E8A9B4"] },
  { id: "reef", name: "Coral Reef", swatch: ["#1F6FA8", "#6FC7B8", "#FAC99A"] },
] as const;
export type PaletteId = (typeof PALETTES)[number]["id"];
export const PALETTE_KEY = "thrivie-palette";
export const isPalette = (v: unknown): v is PaletteId => PALETTES.some((p) => p.id === v);
