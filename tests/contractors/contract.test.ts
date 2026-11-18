import { describe, expect, it } from "vitest";
import {
  bangkokToday,
  canDeleteContractor,
  contractStatus,
  isValidDateString,
  isWithinContract,
} from "@/lib/contractors/contract";

const at = (iso: string) => new Date(iso);

describe("bangkokToday", () => {
  it("is still the old day at 23:59:59 Bangkok", () => {
    expect(bangkokToday(at("2026-12-31T16:59:59Z"))).toBe("2026-12-31");
  });
  it("rolls over at 00:00 Bangkok", () => {
    expect(bangkokToday(at("2026-12-31T17:00:00Z"))).toBe("2027-01-01");
  });
});

describe("isWithinContract", () => {
  const s = "2026-01-01";
  const e = "2026-12-31";
  it("not_started before the start day (Bangkok)", () => {
    expect(isWithinContract(s, e, at("2025-12-31T16:59:59Z"))).toBe("not_started");
  });
  it("ok on the first day", () => {
    expect(isWithinContract(s, e, at("2025-12-31T17:00:00Z"))).toBe("ok");
  });
  it("ok until the last second of the end day", () => {
    expect(isWithinContract(s, e, at("2026-12-31T16:59:59Z"))).toBe("ok");
  });
  it("ended after the end day", () => {
    expect(isWithinContract(s, e, at("2026-12-31T17:00:00Z"))).toBe("ended");
  });
});

describe("contractStatus", () => {
  const now = at("2026-06-01T05:00:00Z"); // 2026-06-01 Bangkok
  const base = { isActive: true, contractStart: "2026-01-01" };
  it("inactive wins over ended", () => {
    const r = contractStatus(
      { isActive: false, contractStart: "2025-01-01", contractEnd: "2025-12-31" },
      now,
    );
    expect(r.status).toBe("inactive");
  });
  it("not_started", () => {
    expect(
      contractStatus({ ...base, contractStart: "2026-07-01", contractEnd: "2026-12-31" }, now).status,
    ).toBe("not_started");
  });
  it("ended", () => {
    expect(contractStatus({ ...base, contractEnd: "2026-05-31" }, now).status).toBe("ended");
  });
  it("expiring at 30 days", () => {
    expect(contractStatus({ ...base, contractEnd: "2026-07-01" }, now)).toEqual({
      status: "expiring",
      daysLeft: 30,
    });
  });
  it("active at 31 days", () => {
    expect(contractStatus({ ...base, contractEnd: "2026-07-02" }, now)).toEqual({
      status: "active",
      daysLeft: 31,
    });
  });
  it("expiring with 0 days left on the end day", () => {
    expect(contractStatus({ ...base, contractEnd: "2026-06-01" }, now)).toEqual({
      status: "expiring",
      daysLeft: 0,
    });
  });
});

describe("isValidDateString", () => {
  it("rejects a non-leap Feb 29", () => expect(isValidDateString("2026-02-29")).toBe(false));
  it("accepts a leap Feb 29", () => expect(isValidDateString("2028-02-29")).toBe(true));
  it("rejects unpadded", () => expect(isValidDateString("2026-1-1")).toBe(false));
  it("rejects month 13", () => expect(isValidDateString("2026-13-01")).toBe(false));
});

describe("canDeleteContractor", () => {
  it("allows only ended and inactive", () => {
    expect(canDeleteContractor("ended")).toBe(true);
    expect(canDeleteContractor("inactive")).toBe(true);
    expect(canDeleteContractor("active")).toBe(false);
    expect(canDeleteContractor("expiring")).toBe(false);
    expect(canDeleteContractor("not_started")).toBe(false);
  });
});
