import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { checkHealth } from "@/lib/health";
import type { AppDb } from "@/lib/users/sync";
import { createTestDb } from "../helpers/pglite";

const holder = vi.hoisted(() => ({ db: undefined as unknown }));
vi.mock("@/lib/db", () => ({
  get db() {
    return holder.db;
  },
}));

import { GET } from "@/app/api/health/route";

let ctx: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => {
  ctx = await createTestDb();
});
afterAll(async () => {
  await ctx.close();
});

const failing = { execute: () => Promise.reject(new Error("ECONNREFUSED 10.0.0.1:5432")) } as unknown as AppDb;
const hanging = { execute: () => new Promise(() => {}) } as unknown as AppDb;

describe("checkHealth", () => {
  it("is ok when the database answers", async () => {
    expect(await checkHealth(ctx.db)).toEqual({ ok: true });
  });

  it("reports db_error when the query fails", async () => {
    expect(await checkHealth(failing)).toEqual({ ok: false, reason: "db_error" });
  });

  it("reports db_timeout when the database does not answer in time", async () => {
    expect(await checkHealth(hanging, 20)).toEqual({ ok: false, reason: "db_timeout" });
  });
});

describe("GET /api/health", () => {
  it("returns 200 and no-store when healthy", async () => {
    holder.db = ctx.raw;
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(await res.json()).toEqual({ status: "ok" });
  });

  it("returns 503 without leaking the database error", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    holder.db = failing;
    const res = await GET();
    expect(res.status).toBe(503);
    const text = await res.text();
    expect(text).not.toContain("ECONNREFUSED");
    expect(JSON.parse(text)).toEqual({ status: "error", reason: "db_error" });
  });
});
