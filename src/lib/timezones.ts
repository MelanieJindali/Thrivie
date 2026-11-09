// Timezone labels, a curated list and search, built only on the Intl API.
// We store the IANA id ("America/New_York") and show a friendly label
// ("Eastern Time (New York) · UTC−5"). Offsets include daylight saving.
import { isValidTimezone } from "./dates";

export type Region = "North America" | "South America" | "Europe" | "Africa" | "Asia" | "Oceania" | "Other";

export type TimeZoneOption = {
  id: string;
  region: Region;
  name: string; // "Eastern Time"
  place: string; // "New York"
  offsetMinutes: number;
  offsetLabel: string; // "UTC−5"
  label: string; // "Eastern Time (New York) · UTC−5"
  curated: boolean;
  searchText: string;
};

type Curated = { id: string; region: Region; place?: string; keywords: string };

// One entry per common set of clock rules, so the default list stays short (~25).
export const CURATED_ZONES: readonly Curated[] = [
  { id: "Pacific/Honolulu", region: "North America", place: "Hawaii", keywords: "usa us united states hst hawaii" },
  { id: "America/Anchorage", region: "North America", place: "Alaska", keywords: "usa us united states akst akdt alaska" },
  { id: "America/Los_Angeles", region: "North America", keywords: "usa us united states canada vancouver seattle san francisco pst pdt pacific" },
  { id: "America/Phoenix", region: "North America", place: "Arizona", keywords: "usa us united states phoenix mst arizona" },
  { id: "America/Denver", region: "North America", keywords: "usa us united states canada calgary edmonton salt lake mst mdt mountain" },
  { id: "America/Chicago", region: "North America", keywords: "usa us united states canada winnipeg dallas houston cst cdt central" },
  { id: "America/Mexico_City", region: "North America", keywords: "mexico cdmx guadalajara" },
  { id: "America/New_York", region: "North America", keywords: "usa us united states canada toronto montreal miami atlanta boston est edt eastern" },
  { id: "America/Halifax", region: "North America", keywords: "canada atlantic nova scotia puerto rico ast adt" },
  { id: "America/Sao_Paulo", region: "South America", keywords: "brazil brasil rio" },
  { id: "America/Argentina/Buenos_Aires", region: "South America", place: "Buenos Aires", keywords: "argentina" },
  { id: "America/Bogota", region: "South America", keywords: "colombia peru lima ecuador" },
  { id: "Europe/London", region: "Europe", keywords: "uk united kingdom england britain ireland dublin lisbon portugal gmt bst" },
  { id: "Europe/Paris", region: "Europe", keywords: "france germany berlin spain madrid italy rome netherlands amsterdam cet cest central european" },
  { id: "Europe/Athens", region: "Europe", keywords: "greece finland helsinki romania bucharest ukraine kyiv eet eest eastern european" },
  { id: "Europe/Istanbul", region: "Europe", keywords: "turkey türkiye trt" },
  { id: "Europe/Moscow", region: "Europe", keywords: "russia msk" },
  { id: "Africa/Lagos", region: "Africa", keywords: "nigeria west africa wat" },
  { id: "Africa/Johannesburg", region: "Africa", keywords: "south africa cape town egypt cairo sast" },
  { id: "Africa/Nairobi", region: "Africa", keywords: "kenya east africa eat ethiopia" },
  { id: "Asia/Dubai", region: "Asia", keywords: "uae united arab emirates gulf abu dhabi oman gst" },
  { id: "Asia/Kolkata", region: "Asia", place: "India", keywords: "india mumbai delhi bangalore kolkata ist" },
  { id: "Asia/Bangkok", region: "Asia", keywords: "thailand vietnam hanoi jakarta indonesia ict" },
  { id: "Asia/Singapore", region: "Asia", keywords: "singapore malaysia kuala lumpur philippines manila sgt" },
  { id: "Asia/Shanghai", region: "Asia", place: "China", keywords: "china beijing shanghai hong kong taiwan cst" },
  { id: "Asia/Tokyo", region: "Asia", keywords: "japan korea seoul jst kst" },
  { id: "Australia/Sydney", region: "Oceania", keywords: "australia melbourne canberra aest aedt" },
  { id: "Pacific/Auckland", region: "Oceania", keywords: "new zealand nz wellington nzst nzdt" },
];
export const REGION_ORDER: readonly Region[] = ["North America", "South America", "Europe", "Africa", "Asia", "Oceania", "Other"];
const CURATED_BY_ID = new Map(CURATED_ZONES.map((z) => [z.id, z]));

