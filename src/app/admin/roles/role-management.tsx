"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RoleTable } from "./role-table";
import { RoleForm } from "./role-form";
import { Role } from "./types";

async function fetchRoles(): Promise<Role[]> {
  const response = await fetch("/api/admin/roles");
  if (!response.ok) throw new Error("ไม่สามารถโหลดรายการบทบาทได้");
  const data = await response.json();
  return data.roles || [];
}

export function RoleManagement() {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<Role | null>(null);

  const { data: roles = [], isLoading, error, refetch } = useQuery({
    queryKey: ["admin-roles"],
    queryFn: fetchRoles,
  });

  const handleAddRole = () => {
    setEditingRole(null);
    setIsFormOpen(true);
  };

  const handleEditRole = (role: Role) => {
    setEditingRole(role);
    setIsFormOpen(true);
  };

  const handleFormClose = () => {
    setIsFormOpen(false);
    setEditingRole(null);
  };

  const handleFormSuccess = () => {
    handleFormClose();
    refetch();
  };

  if (isLoading) {
    return (
      <section className="rounded-xl border border-[#E5E7EB] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04)] overflow-hidden">
        <div className="flex items-center justify-between border-b border-[#E5E7EB] px-5 py-4">
          <div>
            <h2 className="mp-subhead text-[#111827]">บทบาท</h2>
            <p className="mp-caption mt-0.5 text-[#4B5563]">กำลังโหลด...</p>
          </div>
          <Button size="sm" disabled>
            <Plus className="h-3.5 w-3.5" />
            เพิ่มบทบาท
          </Button>
        </div>
        <div className="space-y-2 p-5">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-9 animate-pulse rounded-lg bg-[#F3F4F6]" />
          ))}
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="rounded-xl border border-[#E5E7EB] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04)] overflow-hidden">
        <div className="flex items-center justify-between border-b border-[#E5E7EB] px-5 py-4">
          <div>
            <h2 className="mp-subhead text-[#111827]">บทบาท</h2>
            <p className="mp-caption mt-0.5 text-[#EF4444]">โหลดบทบาทไม่สำเร็จ</p>
          </div>
          <Button size="sm" onClick={handleAddRole}>
            <Plus className="h-3.5 w-3.5" />
            เพิ่มบทบาท
          </Button>
        </div>
        <div className="px-5 py-6">
          <p className="mp-body text-[#EF4444]">ไม่สามารถโหลดรายการบทบาทได้ กรุณาลองใหม่</p>
        </div>
      </section>
    );
  }

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-[#E5E7EB] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04)] overflow-hidden">
        <div className="flex items-center justify-between border-b border-[#E5E7EB] px-5 py-4">
          <div>
            <h2 className="mp-subhead text-[#111827]">บทบาท ({roles.length})</h2>
            <p className="mp-caption mt-0.5 text-[#4B5563]">จัดการบทบาทและสิทธิ์ของระบบ</p>
          </div>
          <Button size="sm" onClick={handleAddRole}>
            <Plus className="h-3.5 w-3.5" />
            เพิ่มบทบาท
          </Button>
        </div>
        <RoleTable
          roles={roles}
          onEdit={handleEditRole}
          onRefresh={refetch}
        />
      </section>

      {isFormOpen && (
        <RoleForm
          role={editingRole}
          onClose={handleFormClose}
          onSuccess={handleFormSuccess}
        />
      )}
    </div>
  );
}
