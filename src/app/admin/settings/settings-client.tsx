"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";

interface SettingsClientProps {
  currentMode: "allow_new_users" | "must_approve";
}

export default function SettingsClient({ currentMode }: SettingsClientProps) {
  const [mode, setMode] = useState<"allow_new_users" | "must_approve">(currentMode);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const mutation = useMutation({
    mutationFn: async (newMode: "allow_new_users" | "must_approve") => {
      const response = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ registration_mode: newMode }),
      });
      if (!response.ok) throw new Error("ไม่สามารถบันทึกการตั้งค่าได้");
      return response.json();
    },
    onSuccess: () => {
      setMessage({ type: "success", text: "บันทึกการตั้งค่าแล้ว" });
      setTimeout(() => setMessage(null), 3000);
    },
    onError: () => {
      setMessage({ type: "error", text: "ไม่สามารถบันทึกการตั้งค่าได้ กรุณาลองใหม่" });
      setTimeout(() => setMessage(null), 3000);
    },
  });

  const handleSave = async () => {
    if (mode !== currentMode) {
      await mutation.mutateAsync(mode);
    }
  };

  return (
    <div className="rounded-xl border border-[#E5E7EB] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04)] overflow-hidden">
      <div className="border-b border-[#E5E7EB] px-5 py-4">
        <h2
          className="mp-subhead text-[#111827]"
        >
          การลงทะเบียนผู้ใช้ใหม่
        </h2>
        <p className="mp-caption mt-0.5 text-[#4B5563]">
          กำหนดวิธีที่พนักงานที่เข้าผ่าน SSO รายใหม่เข้าใช้งานระบบ
        </p>
      </div>

      <div className="space-y-3 p-5">
        {/* Allow Immediate Access */}
        <label
          className={`flex cursor-pointer items-start gap-3 rounded-xl border-2 p-4 transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[#3B82F6] ${
            mode === "allow_new_users"
              ? "border-[#3B82F6] bg-[#EFF6FF]"
              : "border-[#E5E7EB] bg-white hover:bg-[#F9FAFB]"
          }`}
        >
          <div className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 border-current transition-colors"
            style={{ borderColor: mode === "allow_new_users" ? "#3B82F6" : "#D1D5DB" }}
          >
            {mode === "allow_new_users" && (
              <span className="h-2 w-2 rounded-full bg-[#3B82F6]" />
            )}
          </div>
          <input
            type="radio"
            name="registration_mode"
            value="allow_new_users"
            checked={mode === "allow_new_users"}
            onChange={(e) => setMode(e.target.value as "allow_new_users")}
            className="peer sr-only"
          />
          <div>
            <p className="mp-body-sm font-semibold text-[#111827]">อนุญาตให้ใช้งานทันที</p>
            <p className="mp-caption mt-0.5 text-[#4B5563]">
              ผู้ใช้รายใหม่เข้าสู่ระบบและใช้งานได้ทันที
            </p>
          </div>
        </label>

        {/* Require Admin Approval */}
        <label
          className={`flex cursor-pointer items-start gap-3 rounded-xl border-2 p-4 transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[#3B82F6] ${
            mode === "must_approve"
              ? "border-[#3B82F6] bg-[#EFF6FF]"
              : "border-[#E5E7EB] bg-white hover:bg-[#F9FAFB]"
          }`}
        >
          <div className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 transition-colors"
            style={{ borderColor: mode === "must_approve" ? "#3B82F6" : "#D1D5DB" }}
          >
            {mode === "must_approve" && (
              <span className="h-2 w-2 rounded-full bg-[#3B82F6]" />
            )}
          </div>
          <input
            type="radio"
            name="registration_mode"
            value="must_approve"
            checked={mode === "must_approve"}
            onChange={(e) => setMode(e.target.value as "must_approve")}
            className="peer sr-only"
          />
          <div>
            <p className="mp-body-sm font-semibold text-[#111827]">ต้องให้ผู้ดูแลระบบอนุมัติ</p>
            <p className="mp-caption mt-0.5 text-[#4B5563]">
              ผู้ใช้รายใหม่ต้องได้รับการอนุมัติก่อนจึงจะใช้งานได้
            </p>
          </div>
        </label>
      </div>

      {/* Message */}
      {message && (
        <div role="status" className={`mx-5 mb-4 rounded-xl border px-4 py-3 ${
          message.type === "success"
            ? "border-[#A7F3D0] bg-[#ECFDF5] text-[#065F46]"
            : "border-[#FECACA] bg-[#FEF2F2] text-[#991B1B]"
        }`}>
          <p className="mp-body-sm">{message.text}</p>
        </div>
      )}

      {/* Save */}
      <div className="border-t border-[#E5E7EB] px-5 py-4">
        <Button
          onClick={handleSave}
          disabled={mode === currentMode || mutation.isPending}
          size="sm"
        >
          {mutation.isPending ? "กำลังบันทึก..." : "บันทึกการตั้งค่า"}
        </Button>
      </div>
    </div>
  );
}
