"use client";

import { FormEvent, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// Thai strings are inlined: lib/contractors/password imports node:crypto and
// must not be bundled for the browser. The server returns the specific message.
const MISMATCH = "รหัสผ่านใหม่และการยืนยันไม่ตรงกัน";
const UNAVAILABLE = "ระบบไม่พร้อมใช้งานชั่วคราว กรุณาลองใหม่ภายหลัง";

export default function ChangePasswordForm() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;
    setError(null);
    if (next !== confirm) {
      setError(MISMATCH);
      return;
    }
    setPending(true);
    try {
      const response = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(payload?.error ?? UNAVAILABLE);
        setCurrent("");
        return;
      }
      // Full page load, not router.push: the client router cached the earlier
      // /profile -> /change-password redirect and would replay it, and
      // router.refresh() clears only the current route's cache entry.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign("/profile");
    } catch {
      setError(UNAVAILABLE);
    } finally {
      setPending(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-4 rounded-xl border border-[#E5E7EB] bg-white p-6 shadow-[0_2px_8px_rgba(0,0,0,0.06),0_1px_2px_rgba(0,0,0,0.04)]"
    >
      {error ? (
        <div className="rounded-lg border border-[#FECACA] bg-[#FEF2F2] px-3 py-2" role="alert">
          <p className="mp-body-sm text-[#991B1B]">{error}</p>
        </div>
      ) : null}

      <Field id="current" label="รหัสผ่านปัจจุบัน" value={current} onChange={setCurrent} autoComplete="current-password" autoFocus />
      <Field id="new" label="รหัสผ่านใหม่" value={next} onChange={setNext} autoComplete="new-password" />
      <Field id="confirm" label="ยืนยันรหัสผ่านใหม่" value={confirm} onChange={setConfirm} autoComplete="new-password" />

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "กำลังบันทึก..." : "เปลี่ยนรหัสผ่าน"}
      </Button>
    </form>
  );
}

function Field(props: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: string;
  autoFocus?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="mp-body-sm font-medium text-[#111827]" htmlFor={props.id}>
        {props.label}
      </label>
      <Input
        id={props.id}
        name={props.id}
        type="password"
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
        required
        autoFocus={props.autoFocus}
        autoComplete={props.autoComplete}
        spellCheck={false}
      />
    </div>
  );
}
