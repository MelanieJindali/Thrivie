import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { LOGO } from "@/components/logoData";

// Guards the approved logo: the in-app artwork must be byte-for-byte the master
// SVG paths, and colour variants may differ from the masters in colour only.
const read = (f: string) => fs.readFileSync(`public/brand/${f}`, "utf8");
const paths = (svg: string) => [...svg.matchAll(/ d="([^"]+)"/g)].map((m) => m[1]);
const viewBox = (svg: string) => svg.match(/viewBox="([^"]+)"/)![1];

describe("Thrivie logo assets", () => {
  for (const v of ["mark", "lockup", "wordmark"] as const) {
    const master = read(`thrivie-${v}.svg`);
    it(`${v}: the app uses the master artwork unchanged`, () => {
      expect(LOGO[v].paths).toEqual(paths(master));
      expect(`0 0 ${LOGO[v].w} ${LOGO[v].h}`).toBe(viewBox(master));
    });
    it(`${v}: the navy version is a colour change only`, () => {
      const navy = read(`thrivie-${v}-navy.svg`);
      expect(navy.replace(/#1E3A64/gi, "#fff")).toBe(master);
    });
  }

  it("the ghost mark uses the mark's shapes", () => {
    expect(paths(read("thrivie-mark-ghost.svg"))).toEqual(paths(read("thrivie-mark.svg")));
  });

  it("ships every icon size", () => {
    for (const f of ["icon-16.png", "icon-32.png", "apple-touch-icon.png", "icon-192.png", "icon-512.png", "icon-maskable-512.png"]) {
      expect(fs.existsSync(`public/icons/${f}`), f).toBe(true);
    }
    expect(fs.existsSync("public/favicon.ico")).toBe(true);
    expect(fs.existsSync("public/brand/og-image.png")).toBe(true);
  });
});