// "America/..." zones south of Panama (everything else under America/ is North/Central America or the Caribbean).
const SOUTH_AMERICA = /^America\/(Argentina\/|Asuncion|Bahia|Belem|Boa_Vista|Bogota|Campo_Grande|Caracas|Cayenne|Cuiaba|Eirunepe|Fortaleza|Guayaquil|Guyana|La_Paz|Lima|Maceio|Manaus|Montevideo|Noronha|Paramaribo|Porto_Velho|Punta_Arenas|Recife|Rio_Branco|Santarem|Santiago|Sao_Paulo|Araguaina|Buenos_Aires|Catamarca|Cordoba|Jujuy|Mendoza)/;

export function regionFromId(id: string): Region {
  const curated = CURATED_BY_ID.get(id);
  if (curated) return curated.region;
  const area = id.split("/")[0];
  if (area === "America") return SOUTH_AMERICA.test(id) ? "South America" : "North America";
  if (area === "Europe") return "Europe";
  if (area === "Africa") return "Africa";
  if (area === "Asia") return "Asia";
  if (area === "Australia" || area === "Pacific") return "Oceania";
  return "Other";
}

/** The device's timezone (browser or server), or UTC if unknown. */
export function detectTimeZone(): string {
  try {
    const id = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return id && isValidTimezone(id) ? id : "UTC";
  } catch {
    return "UTC";
  }
}

export function getAllTimeZoneIds(): string[] {
  try {
    const ids = (Intl as typeof Intl & { supportedValuesOf?: (k: "timeZone") => string[] }).supportedValuesOf?.("timeZone");
    if (ids?.length) return ids;
  } catch {}
  return CURATED_ZONES.map((z) => z.id);
}

// Building Intl.DateTimeFormat objects is the slow part, so keep one per zone (bounded by the ~420 zones that exist).
const offsetFormatters = new Map<string, Intl.DateTimeFormat>();
const nameFormatters = new Map<string, { generic: Intl.DateTimeFormat; long: Intl.DateTimeFormat; short: Intl.DateTimeFormat }>();

/** Offset from UTC in minutes at an instant (daylight saving included). */
export function getOffsetMinutes(timeZone: string, at: Date = new Date()): number {
  let f = offsetFormatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric" });
    offsetFormatters.set(timeZone, f);
  }
  const parts = f.formatToParts(at);
  const get = (t: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return Math.round((asUtc - Math.floor(at.getTime() / 1000) * 1000) / 60_000);
}

/** 0 → "UTC", -300 → "UTC−5", 330 → "UTC+5:30" (with a true minus sign). */
export function formatOffset(minutes: number): string {
  if (minutes === 0) return "UTC";
  const abs = Math.abs(minutes);
  const m = abs % 60;
  return `UTC${minutes < 0 ? "−" : "+"}${Math.floor(abs / 60)}${m ? `:${String(m).padStart(2, "0")}` : ""}`;
}

function zoneNames(timeZone: string, at: Date) {
  let f = nameFormatters.get(timeZone);
  if (!f) {
    const mk = (timeZoneName: "longGeneric" | "long" | "short") => new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName });
    f = { generic: mk("longGeneric"), long: mk("long"), short: mk("short") };
    nameFormatters.set(timeZone, f);
  }
  const pick = (fmt: Intl.DateTimeFormat) => fmt.formatToParts(at).find((p) => p.type === "timeZoneName")?.value ?? "";
  return { generic: pick(f.generic), long: pick(f.long), short: pick(f.short) };
}

const cityFromId = (id: string) => (id.split("/").pop() ?? id).replace(/_/g, " ");

// Some runtimes still list older spellings; make the current names searchable too.
const RENAMED: Record<string, string> = {
  "Asia/Katmandu": "kathmandu nepal", "Asia/Calcutta": "kolkata india", "Asia/Saigon": "ho chi minh vietnam", "Asia/Rangoon": "yangon myanmar",
  "Europe/Kiev": "kyiv ukraine", "Asia/Kathmandu": "nepal", "Europe/Kyiv": "ukraine", "Atlantic/Faeroe": "faroe", "America/Godthab": "nuuk greenland",
};

export function normalizeQuery(text: string): string {
  return text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[_/]/g, " ").replace(/−/g, "-").replace(/\s+/g, " ").trim();
}

