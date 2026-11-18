"use client";

import { AlertCircle, KeyRound, X } from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";

import { CopyButton } from "@/components/copy-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
// Type-only: admin.ts is server code (bcrypt), erased from the client bundle.
import type { ContractorRow, RoleSummary } from "@/lib/contractors/admin";
import { contractorApiError } from "@/lib/contractors/view";

type ApiResult = { ok: boolean; status: number; payload: unknown };

export async function callContractorApi(url: string, method: string, body?: unknown): Promise<ApiResult> {
  try {
    const response = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const payload = await response.json().catch(() => null);
    return { ok: response.ok, status: response.status, payload };
  } catch {
    return { ok: false, status: 0, payload: null };
  }
}

const FALLBACK = "บันทึกไม่สำเร็จ กรุณาลองใหม่";

function Dialog({
  title,
  onClose,
  busy,
  children,
  wide,
}: {
  title: string;
  onClose: () => void;
  busy?: boolean;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`max-h-[90vh] w-full overflow-y-auto rounded-2xl border border-[#E5E7EB] bg-white shadow-[0_8px_24px_rgba(0,0,0,0.08),0_2px_8px_rgba(0,0,0,0.04)] ${
          wide ? "max-w-2xl" : "max-w-md"
        }`}
      >
        <div className="flex items-center justify-between border-b border-[#E5E7EB] px-5 py-4">
          <h2 className="mp-subhead text-[#111827]">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="ปิด"
            className="flex h-7 w-7 items-center justify-center rounded-full text-[#6B7280] transition-colors hover:bg-[#F3F4F6] hover:text-[#111827] disabled:opacity-50"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function ErrorBanner({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div role="alert" className="flex items-center gap-2 rounded-xl border border-[#FECACA] bg-[#FEF2F2] px-3 py-2">
      <AlertCircle className="h-4 w-4 shrink-0 text-[#EF4444]" />
      <p className="mp-body-sm text-[#991B1B]">{message}</p>
    </div>
  );
}

function Field({
  id,
  label,
  required,
  hint,
  children,
}: {
  id: string;
  label: string;
  required?: boolean;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="mp-body-sm font-medium text-[#111827]">
        {label} {required ? <span className="text-[#EF4444]">*</span> : null}
      </label>
      {children}
      {hint ? <p className="mp-caption text-[#4B5563]">{hint}</p> : null}
    </div>
  );
}

function FormActions({ busy, onClose, submitLabel }: { busy: boolean; onClose: () => void; submitLabel: string }) {
  return (
    <div className="flex justify-end gap-2 border-t border-[#E5E7EB] pt-4">
      <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
        ยกเลิก
      </Button>
      <Button type="submit" disabled={busy}>
        {busy ? "กำลังบันทึก..." : submitLabel}
      </Button>
    </div>
  );
}

/** Client-side date check; the server applies the same rule. */
function dateProblem(start: string, end: string): string | null {
  if (!start) return "กรุณาเลือกวันเริ่มสัญญา";
  if (!end) return "กรุณาเลือกวันสิ้นสุดสัญญา";
  if (end < start) return "วันสิ้นสุดสัญญาต้องไม่ก่อนวันเริ่ม";
  return null;
}

function PasswordChoice({
  id,
  generate,
  setGenerate,
  password,
  setPassword,
  busy,
}: {
  id: string;
  generate: boolean;
  setGenerate: (v: boolean) => void;
  password: string;
  setPassword: (v: string) => void;
  busy: boolean;
}) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mp-body-sm mb-1.5 font-medium text-[#111827]">
        รหัสผ่านเริ่มต้น <span className="text-[#EF4444]">*</span>
      </legend>
      <label className="mp-body-sm flex items-center gap-2 text-[#374151]">
        <input type="radio" name={`${id}-mode`} checked={generate} onChange={() => setGenerate(true)} disabled={busy} />
        สุ่มให้ (แสดงครั้งเดียวหลังบันทึก)
      </label>
      <label className="mp-body-sm flex items-center gap-2 text-[#374151]">
        <input type="radio" name={`${id}-mode`} checked={!generate} onChange={() => setGenerate(false)} disabled={busy} />
        กำหนดเอง
      </label>
      {!generate ? (
        <Input
          id={id}
          type="password"
          aria-label="รหัสผ่านเริ่มต้น"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={8}
          required
          disabled={busy}
        />
      ) : null}
      <p className="mp-caption text-[#4B5563]">ลูกจ้างต้องเปลี่ยนรหัสผ่านเมื่อเข้าสู่ระบบครั้งแรก</p>
    </fieldset>
  );
}

