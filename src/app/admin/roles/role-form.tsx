"use client";

import { useState } from "react";
import { X, CheckCircle, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAdminMutation } from "@/hooks/use-admin-mutation";
import { Role, CreateRoleData, UpdateRoleData } from "./types";

const AVAILABLE_PERMISSIONS = [
  "users.read",
  "users.write",
  "users.delete",
  "roles.read",
  "roles.write",
  "roles.delete",
  "admin.access",
  "reports.read",
  "reports.write",
  "settings.read",
  "settings.write",
  "api.access",
];

interface RoleFormProps {
  role?: Role | null;
  onClose: () => void;
  onSuccess: () => void;
}

export function RoleForm({ role, onClose, onSuccess }: RoleFormProps) {
  const [formData, setFormData] = useState<CreateRoleData>({
    name: role?.name || "",
    description: role?.description || "",
    permissions: role?.permissions || [],
    level: role?.level || 0,
  });
  const [isActive, setIsActive] = useState(role?.isActive ?? true);
  const [showSuccess, setShowSuccess] = useState(false);
  const [showError, setShowError] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const isEditing = !!role;

  const mutation = useAdminMutation(
    async (data: CreateRoleData | UpdateRoleData) => {
      const url = isEditing ? `/api/admin/roles/${role!.id}` : "/api/admin/roles";
      const method = isEditing ? "PUT" : "POST";
      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "ไม่สามารถบันทึกบทบาทได้");
      return payload;
    },
    { queryKey: ["admin-roles"], errorMessage: "ไม่สามารถบันทึกบทบาทได้" }
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setShowSuccess(false);
    setShowError(false);
    setErrorMessage("");
    const data: CreateRoleData | UpdateRoleData = isEditing ? { ...formData, isActive } : formData;
    try {
      await mutation.mutateAsync(data);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "ไม่สามารถบันทึกบทบาทได้");
      setShowError(true);
      return;
    }
    setShowSuccess(true);
    setTimeout(() => {
      onSuccess();
      onClose();
    }, 1200);
  };

  const handlePermissionToggle = (permission: string) => {
    setFormData(prev => ({
      ...prev,
      permissions: prev.permissions.includes(permission)
        ? prev.permissions.filter(p => p !== permission)
        : [...prev.permissions, permission],
    }));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
      <div role="dialog" aria-modal="true" aria-label={isEditing ? "แก้ไขบทบาท" : "สร้างบทบาท"} className="w-full max-w-lg rounded-2xl border border-[#E5E7EB] bg-white shadow-[0_8px_24px_rgba(0,0,0,0.08),0_2px_8px_rgba(0,0,0,0.04)] max-h-[90vh] overflow-y-auto">
        {/* Success Banner */}
        {showSuccess && (
          <div role="status" className="flex items-center gap-2 border-b border-[#A7F3D0] bg-[#ECFDF5] px-5 py-3">
            <CheckCircle className="h-4 w-4 text-[#10B981] shrink-0" />
            <p className="mp-body-sm text-[#065F46]">
              {isEditing ? "อัปเดตบทบาทแล้ว" : "สร้างบทบาทแล้ว"}
            </p>
          </div>
        )}

        {/* Error Banner */}
        {showError && (
          <div role="alert" className="flex items-center gap-2 border-b border-[#FECACA] bg-[#FEF2F2] px-5 py-3">
            <AlertCircle className="h-4 w-4 text-[#EF4444] shrink-0" />
            <p className="mp-body-sm text-[#991B1B]">
              {errorMessage || "บันทึกบทบาทไม่สำเร็จ กรุณาลองใหม่"}
            </p>
          </div>
        )}

        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#E5E7EB] px-5 py-4">
          <h2
            className="mp-subhead text-[#111827]"
          >
            {isEditing ? "แก้ไขบทบาท" : "สร้างบทบาท"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={mutation.isPending}
            aria-label="ปิด"
            className="flex h-7 w-7 items-center justify-center rounded-full text-[#6B7280] transition-colors hover:bg-[#F3F4F6] hover:text-[#111827] disabled:opacity-50"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5 p-5">
          {/* Role Name */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="name" className="mp-body-sm font-medium text-[#111827]">
              ชื่อบทบาท <span className="text-[#EF4444]">*</span>
            </label>
            <Input
              id="name"
              type="text"
              value={formData.name}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              placeholder="เช่น editor, viewer, manager"
              required
              disabled={mutation.isPending}
            />
          </div>

          {/* Description */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="description" className="mp-body-sm font-medium text-[#111827]">
              คำอธิบาย
            </label>
            <textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
              placeholder="คำอธิบายสั้น ๆ ของบทบาทนี้"
              rows={2}
              disabled={mutation.isPending}
              className="w-full resize-none rounded-xl border border-[#E5E7EB] bg-white px-3 py-2 text-[14px] text-[#111827] placeholder:text-[#9CA3AF] shadow-[0_1px_2px_rgba(0,0,0,0.04)] outline-none transition-[box-shadow,border-color] focus:border-[#3B82F6] focus:ring-2 focus:ring-[#3B82F6]/20 disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>

          {/* Level */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="level" className="mp-body-sm font-medium text-[#111827]">
              ระดับ (level)
            </label>
            <Input
              id="level"
              type="number"
              value={formData.level}
              onChange={(e) => setFormData(prev => ({ ...prev, level: parseInt(e.target.value) || 0 }))}
              placeholder="0"
              min="0"
              max="999"
              disabled={mutation.isPending}
            />
            <p className="mp-caption text-[#4B5563]">ระดับสูงกว่า = อำนาจมากกว่า (0-999)</p>
          </div>

          {/* Active toggle (edit mode only) */}
          {isEditing && (
            <div className="flex items-center gap-3">
              <button
                type="button"
                role="switch"
                aria-checked={isActive}
                aria-label="เปิด/ปิดใช้งานบทบาท"
                onClick={() => setIsActive(!isActive)}
                disabled={mutation.isPending}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B82F6] focus-visible:ring-offset-2 disabled:opacity-50 ${
                  isActive ? "bg-[#3B82F6]" : "bg-[#D1D5DB]"
                }`}
              >
                <span
                  className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm transition-transform ${
                    isActive ? "translate-x-[18px]" : "translate-x-0.5"
                  }`}
                />
              </button>
              <span className="mp-body-sm text-[#111827]">
                บทบาทนี้<strong>{isActive ? "เปิดใช้งาน" : "ปิดใช้งาน"}</strong>
              </span>
            </div>
          )}

          {/* Permissions */}
          <div className="flex flex-col gap-2">
            <span className="mp-body-sm font-medium text-[#111827]">สิทธิ์ (permissions)</span>
            <div className="rounded-xl border border-[#E5E7EB] p-3">
              <div className="grid grid-cols-2 gap-2">
                {AVAILABLE_PERMISSIONS.map((permission) => (
                  <label
                    key={permission}
                    className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-[#F9FAFB]"
                  >
                    <input
                      type="checkbox"
                      checked={formData.permissions.includes(permission)}
                      onChange={() => handlePermissionToggle(permission)}
                      disabled={mutation.isPending}
                      className="h-3.5 w-3.5 rounded border-[#D1D5DB] text-[#3B82F6] accent-[#3B82F6]"
                    />
                    <span className="mp-body-sm text-[#374151]">{permission}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          {/* Selected permissions summary */}
          {formData.permissions.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {formData.permissions.map((permission) => (
                <span
                  key={permission}
                  className="inline-flex items-center rounded-full bg-[#EFF6FF] px-2 py-0.5 text-[11px] font-medium text-[#1D4ED8]"
                >
                  {permission}
                </span>
              ))}
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2 border-t border-[#E5E7EB] pt-4">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={onClose}
              disabled={mutation.isPending || showSuccess}
            >
              ยกเลิก
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={mutation.isPending || !formData.name.trim() || showSuccess}
            >
              {mutation.isPending
                ? isEditing ? "กำลังอัปเดต..." : "กำลังสร้าง..."
                : isEditing ? "อัปเดตบทบาท" : "สร้างบทบาท"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
