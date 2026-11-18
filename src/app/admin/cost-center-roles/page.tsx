import { asc } from "drizzle-orm";
import { Metadata } from "next";
import { redirect } from "next/navigation";

import CostCenterRolesManager from "@/components/cost-center-roles-manager";
import { roles } from "@/db/schema";
import { listCostCenterRoles, listCostCenters } from "@/lib/cost-centers/admin";
import { db } from "@/lib/db";
import { getValidSessionUser } from "@/lib/session";
import type { AppDb } from "@/lib/users/sync";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const metadata: Metadata = {
  title: "บทบาทตามศูนย์ต้นทุน | PWA Login",
  description: "กำหนดบทบาทให้พนักงานอัตโนมัติตามศูนย์ต้นทุน",
};

async function safely<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    console.error("Error loading cost center roles page data:", error instanceof Error ? error.name : typeof error);
    return fallback;
  }
}

export default async function CostCenterRolesPage() {
  const user = await getValidSessionUser();
  if (!user) redirect("/login?from=/admin/cost-center-roles");
  // The admin layout re-checks the principal in the DB; this is the cookie-level guard.
  if (user.role !== "admin") redirect("/profile?error=forbidden");

  const conn = db as unknown as AppDb;
  const [mappings, costCenters, roleRows] = await Promise.all([
    safely(() => listCostCenterRoles(conn), []),
    safely(() => listCostCenters(conn), []),
    safely(
      () => db.select({ id: roles.id, name: roles.name, isActive: roles.isActive }).from(roles).orderBy(asc(roles.name)),
      [],
    ),
  ]);

  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6">
      <div className="mb-6">
        <h1 className="mp-headline text-[#111827]">บทบาทตามศูนย์ต้นทุน</h1>
        <p className="mp-body mt-1 text-[#4B5563]">
          พนักงานที่เข้าผ่าน SSO จะได้บทบาทตามศูนย์ต้นทุนของตนโดยอัตโนมัติ (รหัสต้องตรงทั้งรหัส)
          มีผลเมื่อผู้ใช้เข้าสู่ระบบครั้งถัดไป บทบาทที่ไม่ได้ผูกไว้ที่นี่ผู้ดูแลกำหนดเองได้ตามปกติ
        </p>
      </div>
      <CostCenterRolesManager initialMappings={mappings} costCenters={costCenters} roles={roleRows} />
    </div>
  );
}