type ProfileState = {
  username: string;
  firstName: string;
  lastName: string;
  department: string;
  businessArea: string;
  phone: string;
  contractStart: string;
  contractEnd: string;
  roleIds: string[];
};

/** Create (no `contractor`) or edit a contractor. */
export function ContractorFormDialog({
  contractor,
  assignableRoles,
  onClose,
  onSaved,
}: {
  contractor?: ContractorRow;
  assignableRoles: RoleSummary[];
  onClose: () => void;
  onSaved: (result: { username: string; generatedPassword?: string }) => void;
}) {
  const isEdit = !!contractor;
  const [form, setForm] = useState<ProfileState>({
    username: contractor?.username ?? "",
    firstName: contractor?.firstName ?? "",
    lastName: contractor?.lastName ?? "",
    department: contractor?.department ?? "",
    businessArea: contractor?.businessArea ?? "",
    phone: contractor?.phone ?? "",
    contractStart: contractor?.contractStart ?? "",
    contractEnd: contractor?.contractEnd ?? "",
    roleIds: contractor?.roles.map((r) => r.id) ?? [],
  });
  const [generate, setGenerate] = useState(true);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (key: keyof ProfileState) => (e: { target: { value: string } }) =>
    setForm((prev) => ({ ...prev, [key]: e.target.value }));

  // Roles the contractor already holds but that are no longer assignable stay visible so the admin can remove them.
  const roleOptions = [
    ...assignableRoles,
    ...(contractor?.roles ?? []).filter((r) => !assignableRoles.some((a) => a.id === r.id)),
  ];
  const assignable = new Set(assignableRoles.map((r) => r.id));

  const toggleRole = (id: string) =>
    setForm((prev) => ({
      ...prev,
      roleIds: prev.roleIds.includes(id) ? prev.roleIds.filter((r) => r !== id) : [...prev.roleIds, id],
    }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!isEdit) {
      if (!/^\d{1,20}$/.test(form.username.trim())) {
        setError("รหัสลูกจ้างต้องเป็นตัวเลขเท่านั้น (ไม่เกิน 20 หลัก)");
        return;
      }
      const problem = dateProblem(form.contractStart, form.contractEnd);
      if (problem) {
        setError(problem);
        return;
      }
    }
    const profile = {
      firstName: form.firstName,
      lastName: form.lastName,
      department: form.department,
      businessArea: form.businessArea,
      phone: form.phone.trim() ? form.phone : null,
      roleIds: form.roleIds,
    };
    setBusy(true);
    const result = isEdit
      ? await callContractorApi(`/api/admin/contractors/${contractor.id}`, "PATCH", profile)
      : await callContractorApi("/api/admin/contractors", "POST", {
          ...profile,
          username: form.username.trim(),
          contractStart: form.contractStart,
          contractEnd: form.contractEnd,
          ...(generate ? {} : { password }),
        });
    setBusy(false);
    if (!result.ok) {
      setError(contractorApiError(result.payload, FALLBACK, result.status));
      return;
    }
    const generatedPassword = (result.payload as { generatedPassword?: string } | null)?.generatedPassword;
    setPassword("");
    onSaved({ username: form.username.trim(), generatedPassword });
  };

  return (
    <Dialog title={isEdit ? `แก้ไขลูกจ้าง ${contractor.username}` : "เพิ่มลูกจ้าง"} onClose={onClose} busy={busy} wide>
      <form onSubmit={submit} className="space-y-4 p-5">
        <ErrorBanner message={error} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="c-username" label="รหัสลูกจ้าง" required={!isEdit} hint={isEdit ? "แก้ไขรหัสไม่ได้" : "ตัวเลขเท่านั้น ใช้เป็นชื่อเข้าสู่ระบบ"}>
            <Input
              id="c-username"
              inputMode="numeric"
              autoComplete="off"
              value={form.username}
              onChange={set("username")}
              maxLength={20}
              required
              disabled={isEdit || busy}
            />
          </Field>
          <Field id="c-phone" label="เบอร์โทร">
            <Input id="c-phone" type="tel" autoComplete="off" value={form.phone} onChange={set("phone")} maxLength={50} disabled={busy} />
          </Field>
          <Field id="c-first" label="ชื่อ" required>
            <Input id="c-first" autoComplete="off" value={form.firstName} onChange={set("firstName")} maxLength={200} required disabled={busy} />
          </Field>
          <Field id="c-last" label="นามสกุล" required>
            <Input id="c-last" autoComplete="off" value={form.lastName} onChange={set("lastName")} maxLength={200} required disabled={busy} />
          </Field>
          <Field id="c-dept" label="สังกัด" required>
            <Input id="c-dept" autoComplete="off" value={form.department} onChange={set("department")} maxLength={200} required disabled={busy} />
          </Field>
          <Field id="c-ba" label="รหัส BA" required>
            <Input id="c-ba" autoComplete="off" value={form.businessArea} onChange={set("businessArea")} maxLength={200} required disabled={busy} />
          </Field>
          {isEdit ? null : (
            <>
              <Field id="c-start" label="วันเริ่มสัญญา" required>
                <Input id="c-start" type="date" value={form.contractStart} onChange={set("contractStart")} required disabled={busy} />
              </Field>
              <Field id="c-end" label="วันสิ้นสุดสัญญา" required>
                <Input
                  id="c-end"
                  type="date"
                  value={form.contractEnd}
                  min={form.contractStart || undefined}
                  onChange={set("contractEnd")}
                  required
                  disabled={busy}
                />
              </Field>
            </>
          )}
        </div>
        {isEdit ? <p className="mp-caption text-[#4B5563]">แก้วันที่สัญญาได้ที่ปุ่ม &ldquo;ต่อสัญญา&rdquo;</p> : null}

        <fieldset className="flex flex-col gap-2">
          <legend className="mp-body-sm mb-1.5 font-medium text-[#111827]">บทบาท (RBAC)</legend>
          {roleOptions.length === 0 ? (
            <p className="mp-caption text-[#4B5563]">ไม่มีบทบาทที่มอบให้ลูกจ้างได้ (ได้บทบาท user พื้นฐานเสมอ)</p>
          ) : (
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              {roleOptions.map((r) => (
                <label key={r.id} className="mp-body-sm flex items-center gap-2 text-[#374151]">
                  <input
                    type="checkbox"
                    checked={form.roleIds.includes(r.id)}
                    onChange={() => toggleRole(r.id)}
                    disabled={busy || (!assignable.has(r.id) && !form.roleIds.includes(r.id))}
                  />
                  {r.name}
                  {!assignable.has(r.id) ? <span className="mp-caption text-[#B91C1C]">(ไม่อนุญาตแล้ว)</span> : null}
                </label>
              ))}
            </div>
          )}
          <p className="mp-caption text-[#4B5563]">แสดงเฉพาะบทบาทระดับไม่เกิน Manager · บทบาท user พื้นฐานได้เสมอ</p>
        </fieldset>

        {isEdit ? null : (
          <PasswordChoice
            id="c-password"
            generate={generate}
            setGenerate={setGenerate}
            password={password}
            setPassword={setPassword}
            busy={busy}
          />
        )}

        <FormActions busy={busy} onClose={onClose} submitLabel={isEdit ? "บันทึก" : "เพิ่มลูกจ้าง"} />
      </form>
    </Dialog>
  );
}

