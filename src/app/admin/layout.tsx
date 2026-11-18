import { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getValidSessionUser } from "@/lib/session";
import { loadCurrentPrincipal } from "@/lib/auth/principal";
import { Users, Shield, User, Settings, UserRoundCog, Network } from "lucide-react";
import { db } from "@/lib/db";
import { users } from "@/db/schema";
import { and, eq, count } from "drizzle-orm";

interface AdminLayoutProps {
  children: ReactNode;
}

export default async function AdminLayout({ children }: AdminLayoutProps) {
  const sessionUser = await getValidSessionUser();

  if (!sessionUser) {
    redirect("/login?from=/admin");
  }

  if (sessionUser.role !== "admin") {
    redirect("/profile?error=forbidden");
  }

  // The cookie can be stale: re-check the account against the database.
  const principal = await loadCurrentPrincipal(sessionUser);
  if (!principal.ok) {
    redirect(principal.status === 401 ? "/login?from=/admin" : "/profile?error=forbidden");
  }

  // Fetch pending users count
  const pendingResult = await db.select({ count: count() }).from(users).where(and(eq(users.accountType, "sso"), eq(users.approvalStatus, "pending")));
  const pendingCount = pendingResult[0]?.count ?? 0;

  return (
    <div className="min-h-[calc(100vh-48px)] bg-[#F9FAFB]">
      {/* Admin sub-nav */}
      <div className="border-b border-[#E5E7EB] bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-3 sm:px-6 h-11 overflow-x-auto">
          <div className="flex items-center gap-0.5 whitespace-nowrap">
            <span
              className="mr-4 shrink-0 text-[13px] font-semibold text-[#111827]"
              style={{ fontFamily: "var(--font-space-grotesk), var(--font-thai), system-ui, sans-serif" }}
            >
              ผู้ดูแลระบบ
            </span>
            <Link
              href="/admin/users"
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[13px] font-medium text-[#6B7280] transition-colors hover:bg-[#F3F4F6] hover:text-[#111827]"
            >
              <Users className="h-3.5 w-3.5" />
              ผู้ใช้
              {pendingCount > 0 && (
                <span aria-label={`รออนุมัติ ${pendingCount} คน`} className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-[#DC2626] px-1 text-[10px] font-bold text-white">
                  {pendingCount}
                </span>
              )}
            </Link>
            <Link
              href="/admin/contractors"
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[13px] font-medium text-[#6B7280] transition-colors hover:bg-[#F3F4F6] hover:text-[#111827]"
            >
              <UserRoundCog className="h-3.5 w-3.5" />
              ลูกจ้าง
            </Link>
            <Link
              href="/admin/roles"
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[13px] font-medium text-[#6B7280] transition-colors hover:bg-[#F3F4F6] hover:text-[#111827]"
            >
              <Shield className="h-3.5 w-3.5" />
              บทบาท
            </Link>
            <Link
              href="/admin/cost-center-roles"
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[13px] font-medium text-[#6B7280] transition-colors hover:bg-[#F3F4F6] hover:text-[#111827]"
            >
              <Network className="h-3.5 w-3.5" />
              บทบาทตามศูนย์ต้นทุน
            </Link>
            <Link
              href="/admin/settings"
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[13px] font-medium text-[#6B7280] transition-colors hover:bg-[#F3F4F6] hover:text-[#111827]"
            >
              <Settings className="h-3.5 w-3.5" />
              ตั้งค่า
            </Link>
          </div>
          <Link
            href="/profile"
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[13px] font-medium text-[#6B7280] transition-colors hover:bg-[#F3F4F6] hover:text-[#111827]"
          >
            <User className="h-3.5 w-3.5" />
            โปรไฟล์
          </Link>
        </div>
      </div>

      <main className="py-8">
        {children}
      </main>
    </div>
  );
}
