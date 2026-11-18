import { redirect } from "next/navigation";

import ChangePasswordForm from "@/app/change-password/change-password-form";
import { changePasswordRedirect } from "@/lib/auth/change-password-gate";
import { getValidSessionUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function ChangePasswordPage() {
  // Not requireActiveUser: that guard refuses accounts that must change their
  // password. The API re-checks the account in the database again on submit.
  const user = await getValidSessionUser();
  let target: string | null;
  try {
    target = await changePasswordRedirect(user);
  } catch (error) {
    // DB down: show the form; the API answers with a service-unavailable message.
    console.error("Principal lookup failed", error instanceof Error ? error.name : typeof error);
    target = user ? (user.kind === "contractor" ? null : "/profile") : "/login?from=/change-password";
  }
  if (target || !user) redirect(target ?? "/login?from=/change-password");

  return (
    <div className="flex min-h-[calc(100vh-48px)] items-center justify-center bg-[#F9FAFB] px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="mp-headline text-[#111827]">เปลี่ยนรหัสผ่าน</h1>
          <p className="mp-body mt-2 text-[#6B7280]">
            {user.mustChangePassword
              ? "กรุณาตั้งรหัสผ่านใหม่ก่อนเริ่มใช้งาน"
              : "ตั้งรหัสผ่านใหม่สำหรับบัญชีของท่าน"}
          </p>
        </div>
        <ChangePasswordForm />
      </div>
    </div>
  );
}