export function RenewContractDialog({
  contractor,
  onClose,
  onSaved,
}: {
  contractor: ContractorRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [start, setStart] = useState(contractor.contractStart);
  const [end, setEnd] = useState(contractor.contractEnd);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const problem = dateProblem(start, end);
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    setBusy(true);
    const result = await callContractorApi(`/api/admin/contractors/${contractor.id}/contract`, "PUT", {
      contractStart: start,
      contractEnd: end,
    });
    setBusy(false);
    if (!result.ok) {
      setError(contractorApiError(result.payload, FALLBACK, result.status));
      return;
    }
    onSaved();
  };

  return (
    <Dialog title={`ต่อสัญญา ${contractor.username}`} onClose={onClose} busy={busy}>
      <form onSubmit={submit} className="space-y-4 p-5">
        <p className="mp-body-sm text-[#374151]">
          {contractor.firstName} {contractor.lastName}
        </p>
        <ErrorBanner message={error} />
        <Field id="r-start" label="วันเริ่มสัญญา" required>
          <Input id="r-start" type="date" value={start} onChange={(e) => setStart(e.target.value)} required disabled={busy} />
        </Field>
        <Field id="r-end" label="วันสิ้นสุดสัญญา" required>
          <Input id="r-end" type="date" value={end} min={start || undefined} onChange={(e) => setEnd(e.target.value)} required disabled={busy} />
        </Field>
        <FormActions busy={busy} onClose={onClose} submitLabel="บันทึกสัญญา" />
      </form>
    </Dialog>
  );
}

