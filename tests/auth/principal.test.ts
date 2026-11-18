import bcrypt from "bcrypt";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { localAdmins, users } from "@/db/schema";
import { loadActivePrincipal, loadCurrentPrincipal } from "@/lib/auth/principal";
import { createTestDb } from "../helpers/pglite";

let ctx: Awaited<ReturnType<typeof createTestDb>>;
const ids: Record<string, string> = {};
const MISSING = "00000000-0000-4000-8000-000000000000";

beforeAll(async () => {
  ctx = await createTestDb();
  const password = await bcrypt.hash("x", 4);
  const admins = await ctx.raw
    .insert(localAdmins)
    .values([
      { username: "root", password },
      { username: "off", password, isActive: false },
    ])
    .returning();
  ids.root = admins[0].id;
  ids.off = admins[1].id;

  const base = { displayName: "X" };
  const rows = await ctx.raw
    .insert(users)
    .values([
      { ...base, username: "adm", role: "admin" },
      { ...base, username: "usr", role: "user" },
      { ...base, username: "inactive", role: "admin", isActive: false },
      { ...base, username: "pending", role: "admin", approvalStatus: "pending" },
      { ...base, username: "rejected", role: "admin", approvalStatus: "rejected" },
    ])
    .returning();
  for (const r of rows) ids[r.username] = r.id;
});
afterAll(async () => {
  await ctx.close();
});

const load = (kind: "sso" | "local", id: string) => loadCurrentPrincipal({ kind, id }, ctx.db);

describe("loadCurrentPrincipal", () => {
  it("accepts an active local admin", async () => {
    expect(await load("local", ids.root)).toEqual({
      ok: true,
      principal: { kind: "local", id: ids.root, username: "root", role: "admin" },
    });
  });

  it("rejects a missing or inactive local admin with 401", async () => {
    expect(await load("local", MISSING)).toMatchObject({ ok: false, status: 401, reason: "not_found" });
    expect(await load("local", ids.off)).toMatchObject({ ok: false, status: 401, reason: "inactive" });
  });

  it("accepts an active, approved SSO admin", async () => {
    expect(await load("sso", ids.adm)).toMatchObject({ ok: true, principal: { kind: "sso", username: "adm" } });
  });

  it("rejects SSO users that are missing, inactive, unapproved or not admin", async () => {
    expect(await load("sso", MISSING)).toMatchObject({ ok: false, status: 401, reason: "not_found" });
    expect(await load("sso", ids.inactive)).toMatchObject({ ok: false, status: 401, reason: "inactive" });
    expect(await load("sso", ids.pending)).toMatchObject({ ok: false, status: 403, reason: "not_approved" });
    expect(await load("sso", ids.rejected)).toMatchObject({ ok: false, status: 403, reason: "not_approved" });
    expect(await load("sso", ids.usr)).toMatchObject({ ok: false, status: 403, reason: "not_admin" });
  });

  it("does not look an SSO id up in local_admins (kinds are not interchangeable)", async () => {
    expect(await load("local", ids.adm)).toMatchObject({ ok: false, reason: "not_found" });
    expect(await load("sso", ids.root)).toMatchObject({ ok: false, reason: "not_found" });
  });
});

