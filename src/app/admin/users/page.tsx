import { Metadata } from "next";
import { redirect } from "next/navigation";

import AdminUsersTable from "@/components/admin-users-table";
import PendingUsersTable from "@/components/pending-users-table";
import { getValidSessionUser } from "@/lib/session";
import { listAdminUsers, listPendingUsers } from "@/lib/users/admin-list";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "จัดการผู้ใช้ | PWA Login",
  description: "จัดการบัญชีผู้ใช้และบทบาท",
};

async function safely<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    console.error("Error loading admin users page data:", error instanceof Error ? error.name : typeof error);
    return fallback;
  }
}

export default async function AdminUsersPage() {
  const user = await getValidSessionUser();

  if (!user) {
    redirect("/login?from=/admin/users");
  }

  if (user.role !== "admin") {
    redirect("/profile?error=forbidden");
  }

  const [initialUsers, pendingUsers] = await Promise.all([
    safely(listAdminUsers, []),
    safely(listPendingUsers, []),
  ]);

  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6">
      <div className="mb-6">
        <h1 className="mp-headline text-[#111827]">จัดการผู้ใช้</h1>
        <p className="mp-body mt-1 text-[#4B5563]">จัดการบัญชีผู้ใช้ บทบาท และสิทธิ์การเข้าถึง</p>
      </div>
      <PendingUsersTable initialPendingUsers={pendingUsers} />
      <AdminUsersTable initialUsers={initialUsers} currentUserId={user.id} />
    </div>
  );
}
