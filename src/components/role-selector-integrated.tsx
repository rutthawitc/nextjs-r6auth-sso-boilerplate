"use client";

import { useQuery } from "@tanstack/react-query";

interface Role {
  id: string;
  name: string;
  description: string | null;
  permissions: string[];
  level: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface RoleSelectorIntegratedProps {
  userLabel?: string;
  currentRoleId?: string;
  onChange: (roleId: string) => void;
  disabled?: boolean;
  isLoading?: boolean;
}

async function fetchRoles(): Promise<Role[]> {
  const response = await fetch("/api/admin/roles");
  if (!response.ok) throw new Error("ไม่สามารถโหลดรายการบทบาทได้");
  const data = await response.json();
  return data.roles || [];
}

export default function RoleSelectorIntegrated({
  userLabel,
  currentRoleId,
  onChange,
  disabled,
  isLoading,
}: RoleSelectorIntegratedProps) {
  const { data: roles = [], isLoading: rolesLoading } = useQuery({
    queryKey: ["admin-roles-selector"],
    queryFn: fetchRoles,
  });

  const effectiveRole = roles.find((role) => role.id === currentRoleId);
  const availableRoles = roles.filter((role) => role.isActive);

  return (
    <div className="inline-flex items-center gap-2">
      <select
        aria-label={userLabel ? `บทบาทของ ${userLabel}` : "บทบาท"}
        className="h-8 rounded-lg border border-[#E5E7EB] bg-white px-2 py-0 text-[13px] text-[#111827] shadow-[0_1px_2px_rgba(0,0,0,0.04)] outline-none transition-[border-color,box-shadow] focus:border-[#3B82F6] focus:ring-2 focus:ring-[#3B82F6]/20 disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-[#F9FAFB]"
        value={currentRoleId ?? ""}
        disabled={disabled || rolesLoading || availableRoles.length === 0}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">{rolesLoading ? "กำลังโหลด..." : "เลือกบทบาท"}</option>
        {availableRoles.map((role) => (
          <option key={role.id} value={role.id}>
            {role.name} (L{role.level})
          </option>
        ))}
      </select>
      {isLoading ? <span className="mp-caption text-[#6B7280]">กำลังบันทึก...</span> : null}
      {effectiveRole && (
        <span className="mp-badge mp-badge-neutral">{effectiveRole.permissions.length} สิทธิ์</span>
      )}
    </div>
  );
}
