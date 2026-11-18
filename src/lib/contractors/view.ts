/**
 * Client-safe display helpers for the admin contractor page. Must not import
 * admin.ts or password.ts (bcrypt / node:crypto are server-only).
 */
import type { ContractStatus } from "./contract";

/** `current` = everything except ended contracts (the default view). */
export type StatusFilter = "current" | "all" | ContractStatus;

export const DEFAULT_STATUS_FILTER: StatusFilter = "current";

export type ContractorListItem = {
  username: string;
  firstName: string;
  lastName: string;
  department: string;
  businessArea: string;
  status: ContractStatus;
};

export function statusLabel(status: ContractStatus, daysLeft: number): string {
  switch (status) {
    case "inactive":
      return "ปิดใช้งาน";
    case "not_started":
      return "ยังไม่เริ่มสัญญา";
    case "ended":
      return "หมดสัญญา";
    case "expiring":
      // The contract end day is inclusive, so 0 days left means today is the last day.
      return daysLeft <= 0 ? "วันสุดท้าย" : `ใกล้หมด (${daysLeft} วัน)`;
    case "active":
      return "ใช้งานได้";
  }
}

export const STATUS_FILTERS: ReadonlyArray<{ value: StatusFilter; label: string }> = [
  { value: "current", label: "ทั้งหมด (ไม่รวมหมดสัญญา)" },
  { value: "all", label: "ทุกสถานะ" },
  { value: "active", label: "ใช้งานได้" },
  { value: "expiring", label: "ใกล้หมดสัญญา" },
  { value: "ended", label: "หมดสัญญา" },
  { value: "not_started", label: "ยังไม่เริ่มสัญญา" },
  { value: "inactive", label: "ปิดใช้งาน" },
];

/** Search by code, full name or department; then filter by status. */
export function matchesContractor(c: ContractorListItem, term: string, filter: StatusFilter): boolean {
  if (filter === "current" ? c.status === "ended" : filter !== "all" && c.status !== filter) return false;
  const q = term.trim().toLowerCase();
  if (!q) return true;
  return [c.username, `${c.firstName} ${c.lastName}`, c.department].some((v) => v.toLowerCase().includes(q));
}

const FIELD_MESSAGES: Record<string, string> = {
  username: "รหัสลูกจ้างต้องเป็นตัวเลขเท่านั้น (ไม่เกิน 20 หลัก)",
  firstName: "กรุณากรอกชื่อ",
  lastName: "กรุณากรอกนามสกุล",
  department: "กรุณากรอกสังกัด",
  businessArea: "กรุณากรอกรหัส BA",
  phone: "เบอร์โทรยาวเกินไป",
  contractStart: "วันเริ่มสัญญาไม่ถูกต้อง",
  contractEnd: "วันสิ้นสุดสัญญาไม่ถูกต้อง หรืออยู่ก่อนวันเริ่ม",
  roleIds: "มีบทบาทที่ลูกจ้างไม่ได้รับอนุญาต กรุณาเอาออกแล้วลองใหม่",
};

/**
 * Thai message for a failed /api/admin/contractors call. The API's messages are
 * English except the password rules (already Thai), so map by code and field.
 */
export function contractorApiError(payload: unknown, fallback: string, status?: number): string {
  if (status === 401) return "เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่";
  if (status === 403) return "ไม่มีสิทธิ์ทำรายการนี้";
  const p = (payload && typeof payload === "object" ? payload : {}) as {
    code?: unknown;
    field?: unknown;
    error?: unknown;
  };
  switch (p.code) {
    case "USERNAME_TAKEN":
      return "รหัสลูกจ้างนี้ถูกใช้แล้ว";
    case "ROLE_NOT_ALLOWED":
      return FIELD_MESSAGES.roleIds;
    case "NOT_FOUND":
      return "ไม่พบบัญชีลูกจ้างนี้";
    case "NOT_DELETABLE":
      return "ลบได้เฉพาะลูกจ้างที่หมดสัญญาหรือถูกปิดใช้งานแล้ว";
    case "INVALID_INPUT":
      if (p.field === "password" && typeof p.error === "string") return p.error;
      if (typeof p.field === "string" && FIELD_MESSAGES[p.field]) return FIELD_MESSAGES[p.field];
      return "ข้อมูลไม่ถูกต้อง กรุณาตรวจสอบอีกครั้ง";
    default:
      return fallback;
  }
}
