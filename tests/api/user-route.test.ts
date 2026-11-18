import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import bcrypt from "bcrypt";
import { eq } from "drizzle-orm";

import { users } from "@/db/schema";
import { createTestDb } from "../helpers/pglite";

const destroy = vi.hoisted(() => vi.fn());
vi.mock("@/lib/session", () => ({ getValidSessionUser: vi.fn(), getSession: vi.fn(async () => ({ destroy })) }));
vi.mock("@/lib/db", () => ({ get db() { return holder.db; } }));

const holder = vi.hoisted(() => ({ db: undefined as unknown }));

import { GET } from "@/app/api/user/route";
import { getValidSessionUser } from "@/lib/session";

let ctx: Awaited<ReturnType<typeof createTestDb>>;
let id: string;

beforeAll(async () => {
  ctx = await createTestDb();
  holder.db = ctx.db;
  const [row] = await ctx.raw
    .insert(users)
    .values({
      username: "90001",
      displayName: "สมชาย ใจดี",
      accountType: "contractor",
      passwordHash: await bcrypt.hash("x", 4),
      approvalStatus: "approved",
      contractStart: "2020-01-01",
      contractEnd: "2099-12-31",
    })
    .returning();
  id = row.id;
});
afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  destroy.mockClear();
  await ctx.raw
    .update(users)
    .set({ contractStart: "2020-01-01", contractEnd: "2099-12-31", mustChangePassword: false })
    .where(eq(users.id, id));
  vi.mocked(getValidSessionUser).mockResolvedValue({
    kind: "contractor",
    id,
    username: "90001",
    displayName: "สมชาย ใจดี",
    role: "user",
  } as never);
});

describe("GET /api/user for contractors", () => {
  it("returns the user while the contract is valid", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect(destroy).not.toHaveBeenCalled();
  });

  it("returns 401 CONTRACT_ENDED after an admin shortens the contract to yesterday", async () => {
    await ctx.raw.update(users).set({ contractEnd: "2020-01-02" }).where(eq(users.id, id));
    const res = await GET();
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ code: "CONTRACT_ENDED" });
    expect(destroy).toHaveBeenCalledTimes(1);
  });

  it("returns 401 CONTRACT_NOT_STARTED before the start date", async () => {
    await ctx.raw.update(users).set({ contractStart: "2098-01-01" }).where(eq(users.id, id));
    const res = await GET();
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ code: "CONTRACT_NOT_STARTED" });
    expect(destroy).toHaveBeenCalledTimes(1);
  });

  it("returns 403 PASSWORD_CHANGE_REQUIRED while the initial password is unchanged", async () => {
    await ctx.raw.update(users).set({ mustChangePassword: true }).where(eq(users.id, id));
    const res = await GET();
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: "PASSWORD_CHANGE_REQUIRED" });
    expect(destroy).not.toHaveBeenCalled();
  });
});
