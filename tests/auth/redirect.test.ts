import { describe, expect, it } from "vitest";

import { safeRedirectPath } from "@/lib/auth/redirect";

describe("safeRedirectPath", () => {
  it("accepts same-origin relative paths", () => {
    expect(safeRedirectPath("/admin/users")).toBe("/admin/users");
    expect(safeRedirectPath("/profile?x=1#y")).toBe("/profile?x=1#y");
    expect(safeRedirectPath("/")).toBe("/");
  });

  it("falls back for missing values", () => {
    expect(safeRedirectPath(undefined)).toBe("/profile");
    expect(safeRedirectPath(null)).toBe("/profile");
    expect(safeRedirectPath("")).toBe("/profile");
  });

  it("rejects absolute and protocol-relative URLs", () => {
    expect(safeRedirectPath("//evil.com")).toBe("/profile");
    expect(safeRedirectPath("//evil.com/path")).toBe("/profile");
    expect(safeRedirectPath("/\\evil.com")).toBe("/profile");
    expect(safeRedirectPath("https://evil.com")).toBe("/profile");
    expect(safeRedirectPath("http://localhost/x")).toBe("/profile");
    expect(safeRedirectPath("javascript:alert(1)")).toBe("/profile");
    expect(safeRedirectPath("evil.com")).toBe("/profile");
    expect(safeRedirectPath("admin")).toBe("/profile");
  });

  it("rejects control characters and backslashes", () => {
    expect(safeRedirectPath("/\t/evil.com")).toBe("/profile");
    expect(safeRedirectPath("/\n/evil.com")).toBe("/profile");
    expect(safeRedirectPath("/a\\b")).toBe("/profile");
  });

  it("uses a custom fallback", () => {
    expect(safeRedirectPath("//x", "/")).toBe("/");
  });
});