describe("loadActivePrincipal", () => {
  const active = (kind: "sso" | "local", id: string) => loadActivePrincipal({ kind, id }, ctx.db);

  it("returns the role from the database for an approved SSO user", async () => {
    expect(await active("sso", ids.usr)).toEqual({
      ok: true,
      principal: { kind: "sso", id: ids.usr, username: "usr", role: "user" },
    });
    expect(await active("sso", ids.adm)).toMatchObject({ ok: true, principal: { role: "admin" } });
  });

  it("rejects inactive, pending, rejected and missing SSO users", async () => {
    expect(await active("sso", ids.inactive)).toMatchObject({ ok: false, status: 401, reason: "inactive" });
    expect(await active("sso", ids.pending)).toMatchObject({ ok: false, status: 403, reason: "not_approved" });
    expect(await active("sso", ids.rejected)).toMatchObject({ ok: false, status: 403, reason: "not_approved" });
    expect(await active("sso", MISSING)).toMatchObject({ ok: false, status: 401, reason: "not_found" });
  });

  it("accepts an active local admin and rejects an inactive one", async () => {
    expect(await active("local", ids.root)).toMatchObject({ ok: true, principal: { kind: "local", role: "admin" } });
    expect(await active("local", ids.off)).toMatchObject({ ok: false, status: 401, reason: "inactive" });
  });

  it("admin-only check rejects an approved non-admin with 403", async () => {
    expect(await active("sso", ids.usr)).toMatchObject({ ok: true });
    expect(await load("sso", ids.usr)).toMatchObject({ ok: false, status: 403, reason: "not_admin" });
  });
});

describe("contractor principals", () => {
  const NOW = new Date("2026-06-15T05:00:00Z");
  const cids: Record<string, string> = {};

  beforeAll(async () => {
    const passwordHash = await bcrypt.hash("x", 4);
    const base = {
      displayName: "สมชาย ใจดี",
      accountType: "contractor" as const,
      passwordHash,
      approvalStatus: "approved" as const,
    };
    const rows = await ctx.raw
      .insert(users)
      .values([
        { ...base, username: "90001", contractStart: "2026-01-01", contractEnd: "2026-12-31" },
        { ...base, username: "90002", contractStart: "2026-01-01", contractEnd: "2026-06-14" },
        { ...base, username: "90003", contractStart: "2026-06-16", contractEnd: "2026-12-31" },
        { ...base, username: "90004", contractStart: "2026-01-01", contractEnd: "2026-12-31", isActive: false },
        { ...base, username: "90005", contractStart: "2026-01-01", contractEnd: "2026-12-31", mustChangePassword: true },
        { ...base, username: "90006", contractStart: "2026-01-01", contractEnd: "2026-12-31" },
      ])
      .returning();
    for (const r of rows) cids[r.username] = r.id;
  });

  const active = (kind: "sso" | "local" | "contractor", id: string) =>
    loadActivePrincipal({ kind, id }, ctx.db, NOW);

  it("accepts an in-window, active contractor with role user", async () => {
    expect(await active("contractor", cids["90001"])).toEqual({
      ok: true,
      principal: { kind: "contractor", id: cids["90001"], username: "90001", role: "user" },
    });
  });

  it("rejects an ended or not-yet-started contract with 401", async () => {
    expect(await active("contractor", cids["90002"])).toMatchObject({ ok: false, status: 401, reason: "contract_ended" });
    expect(await active("contractor", cids["90003"])).toMatchObject({ ok: false, status: 401, reason: "contract_not_started" });
  });

  it("rejects an inactive contractor with 401 and a pending password change with 403", async () => {
    expect(await active("contractor", cids["90004"])).toMatchObject({ ok: false, status: 401, reason: "inactive" });
    expect(await active("contractor", cids["90005"])).toMatchObject({ ok: false, status: 403, reason: "password_change_required" });
  });

  it("is not an admin even when the row's role column says admin", async () => {
    await ctx.raw.update(users).set({ role: "admin" }).where(eq(users.id, cids["90006"]));
    expect(await active("contractor", cids["90006"])).toMatchObject({ ok: true, principal: { role: "user" } });
    expect(await loadCurrentPrincipal({ kind: "contractor", id: cids["90006"] }, ctx.db, NOW)).toMatchObject({
      ok: false,
      status: 403,
      reason: "not_admin",
    });
  });

  it("does not let session kinds cross account types", async () => {
    expect(await active("sso", cids["90001"])).toMatchObject({ ok: false, status: 401, reason: "not_found" });
    expect(await active("contractor", ids.usr)).toMatchObject({ ok: false, status: 401, reason: "not_found" });
    expect(await active("contractor", MISSING)).toMatchObject({ ok: false, status: 401, reason: "not_found" });
  });
});