// Options only change when the offset does (daylight saving), so cache by id + current offset.
const optionCache = new Map<string, TimeZoneOption>();

export function getTimeZoneOption(id: string, at: Date = new Date()): TimeZoneOption {
  const offsetMinutes = getOffsetMinutes(id, at);
  const key = `${id}|${offsetMinutes}`;
  const hit = optionCache.get(key);
  if (hit) return hit;
  for (const k of optionCache.keys()) if (k.startsWith(id + "|")) optionCache.delete(k); // one entry per zone
  const curated = CURATED_BY_ID.get(id);
  const place = curated?.place ?? cityFromId(id);
  const names = zoneNames(id, at);
  let name = names.generic || names.long;
  if (/^GMT([+\-−]|$)/.test(name)) name = ""; // Intl has no friendly name for some zones
  const showPlace = !name || !name.toLowerCase().includes(place.toLowerCase());
  const offsetLabel = formatOffset(offsetMinutes);
  const option: TimeZoneOption = {
    id,
    region: regionFromId(id),
    name: name || place,
    place,
    offsetMinutes,
    offsetLabel,
    label: name ? `${name}${showPlace ? ` (${place})` : ""} · ${offsetLabel}` : `${place} · ${offsetLabel}`,
    curated: !!curated,
    searchText: normalizeQuery([id, cityFromId(id), place, name, names.short, offsetLabel, curated?.keywords ?? "", RENAMED[id] ?? ""].join(" ")),
  };
  optionCache.set(key, option);
  return option;
}

export function getTimeZoneLabel(id: string, at: Date = new Date()): string {
  return isValidTimezone(id) ? getTimeZoneOption(id, at).label : id;
}

/** The curated list grouped by region; the user's own zone is always included. */
export function getCuratedGroups(at: Date = new Date(), includeId?: string): { region: Region; options: TimeZoneOption[] }[] {
  const ids = CURATED_ZONES.map((z) => z.id);
  if (includeId && !CURATED_BY_ID.has(includeId) && isValidTimezone(includeId)) ids.push(includeId);
  const options = ids.map((id) => getTimeZoneOption(id, at));
  return REGION_ORDER.map((region) => ({ region, options: options.filter((o) => o.region === region).sort((a, b) => a.offsetMinutes - b.offsetMinutes) })).filter((g) => g.options.length);
}

function score(o: TimeZoneOption, q: string): number | null {
  const place = normalizeQuery(o.place);
  const city = normalizeQuery(cityFromId(o.id));
  const words = o.searchText.split(" ");
  let s: number;
  if (place.startsWith(q) || city.startsWith(q) || (RENAMED[o.id] ?? "").startsWith(q)) s = 0;
  else if (words.includes(q)) s = 1; // exact keyword: "est", "japan"
  else if (words.some((w) => w.startsWith(q))) s = 2;
  else if (o.searchText.includes(q)) s = 3;
  else return null;
  return o.curated ? s : s + 0.5;
}

// Jan/Jul offsets per zone and year, to merge zones that follow identical rules.
const rulesCache = new Map<string, string>();
function rulesKey(o: TimeZoneOption, year: number): string {
  const k = `${o.id}|${year}`;
  let v = rulesCache.get(k);
  if (v === undefined) {
    v = `${o.name}|${getOffsetMinutes(o.id, new Date(Date.UTC(year, 0, 15)))}|${getOffsetMinutes(o.id, new Date(Date.UTC(year, 6, 15)))}`;
    rulesCache.set(k, v);
  }
  return v;
}

/** Search every zone by city, country, zone name, abbreviation or offset. Near-duplicates (same rules) are merged. */
export function searchTimeZones(raw: string, at: Date = new Date(), limit = 20): TimeZoneOption[] {
  const q = normalizeQuery(raw);
  if (!q) return [];
  const ids = [...new Set([...CURATED_ZONES.map((z) => z.id), ...getAllTimeZoneIds()])];
  const matches: { o: TimeZoneOption; s: number }[] = [];
  for (const id of ids) {
    const o = getTimeZoneOption(id, at);
    const s = score(o, q);
    if (s !== null) matches.push({ o, s });
  }
  matches.sort((a, b) => a.s - b.s || a.o.offsetMinutes - b.o.offsetMinutes);
  const seen = new Set<string>();
  const out: TimeZoneOption[] = [];
  for (const { o } of matches) {
    const k = rulesKey(o, at.getUTCFullYear());
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(o);
    if (out.length >= limit) break;
  }
  return out;
}
