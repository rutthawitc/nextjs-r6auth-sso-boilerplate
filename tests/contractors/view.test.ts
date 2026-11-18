import { describe, expect, it } from "vitest";

import { formatThaiShortDate } from "@/lib/format";
import {
  STATUS_FILTERS,
  DEFAULT_STATUS_FILTER,
  contractorApiError,
  matchesContractor,
  statusLabel,
  type ContractorListItem,
} from "@/lib/contractors/view";

describe("formatThaiShortDate", () => {
  it("formats YYYY-MM-DD as Buddhist-era dd/mm/yy", () => {
    expect(formatThaiShortDate("2026-11-03")).toBe("03/11/69");
    expect(formatThaiShortDate("2000-01-31")).toBe("31/01/43");
  });

  it("does not shift the calendar day by time zone", () => {
    expect(formatThaiShortDate("2026-12-31")).toBe("31/12/69");
  });

  it("returns - for empty or invalid input", () => {
    expect(formatThaiShortDate("")).toBe("-");
    expect(formatThaiShortDate(null)).toBe("-");
    expect(formatThaiShortDate(undefined)).toBe("-");
    expect(formatThaiShortDate("2026-02-30")).toBe("-");
    expect(formatThaiShortDate("03/11/2026")).toBe("-");
  });
});

describe("statusLabel", () => {
  it("labels every status in Thai", () => {
    expect(statusLabel("active", 100)).toBe("ใช้งานได้");
    expect(statusLabel("expiring", 7)).toBe("ใกล้หมด (7 วัน)");
    expect(statusLabel("expiring", 1)).toBe("ใกล้หมด (1 วัน)");
    expect(statusLabel("expiring", 0)).toBe("วันสุดท้าย");
    expect(statusLabel("ended", -3)).toBe("หมดสัญญา");
    expect(statusLabel("not_started", 40)).toBe("ยังไม่เริ่มสัญญา");
    expect(statusLabel("inactive", 10)).toBe("ปิดใช้งาน");
  });
});

const row = (over: Partial<ContractorListItem> = {}): ContractorListItem => ({
  username: "90001",
  firstName: "สมชาย",
  lastName: "ใจดี",
  department: "กองบริการ",
  businessArea: "1100",
  status: "active",
  ...over,
});

describe("matchesContractor", () => {
  it("matches everything with an empty search and filter all", () => {
    expect(matchesContractor(row(), "", "all")).toBe(true);
    expect(matchesContractor(row(), "   ", "all")).toBe(true);
  });

  it("searches code, full name and department, case-insensitively", () => {
    expect(matchesContractor(row(), "9000", "all")).toBe(true);
    expect(matchesContractor(row(), "สมชาย ใจดี", "all")).toBe(true);
    expect(matchesContractor(row(), "ใจดี", "all")).toBe(true);
    expect(matchesContractor(row({ department: "IT Section" }), "it sec", "all")).toBe(true);
    expect(matchesContractor(row(), "1100", "all")).toBe(false);
    expect(matchesContractor(row(), "สมหญิง", "all")).toBe(false);
  });

  it("filters by status", () => {
    expect(matchesContractor(row({ status: "expiring" }), "", "expiring")).toBe(true);
    expect(matchesContractor(row({ status: "active" }), "", "expiring")).toBe(false);
    expect(matchesContractor(row({ status: "ended" }), "9000", "ended")).toBe(true);
    expect(matchesContractor(row({ status: "ended" }), "สมหญิง", "ended")).toBe(false);
  });

  it("hides ended contracts under the current filter only", () => {
    for (const status of ["active", "expiring", "not_started", "inactive"] as const) {
      expect(matchesContractor(row({ status }), "", "current")).toBe(true);
    }
    expect(matchesContractor(row({ status: "ended" }), "", "current")).toBe(false);
    expect(matchesContractor(row({ status: "ended" }), "", "all")).toBe(true);
    expect(matchesContractor(row({ status: "active" }), "สมหญิง", "current")).toBe(false);
  });

  it("defaults to the current filter", () => {
    expect(DEFAULT_STATUS_FILTER).toBe("current");
    expect(STATUS_FILTERS[0]).toEqual({ value: "current", label: "ทั้งหมด (ไม่รวมหมดสัญญา)" });
  });

  it("offers current, all and every status as filters", () => {
    expect(STATUS_FILTERS.map((f) => f.value)).toEqual([
      "current",
      "all",
      "active",
      "expiring",
      "ended",
      "not_started",
      "inactive",
    ]);
  });
});

describe("contractorApiError", () => {
  it("maps API codes and fields to Thai", () => {
    expect(contractorApiError({ code: "USERNAME_TAKEN", field: "username" }, "x")).toBe("รหัสลูกจ้างนี้ถูกใช้แล้ว");
    expect(contractorApiError({ code: "ROLE_NOT_ALLOWED" }, "x")).toBe(
      "มีบทบาทที่ลูกจ้างไม่ได้รับอนุญาต กรุณาเอาออกแล้วลองใหม่",
    );
    expect(contractorApiError({ code: "NOT_FOUND" }, "x")).toBe("ไม่พบบัญชีลูกจ้างนี้");
    expect(contractorApiError({ code: "NOT_DELETABLE" }, "x")).toBe(
      "ลบได้เฉพาะลูกจ้างที่หมดสัญญาหรือถูกปิดใช้งานแล้ว",
    );
    expect(contractorApiError({ code: "INVALID_INPUT", field: "contractEnd" }, "x")).toBe(
      "วันสิ้นสุดสัญญาไม่ถูกต้อง หรืออยู่ก่อนวันเริ่ม",
    );
    expect(contractorApiError({ code: "INVALID_INPUT", field: "username" }, "x")).toBe(
      "รหัสลูกจ้างต้องเป็นตัวเลขเท่านั้น (ไม่เกิน 20 หลัก)",
    );
  });

  it("passes the server's Thai password message through", () => {
    expect(
      contractorApiError({ code: "INVALID_INPUT", field: "password", error: "รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร" }, "x"),
    ).toBe("รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร");
  });

  it("falls back for unknown shapes and never echoes English server text", () => {
    expect(contractorApiError(null, "บันทึกไม่สำเร็จ")).toBe("บันทึกไม่สำเร็จ");
    expect(contractorApiError({ error: "An internal server error occurred." }, "บันทึกไม่สำเร็จ")).toBe(
      "บันทึกไม่สำเร็จ",
    );
    expect(contractorApiError({ code: "INVALID_INPUT", field: "nope" }, "บันทึกไม่สำเร็จ")).toBe(
      "ข้อมูลไม่ถูกต้อง กรุณาตรวจสอบอีกครั้ง",
    );
  });

  it("maps auth failures", () => {
    expect(contractorApiError({ error: "Authentication required." }, "x", 401)).toBe(
      "เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่",
    );
    expect(contractorApiError({ error: "Forbidden" }, "x", 403)).toBe("ไม่มีสิทธิ์ทำรายการนี้");
  });
});
