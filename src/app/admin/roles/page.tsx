import { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { RoleManagement } from "./role-management";

export const metadata: Metadata = {
  title: "จัดการบทบาท | PWA Login",
  description: "จัดการบทบาทและสิทธิ์ของระบบ",
};

export default async function RolesPage() {
  const session = await getSession();

  if (!session?.user) {
    redirect("/login?from=/admin/roles");
  }

  if (session.user.role !== "admin") {
    redirect("/profile?error=forbidden");
  }

  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6">
      <div className="mb-6">
        <h1
          className="mp-headline text-[#111827]"
        >
          จัดการบทบาท
        </h1>
        <p className="mp-body mt-1 text-[#4B5563]">
          จัดการบทบาทและสิทธิ์ของระบบ
        </p>
      </div>
      <RoleManagement />
    </div>
  );
}
