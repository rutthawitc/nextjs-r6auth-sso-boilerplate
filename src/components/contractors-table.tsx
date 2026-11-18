"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";

import ActiveStatusToggle from "@/components/active-status-toggle";
import {
  ContractorFormDialog,
  DeleteContractorDialog,
  GeneratedPasswordDialog,
  RenewContractDialog,
  ResetPasswordDialog,
  callContractorApi,
} from "@/components/contractor-form";
import { Button } from "@/components/ui/button";
// Type-only: admin.ts is server code (bcrypt), erased from the client bundle.
import type { ContractorRow, RoleSummary } from "@/lib/contractors/admin";
import { canDeleteContractor, type ContractStatus } from "@/lib/contractors/contract";
import {
  DEFAULT_STATUS_FILTER,
  STATUS_FILTERS,
  contractorApiError,
  matchesContractor,
  statusLabel,
  type StatusFilter,
} from "@/lib/contractors/view";
import { formatThaiShortDate } from "@/lib/format";

type Data = { contractors: ContractorRow[]; assignableRoles: RoleSummary[] };

type Props = {
  initialContractors: ContractorRow[];
  assignableRoles: RoleSummary[];
};

type DialogState =
  | { kind: "create" }
  | { kind: "edit"; contractor: ContractorRow }
  | { kind: "renew"; contractor: ContractorRow }
  | { kind: "reset"; contractor: ContractorRow }
  | { kind: "delete"; contractor: ContractorRow }
  | { kind: "password"; username: string; password: string }
  | null;

const QUERY_KEY = ["admin-contractors"];

const HEADERS = ["รหัส", "ชื่อ-นามสกุล", "สังกัด / BA", "ช่วงสัญญา", "สถานะ", "ใช้งาน", ""];

const BADGE: Record<ContractStatus, string> = {
  active: "bg-[#ECFDF5] text-[#065F46]",
  expiring: "bg-[#FFFBEB] text-[#92400E]",
  ended: "bg-[#FEF2F2] text-[#991B1B]",
  not_started: "bg-[#EFF6FF] text-[#1E40AF]",
  inactive: "bg-[#F3F4F6] text-[#4B5563]",
};

async function fetchContractors(): Promise<Data> {
  const response = await fetch("/api/admin/contractors", { cache: "no-store" });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(contractorApiError(payload, "ไม่สามารถโหลดรายชื่อลูกจ้างได้ กรุณาลองใหม่ภายหลัง", response.status));
  }
  return payload as Data;
}