export function ResetPasswordDialog({
  contractor,
  onClose,
  onSaved,
}: {
  contractor: ContractorRow;
  onClose: () => void;
  onSaved: (result: { username: string; generatedPassword?: string }) => void;
}) {
  const [generate, setGenerate] = useState(true);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const result = await callContractorApi(
      `/api/admin/contractors/${contractor.id}/reset-password`,
      "POST",
      generate ? {} : { password },
    );
    setBusy(false);
    if (!result.ok) {
      setError(contractorApiError(result.payload, FALLBACK, result.status));
      return;
    }
    setPassword("");
    const generatedPassword = (result.payload as { generatedPassword?: string } | null)?.generatedPassword;
    onSaved({ username: contractor.username, generatedPassword });
  };

  return (
    <Dialog title={`รีเซ็ตรหัสผ่าน ${contractor.username}`} onClose={onClose} busy={busy}>
      <form onSubmit={submit} className="space-y-4 p-5">
        <p className="mp-body-sm text-[#374151]">
          {contractor.firstName} {contractor.lastName} · รหัสผ่านเดิมจะใช้ไม่ได้ทันที และการล็อกจากการใส่รหัสผิดจะถูกล้าง
        </p>
        <ErrorBanner message={error} />
        <PasswordChoice
          id="reset-password"
          generate={generate}
          setGenerate={setGenerate}
          password={password}
          setPassword={setPassword}
          busy={busy}
        />
        <FormActions busy={busy} onClose={onClose} submitLabel="รีเซ็ตรหัสผ่าน" />
      </form>
    </Dialog>
  );
}

/** Confirms a permanent delete. The server re-checks that the contractor is ended or deactivated. */
export function DeleteContractorDialog({
  contractor,
  onClose,
  onDeleted,
}: {
  contractor: ContractorRow;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirm = async () => {
    setError(null);
    setBusy(true);
    const result = await callContractorApi(`/api/admin/contractors/${contractor.id}`, "DELETE");
    setBusy(false);
    if (!result.ok) {
      setError(contractorApiError(result.payload, "ลบไม่สำเร็จ กรุณาลองใหม่", result.status));
      return;
    }
    onDeleted();
  };

  return (
    <Dialog title={`ลบบัญชีลูกจ้าง ${contractor.username}`} onClose={onClose} busy={busy}>
      <div className="space-y-4 p-5">
        <p className="mp-body-sm text-[#374151]">
          ลบบัญชีของ <span className="font-semibold">{contractor.firstName} {contractor.lastName}</span> (รหัส{" "}
          <span className="font-mono">{contractor.username}</span>) พร้อมบทบาททั้งหมด
        </p>
        <p className="mp-body-sm font-medium text-[#991B1B]">
          ลบแล้วกู้คืนไม่ได้ รหัสลูกจ้างนี้จะนำไปสร้างบัญชีใหม่ได้
        </p>
        <ErrorBanner message={error} />
        <div className="flex justify-end gap-2 border-t border-[#E5E7EB] pt-4">
          <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
            ยกเลิก
          </Button>
          <Button type="button" variant="destructive" onClick={confirm} disabled={busy}>
            {busy ? "กำลังลบ..." : "ลบถาวร"}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

/** Shows a generated password once. It lives only in this component's props. */
export function GeneratedPasswordDialog({
  username,
  password,
  onClose,
}: {
  username: string;
  password: string;
  onClose: () => void;
}) {
  return (
    <Dialog title="รหัสผ่านเริ่มต้น" onClose={onClose}>
      <div className="space-y-4 p-5">
        <p className="mp-body-sm text-[#374151]">
          รหัสผ่านของลูกจ้าง <span className="font-semibold">{username}</span> แสดงครั้งนี้ครั้งเดียว กรุณาคัดลอกแล้วส่งให้ลูกจ้าง
        </p>
        <div className="flex items-center justify-between gap-3 rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] px-3 py-2">
          <span className="flex items-center gap-2 font-mono text-[16px] tracking-wide text-[#111827]">
            <KeyRound className="h-4 w-4 text-[#6B7280]" aria-hidden="true" />
            {password}
          </span>
          <CopyButton value={password} />
        </div>
        <div className="flex justify-end">
          <Button type="button" onClick={onClose}>
            เสร็จสิ้น
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
