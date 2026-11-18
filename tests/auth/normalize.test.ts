import { describe, expect, it } from "vitest";

import { normalizeUsername } from "@/lib/auth/normalize";

describe("normalizeUsername", () => {
  it.each([
    ["plain", "somchai", "somchai"],
    ["trimmed", "  somchai  ", "somchai"],
    ["domain prefix", "PWA\\somchai", "somchai"],
    ["upn suffix", "somchai@pwa.local", "somchai"],
    ["case preserved", "PWA\\SomChai", "SomChai"],
    ["last backslash wins", "a\\b\\user", "user"],
    ["backslash beats at", "PWA\\user@x", "user@x"],
    ["empty", "   ", ""],
  ])("%s", (_name, input, expected) => {
    expect(normalizeUsername(input)).toBe(expected);
  });
});
