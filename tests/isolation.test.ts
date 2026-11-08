import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createClient } from "@libsql/client";

// Integration test against a real (temporary) SQLite database: two users must
// never be able to read or modify each other's data through the scoped client.
const dbFile = path.join(os.tmpdir(), `thrivie-isolation-${process.pid}.db`);
process.env.DATABASE_URL = `file:${dbFile}`;
delete process.env.TURSO_DATABASE_URL;

type Mod = typeof import("@/lib/db");
let m: Mod;
let alice: string;
let bob: string;

beforeAll(async () => {
  const c = createClient({ url: `file:${dbFile}` });
  await c.executeMultiple(fs.readFileSync(path.join(process.cwd(), "prisma/migrations/0001_init.sql"), "utf8"));
  c.close();
  m = await import("@/lib/db");
  alice = (await m.prisma.user.create({ data: { email: "alice@example.com", passwordHash: "x" } })).id;
  bob = (await m.prisma.user.create({ data: { email: "bob@example.com", passwordHash: "x" } })).id;
});

afterAll(async () => {
  await m?.prisma.$disconnect();
  fs.rmSync(dbFile, { force: true });
});

describe("per-user data isolation", () => {
  it("stamps the owner on create and only returns your own rows", async () => {
    const a = m.scopedDb(alice);
    const b = m.scopedDb(bob);
    await a.journalEntry.create({ data: { date: "2026-11-01", content: "alice private" } as never });
    await b.journalEntry.create({ data: { date: "2026-11-01", content: "bob private" } as never });
    expect((await a.journalEntry.findMany()).map((j) => j.content)).toEqual(["alice private"]);
    expect((await b.journalEntry.findMany()).map((j) => j.content)).toEqual(["bob private"]);
    expect(await a.journalEntry.count()).toBe(1);
  });

  it("ignores attempts to query another user's id explicitly", async () => {
    const a = m.scopedDb(alice);
    expect(await a.journalEntry.findMany({ where: { userId: bob } })).toHaveLength(0);
    const bobs = await m.prisma.journalEntry.findFirstOrThrow({ where: { userId: bob } });
    expect(await a.journalEntry.findUnique({ where: { id: bobs.id } })).toBeNull();
  });

  it("cannot update or delete another user's rows", async () => {
    const a = m.scopedDb(alice);
    const bobs = await m.prisma.journalEntry.findFirstOrThrow({ where: { userId: bob } });
    await expect(a.journalEntry.update({ where: { id: bobs.id }, data: { content: "hacked" } })).rejects.toThrow();
    expect((await a.journalEntry.deleteMany({ where: { id: bobs.id } })).count).toBe(0);
    expect((await m.prisma.journalEntry.findUniqueOrThrow({ where: { id: bobs.id } })).content).toBe("bob private");
  });

  it("cannot move a row to another user", async () => {
    const a = m.scopedDb(alice);
    const mine = await a.journalEntry.findFirstOrThrow();
    await expect(a.journalEntry.update({ where: { id: mine.id }, data: { userId: bob } as never })).rejects.toThrow(/owner/);
  });

  it("allows the same date for different users (per-user unique keys)", async () => {
    const a = m.scopedDb(alice);
    const b = m.scopedDb(bob);
    await a.healthLog.create({ data: { date: "2026-11-02", steps: 1000 } as never });
    await b.healthLog.create({ data: { date: "2026-11-02", steps: 9000 } as never });
    expect((await a.healthLog.findUnique({ where: { userId_date: { userId: alice, date: "2026-11-02" } } }))?.steps).toBe(1000);
    // even asking with bob's compound key returns nothing for alice
    expect(await a.healthLog.findUnique({ where: { userId_date: { userId: bob, date: "2026-11-02" } } })).toBeNull();
  });

  it("scopes child rows through their parent and blocks attaching to someone else's parent", async () => {
    const a = m.scopedDb(alice);
    const b = m.scopedDb(bob);
    const bobHabit = await b.habit.create({ data: { name: "Bob's habit" } as never });
    await b.habitCheckin.create({ data: { habitId: bobHabit.id, date: "2026-11-03" } });
    expect(await a.habitCheckin.findMany()).toHaveLength(0);
    expect(await b.habitCheckin.count()).toBe(1);
    await expect(a.habitCheckin.create({ data: { habitId: bobHabit.id, date: "2026-11-04" } })).rejects.toThrow(/another user/);
    await expect(
      a.habitCheckin.upsert({
        where: { habitId_date: { habitId: bobHabit.id, date: "2026-11-05" } },
        update: {},
        create: { habitId: bobHabit.id, date: "2026-11-05" },
      }),
    ).rejects.toThrow(/another user/);
    expect((await a.habitCheckin.deleteMany({ where: { habitId: bobHabit.id } })).count).toBe(0);
  });

  it("keeps scoping inside interactive transactions", async () => {
    const a = m.scopedDb(alice);
    const n = await a.$transaction(async (tx) => {
      await tx.workout.create({ data: { date: "2026-11-01", type: "cardio", durationMin: 30 } as never });
      return tx.journalEntry.count();
    });
    expect(n).toBe(1);
    expect(await m.scopedDb(bob).workout.count()).toBe(0);
  });

  it("deleting a user removes all of their data", async () => {
    await m.prisma.user.delete({ where: { id: bob } });
    expect(await m.prisma.journalEntry.count({ where: { userId: bob } })).toBe(0);
    expect(await m.prisma.habit.count({ where: { userId: bob } })).toBe(0);
    expect(await m.prisma.journalEntry.count({ where: { userId: alice } })).toBe(1);
  });
});
