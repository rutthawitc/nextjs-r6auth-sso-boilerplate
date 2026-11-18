"use client";

import { useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAdminMutation } from "@/hooks/use-admin-mutation";
import { formatThaiDate } from "@/lib/format";
import { Role } from "./types";

interface RoleTableProps {
  roles: Role[];
  onEdit: (role: Role) => void;
  onRefresh: () => void;
}

export function RoleTable({ roles, onEdit, onRefresh }: RoleTableProps) {
  const [deleteRole, setDeleteRole] = useState<Role | null>(null);

  const deleteMutation = useAdminMutation(
    async (role: Role) => {
      const response = await fetch(`/api/admin/roles/${role.id}`, { method: "DELETE" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "ไม่สามารถลบบทบาทได้");
      return payload;
    },
    { queryKey: ["admin-roles"], errorMessage: "ไม่สามารถลบบทบาทได้" }
  );

  const toggleActiveMutation = useAdminMutation(
    async (roleId: string) => {
      const response = await fetch(`/api/admin/roles/${roleId}/toggle-active`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "ไม่สามารถเปลี่ยนสถานะบทบาทได้");
      return payload;
    },
    { queryKey: ["admin-roles"], errorMessage: "ไม่สามารถเปลี่ยนสถานะบทบาทได้" }
  );

  const handleToggleActive = async (role: Role) => {
    try {
      await toggleActiveMutation.mutateAsync(role.id);
      onRefresh();
    } catch {
      // The hook exposes the message as toggleActiveMutation.error.
    }
  };

  const handleDelete = async () => {
    if (!deleteRole) return;
    try {
      await deleteMutation.mutateAsync(deleteRole);
      setDeleteRole(null);
      onRefresh();
    } catch {
      // The hook exposes the message as deleteMutation.error.
    }
  };

  const actionError = toggleActiveMutation.error;

  return (
    <>
      {actionError ? (
        <p className="mp-body-sm border-b border-[#FECACA] bg-[#FEF2F2] px-5 py-2 text-[#991B1B]" role="alert">
          {actionError}
        </p>
      ) : null}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[820px]">
          <thead>
            <tr className="border-b border-[#E5E7EB] bg-[#F9FAFB]">
              {["ชื่อ", "คำอธิบาย", "สิทธิ์", "ระดับ", "สถานะ", "สร้างเมื่อ", "ดำเนินการ"].map((col, i) => (
                <th
                  key={col}
                  className={`px-4 py-2.5 text-[12px] font-semibold text-[#4B5563] ${i === 6 ? "text-right" : "text-left"}`}
                  style={{ fontFamily: "var(--font-space-grotesk), var(--font-thai), system-ui, sans-serif" }}
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#F3F4F6]">
            {roles.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center">
                  <p className="mp-body text-[#6B7280]">ยังไม่มีบทบาท</p>
                </td>
              </tr>
            ) : (
              roles.map((role) => (
                <tr key={role.id} className="transition-colors hover:bg-[#F9FAFB]">
                  <td className="px-4 py-3">
                    <span className="mp-body font-medium text-[#111827]">{role.name}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="mp-body text-[#4B5563]">{role.description || "-"}</span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {role.permissions.length === 0 ? (
                        <span className="mp-caption text-[#6B7280]">ไม่มี</span>
                      ) : (
                        <>
                          {role.permissions.slice(0, 2).map((perm) => (
                            <span
                              key={perm}
                              className="inline-flex items-center rounded-md bg-[#F3F4F6] px-1.5 py-0.5 text-[11px] font-medium text-[#4B5563]"
                            >
                              {perm}
                            </span>
                          ))}
                          {role.permissions.length > 2 && (
                            <span className="mp-caption text-[#6B7280]">
                              +{role.permissions.length - 2}
                            </span>
                          )}
                        </>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="mp-badge mp-badge-blue">
                      {role.level}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleToggleActive(role)}
                        disabled={toggleActiveMutation.isPending}
                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B82F6] focus-visible:ring-offset-2 disabled:opacity-50 ${
                          role.isActive ? "bg-[#3B82F6]" : "bg-[#D1D5DB]"
                        }`}
                        aria-label={role.isActive ? "ปิดใช้งานบทบาท" : "เปิดใช้งานบทบาท"}
                      >
                        <span
                          className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm transition-transform ${
                            role.isActive ? "translate-x-[18px]" : "translate-x-0.5"
                          }`}
                        />
                      </button>
                      <span
                        className={`mp-caption font-semibold ${
                          role.isActive ? "text-[#065F46]" : "text-[#6B7280]"
                        }`}
                      >
                        {role.isActive ? "ใช้งานอยู่" : "ปิดใช้งาน"}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="mp-caption text-[#4B5563]">
                      {formatThaiDate(role.createdAt)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => onEdit(role)}
                      className="text-[#6B7280]"
                      title="แก้ไขบทบาท"
                      aria-label={`แก้ไขบทบาท ${role.name}`}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => setDeleteRole(role)}
                      className="text-[#6B7280] hover:text-[#DC2626] hover:bg-[#FEF2F2]"
                      title="ลบบทบาท" aria-label={`ลบบทบาท ${role.name}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Delete confirmation modal */}
      {deleteRole && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
          <div role="dialog" aria-modal="true" aria-labelledby="delete-role-title" className="w-full max-w-sm rounded-2xl border border-[#E5E7EB] bg-white p-6 shadow-[0_8px_24px_rgba(0,0,0,0.08),0_2px_8px_rgba(0,0,0,0.04)]">
            <h3 id="delete-role-title" className="mp-subhead text-[#111827] mb-2">ลบบทบาท</h3>
            <p className="mp-body text-[#4B5563] mb-6">
              ต้องการลบบทบาท <strong className="text-[#111827]">{deleteRole.name}</strong> ใช่หรือไม่?
              การดำเนินการนี้ไม่สามารถย้อนกลับได้
            </p>
            {deleteMutation.error ? (
              <p className="mp-body-sm mb-4 text-[#991B1B]" role="alert">
                {deleteMutation.error}
              </p>
            ) : null}
            <div className="flex justify-end gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  deleteMutation.setError(null);
                  setDeleteRole(null);
                }}
              >
                ยกเลิก
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={handleDelete}
                disabled={deleteMutation.isPending}
              >
                {deleteMutation.isPending ? "กำลังลบ..." : "ลบ"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
