import LoginForm from "@/components/login-form";
import SsoButton from "@/components/sso-button";
import { AUTH_MESSAGES, SSO_ERROR_MESSAGES } from "@/lib/auth/messages";
import { safeRedirectPath } from "@/lib/auth/redirect";
import { getR6AuthConfig } from "@/lib/r6auth";

export const dynamic = "force-dynamic";

function ssoErrorMessage(code: string | undefined): string | undefined {
  if (!code || !Object.hasOwn(SSO_ERROR_MESSAGES, code)) return undefined;
  return SSO_ERROR_MESSAGES[code as keyof typeof SSO_ERROR_MESSAGES];
}

/**
 * Origin of R6AUTH_REDIRECT_URI. Empty (a relative link) in fake mode and when
 * the config is invalid; the login route then reports the configuration error.
 */
function ssoOrigin(): string {
  try {
    const cfg = getR6AuthConfig();
    return cfg.fake ? "" : new URL(cfg.redirectUri).origin;
  } catch {
    return "";
  }
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams?: Promise<{ expired?: string; contract?: string; from?: string | string[]; error?: string | string[] }>;
}) {
  const params = await searchParams;
  const expired = params?.expired === "1";
  const contractNotice =
    params?.contract === "ended"
      ? AUTH_MESSAGES.contractEnded
      : params?.contract === "not_started"
        ? AUTH_MESSAGES.contractNotStarted
        : undefined;
  const rawFrom = Array.isArray(params?.from) ? params?.from[0] : params?.from;
  const redirectTo = safeRedirectPath(rawFrom);
  const rawError = Array.isArray(params?.error) ? params?.error[0] : params?.error;
  const ssoError = ssoErrorMessage(rawError);

  return (
    <div className="flex min-h-[calc(100vh-48px)] items-center justify-center bg-[#F9FAFB] px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="mp-headline text-[#111827]">เข้าสู่ระบบ</h1>
          <p className="mp-body mt-2 text-[#6B7280]">
            พนักงาน กปภ. เข้าสู่ระบบด้วยบัญชีเดียวกับ Web Portal ส่วนลูกจ้างใช้รหัสลูกจ้างและรหัสผ่านที่ได้รับจากผู้ดูแลระบบ
          </p>
        </div>

        <div className="flex flex-col gap-4 rounded-xl border border-[#E5E7EB] bg-white p-6 shadow-[0_2px_8px_rgba(0,0,0,0.06),0_1px_2px_rgba(0,0,0,0.04)]">
          {ssoError ? (
            <div className="rounded-lg border border-[#FECACA] bg-[#FEF2F2] px-3 py-2" role="alert">
              <p className="mp-body-sm text-[#991B1B]">{ssoError}</p>
            </div>
          ) : expired ? (
            <div className="rounded-lg border border-[#FDE68A] bg-[#FFFBEB] px-3 py-2" role="status">
              <p className="mp-body-sm text-[#92400E]">{AUTH_MESSAGES.sessionExpired}</p>
            </div>
          ) : null}

          <SsoButton from={redirectTo} origin={ssoOrigin()} />

          <div className="flex items-center gap-3" aria-hidden="true">
            <span className="h-px flex-1 bg-[#E5E7EB]" />
            <span className="mp-caption text-[#6B7280]">หรือ</span>
            <span className="h-px flex-1 bg-[#E5E7EB]" />
          </div>

          <details className="group" open={contractNotice !== undefined}>
            <summary className="mp-body-sm cursor-pointer select-none rounded font-medium text-[#1D4ED8] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3B82F6]">
              ลูกจ้าง / ผู้ดูแลระบบ
            </summary>
            <div className="mt-3">
              <LoginForm notice={contractNotice} redirectTo={redirectTo} />
              <p className="mp-caption mt-2 text-[#6B7280]">
                สำหรับลูกจ้างและผู้ดูแลระบบเท่านั้น พนักงาน กปภ. ใช้ปุ่มด้านบน
              </p>
            </div>
          </details>
        </div>
      </div>
    </div>
  );
}
