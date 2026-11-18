import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/session", () => ({ getSession: vi.fn() }));
vi.mock("@/lib/auth/principal", () => ({ loadCurrentPrincipal: vi.fn() }));

import { ApiError, handleApiError, validateUuid } from "@/lib/api-middleware";

const GENERIC = "An internal server error occurred.";

describe("handleApiError", () => {
  it("returns an ApiError's message and status", async () => {
    const res = handleApiError(new ApiError("User not found.", 404));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "User not found." });
  });

  it("hides a database error behind a generic 500", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const dbError = new Error(
      'Failed query: update "users" set "is_active" = $1 where "id" = $2\nparams: false,10001,นายสมชาย ใจดี',
      { cause: Object.assign(new Error("Invalid input"), { code: "22P02" }) },
    );
    const res = handleApiError(dbError);
    expect(res.status).toBe(500);
    const body = JSON.stringify(await res.json());
    expect(body).toBe(JSON.stringify({ error: GENERIC }));
    const logged = JSON.stringify(spy.mock.calls);
    expect(logged).toContain("22P02");
    expect(logged).not.toContain("Failed query");
    spy.mockRestore();
  });

  it("does not match keywords in arbitrary error messages", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    for (const message of ["Invalid input syntax for type uuid", "relation not found", "account deactivated"]) {
      const res = handleApiError(new Error(message));
      expect(res.status).toBe(500);
      expect((await res.json()).error).toBe(GENERIC);
    }
    spy.mockRestore();
  });

  it("answers 500 for a non-Error value", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = handleApiError("boom");
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe(GENERIC);
    spy.mockRestore();
  });
});

describe("validators throw ApiError", () => {
  it("validateUuid -> 400 Invalid id.", () => {
    expect(() => validateUuid("x")).toThrow(ApiError);
    try {
      validateUuid("x");
    } catch (error) {
      expect(error).toMatchObject({ status: 400, message: "Invalid id." });
    }
  });
});
