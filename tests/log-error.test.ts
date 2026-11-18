import { describe, expect, it } from "vitest";

import { errorSummary } from "@/lib/log-error";

class QueryError extends Error {
  constructor(message: string, cause: unknown) {
    super(message, { cause });
    this.name = "DrizzleQueryError";
  }
}

describe("errorSummary", () => {
  it("keeps the class and codes, never the message", () => {
    const cause = Object.assign(new Error('duplicate key value violates unique constraint "users_username_unique"'), {
      code: "23505",
    });
    const error = new QueryError("Failed query: insert into users ...\nparams: 10001,นายสมชาย ใจดี,somchai@example.com", cause);
    const summary = errorSummary(error);
    expect(summary).toEqual({ errorClass: "DrizzleQueryError", causeClass: "Error", causeCode: "23505" });
    const text = JSON.stringify(summary);
    expect(text).not.toContain("สมชาย");
    expect(text).not.toContain("somchai@example.com");
    expect(text).not.toContain("params");
  });

  it("includes the error's own string code", () => {
    const error = Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:5432"), { code: "ECONNREFUSED" });
    expect(errorSummary(error)).toEqual({ errorClass: "Error", code: "ECONNREFUSED" });
  });

  it("falls back to the constructor name when name is the default", () => {
    class TimeoutError extends Error {}
    expect(errorSummary(new TimeoutError("x"))).toEqual({ errorClass: "TimeoutError" });
  });

  it("handles non-Error values without echoing them", () => {
    expect(errorSummary("secret text")).toEqual({ errorClass: "string" });
    expect(errorSummary(undefined)).toEqual({ errorClass: "undefined" });
  });
});