export default function ContractorsTable({ initialContractors, assignableRoles }: Props) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<StatusFilter>(DEFAULT_STATUS_FILTER);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [toggling, setToggling] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const query = useQuery({
    queryKey: QUERY_KEY,
    queryFn: fetchContractors,
    initialData: { contractors: initialContractors, assignableRoles },
  });

  const contractors = useMemo(() => query.data?.contractors ?? [], [query.data]);
  const roles = query.data?.assignableRoles ?? assignableRoles;

  const filtered = useMemo(
    () => contractors.filter((c) => matchesContractor(c, search, filter)),
    [contractors, search, filter],
  );

  const counts = useMemo(() => {
    const byStatus = { active: 0, expiring: 0, ended: 0, not_started: 0, inactive: 0 } as Record<ContractStatus, number>;
    for (const c of contractors) byStatus[c.status] += 1;
    return byStatus;
  }, [contractors]);

  const refresh = () => queryClient.invalidateQueries({ queryKey: QUERY_KEY });

  const afterSave = (result: { username: string; generatedPassword?: string }) => {
    void refresh();
    setDialog(result.generatedPassword ? { kind: "password", username: result.username, password: result.generatedPassword } : null);
  };

  const toggleActive = async (c: ContractorRow, isActive: boolean) => {
    setActionError(null);
    setToggling(c.id);
    const result = await callContractorApi(`/api/admin/contractors/${c.id}/active`, "PUT", { isActive });
    setToggling(null);
    if (!result.ok) setActionError(contractorApiError(result.payload, "ไม่สามารถเปลี่ยนสถานะการใช้งานได้", result.status));
    void refresh();
  };

  return (
    <section className="overflow-hidden rounded-xl border border-[#E5E7EB] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
      <div className="flex flex-col gap-3 border-b border-[#E5E7EB] px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="mp-subhead text-[#111827]">ลูกจ้าง</h2>
          <p className="mp-caption mt-0.5 text-[#4B5563]">
            ทั้งหมด {contractors.length} &middot; ใช้งานได้ {counts.active + counts.expiring} &middot; ใกล้หมด {counts.expiring}{" "}
            &middot; หมดสัญญา {counts.ended}
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative w-full sm:w-64">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6B7280]"
            />
            <label htmlFor="contractor-search" className="sr-only">
              ค้นหาลูกจ้าง
            </label>
            <input
              id="contractor-search"
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ค้นหารหัส ชื่อ หรือสังกัด"
              autoComplete="off"
              spellCheck={false}
              className="h-9 w-full rounded-xl border border-[#E5E7EB] bg-white pl-9 pr-3 text-[14px] text-[#111827] placeholder:text-[#6B7280] shadow-[0_1px_2px_rgba(0,0,0,0.04)] outline-none focus:border-[#3B82F6] focus:ring-2 focus:ring-[#3B82F6]/20"
            />
          </div>
          <label htmlFor="contractor-status" className="sr-only">
            กรองตามสถานะ
          </label>
          <select
            id="contractor-status"
            value={filter}
            onChange={(e) => setFilter(e.target.value as StatusFilter)}
            className="h-9 rounded-xl border border-[#E5E7EB] bg-white px-3 text-[14px] text-[#111827] shadow-[0_1px_2px_rgba(0,0,0,0.04)] outline-none focus:border-[#3B82F6] focus:ring-2 focus:ring-[#3B82F6]/20"
          >
            {STATUS_FILTERS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
          <Button type="button" onClick={() => setDialog({ kind: "create" })}>
            <Plus />
            เพิ่มลูกจ้าง
          </Button>
        </div>
      </div>

      {actionError ? (
        <p className="mp-body-sm border-b border-[#FECACA] bg-[#FEF2F2] px-5 py-2 text-[#991B1B]" role="alert">
          {actionError}
        </p>
      ) : query.isError ? (
        <p className="mp-body-sm border-b border-[#FECACA] bg-[#FEF2F2] px-5 py-2 text-[#991B1B]" role="alert">
          {query.error instanceof Error ? query.error.message : "ไม่สามารถโหลดรายชื่อลูกจ้างได้"}
        </p>
      ) : null}

      {contractors.length === 0 ? (
        <div className="mx-5 my-6 rounded-xl border border-dashed border-[#E5E7EB] bg-[#F9FAFB] px-4 py-10 text-center">
          <p className="mp-body text-[#6B7280]">ยังไม่มีบัญชีลูกจ้าง กด &ldquo;เพิ่มลูกจ้าง&rdquo; เพื่อสร้างบัญชีแรก</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="px-5 py-10 text-center">
          <p className="mp-body text-[#6B7280]">ไม่พบลูกจ้างที่ตรงกับเงื่อนไข</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[960px]">
            <thead>
              <tr className="border-b border-[#E5E7EB] bg-[#F9FAFB]">
                {HEADERS.map((col, i) => (
                  <th
                    key={col || `col-${i}`}
                    scope="col"
                    className="px-4 py-2.5 text-left text-[12px] font-semibold text-[#4B5563]"
                    style={{ fontFamily: "var(--font-space-grotesk), var(--font-thai), system-ui, sans-serif" }}
                  >
                    {col || <span className="sr-only">การดำเนินการ</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F3F4F6]">
              {filtered.map((c) => {
                const name = `${c.firstName} ${c.lastName}`;
                return (
                  <tr key={c.id} className="align-top transition-colors hover:bg-[#F9FAFB]">
                    <td className="px-4 py-3">
                      <span className="mp-body font-mono text-[#111827]">{c.username}</span>
                    </td>
                    <td className="px-4 py-3">
                      <p className="mp-body font-medium text-[#111827]">{name}</p>
                      {c.roles.length > 0 ? (
                        <p className="mp-caption text-[#4B5563]">{c.roles.map((r) => r.name).join(", ")}</p>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">
                      <p className="mp-body text-[#374151]">{c.department || "-"}</p>
                      <p className="mp-caption text-[#4B5563]">BA {c.businessArea || "-"}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className="mp-body whitespace-nowrap text-[#374151]">
                        {formatThaiShortDate(c.contractStart)} – {formatThaiShortDate(c.contractEnd)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-[12px] font-semibold ${BADGE[c.status]}`}>
                        {statusLabel(c.status, c.daysLeft)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <ActiveStatusToggle
                        label={name}
                        isActive={c.isActive}
                        onChange={(isActive) => toggleActive(c, isActive)}
                        disabled={toggling !== null}
                        isLoading={toggling === c.id}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap justify-end gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          aria-label={`แก้ไข ${name}`}
                          onClick={() => setDialog({ kind: "edit", contractor: c })}
                        >
                          แก้ไข
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          aria-label={`ต่อสัญญา ${name}`}
                          onClick={() => setDialog({ kind: "renew", contractor: c })}
                        >
                          ต่อสัญญา
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          aria-label={`รีเซ็ตรหัสผ่าน ${name}`}
                          onClick={() => setDialog({ kind: "reset", contractor: c })}
                        >
                          รีเซ็ตรหัสผ่าน
                        </Button>
                        {canDeleteContractor(c.status) ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            aria-label={`ลบ ${name}`}
                            className="text-[#B91C1C] hover:bg-[#FEF2F2] hover:text-[#991B1B]"
                            onClick={() => setDialog({ kind: "delete", contractor: c })}
                          >
                            ลบ
                          </Button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {dialog?.kind === "create" ? (
        <ContractorFormDialog assignableRoles={roles} onClose={() => setDialog(null)} onSaved={afterSave} />
      ) : dialog?.kind === "edit" ? (
        <ContractorFormDialog
          contractor={dialog.contractor}
          assignableRoles={roles}
          onClose={() => setDialog(null)}
          onSaved={afterSave}
        />
      ) : dialog?.kind === "renew" ? (
        <RenewContractDialog
          contractor={dialog.contractor}
          onClose={() => setDialog(null)}
          onSaved={() => {
            void refresh();
            setDialog(null);
          }}
        />
      ) : dialog?.kind === "reset" ? (
        <ResetPasswordDialog contractor={dialog.contractor} onClose={() => setDialog(null)} onSaved={afterSave} />
      ) : dialog?.kind === "delete" ? (
        <DeleteContractorDialog
          contractor={dialog.contractor}
          onClose={() => setDialog(null)}
          onDeleted={() => {
            void refresh();
            setDialog(null);
          }}
        />
      ) : dialog?.kind === "password" ? (
        <GeneratedPasswordDialog username={dialog.username} password={dialog.password} onClose={() => setDialog(null)} />
      ) : null}
    </section>
  );
}
