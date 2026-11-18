import { eq } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";

import { localAdmins, roles, userRoles, users } from "@/db/schema";
import { db } from "@/lib/db";
import { APPROVAL_LABELS, formatThaiDate, formatThaiDateTime } from "@/lib/format";
import { requireActiveUser } from "@/lib/auth/require-active-user";
import { unitOf } from "@/lib/users/unit";

export const dynamic = "force-dynamic";

export default async function ProfilePage({
  searchParams,
}: {
  searchParams?: Promise<{ error?: string }>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  // Cookie session plus a DB re-check (active, approved): a deactivated or
  // deleted account must not keep seeing this page until the cookie expires.
  const active = await requireActiveUser();

  if (!active.ok) {
    if (active.reason === "password_change_required") redirect("/change-password");
    if (active.reason === "contract_ended") redirect("/login?contract=ended");
    if (active.reason === "contract_not_started") redirect("/login?contract=not_started");
    redirect(active.reason === "no_session" ? "/login?from=/profile" : "/login?expired=1&from=/profile");
  }
  const sessionUser = active.sessionUser;

  const errorNotice = resolvedSearchParams?.error === "forbidden";

  const notice = errorNotice ? (
    <div
      className="mb-6 rounded-xl border border-[#FDE68A] bg-[#FFFBEB] px-4 py-3"
      role="alert"
    >
      <p className="mp-body-sm text-[#92400E]">ต้องเป็นผู้ดูแลระบบจึงจะเข้าหน้านั้นได้</p>
    </div>
  ) : null;

  if (sessionUser.kind === "local") {
    const [admin] = await db
      .select()
      .from(localAdmins)
      .where(eq(localAdmins.id, sessionUser.id))
      .limit(1);
    if (!admin) redirect("/login?from=/profile");

    return (
      <div className="min-h-[calc(100vh-48px)] bg-[#F9FAFB] px-4 py-10">
        <div className="mx-auto w-full max-w-2xl">
          {notice}
          <div className="overflow-hidden rounded-xl border border-[#E5E7EB] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
            <div className="border-b border-[#E5E7EB] px-6 py-5">
              <h1 className="mp-headline text-[#111827]">{admin.displayName || admin.username}</h1>
              <p className="mp-body mt-1 text-[#4B5563]">ผู้ดูแลระบบ (local admin)</p>
            </div>
            <dl className="grid grid-cols-1 gap-4 p-6 sm:grid-cols-2">
              <InfoRow label="ชื่อผู้ใช้" value={admin.username} />
              <InfoRow label="ชื่อที่แสดง" value={admin.displayName || "-"} />
              <InfoRow label="ประเภทบัญชี" value="ผู้ดูแลระบบ (local admin)" />
              <InfoRow label="เข้าสู่ระบบล่าสุด" value={formatThaiDateTime(admin.lastLogin)} />
            </dl>
          </div>
        </div>
      </div>
    );
  }

  const [user] = await db.select().from(users).where(eq(users.id, sessionUser.id)).limit(1);
  if (!user) redirect("/login?from=/profile");

  if (sessionUser.kind === "contractor") {
    return (
      <div className="min-h-[calc(100vh-48px)] bg-[#F9FAFB] px-4 py-10">
        <div className="mx-auto w-full max-w-2xl">
          {notice}
          <div className="overflow-hidden rounded-xl border border-[#E5E7EB] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
            <div className="border-b border-[#E5E7EB] px-6 py-5">
              <h1 className="mp-headline text-[#111827]">{user.displayName}</h1>
              <p className="mp-body mt-1 text-[#4B5563]">ลูกจ้าง</p>
            </div>
            <dl className="grid grid-cols-1 gap-4 p-6 sm:grid-cols-2">
              <InfoRow label="รหัสลูกจ้าง" value={user.username} />
              <InfoRow
                label="ชื่อ-นามสกุล"
                value={[user.firstName, user.lastName].filter(Boolean).join(" ") || user.displayName}
              />
              <InfoRow label="สังกัด" value={user.department || "-"} />
              <InfoRow label="รหัสเขตธุรกิจ (BA)" value={user.businessArea || "-"} />
              <InfoRow label="เบอร์โทร" value={user.phone || "-"} />
              <InfoRow
                label="ช่วงสัญญา"
                value={`${formatThaiDate(user.contractStart)} - ${formatThaiDate(user.contractEnd)}`}
              />
              <InfoRow label="ประเภทบัญชี" value="ลูกจ้าง" />
              <InfoRow label="เข้าสู่ระบบล่าสุด" value={formatThaiDateTime(user.lastLogin)} />
            </dl>
            <div className="border-t border-[#E5E7EB] p-6">
              <Link href="/change-password" className="mp-body font-medium text-[#1D4ED8] hover:underline">
                เปลี่ยนรหัสผ่าน
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const assigned = await db
    .select({ name: roles.name, level: roles.level })
    .from(userRoles)
    .innerJoin(roles, eq(userRoles.roleId, roles.id))
    .where(eq(userRoles.userId, user.id));
  assigned.sort((a, b) => b.level - a.level || a.name.localeCompare(b.name));

  const unit = unitOf(user);
  // Never greet with displayName: it carries the title prefix (นาย/นางสาว).
  const greetingName = user.firstName?.trim() || sessionUser.firstName?.trim() || user.username;

  return (
    <div className="min-h-[calc(100vh-48px)] bg-[#F9FAFB] px-4 py-10">
      <div className="mx-auto w-full max-w-2xl">
        {notice}
        <div className="overflow-hidden rounded-xl border border-[#E5E7EB] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
          <div className="border-b border-[#E5E7EB] px-6 py-5">
            <p className="mp-body-sm text-[#4B5563]">{`สวัสดี คุณ${greetingName}`}</p>
            <h1 className="mp-headline mt-1 text-[#111827]">{user.displayName}</h1>
            <p className="mp-body mt-1 text-[#4B5563]">
              {user.role === "admin" ? "ผู้ดูแลระบบ" : "ผู้ใช้งาน"} · บัญชี กปภ.
            </p>
          </div>

          <div className="p-6">
            <h2 className="mp-overline mb-4 text-[#6B7280]">ข้อมูลบัญชี</h2>
            <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <InfoRow label="ชื่อผู้ใช้ (รหัสพนักงาน)" value={user.username} />
              <InfoRow label="อีเมล" value={user.email || "-"} />
              <InfoRow label="ตำแหน่ง" value={user.title || "-"} />
              <InfoRow label="ระดับ" value={user.level || "-"} />
              <InfoRow label="หน่วยงาน" value={unit || "-"} />
              <InfoRow label="กอง / ฝ่าย" value={user.division || "-"} />
              <InfoRow label="สายงาน" value={user.company || "-"} />
              <InfoRow label="รหัสเขตธุรกิจ (BA)" value={user.businessArea || "-"} />
              <InfoRow label="ศูนย์ต้นทุน" value={user.costCenter || "-"} />
              {user.nameEn ? <InfoRow label="ชื่อภาษาอังกฤษ" value={user.nameEn} /> : null}
              {user.phone ? <InfoRow label="เบอร์โทร" value={user.phone} /> : null}
              <InfoRow label="เข้าสู่ระบบล่าสุด" value={formatThaiDateTime(user.lastLogin)} />
              <InfoRow label="สถานะการอนุมัติ" value={APPROVAL_LABELS[user.approvalStatus] ?? user.approvalStatus} />
              <InfoRow label="สถานะบัญชี" value={user.isActive ? "ใช้งานอยู่" : "ถูกระงับ"} />
            </dl>
          </div>

          <div className="border-t border-[#E5E7EB] p-6">
            <h2 className="mp-overline mb-3 text-[#6B7280]">บทบาท (RBAC) ที่ได้รับ</h2>
            {assigned.length > 0 ? (
              <ul className="flex flex-wrap gap-1.5">
                {assigned.map((r) => (
                  <li
                    key={r.name}
                    className="rounded-full bg-[#EFF6FF] px-2.5 py-0.5 text-[12px] font-medium text-[#1D4ED8]"
                  >
                    {r.name}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mp-body-sm text-[#6B7280]">ยังไม่ได้รับมอบหมายบทบาท</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-0.5">
      <dt className="mp-caption text-[#6B7280]">{label}</dt>
      <dd className="mp-body break-words font-medium text-[#111827]">{value}</dd>
    </div>
  );
}
