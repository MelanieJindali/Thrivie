// Everything is stored metric; these helpers convert for display/input.
export type Units = "metric" | "imperial";

const KG_PER_LB = 0.45359237;
const KM_PER_MI = 1.609344;
const ML_PER_OZ = 29.5735;

const round = (n: number, dp = 1) => Math.round(n * 10 ** dp) / 10 ** dp;

export const weightUnit = (u: Units) => (u === "imperial" ? "lb" : "kg");
export const distanceUnit = (u: Units) => (u === "imperial" ? "mi" : "km");
export const waterUnit = (u: Units) => (u === "imperial" ? "oz" : "ml");
export const paceUnit = (u: Units) => (u === "imperial" ? "min/mi" : "min/km");

export const kgToDisplay = (kg: number, u: Units) => round(u === "imperial" ? kg / KG_PER_LB : kg);
export const displayToKg = (v: number, u: Units) => (u === "imperial" ? v * KG_PER_LB : v);
export const kmToDisplay = (km: number, u: Units) => round(u === "imperial" ? km / KM_PER_MI : km, 2);
export const displayToKm = (v: number, u: Units) => (u === "imperial" ? v * KM_PER_MI : v);
export const mlToDisplay = (ml: number, u: Units) => Math.round(u === "imperial" ? ml / ML_PER_OZ : ml);
export const displayToMl = (v: number, u: Units) => Math.round(u === "imperial" ? v * ML_PER_OZ : v);
/** pace is stored as min/km */
export const paceToDisplay = (p: number, u: Units) => round(u === "imperial" ? p * KM_PER_MI : p, 2);
export const displayToPace = (p: number, u: Units) => (u === "imperial" ? p / KM_PER_MI : p);

export function formatPace(minPerUnit: number): string {
  const m = Math.floor(minPerUnit);
  const s = Math.round((minPerUnit - m) * 60);
  return `${m}:${String(s === 60 ? 0 : s).padStart(2, "0")}`;
}

/** Convert a value expressed in a free-text unit ("lb", "mi", "kg") into metric. */
export function toMetric(value: number, unit: string | null | undefined): { value: number; kind: "weight" | "distance" | "water" | "unknown" } {
  const u = (unit ?? "").toLowerCase().trim();
  if (["lb", "lbs", "pound", "pounds"].includes(u)) return { value: value * KG_PER_LB, kind: "weight" };
  if (["kg", "kgs", "kilo", "kilos"].includes(u)) return { value, kind: "weight" };
  if (["mi", "mile", "miles"].includes(u)) return { value: value * KM_PER_MI, kind: "distance" };
  if (["km", "k", "kms"].includes(u)) return { value, kind: "distance" };
  if (["m", "meters", "metres"].includes(u)) return { value: value / 1000, kind: "distance" };
  if (["oz", "fl oz"].includes(u)) return { value: value * ML_PER_OZ, kind: "water" };
  if (["ml"].includes(u)) return { value, kind: "water" };
  if (["l", "liter", "liters", "litre", "litres"].includes(u)) return { value: value * 1000, kind: "water" };
  if (["glass", "glasses", "cup", "cups"].includes(u)) return { value: value * 240, kind: "water" }; // a U.S. cup / 8 fl oz glass
  return { value, kind: "unknown" };
}
