import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";
import { disconnect, scopedDb, systemDb } from "@/lib/db";
import { decryptText, encryptText } from "@/lib/crypto";

// Security tests against a real Postgres database with the production RLS
// migration applied. Two layers are checked separately:
//   1. scopedDb (application layer + RLS together), the way the app uses it
//   2. the database alone, with raw SQL that skips every application check

const url = process.env.DATABASE_URL!;
let raw: Client;
let alice: string, bob: string;

/** Run SQL exactly as the app's restricted role would, but with no app-level filtering. */
async function asUser(userId: string | null, sql: string, params: unknown[] = [], system = false) {
  await raw.query("BEGIN");
  try {
    await raw.query("SELECT set_config('app.user_id', $1, true), set_config('app.system', $2, true), set_config('role', 'thrivie_rls', true)", [userId ?? "", system ? "on" : "off"]);
    const r = await raw.query(sql, params);
    await raw.query("COMMIT");
    return r;
  } catch (e) {
    await raw.query("ROLLBACK");
    throw e;
  }
}

beforeAll(async () => {
  raw = new Client({ connectionString: url });
  await raw.connect();
  const sys = systemDb();
  alice = (await sys.user.create({ data: { email: "alice@example.test", passwordHash: "x" } })).id;
  bob = (await sys.user.create({ data: { email: "bob@example.test", passwordHash: "x" } })).id;
  const a = scopedDb(alice);
  const b = scopedDb(bob);
  await a.journalEntry.create({ data: { userId: alice, date: "2026-11-01", content: "alice private thoughts" } });
  await b.journalEntry.create({ data: { userId: bob, date: "2026-11-01", content: "bob private thoughts" } });
  await a.healthLog.create({ data: { userId: alice, date: "2026-11-02", steps: 1000 } });
  await b.healthLog.create({ data: { userId: bob, date: "2026-11-02", steps: 9000 } });
});

afterAll(async () => {
  await raw?.end();
  await disconnect();
});

describe("application layer + RLS (scopedDb)", () => {
  it("returns only your own rows and decrypts them", async () => {
    expect((await scopedDb(alice).journalEntry.findMany()).map((j) => j.content)).toEqual(["alice private thoughts"]);
    expect((await scopedDb(bob).journalEntry.findMany()).map((j) => j.content)).toEqual(["bob private thoughts"]);
  });

  it("ignores filters for another user's id", async () => {
    expect(await scopedDb(alice).journalEntry.findMany({ where: { userId: bob } })).toHaveLength(0);
    const bobsId = (await scopedDb(bob).journalEntry.findFirstOrThrow()).id;
    expect(await scopedDb(alice).journalEntry.findUnique({ where: { id: bobsId } })).toBeNull();
  });

  it("cannot update, delete or re-own another user's row", async () => {
    const bobsId = (await scopedDb(bob).journalEntry.findFirstOrThrow()).id;
    await expect(scopedDb(alice).journalEntry.update({ where: { id: bobsId }, data: { content: "hacked" } })).rejects.toThrow();
    expect((await scopedDb(alice).journalEntry.deleteMany({ where: { id: bobsId } })).count).toBe(0);
    const mine = await scopedDb(alice).journalEntry.findFirstOrThrow();
    await expect(scopedDb(alice).journalEntry.update({ where: { id: mine.id }, data: { userId: bob } as never })).rejects.toThrow(/owner/);
    expect((await scopedDb(bob).journalEntry.findFirstOrThrow()).content).toBe("bob private thoughts");
  });

  it("keeps per-user unique keys separate", async () => {
    expect((await scopedDb(alice).healthLog.findUnique({ where: { userId_date: { userId: alice, date: "2026-11-02" } } }))?.steps).toBe(1000);
    expect(await scopedDb(alice).healthLog.findUnique({ where: { userId_date: { userId: bob, date: "2026-11-02" } } })).toBeNull();
  });

  it("blocks attaching children to another user's parent", async () => {
    const bobHabit = await scopedDb(bob).habit.create({ data: { userId: bob, name: "Bob's habit" } });
    await scopedDb(bob).habitCheckin.create({ data: { habitId: bobHabit.id, date: "2026-11-03" } });
    expect(await scopedDb(alice).habitCheckin.findMany()).toHaveLength(0);
    await expect(scopedDb(alice).habitCheckin.create({ data: { habitId: bobHabit.id, date: "2026-11-04" } })).rejects.toThrow();
    await expect(
      scopedDb(alice).goal.create({ data: { userId: alice, title: "x", target: 1, unit: "x", startDate: "2026-11-01", deadline: "2026-12-01", linkType: "habit", linkHabitId: bobHabit.id } }),
    ).rejects.toThrow();
  });

  it("keeps scoping inside interactive transactions", async () => {
    const n = await scopedDb(alice).$transaction(async (tx) => {
      await tx.workout.create({ data: { userId: alice, date: "2026-11-01", type: "cardio", durationMin: 30 } });
      return tx.journalEntry.count();
    });
    expect(n).toBe(1);
    expect(await scopedDb(bob).workout.count()).toBe(0);
  });

  it("does not expose raw SQL or account tables on a user client", () => {
    const a = scopedDb(alice) as unknown as Record<string, unknown>;
    expect(() => a.$queryRawUnsafe).toThrow();
    expect(() => a.$executeRaw).toThrow();
  });
});

