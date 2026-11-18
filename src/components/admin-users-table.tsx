"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";

import ActiveStatusToggle from "@/components/active-status-toggle";
import RoleSelectorIntegrated from "@/components/role-selector-integrated";
import { useAdminMutation } from "@/hooks/use-admin-mutation";
import { formatThaiDateTime } from "@/lib/format";
import { calculateUserStats, isUserRowUpdating } from "@/lib/user-utils";

export type AdminUser = {
  id: string;
  username: string;
  displayName: string;
  email: string | null;
  title: string | null;
  unit: string | null;
  businessArea: string | null;
  costCenter: string | null;
  costCenterName: string | null;
  role: "admin" | "user";
  lastLogin: string | null;
  isActive: boolean;
  assignedRoles: Array<{
    id: string;
    name: string;
    level: number;
  }>;
  primaryRoleId: string | null;
  primaryRoleName: string | null;
  primaryRoleLevel: number | null;
};

type Props = {
  initialUsers: AdminUser[];
  currentUserId: string;
};

const ADMIN_USERS_QUERY_KEY = ["admin-users"];

export function matchesUserSearch(user: AdminUser, term: string): boolean {
  const q = term.trim().toLowerCase();
  if (!q) return true;
  return [user.username, user.displayName, user.unit, user.email, user.costCenter, user.costCenterName].some((v) =>
    (v ?? "").toLowerCase().includes(q),
  );
}

const HEADERS = ["ชื่อ", "หน่วยงาน", "ตำแหน่ง", "BA / ศูนย์ต้นทุน", "บทบาท (role)", "สถานะ", "เข้าสู่ระบบล่าสุด"];

