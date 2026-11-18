import { randomInt } from "node:crypto";
import { PASSWORD_MAX, PASSWORD_MAX_BYTES, PASSWORD_MIN } from "./constants";

export type PasswordProblem = "too_short" | "too_long" | "control_chars" | "same_as_current";

export const PASSWORD_MESSAGES: Record<PasswordProblem, string> = {
  too_short: "รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร",
  too_long: "รหัสผ่านยาวเกินไป (ไม่เกิน 72 ไบต์ ภาษาไทยประมาณ 24 ตัวอักษร)",
  control_chars: "รหัสผ่านต้องไม่มีอักขระควบคุม",
  same_as_current: "รหัสผ่านใหม่ต้องไม่ซ้ำกับรหัสผ่านเดิม",
};

// No 0 O o l 1 I, so a printed password cannot be misread.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
const GENERATED_LENGTH = 12;

/**
 * Length, byte and control-character rules only. "same_as_current" needs the
 * current hash and is detected by the change-password service.
 */
export function checkNewPassword(pw: string): PasswordProblem | null {
  if (/[\u0000-\u001f\u007f]/.test(pw)) return "control_chars";
  const chars = [...pw].length;
  if (chars < PASSWORD_MIN) return "too_short";
  if (chars > PASSWORD_MAX || Buffer.byteLength(pw, "utf8") > PASSWORD_MAX_BYTES) {
    return "too_long";
  }
  return null;
}

export function generatePassword(): string {
  let out = "";
  for (let i = 0; i < GENERATED_LENGTH; i++) out += ALPHABET[randomInt(ALPHABET.length)];
  return out;
}
