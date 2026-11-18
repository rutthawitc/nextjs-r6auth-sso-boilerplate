export const AUTH_MESSAGES = {
  invalid: "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง",
  unavailable: "ระบบยืนยันตัวตนไม่พร้อมใช้งานชั่วคราว กรุณาลองใหม่ภายหลัง",
  notAllowed: "บัญชีของคุณไม่มีสิทธิ์ใช้งานระบบนี้",
  inactive: "บัญชีของคุณถูกระงับการใช้งาน กรุณาติดต่อผู้ดูแลระบบ",
  pending: "บัญชีของคุณรอผู้ดูแลระบบอนุมัติ",
  rejected: "คำขอใช้งานของคุณไม่ได้รับการอนุมัติ กรุณาติดต่อผู้ดูแลระบบ",
  contractNotStarted: "สัญญาจ้างของคุณยังไม่เริ่มต้น กรุณาติดต่อผู้ดูแลระบบ",
  contractEnded: "สัญญาจ้างของคุณสิ้นสุดแล้ว กรุณาติดต่อผู้ดูแลระบบ",
  passwordChangeRequired: "กรุณาเปลี่ยนรหัสผ่านก่อนใช้งาน",
  currentPasswordWrong: "รหัสผ่านปัจจุบันไม่ถูกต้อง",
  sessionExpired: "เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่",
  ssoExpired: "ลิงก์เข้าสู่ระบบหมดอายุ กรุณาลองอีกครั้ง",
  accountConflict: "รหัสพนักงานของคุณซ้ำกับบัญชีอื่นในระบบ กรุณาติดต่อผู้ดูแลระบบ",
} as const;

/** Thai text for `/login?error=<code>` after an SSO attempt. */
export const SSO_ERROR_MESSAGES = {
  SSO_EXPIRED: AUTH_MESSAGES.ssoExpired,
  SERVICE_UNAVAILABLE: AUTH_MESSAGES.unavailable,
  NOT_ALLOWED: AUTH_MESSAGES.notAllowed,
  INACTIVE: AUTH_MESSAGES.inactive,
  PENDING_APPROVAL: AUTH_MESSAGES.pending,
  REJECTED: AUTH_MESSAGES.rejected,
  ACCOUNT_CONFLICT: AUTH_MESSAGES.accountConflict,
} as const satisfies Record<import("./sso-login").SsoLoginFailureCode, string>;

export function throttleMessage(seconds: number): string {
  return `พยายามเข้าสู่ระบบหลายครั้งเกินไป กรุณาลองใหม่ใน ${seconds} วินาที`;
}
