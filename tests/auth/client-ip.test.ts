import { describe, expect, it } from "vitest";

import { getClientIp } from "@/lib/auth/client-ip";

const h = (o: Record<string, string>) => new Headers(o);

describe("getClientIp", () => {
  it("ignores forwarding headers when the proxy is not trusted", () => {
    expect(getClientIp(h({ "x-forwarded-for": "1.1.1.1", "x-real-ip": "2.2.2.2" }), false)).toBe("-");
  });

  it("uses the first X-Forwarded-For entry when trusted", () => {
    expect(getClientIp(h({ "x-forwarded-for": " 1.1.1.1 , 10.0.0.1" }), true)).toBe("1.1.1.1");
  });

  it("falls back to X-Real-IP, then to the constant", () => {
    expect(getClientIp(h({ "x-real-ip": "2.2.2.2" }), true)).toBe("2.2.2.2");
    expect(getClientIp(h({}), true)).toBe("-");
    expect(getClientIp(h({ "x-forwarded-for": " ," , "x-real-ip": "2.2.2.2" }), true)).toBe("2.2.2.2");
  });

  it("rejects absurdly long values", () => {
    expect(getClientIp(h({ "x-forwarded-for": "a".repeat(200) }), true)).toBe("-");
  });

  it("reads TRUST_PROXY from the environment by default", () => {
    const prev = process.env.TRUST_PROXY;
    try {
      process.env.TRUST_PROXY = "true";
      expect(getClientIp(h({ "x-real-ip": "3.3.3.3" }))).toBe("3.3.3.3");
      process.env.TRUST_PROXY = "false";
      expect(getClientIp(h({ "x-real-ip": "3.3.3.3" }))).toBe("-");
    } finally {
      if (prev === undefined) delete process.env.TRUST_PROXY;
      else process.env.TRUST_PROXY = prev;
    }
  });
});
