import { describe, expect, it } from "vitest";

import { InvalidGrantError, R6AuthUnavailableError } from "@/lib/r6auth/errors";
import { FAKE_SSO_USERS, FakeR6AuthClient } from "@/lib/r6auth/fake";

const NOW = new Date("2026-01-01T00:00:00Z");
const client = new FakeR6AuthClient(() => NOW);

describe("FakeR6AuthClient", () => {
  it("returns สมชาย for fake:10001 with an 8 hour session", async () => {
    const r = await client.exchangeCode("fake:10001");
    expect(r.user.username).toBe("10001");
    expect(r.user.first_name).toBe("สมชาย");
    expect(r.loginAt).toBe(NOW.getTime() / 1000);
    expect(r.expiresAt - r.loginAt).toBe(28800);
  });

  it("has three users in two BAs", () => {
    expect(FAKE_SSO_USERS.map((u) => [u.username, u.ba, u.costcenter])).toEqual([
      ["10001", "1059", "101932"],
      ["10002", "1059", "101931"],
      ["10003", "1060", "100405"],
    ]);
  });

  it("fake:down simulates an outage", async () => {
    await expect(client.exchangeCode("fake:down")).rejects.toBeInstanceOf(R6AuthUnavailableError);
  });

  it("anything else is an invalid grant", async () => {
    await expect(client.exchangeCode("bogus")).rejects.toBeInstanceOf(InvalidGrantError);
    await expect(client.exchangeCode("fake:99999")).rejects.toBeInstanceOf(InvalidGrantError);
  });
});
