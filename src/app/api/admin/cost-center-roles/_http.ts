import { createErrorResponse } from "@/lib/api-response";
import { CostCenterRoleError } from "@/lib/cost-centers/admin";

const ERRORS: Record<CostCenterRoleError["code"], { status: number; message: string }> = {
  invalid_code: { status: 400, message: "รหัสศูนย์ต้นทุนต้องเป็นตัวเลข 1-20 หลัก" },
  role_not_found: { status: 404, message: "ไม่พบบทบาทที่เลือก" },
  duplicate: { status: 409, message: "ศูนย์ต้นทุนนี้ผูกกับบทบาทนี้อยู่แล้ว" },
  not_found: { status: 404, message: "ไม่พบรายการที่ต้องการลบ" },
  base_role: { status: 400, message: "บทบาทพื้นฐาน user ให้ทุกคนอยู่แล้ว ผูกกับศูนย์ต้นทุนไม่ได้" },
};

export function costCenterErrorResponse(error: unknown): Response {
  if (error instanceof CostCenterRoleError) {
    const { status, message } = ERRORS[error.code];
    return createErrorResponse(message, status, { code: error.code.toUpperCase() });
  }
  console.error("Cost center role API failed", error instanceof Error ? error.name : typeof error);
  return createErrorResponse("เกิดข้อผิดพลาดภายในระบบ", 500);
}
