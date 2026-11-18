import { describe, expect, it } from "vitest";

import { createErrorResponse, createSuccessResponse } from "@/lib/api-response";

async function parseJson(response: Response) {
  return await response.json();
}

describe("api-response helpers", () => {
  it("wraps data into a successful JSON response", async () => {
    const res = createSuccessResponse({ ok: true });
    expect(res.status).toBe(200);
    expect(await parseJson(res)).toEqual({ ok: true });
  });

  it("builds a consistent error payload", async () => {
    const res = createErrorResponse("Oops", 400, { code: "BAD_INPUT" });
    expect(res.status).toBe(400);
    expect(await parseJson(res)).toEqual({
      error: "Oops",
      code: "BAD_INPUT",
    });
  });
});