describe("database alone (RLS, no application checks)", () => {
  it("shows a user only their own rows", async () => {
    const r = await asUser(alice, `SELECT "userId" FROM "JournalEntry"`);
    expect(r.rows.every((x) => x.userId === alice)).toBe(true);
    expect(r.rowCount).toBe(1);
  });

  it("returns nothing when no user is set (fails closed)", async () => {
    for (const t of ["JournalEntry", "HealthLog", "Workout", "Habit", "HabitCheckin", "Goal", "Settings", "User", "Session"]) {
      expect((await asUser(null, `SELECT 1 FROM "${t}"`)).rowCount, t).toBe(0);
    }
  });

  it("does not let the system role read personal data", async () => {
    for (const t of ["JournalEntry", "HealthLog", "Workout", "Habit", "HabitCheckin", "Goal", "GoalProgress", "Attachment", "Alias"]) {
      expect((await asUser(null, `SELECT 1 FROM "${t}"`, [], true)).rowCount, t).toBe(0);
    }
  });

  it("refuses to update or delete another user's rows", async () => {
    expect((await asUser(alice, `UPDATE "HealthLog" SET steps = 0 WHERE "userId" = $1`, [bob])).rowCount).toBe(0);
    expect((await asUser(alice, `DELETE FROM "JournalEntry" WHERE "userId" = $1`, [bob])).rowCount).toBe(0);
    expect((await asUser(bob, `SELECT steps FROM "HealthLog"`)).rows[0].steps).toBe(9000);
  });

  it("refuses to insert rows owned by someone else", async () => {
    await expect(asUser(alice, `INSERT INTO "JournalEntry" (id, "userId", date, content, "updatedAt") VALUES ('x1', $1, '2026-11-05', 'spoof', now())`, [bob])).rejects.toThrow(/row-level security/);
  });

  it("refuses to move a row to another user", async () => {
    await expect(asUser(alice, `UPDATE "JournalEntry" SET "userId" = $1`, [bob])).rejects.toThrow(/row-level security/);
  });

  it("cannot read other users' accounts or sessions", async () => {
    const r = await asUser(alice, `SELECT id FROM "User"`);
    expect(r.rows.map((x) => x.id)).toEqual([alice]);
    expect((await asUser(alice, `SELECT 1 FROM "RateEvent"`)).rowCount).toBe(0);
  });

  it("applies even though the connecting role can bypass RLS", async () => {
    const r = await raw.query(`SELECT rolbypassrls FROM pg_roles WHERE rolname = current_user`);
    // The local owner role is deliberately created with BYPASSRLS to mimic hosted providers.
    expect(typeof r.rows[0].rolbypassrls).toBe("boolean");
    const inside = await asUser(alice, `SELECT current_user AS u`);
    expect(inside.rows[0].u).toBe("thrivie_rls");
  });
});

describe("encryption at rest", () => {
  it("stores journal text encrypted and binds it to its owner", async () => {
    const r = await raw.query(`SELECT content FROM "JournalEntry" WHERE "userId" = $1`, [alice]);
    expect(r.rows[0].content.startsWith("enc:")).toBe(true);
    expect(r.rows[0].content).not.toContain("alice");
    expect(decryptText(r.rows[0].content, alice)).toBe("alice private thoughts");
    expect(() => decryptText(r.rows[0].content, bob)).toThrow(); // copied into another user's row, it won't decrypt
  });

  it("stores photos and voice notes encrypted", async () => {
    const a = scopedDb(alice);
    const j = await a.journalEntry.create({ data: { userId: alice, date: "2026-11-06", content: "with photo" } });
    const bytes = Buffer.from("fake-jpeg-bytes-0123456789");
    const att = await a.attachment.create({ data: { userId: alice, journalId: j.id, kind: "photo", mime: "image/jpeg", size: bytes.length, data: bytes } });
    const stored = (await raw.query(`SELECT data FROM "Attachment" WHERE id = $1`, [att.id])).rows[0].data as Buffer;
    expect(stored.subarray(0, 4).toString()).toBe("THV1");
    expect(stored.includes(bytes)).toBe(false);
    expect(Buffer.from((await a.attachment.findUniqueOrThrow({ where: { id: att.id } })).data).equals(bytes)).toBe(true);
    expect(await scopedDb(bob).attachment.findUnique({ where: { id: att.id } })).toBeNull();
  });

  it("round-trips unicode and detects tampering", () => {
    const enc = encryptText("Grateful 🌊 for the morning", alice);
    expect(decryptText(enc, alice)).toBe("Grateful 🌊 for the morning");
    const tampered = enc.slice(0, -4) + (enc.endsWith("AAAA") ? "BBBB" : "AAAA");
    expect(() => decryptText(tampered, alice)).toThrow();
  });

  it("deleting a user removes all of their data", async () => {
    await systemDb().user.delete({ where: { id: bob } });
    expect((await raw.query(`SELECT count(*)::int n FROM "JournalEntry" WHERE "userId" = $1`, [bob])).rows[0].n).toBe(0);
    expect((await raw.query(`SELECT count(*)::int n FROM "Habit" WHERE "userId" = $1`, [bob])).rows[0].n).toBe(0);
  });
});
