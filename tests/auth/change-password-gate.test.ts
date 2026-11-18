import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import bcrypt from "bcrypt";
import { eq } from "drizzle-orm";

import { users } from "@/db/schema";
import { changePasswordRedirect } from "@/lib/auth/change-password-gate";
import { createTestDb } from "../helpers/pglite";

let ctx: Awaited<ReturnType<typeof createTestDb>>;
let id: string;
const NOW = new Date("2026-11-03T05:00:00Z");
const contractor = () => ({ kind: "contractor" as const, id });

beforeAll(async () => {
  ctx = await createTestDb();
  const [row] = await ctx.raw
    .insert(users)
    .values({
      username: "90001",
      displayName: "สมชาย ใจดี",
      accountType: "contractor",
      passwordHash: await bcrypt.hash("x", 4),
      approvalStatus: "approved",
      contractStart: "2026-01-01",
      contractEnd: "2026-12-31",
      mustChangePassword: true,
    })
    .returning();
  id = row.id;
});
afterAll(async () => {
  await ctx.close();
});
beforeEach(async () => {
  await ctx.raw
    .update(users)
    .set({ contractStart: "2026-01-01", contractEnd: "2026-12-31", mustChangePassword: true, isActive: true })
    .where(eq(users.id, id));
});

describe("changePasswordRedirect", () => {
  it("sends a visitor without a session to login", async () => {
    expect(await changePasswordRedirect(null, ctx.db, NOW)).toBe("/login?from=/change-password");
  });

  it("sends non-contractors to /profile", async () => {
    expect(await changePasswordRedirect({ kind: "sso", id }, ctx.db, NOW)).toBe("/profile");
    expect(await changePasswordRedirect({ kind: "local", id }, ctx.db, NOW)).toBe("/profile");
  });

  it("shows the form when a password change is required", async () => {
    expect(await changePasswordRedirect(contractor(), ctx.db, NOW)).toBeNull();
  });

  it("shows the form for a voluntary change", async () => {
    await ctx.raw.update(users).set({ mustChangePassword: false }).where(eq(users.id, id));
    expect(await changePasswordRedirect(contractor(), ctx.db, NOW)).toBeNull();
  });

  it("sends an ended contract to login with the ended message", async () => {
    await ctx.raw.update(users).set({ contractEnd: "2026-11-02" }).where(eq(users.id, id));
    expect(await changePasswordRedirect(contractor(), ctx.db, NOW)).toBe("/login?contract=ended");
  });

  it("sends a not-yet-started contract to login with that message", async () => {
    await ctx.raw.update(users).set({ contractStart: "2026-11-04" }).where(eq(users.id, id));
    expect(await changePasswordRedirect(contractor(), ctx.db, NOW)).toBe("/login?contract=not_started");
  });

  it("sends a deactivated contractor to login as expired", async () => {
    await ctx.raw.update(users).set({ isActive: false }).where(eq(users.id, id));
    expect(await changePasswordRedirect(contractor(), ctx.db, NOW)).toBe("/login?expired=1&from=/change-password");
  });
});
