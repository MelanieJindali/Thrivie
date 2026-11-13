import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Motion budget: every animation and transition finishes within 300 ms. The one exception is a
// spinner, which loops, but only while something is loading.
const raw = readFileSync("src/app/globals.css", "utf8");
const css = raw.replace(/\/\*[\s\S]*?\*\//g, ""); // comments are not styles
const tokens: Record<string, number> = {};
for (const m of css.matchAll(/--duration-([a-z-]+):\s*(\d+)ms/g)) tokens[m[1]] = Number(m[2]);

function ms(expr: string): number[] {
  const out: number[] = [];
  for (const m of expr.matchAll(/calc\(var\(--duration-([a-z-]+)\)\s*\*\s*(\d+)\)/g)) out.push(tokens[m[1]] * Number(m[2]));
  const rest = expr.replace(/calc\([^)]*\)\)?/g, "");
  for (const m of rest.matchAll(/var\(--duration-([a-z-]+)\)/g)) out.push(tokens[m[1]]);
  for (const m of rest.matchAll(/(?<![\w.-])(\d+(?:\.\d+)?)(ms|s)\b/g)) out.push(Number(m[1]) * (m[2] === "s" ? 1000 : 1));
  return out;
}

describe("motion budget", () => {
  it("has the duration tokens", () => expect(Object.keys(tokens).length).toBeGreaterThanOrEqual(6));
  it("keeps every duration token at or under 300 ms", () => {
    for (const [name, v] of Object.entries(tokens)) expect(v, name).toBeLessThanOrEqual(300);
  });
  it("keeps every finite animation in globals.css at or under 300 ms", () => {
    const lines = css.split("\n").filter((l) => /animation:/.test(l) && !/infinite/.test(l) && !/animation-(duration|delay)/.test(l));
    expect(lines.length).toBeGreaterThan(8);
    for (const l of lines) for (const d of ms(l.split("animation:")[1])) expect(d, l.trim()).toBeLessThanOrEqual(300);
  });
  it("has only one kind of looping animation: the spinner", () => {
    const loops = css.split("\n").filter((l) => /infinite/.test(l) && /animation:/.test(l));
    expect(loops.length).toBeGreaterThan(0);
    for (const l of loops) expect(l, l.trim()).toMatch(/t-spin/);
  });
  it("uses no Tailwind duration over 300 ms in components", () => {
    const bad: string[] = [];
    const walk = (dir: string) => {
      for (const f of readdirSync(dir)) {
        const p = join(dir, f);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.tsx?$/.test(f)) readFileSync(p, "utf8").split("\n").forEach((l, i) => { for (const m of l.matchAll(/\bduration-(\d+)\b/g)) if (Number(m[1]) > 300) bad.push(`${p}:${i + 1} duration-${m[1]}`); });
      }
    };
    walk("src");
    expect(bad).toEqual([]);
  });
  it("switches everything off for people who ask for less motion", () => {
    expect(css).toMatch(/prefers-reduced-motion: reduce\)[\s\S]*animation-duration: 1ms !important[\s\S]*transition-duration: 1ms !important/);
  });
  it("gives a button a spinner while it is busy", () => {
    expect(css).toMatch(/btn-primary[^{]*\[aria-busy="true"\]::before[\s\S]*animation: t-spin/);
  });

  it("animates only opacity and transform, which phones can do without repainting", () => {
    const blocks: string[] = [];
    for (const m of css.matchAll(/@keyframes\s+[\w-]+\s*\{/g)) {
      let depth = 1, k = m.index! + m[0].length;
      while (depth && k < css.length) depth += css[k] === "{" ? 1 : css[k] === "}" ? -1 : 0, k++;
      blocks.push(css.slice(m.index!, k));
    }
    expect(blocks.length).toBeGreaterThan(8);
    for (const b of blocks) expect(b, b.slice(0, 40)).not.toMatch(/\bfilter\s*:|\b(width|height|top|left|margin|padding)\s*:/);
  });
});

describe("phone paint costs", () => {
  it("does not use a fixed background attachment (ignored by iOS, repainted on every scroll by Android)", () => {
    expect(css).not.toMatch(/background-attachment:\s*fixed/);
    expect(css).toMatch(/body::before\s*\{[^}]*position:\s*fixed/);
  });
  it("keeps taps instant and the glass cheap", () => {
    expect(css).toMatch(/touch-action:\s*manipulation/);
    expect(css).toMatch(/blur\((?:[0-9]|1[0-2])px\)/); // glass blur is 12 px at most
    expect(css).not.toMatch(/blur\((?:1[3-9]|[2-9][0-9])px\)/);
    expect(css).toMatch(/prefers-reduced-transparency: reduce/);
  });
  it("never blurs the screen behind a sheet", () => {
    expect(readFileSync("src/components/Sheet.tsx", "utf8")).not.toMatch(/backdrop-blur/);
    expect(readFileSync("src/components/Sheet.tsx", "utf8")).toMatch(/overscroll-contain/);
  });
  it("lets people pinch to zoom", () => {
    const layout = readFileSync("src/app/layout.tsx", "utf8");
    expect(layout).not.toMatch(/maximumScale|userScalable/);
  });
});
