import { PrismaClient, Prisma } from "@prisma/client";
import { decryptDeep, encryptBytes, encryptText, isEncryptedText } from "./crypto";

// ---------------------------------------------------------------------------
// Data access with two independent layers of protection:
//
// 1. Database: every query runs inside a transaction that switches to the
//    restricted role "thrivie_rls" and sets the current user id. Row Level
//    Security policies (FORCE'd on every table) then only expose that user's
//    rows. With no user set, queries see nothing (fail closed).
// 2. Application: the same queries are also rewritten to filter by the user
//    and to stamp the user on new rows, and sensitive fields are encrypted
//    (AES-256-GCM) before they leave the server and decrypted on the way back.
//
// The raw Prisma client is NOT exported. App code gets either
//   scopedDb(userId) – a signed-in user's view of their own data, or
//   systemDb()       – a narrow system role used for auth, cron and token lookup
//                      (RLS grants it only the tables those jobs need).
// ---------------------------------------------------------------------------

const g = globalThis as unknown as { __prisma?: PrismaClient };
const base: PrismaClient = g.__prisma ?? new PrismaClient({ log: [] }); // never log queries (they can contain health data)
if (process.env.NODE_ENV !== "production") g.__prisma = base;

/** Models whose rows carry a userId column. */
const OWNED = new Set([
  "Settings", "HealthLog", "Workout", "Habit", "Goal", "JournalEntry", "Attachment", "Alias", "PushSubscription", "ApiToken",
]);
/** Child models scoped through their parent. */
const CHILD: Record<string, string> = { Exercise: "workout", HabitCheckin: "habit", GoalProgress: "goal" };
/** Fields stored encrypted. */
const ENCRYPTED: Record<string, string[]> = {
  JournalEntry: ["content"],
  HealthLog: ["notes"],
  Workout: ["notes"],
  GoalProgress: ["note"],
  Attachment: ["data"],
};
/** Nested relation writes that need their own encryption. */
const NESTED: Record<string, Record<string, string>> = { Goal: { progress: "GoalProgress" }, JournalEntry: { attachments: "Attachment" } };

const WHERE_OPS = new Set([
  "findUnique", "findUniqueOrThrow", "findFirst", "findFirstOrThrow", "findMany", "count", "aggregate", "groupBy",
  "update", "updateMany", "delete", "deleteMany", "upsert",
]);
const UNIQUE_OPS = new Set(["findUnique", "findUniqueOrThrow", "update", "delete", "upsert"]);

export class AccessError extends Error {}

type Row = Record<string, unknown>;

function encryptData(model: string, data: unknown, userId: string): unknown {
  if (!data || typeof data !== "object") return data;
  if (Array.isArray(data)) return data.map((d) => encryptData(model, d, userId));
  const out: Row = { ...(data as Row) };
  for (const f of ENCRYPTED[model] ?? []) {
    const v = out[f];
    if (typeof v === "string" && !isEncryptedText(v)) out[f] = encryptText(v, userId);
    else if (v instanceof Uint8Array) out[f] = encryptBytes(v, userId);
    else if (v && typeof v === "object" && "set" in (v as Row) && typeof (v as Row).set === "string") out[f] = { set: encryptText((v as Row).set as string, userId) };
  }
  for (const [rel, childModel] of Object.entries(NESTED[model] ?? {})) {
    const nested = out[rel] as Row | undefined;
    if (nested && typeof nested === "object") {
      const n: Row = { ...nested };
      for (const k of ["create", "createMany"]) {
        if (k === "createMany" && n.createMany) n.createMany = { ...(n.createMany as Row), data: encryptData(childModel, (n.createMany as Row).data, userId) };
        else if (n[k]) n[k] = encryptData(childModel, n[k], userId);
      }
      out[rel] = n;
    }
  }
  return out;
}

