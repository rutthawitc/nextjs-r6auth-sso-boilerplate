import Link from "next/link";

import { getValidSessionUser } from "@/lib/session";

const primaryLink =
  "inline-flex items-center gap-2 rounded-full bg-[#3B82F6] px-6 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-[#2563EB] active:bg-[#1D4ED8] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3B82F6]";
const secondaryLink =
  "inline-flex items-center gap-2 rounded-full bg-[#F3F4F6] px-6 py-2.5 text-[13px] font-semibold text-[#111827] transition-colors hover:bg-[#E5E7EB] active:bg-[#D1D5DB] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3B82F6]";

export default async function Home() {
  const user = await getValidSessionUser();
  const isAdmin = user?.role === "admin";

  return (
    <div className="min-h-[calc(100vh-48px)] bg-[#F9FAFB]">
      <section className="flex flex-col items-center gap-6 px-4 pt-16 pb-14 text-center sm:px-6">
        <span className="mp-overline text-[#2563EB]">PWA Login</span>
        <h1 className="mp-display max-w-xl text-[#111827]">
          เข้าสู่ระบบด้วยบัญชี กปภ.
        </h1>
        <p className="mp-body-lg max-w-lg text-[#4B5563]">
          ระบบตัวอย่างการเข้าสู่ระบบด้วย r6auth (SSO กปภ.ข.6)
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
          {user ? (
            <>
              <Link href="/profile" className={primaryLink}>
                ไปที่โปรไฟล์
              </Link>
              {isAdmin ? (
                <Link href="/admin/users" className={secondaryLink}>
                  จัดการผู้ใช้
                </Link>
              ) : null}
            </>
          ) : (
            <Link href="/login" className={primaryLink}>
              เข้าสู่ระบบ
            </Link>
          )}
        </div>
      </section>
    </div>
  );
}
