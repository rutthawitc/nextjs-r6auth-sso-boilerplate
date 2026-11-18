import { notFound } from "next/navigation";

import { FAKE_SSO_USERS, getR6AuthConfig } from "@/lib/r6auth";

export const dynamic = "force-dynamic";

function fakeActive(): boolean {
  try {
    return getR6AuthConfig().fake;
  } catch {
    return false;
  }
}

/** Development-only stand-in for r6auth's authorize page (R6AUTH_FAKE=true). */
export default async function DevSsoPage({
  searchParams,
}: {
  searchParams?: Promise<{ state?: string | string[] }>;
}) {
  if (!fakeActive()) notFound();
  const params = await searchParams;
  const state = (Array.isArray(params?.state) ? params?.state[0] : params?.state) ?? "";
  const link = (code: string) => `/api/auth/sso/callback?${new URLSearchParams({ code, state })}`;

  return (
    <div className="flex min-h-[calc(100vh-48px)] items-center justify-center bg-[#F9FAFB] px-4 py-10">
      <div className="w-full max-w-sm rounded-xl border border-[#FDE68A] bg-white p-6">
        <h1 className="mp-subhead text-[#111827]">r6auth จำลอง (เฉพาะการพัฒนา)</h1>
        <p className="mp-body-sm mt-1 text-[#6B7280]">เลือกผู้ใช้ทดสอบ หน้านี้ไม่มีในระบบจริง</p>
        <ul className="mt-4 flex flex-col gap-2">
          {FAKE_SSO_USERS.map((u) => (
            <li key={u.username}>
              <a
                href={link(`fake:${u.username}`)}
                className="block rounded-lg border border-[#E5E7EB] px-3 py-2 hover:bg-[#F3F4F6]"
              >
                <span className="mp-body font-medium text-[#111827]">{u.name}</span>
                <span className="mp-caption block text-[#4B5563]">
                  {u.username} · BA {u.ba} · ศูนย์ต้นทุน {u.costcenter}
                </span>
              </a>
            </li>
          ))}
          <li>
            <a href={link("fake:down")} className="mp-body-sm block px-3 py-2 text-[#991B1B] hover:underline">
              จำลองระบบล่ม
            </a>
          </li>
        </ul>
      </div>
    </div>
  );
}
