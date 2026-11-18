import bcrypt from "bcrypt";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { localAdmins } from "@/db/schema";
import { localAuthStrategy } from "@/lib/auth-strategies";
import { createTestDb } from "../helpers/pglite";

let ctx: Awaited<ReturnType<typeof createTestDb>>;

beforeAll(async () => {
  ctx = await createTestDb();
  const password = await bcrypt.hash("Pass123!", 4);
  await ctx.raw.insert(localAdmins).values([
    { username: "admin", password, displayName: "Admin" },
    { username: "off", password, isActive: false },
  ]);
});

afterAll(async () => {
  await ctx.close();
});

describe("localAuthStrategy", () => {
  it("accepts the correct password", async () => {
    const r = await localAuthStrategy.authenticate("admin", "Pass123!", ctx.db);
    expect(r.success).toBe(true);
    expect(r.user?.username).toBe("admin");
  });

  it("matches the username case-insensitively", async () => {
    const r = await localAuthStrategy.authenticate("  ADMIN ", "Pass123!", ctx.db);
    expect(r.success).toBe(true);
  });

  it("rejects a wrong password and unknown users", async () => {
    expect((await localAuthStrategy.authenticate("admin", "nope", ctx.db)).success).toBe(false);
    expect((await localAuthStrategy.authenticate("ghost", "Pass123!", ctx.db)).success).toBe(false);
  });

  it("rejects inactive admins with the deactivation error", async () => {
    const r = await localAuthStrategy.authenticate("off", "Pass123!", ctx.db);
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/deactivated/i);
  });

  it("does not reveal deactivation for a wrong password", async () => {
    const r = await localAuthStrategy.authenticate("off", "wrong", ctx.db);
    expect(r.success).toBe(false);
    expect(r.error).toBeUndefined();
  });
});
