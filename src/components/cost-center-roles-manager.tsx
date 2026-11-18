"use client";

import { FormEvent, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export interface CostCenterOption {
  code: string;
  ba: string;
  name: string;
}

export interface CostCenterMapping {
  id: string;
  costCenter: string;
  roleId: string;
  roleName: string;
  centerName: string | null;
  ba: string | null;
}

export interface RoleOption {
  id: string;
  name: string;
  isActive: boolean;
}

interface Props {
  initialMappings: CostCenterMapping[];
  costCenters: CostCenterOption[];
  roles: RoleOption[];
}

const CODE = /^\d{1,20}$/;

export const costCenterLabel = (c: CostCenterOption) => `${c.code} · ${c.name} (BA ${c.ba})`;

async function readError(res: Response): Promise<string> {
  const body = (await res.json().catch(() => null)) as { error?: string } | null;
  return body?.error ?? "เกิดข้อผิดพลาด กรุณาลองใหม่";
}

export default function CostCenterRolesManager({ initialMappings, costCenters, roles }: Props) {
  const [mappings, setMappings] = useState(initialMappings);
  const [code, setCode] = useState("");
  const [roleId, setRoleId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const byCode = useMemo(() => new Map(costCenters.map((c) => [c.code, c])), [costCenters]);
  // The base "user" role is given to everyone and cannot be mapped.
  const activeRoles = roles.filter((r) => r.isActive && r.name !== "user");
  const trimmed = code.trim();
  const known = byCode.get(trimmed);

  const reload = async () => {
    const res = await fetch("/api/admin/cost-center-roles", { cache: "no-store" });
    if (res.ok) setMappings(((await res.json()) as { mappings: CostCenterMapping[] }).mappings);
  };

  const add = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    if (!CODE.test(trimmed)) return setError("รหัสศูนย์ต้นทุนต้องเป็นตัวเลข 1-20 หลัก");
    if (!roleId) return setError("กรุณาเลือกบทบาท");
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/cost-center-roles", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ costCenter: trimmed, roleId }),
      });
      if (!res.ok) return setError(await readError(res));
      setCode("");
      await reload();
    } catch {
      setError("เชื่อมต่อระบบไม่ได้ กรุณาลองใหม่");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (m: CostCenterMapping) => {
    if (busy || !window.confirm(`ลบการผูก ${m.costCenter} → ${m.roleName}?`)) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/cost-center-roles/${m.id}`, { method: "DELETE" });
      if (!res.ok) setError(await readError(res));
      await reload();
    } catch {
      setError("เชื่อมต่อระบบไม่ได้ กรุณาลองใหม่");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="flex flex-col gap-6">
      <form
        onSubmit={add}
        className="flex flex-col gap-4 rounded-xl border border-[#E5E7EB] bg-white p-5 sm:flex-row sm:items-end"
      >
        <div className="flex flex-1 flex-col gap-1">
          <label htmlFor="cc-code" className="mp-body-sm font-medium text-[#111827]">
            ศูนย์ต้นทุน
          </label>
          <Input
            id="cc-code"
            list="cc-options"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="พิมพ์รหัส ชื่อหน่วยงาน หรือ BA"
            autoComplete="off"
            inputMode="numeric"
            disabled={busy}
          />
          <datalist id="cc-options">
            {costCenters.map((c) => (
              <option key={c.code} value={c.code} label={`${c.name} (BA ${c.ba})`}>
                {costCenterLabel(c)}
              </option>
            ))}
          </datalist>
          <p className="mp-caption min-h-4 text-[#6B7280]" aria-live="polite">
            {known
              ? costCenterLabel(known)
              : trimmed && CODE.test(trimmed)
                ? "ไม่พบรหัสนี้ในรายการศูนย์ต้นทุน"
                : ""}
          </p>
        </div>
        <div className="flex flex-col gap-1 sm:w-56">
          <label htmlFor="cc-role" className="mp-body-sm font-medium text-[#111827]">
            บทบาท
          </label>
          <select
            id="cc-role"
            value={roleId}
            onChange={(e) => setRoleId(e.target.value)}
            disabled={busy}
            className="h-9 rounded-lg border border-[#E5E7EB] bg-white px-3 text-[13px] text-[#111827]"
          >
            <option value="">เลือกบทบาท</option>
            {activeRoles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
          <p className="mp-caption min-h-4" />
        </div>
        <div className="flex flex-col gap-1">
          <Button type="submit" disabled={busy}>
            เพิ่ม
          </Button>
          <p className="mp-caption min-h-4" />
        </div>
      </form>

      {error ? (
        <div className="rounded-lg border border-[#FECACA] bg-[#FEF2F2] px-3 py-2" role="alert">
          <p className="mp-body-sm text-[#991B1B]">{error}</p>
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-xl border border-[#E5E7EB] bg-white">
        <table className="w-full text-left">
          <thead className="border-b border-[#E5E7EB] bg-[#F9FAFB]">
            <tr>
              {["ศูนย์ต้นทุน", "หน่วยงาน", "BA", "บทบาท", ""].map((h, i) => (
                <th key={i} scope="col" className="mp-caption px-4 py-2 font-medium text-[#6B7280]">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E5E7EB]">
            {mappings.length === 0 ? (
              <tr>
                <td colSpan={5} className="mp-body-sm px-4 py-6 text-center text-[#6B7280]">
                  ยังไม่มีการผูกบทบาทกับศูนย์ต้นทุน
                </td>
              </tr>
            ) : (
              mappings.map((m) => (
                <tr key={m.id}>
                  <td className="mp-body px-4 py-2 font-mono text-[#111827]">{m.costCenter}</td>
                  <td className="mp-body px-4 py-2 text-[#374151]">{m.centerName ?? "-"}</td>
                  <td className="mp-body px-4 py-2 text-[#374151]">{m.ba ?? "-"}</td>
                  <td className="mp-body px-4 py-2 text-[#111827]">{m.roleName}</td>
                  <td className="px-4 py-2 text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => remove(m)}
                      disabled={busy}
                      aria-label={`ลบ ${m.costCenter} ${m.roleName}`}
                    >
                      ลบ
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
