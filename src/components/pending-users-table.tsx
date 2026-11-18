"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, XCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { formatThaiDate } from "@/lib/format";
import type { PendingUser } from "@/lib/users/admin-list";

interface PendingUsersTableProps {
  initialPendingUsers: PendingUser[];
}

const HEADERS = ["ชื่อ", "หน่วยงาน", "ตำแหน่ง", "ลงทะเบียนเมื่อ", "ดำเนินการ"];

export default function PendingUsersTable({ initialPendingUsers }: PendingUsersTableProps) {
  const [pendingUsers, setPendingUsers] = useState<PendingUser[]>(initialPendingUsers);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const decide = useMutation({
    mutationFn: async ({ userId, action }: { userId: string; action: "approve" | "reject" }) => {
      const response = await fetch(`/api/admin/users/${userId}/${action}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
      });
      if (!response.ok) {
        throw new Error(action === "approve" ? "ไม่สามารถอนุมัติผู้ใช้ได้" : "ไม่สามารถปฏิเสธผู้ใช้ได้");
      }
      return response.json();
    },
    onSuccess: (_, { userId }) => {
      setPendingUsers((prev) => prev.filter((u) => u.id !== userId));
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
    },
    onError: (err: unknown) => {
      setError(err instanceof Error ? err.message : "เกิดข้อผิดพลาด");
    },
    onSettled: () => setLoadingId(null),
  });

  const handle = (user: PendingUser, action: "approve" | "reject") => {
    if (action === "reject" && !window.confirm(`ปฏิเสธคำขอของ ${user.displayName} ใช่หรือไม่?`)) {
      return;
    }
    setError(null);
    setLoadingId(user.id);
    decide.mutate({ userId: user.id, action });
  };

  if (pendingUsers.length === 0 && !error) {
    return null;
  }

  return (
    <div className="mb-6 overflow-hidden rounded-xl border border-[#FDE68A] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
      <div className="flex items-center gap-3 border-b border-[#FDE68A] bg-[#FFFBEB] px-5 py-3.5">
        <span className="inline-flex h-2 w-2 rounded-full bg-[#F59E0B]" aria-hidden="true" />
        <div>
          <h2 className="mp-subhead text-[#111827]">รออนุมัติ</h2>
          <p className="mp-caption text-[#92400E]">มี {pendingUsers.length} คนรอการอนุมัติ</p>
        </div>
      </div>

      {error ? (
        <p className="mp-body-sm border-b border-[#FECACA] bg-[#FEF2F2] px-5 py-2 text-[#991B1B]" role="alert">
          {error}
        </p>
      ) : null}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px]">
          <thead>
            <tr className="border-b border-[#E5E7EB] bg-[#F9FAFB]">
              {HEADERS.map((col, i) => (
                <th
                  key={col}
                  scope="col"
                  className={`px-4 py-2.5 text-[12px] font-semibold text-[#4B5563] ${i === HEADERS.length - 1 ? "text-right" : "text-left"}`}
                  style={{ fontFamily: "var(--font-space-grotesk), var(--font-thai), system-ui, sans-serif" }}
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#F3F4F6]">
            {pendingUsers.map((user) => (
              <tr key={user.id} className="align-top transition-colors hover:bg-[#F9FAFB]">
                <td className="px-4 py-3">
                  <p className="mp-body font-medium text-[#111827]">{user.displayName}</p>
                  <p className="mp-caption text-[#4B5563]">{user.username}</p>
                  {user.email && <p className="mp-caption text-[#4B5563]">{user.email}</p>}
                </td>
                <td className="px-4 py-3">
                  <span className="mp-body text-[#374151]">{user.unit || "-"}</span>
                </td>
                <td className="px-4 py-3">
                  <span className="mp-body text-[#374151]">{user.title || "-"}</span>
                </td>
                <td className="px-4 py-3">
                  <span className="mp-caption text-[#4B5563]">{formatThaiDate(user.createdAt)}</span>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex justify-end gap-2">
                    <Button
                      onClick={() => handle(user, "approve")}
                      disabled={loadingId === user.id}
                      size="sm"
                      className="bg-[#059669] text-white hover:bg-[#047857]"
                      aria-label={`อนุมัติ ${user.displayName}`}
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      {loadingId === user.id ? "..." : "อนุมัติ"}
                    </Button>
                    <Button
                      onClick={() => handle(user, "reject")}
                      disabled={loadingId === user.id}
                      size="sm"
                      variant="destructive"
                      aria-label={`ปฏิเสธ ${user.displayName}`}
                    >
                      <XCircle className="h-3.5 w-3.5" />
                      {loadingId === user.id ? "..." : "ปฏิเสธ"}
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