/** Application-layer rewrite: user filter + owner stamping + encryption. */
function prepare(model: string, op: string, args: Row | undefined, userId: string): Row {
  const a: Row = { ...(args ?? {}) };
  const owned = OWNED.has(model);
  const child = CHILD[model];
  if (!owned && !child) throw new AccessError(`${model} is not accessible from a user context`);

  if (WHERE_OPS.has(op)) {
    const scope = owned ? { userId } : { [child]: { userId } };
    a.where = UNIQUE_OPS.has(op) ? { ...((a.where as Row) ?? {}), ...scope } : { AND: [a.where ?? {}, scope] };
  }
  const stamp = (d: unknown) => (owned && d && typeof d === "object" ? { ...(d as Row), userId } : d);
  if (op === "create") a.data = encryptData(model, stamp(a.data), userId);
  if (op === "createMany") a.data = encryptData(model, (Array.isArray(a.data) ? a.data : [a.data]).map(stamp), userId);
  if (op === "upsert") {
    a.create = encryptData(model, stamp(a.create), userId);
    a.update = encryptData(model, a.update, userId);
  }
  if (op === "update" || op === "updateMany") a.data = encryptData(model, a.data, userId);
  const data = (op === "upsert" ? a.update : op.startsWith("update") ? a.data : null) as Row | null;
  if (owned && data && ("userId" in data || "user" in data)) throw new AccessError("Cannot change owner");
  return a;
}

type Ctx = { userId: string | null; system: boolean };

const setContext = (tx: Prisma.TransactionClient | PrismaClient, ctx: Ctx) =>
  tx.$executeRaw`SELECT set_config('app.user_id', ${ctx.userId ?? ""}, true), set_config('app.system', ${ctx.system ? "on" : "off"}, true), set_config('role', 'thrivie_rls', true)`;

const lower = (s: string) => s[0].toLowerCase() + s.slice(1);
const MODELS = new Set(Prisma.dmmf.datamodel.models.map((m) => lower(m.name)));
const MODEL_NAME = Object.fromEntries(Prisma.dmmf.datamodel.models.map((m) => [lower(m.name), m.name]));

/**
 * Wraps a client (or an interactive-transaction client) so that every model
 * call runs with the RLS context and, for users, the application-layer rules.
 */
function wrap(target: PrismaClient | Prisma.TransactionClient, ctx: Ctx, inTx: boolean): PrismaClient {
  return new Proxy(target as PrismaClient, {
    get(t, prop: string) {
      if (prop === "$transaction") {
        return async (fn: unknown, opts?: { timeout?: number; maxWait?: number }) => {
          if (typeof fn !== "function") throw new AccessError("Use the callback form of $transaction");
          if (inTx) return (fn as (tx: PrismaClient) => unknown)(wrap(t, ctx, true));
          return base.$transaction(
            async (tx) => {
              await setContext(tx, ctx);
              return (fn as (tx: PrismaClient) => unknown)(wrap(tx, ctx, true));
            },
            { timeout: opts?.timeout ?? 20_000, maxWait: opts?.maxWait ?? 10_000 },
          );
        };
      }
      if (typeof prop === "string" && prop.startsWith("$")) {
        // Raw SQL and connection management are not available to app code.
        throw new AccessError(`${prop} is not available on a scoped client`);
      }
      if (!MODELS.has(prop)) return (t as unknown as Row)[prop];
      const delegate = (t as unknown as Record<string, Record<string, (a?: unknown) => Promise<unknown>>>)[prop];
      const model = MODEL_NAME[prop];
      return new Proxy(delegate, {
        get(d, op: string) {
          const fn = d[op];
          if (typeof fn !== "function") return fn;
          return async (args?: Row) => {
            const a = ctx.userId ? prepare(model, op, args, ctx.userId) : args;
            if (inTx) {
              const r = await fn.call(d, a);
              return ctx.userId ? decryptDeep(r, ctx.userId) : r;
            }
            const [, r] = await base.$transaction([setContext(base, ctx), (base as unknown as Record<string, Record<string, (x?: unknown) => Prisma.PrismaPromise<unknown>>>)[prop][op](a)]);
            return ctx.userId ? decryptDeep(r, ctx.userId) : r;
          };
        },
      });
    },
  });
}

/** A signed-in user's view of their own data. */
export function scopedDb(userId: string): PrismaClient {
  if (!userId) throw new AccessError("No user");
  return wrap(base, { userId, system: false }, false);
}

/** Narrow system context for auth, scheduled jobs and token lookups. */
export function systemDb(): PrismaClient {
  return wrap(base, { userId: null, system: true }, false);
}

export type ScopedDb = PrismaClient;
export { Prisma };

/** Close the connection (scripts and tests). */
export const disconnect = () => base.$disconnect();
