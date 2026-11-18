import { describe, expect, it } from "vitest";
import { checkNewPassword, generatePassword, PASSWORD_MESSAGES } from "@/lib/contractors/password";

describe("checkNewPassword", () => {
  it("7 chars is too short", () => expect(checkNewPassword("abcdefg")).toBe("too_short"));
  it("8 chars is ok", () => expect(checkNewPassword("abcdefgh")).toBeNull());
  it("129 chars is too long", () => expect(checkNewPassword("a".repeat(129))).toBe("too_long"));
  it("30 Thai chars (90 bytes) is too long", () => {
    expect(checkNewPassword("ก".repeat(30))).toBe("too_long");
  });
  it("24 Thai chars (72 bytes) is ok", () => {
    expect(checkNewPassword("ก".repeat(24))).toBeNull();
  });
  it("rejects control chars", () => {
    expect(checkNewPassword("abcdefg\n")).toBe("control_chars");
  });
});

describe("generatePassword", () => {
  it("is 12 valid chars without ambiguous characters", () => {
    for (let i = 0; i < 50; i++) {
      const p = generatePassword();
      expect(p).toHaveLength(12);
      expect(checkNewPassword(p)).toBeNull();
      expect(p).not.toMatch(/[0Ool1I]/);
    }
  });
  it("differs between calls", () => {
    expect(generatePassword()).not.toBe(generatePassword());
  });
});

describe("PASSWORD_MESSAGES", () => {
  it("has a Thai message for every problem", () => {
    for (const k of ["too_short", "too_long", "control_chars", "same_as_current"] as const) {
      expect(PASSWORD_MESSAGES[k]).toMatch(/[฀-๿]/);
    }
  });
});