export default function AdminUsersTable({ initialUsers, currentUserId }: Props) {
  const [search, setSearch] = useState("");

  const usersQuery = useQuery({
    queryKey: ADMIN_USERS_QUERY_KEY,
    queryFn: fetchAdminUsers,
    initialData: initialUsers,
    placeholderData: initialUsers.length > 0 ? initialUsers : undefined,
  });

  const stats = useMemo(() => {
    return usersQuery.data ? calculateUserStats(usersQuery.data) : { totalUsers: 0, totalAdmins: 0, activeUsers: 0 };
  }, [usersQuery.data]);

  const filtered = useMemo(
    () => (usersQuery.data ?? []).filter((u) => matchesUserSearch(u, search)),
    [usersQuery.data, search],
  );

  const updateRole = useAdminMutation(
    async (variables: { userId: string; roleId: string }) => {
      const response = await fetch(`/api/admin/users/${variables.userId}/roles`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roleId: variables.roleId }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "ไม่สามารถเปลี่ยนบทบาทได้");
      return payload;
    },
    { queryKey: ADMIN_USERS_QUERY_KEY, errorMessage: "ไม่สามารถเปลี่ยนบทบาทได้" }
  );

  const updateActiveStatus = useAdminMutation(
    async (variables: { userId: string; isActive: boolean }) => {
      const response = await fetch(`/api/admin/users/${variables.userId}/active`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: variables.isActive }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "ไม่สามารถเปลี่ยนสถานะการใช้งานได้");
      return variables;
    },
    { queryKey: ADMIN_USERS_QUERY_KEY, errorMessage: "ไม่สามารถเปลี่ยนสถานะการใช้งานได้" }
  );

  const handleRoleChange = (userId: string, roleId: string) => {
    updateRole.setError(null);
    updateRole.mutate({ userId, roleId });
  };

  const handleActiveStatusChange = (userId: string, isActive: boolean) => {
    updateActiveStatus.setError(null);
    updateActiveStatus.mutate({ userId, isActive });
  };

  const mutationError = updateRole.error || updateActiveStatus.error;

  return (
    <section className="overflow-hidden rounded-xl border border-[#E5E7EB] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
      <div className="flex flex-col gap-3 border-b border-[#E5E7EB] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="mp-subhead text-[#111827]">ผู้ใช้งาน</h2>
          <p className="mp-caption mt-0.5 text-[#4B5563]">
            ทั้งหมด {stats.totalUsers} &middot; ผู้ดูแลระบบ {stats.totalAdmins} &middot; ใช้งานอยู่ {stats.activeUsers}
          </p>
        </div>
        <div className="relative w-full sm:w-72">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6B7280]"
          />
          <label htmlFor="user-search" className="sr-only">
            ค้นหาผู้ใช้
          </label>
          <input
            id="user-search"
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ค้นหาชื่อ รหัส หน่วยงาน อีเมล หรือศูนย์ต้นทุน"
            autoComplete="off"
            spellCheck={false}
            className="h-9 w-full rounded-xl border border-[#E5E7EB] bg-white pl-9 pr-3 text-[14px] text-[#111827] placeholder:text-[#6B7280] shadow-[0_1px_2px_rgba(0,0,0,0.04)] outline-none focus:border-[#3B82F6] focus:ring-2 focus:ring-[#3B82F6]/20"
          />
        </div>
      </div>

      {mutationError ? (
        <p className="mp-body-sm border-b border-[#FECACA] bg-[#FEF2F2] px-5 py-2 text-[#991B1B]" role="alert">
          {mutationError}
        </p>
      ) : usersQuery.isError ? (
        <p className="mp-body-sm border-b border-[#FECACA] bg-[#FEF2F2] px-5 py-2 text-[#991B1B]" role="alert">
          {usersQuery.error instanceof Error ? usersQuery.error.message : "ไม่สามารถโหลดรายชื่อผู้ใช้ได้"}
        </p>
      ) : null}

      {usersQuery.isLoading && initialUsers.length === 0 ? (
        <div className="px-5 py-10 text-center">
          <p className="mp-body text-[#6B7280]">กำลังโหลดรายชื่อผู้ใช้...</p>
        </div>
      ) : !usersQuery.data || usersQuery.data.length === 0 ? (
        <div className="mx-5 my-6 rounded-xl border border-dashed border-[#E5E7EB] bg-[#F9FAFB] px-4 py-10 text-center">
          <p className="mp-body text-[#6B7280]">
            ยังไม่มีผู้ใช้ ผู้ใช้จะปรากฏหลังจากเข้าสู่ระบบครั้งแรก
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="px-5 py-10 text-center">
          <p className="mp-body text-[#6B7280]">ไม่พบผู้ใช้ที่ตรงกับ &ldquo;{search}&rdquo;</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-[960px] w-full">
            <thead>
              <tr className="border-b border-[#E5E7EB] bg-[#F9FAFB]">
                {HEADERS.map((col) => (
                  <th
                    key={col}
                    scope="col"
                    className="px-4 py-2.5 text-left text-[12px] font-semibold text-[#4B5563]"
                    style={{ fontFamily: "var(--font-space-grotesk), var(--font-thai), system-ui, sans-serif" }}
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F3F4F6]">
              {filtered.map((user) => {
                const isCurrent = user.id === currentUserId;
                const isUpdatingCurrentRow = isUserRowUpdating(
                  user.id,
                  currentUserId,
                  updateRole.isPending,
                  updateRole.variables?.userId,
                  updateActiveStatus.isPending,
                  updateActiveStatus.variables?.userId
                );
                return (
                  <tr key={user.id} className="align-top transition-colors hover:bg-[#F9FAFB]">
                    <td className="px-4 py-3">
                      <p className="mp-body font-medium text-[#111827]">{user.displayName}</p>
                      <p className="mp-caption text-[#4B5563]">{user.username}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className="mp-body text-[#374151]">{user.unit ?? "-"}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="mp-body text-[#374151]">{user.title ?? "-"}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="mp-body text-[#374151]">{user.businessArea ?? "-"}</span>
                      <p className="mp-caption text-[#4B5563]">
                        {user.costCenter ? [user.costCenter, user.costCenterName].filter(Boolean).join(" · ") : "-"}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-1">
                        <RoleSelectorIntegrated
                          userLabel={user.displayName}
                          currentRoleId={user.primaryRoleId || undefined}
                          onChange={(roleId) => handleRoleChange(user.id, roleId)}
                          disabled={isUpdatingCurrentRow}
                          isLoading={isUpdatingCurrentRow}
                        />
                        {user.assignedRoles.length > 1 && (
                          <span className="mp-caption text-[#4B5563]">
                            +{user.assignedRoles.length - 1} บทบาทอื่น
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <ActiveStatusToggle
                        label={user.displayName}
                        isActive={user.isActive}
                        onChange={(isActive) => handleActiveStatusChange(user.id, isActive)}
                        disabled={isCurrent || updateActiveStatus.isPending}
                        isLoading={
                          updateActiveStatus.isPending &&
                          updateActiveStatus.variables?.userId === user.id
                        }
                      />
                    </td>
                    <td className="px-4 py-3">
                      <span className="mp-caption text-[#4B5563]">{formatThaiDateTime(user.lastLogin)}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

async function fetchAdminUsers(): Promise<AdminUser[]> {
  const response = await fetch("/api/admin/users", { cache: "no-store" });
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(payload?.error ?? "ไม่สามารถโหลดรายชื่อผู้ใช้ได้ กรุณาลองใหม่ภายหลัง");
  }

  const data = payload as { users?: AdminUser[] };
  return data.users ?? [];
}
