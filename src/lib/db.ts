import { PrismaClient, Prisma } from "@prisma/client";
import { PrismaLibSQL } from "@prisma/adapter-libsql";
import { libsqlConfig } from "./dbConfig";

// ---------------------------------------------------------------------------
// Base client (local SQLite file or Turso). Only auth code and system jobs use
// it directly; everything user-facing goes through `scopedDb(userId)`.
// ---------------------------------------------------------------------------

function makeClient() {
  return new PrismaClient({ adapter: new PrismaLibSQL(libsqlConfig()) });
}

const g = globalThis as unknown as { prisma?: PrismaClient };
export const prisma = g.prisma ?? makeClient();
if (process.env.NODE_ENV !== "production") g.prisma = prisma;

// ---------------------------------------------------------------------------
// Per-user scoping
//
// Every model that holds personal data has a userId (OWNED), or belongs to a
// parent that does (CHILD). The extension below rewrites every query so it:
//   - filters by the user (reads, updates, deletes, counts, aggregates), and
//   - stamps the user onto everything created.
// Child rows (exercise, check-in, goal progress) are filtered through their
// parent, and creating one requires the parent to belong to the same user.
// The caller cannot override this: the user filter is applied last.
// ---------------------------------------------------------------------------

const OWNED = new Set([
  "Settings", "HealthLog", "Workout", "Habit", "Goal", "JournalEntry", "Attachment",
  "DailyBrief", "WeeklyReview", "PushSubscription", "ApiToken",
]);

const CHILD: Record<string, { rel: string; fk: string; parent: "workout" | "habit" | "goal" }> = {
  Exercise: { rel: "workout", fk: "workoutId", parent: "workout" },
  HabitCheckin: { rel: "habit", fk: "habitId", parent: "habit" },
  GoalProgress: { rel: "goal", fk: "goalId", parent: "goal" },
};

const WHERE_OPS = new Set([
  "findUnique", "findUniqueOrThrow", "findFirst", "findFirstOrThrow", "findMany", "count", "aggregate", "groupBy",
  "update", "updateMany", "updateManyAndReturn", "delete", "deleteMany", "upsert",
]);

const UNIQUE_OPS = new Set(["findUnique", "findUniqueOrThrow", "update", "delete", "upsert"]);

export class AccessError extends Error {}

type Args = Record<string, unknown> & { where?: Record<string, unknown>; data?: unknown; create?: Record<string, unknown> };

export function scopedDb(userId: string) {
  if (!userId) throw new AccessError("No user");

  async function assertParents(model: string, rows: Record<string, unknown>[]) {
    const c = CHILD[model];
    const ids = [...new Set(rows.map((r) => r[c.fk]).filter((v): v is string => typeof v === "string"))];
    if (!ids.length) return;
    const delegate = prisma[c.parent] as unknown as { count: (a: unknown) => Promise<number> };
    const owned = await delegate.count({ where: { id: { in: ids }, userId } });
    if (owned !== ids.length) throw new AccessError(`Not allowed: ${c.parent} belongs to another user`);
  }

  return prisma.$extends({
    name: "user-scope",
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          const a = (args ?? {}) as Args;
          const owned = OWNED.has(model);
          const child = CHILD[model];
          if (!owned && !child) return query(args); // User, Session, LoginAttempt – not reachable from app code paths

          if (WHERE_OPS.has(operation)) {
            const scope = owned ? { userId } : { [child.rel]: { userId } };
            // Unique lookups need their unique key at the top level; the user
            // filter is merged in (and wins). Everything else is AND-ed, so a
            // caller-supplied filter on another user simply matches nothing.
            a.where = UNIQUE_OPS.has(operation) ? { ...(a.where ?? {}), ...scope } : { AND: [a.where ?? {}, scope] };
          }
          if (operation === "create") {
            if (owned) a.data = { ...(a.data as object), userId };
            else await assertParents(model, [a.data as Record<string, unknown>]);
          }
          if (operation === "createMany" || operation === "createManyAndReturn") {
            const rows = (Array.isArray(a.data) ? a.data : [a.data]) as Record<string, unknown>[];
            if (owned) a.data = rows.map((r) => ({ ...r, userId }));
            else await assertParents(model, rows);
          }
          if (operation === "upsert") {
            if (owned) a.create = { ...(a.create ?? {}), userId };
            else await assertParents(model, [a.create ?? {}]);
          }
          if ((operation === "update" || operation === "updateMany" || operation === "upsert") && owned) {
            // never allow moving a row to another user
            const data = (operation === "upsert" ? (a as { update?: Record<string, unknown> }).update : a.data) as Record<string, unknown> | undefined;
            if (data && ("userId" in data || "user" in data)) throw new AccessError("Cannot change owner");
          }
          return query(a as typeof args);
        },
      },
    },
  });
}

export type ScopedDb = ReturnType<typeof scopedDb>;
export { Prisma };
