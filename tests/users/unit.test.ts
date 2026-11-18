import { describe, expect, it } from "vitest";

import { unitOf } from "@/lib/users/unit";

describe("unitOf", () => {
  it("prefers office", () => {
    expect(unitOf({ office: "งานบริการ", department: "x", division: "y" })).toBe("งานบริการ");
  });
  it("falls back to department, then division", () => {
    expect(unitOf({ office: " ", department: "แผนก", division: "กอง" })).toBe("แผนก");
    expect(unitOf({ office: null, department: "", division: "กอง" })).toBe("กอง");
  });
  it("returns null when nothing is known", () => {
    expect(unitOf({ office: "", department: null, division: "  " })).toBeNull();
    expect(unitOf({})).toBeNull();
  });
});
