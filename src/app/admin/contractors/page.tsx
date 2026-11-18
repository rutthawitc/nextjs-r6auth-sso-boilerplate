import { Metadata } from "next";
import { redirect } from "next/navigation";

import ContractorsTable from "@/components/contractors-table";
import { listAssignableRoles, listContractors } from "@/lib/contractors/admin";
import { getValidSessionUser } from "@/lib/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const metadata: Metadata = {
  title: "จัดการลูกจ้าง | PWA Login",
  description: "จัดการบัญชีลูกจ้าง สัญญา และรหัสผ่าน",
};

async function safely<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    console.error("Error loading admin contractors page data:", error instanceof Error ? error.name : typeof error);
    return fallback;
  }
}

export default async function AdminContractorsPage() {
  const user = await getValidSessionUser();

  if (!user) {
    redirect("/login?from=/admin/contractors");
  }

  // The admin layout re-checks the principal in the DB; this is the cookie-level guard, as on /admin/users.
  if (user.role !== "admin") {
    redirect("/profile?error=forbidden");
  }

  const [contractors, assignableRoles] = await Promise.all([
    safely(() => listContractors(), []),
    safely(() => listAssignableRoles(), []),
  ]);

  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6">
      <div className="mb-6">
        <h1 className="mp-headline text-[#111827]">จัดการลูกจ้าง</h1>
        <p className="mp-body mt-1 text-[#4B5563]">
          บัญชีลูกจ้างเข้าสู่ระบบด้วยรหัสลูกจ้าง ใช้งานได้เฉพาะในช่วงสัญญา และต้องเปลี่ยนรหัสผ่านเมื่อเข้าครั้งแรก
        </p>
      </div>
      <ContractorsTable initialContractors={contractors} assignableRoles={assignableRoles} />
    </div>
  );
}
