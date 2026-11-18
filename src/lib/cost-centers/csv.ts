/**
 * Parses the cost center list exported as `cctr,ba,cctrname` (UTF-8, often
 * with a BOM and a title line above the header). Client- and server-safe.
 */
export interface CostCenterRow {
  code: string;
  ba: string;
  name: string;
}

const DIGITS = /^\d+$/;

export function parseCostCenterCsv(text: string): { rows: CostCenterRow[]; errors: string[] } {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/);
  const headerIndex = lines.findIndex((l) => l.split(",").map((c) => c.trim().toLowerCase()).join(",") === "cctr,ba,cctrname");
  if (headerIndex === -1) return { rows: [], errors: ["header cctr,ba,cctrname not found"] };

  const rows: CostCenterRow[] = [];
  const errors: string[] = [];
  for (let i = headerIndex + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === "") continue;
    const [code = "", ba = "", ...rest] = line.split(",").map((c) => c.trim());
    const name = rest.join(",").trim();
    const where = `line ${i + 1}`;
    if (!DIGITS.test(code)) errors.push(`${where}: code must be digits`);
    else if (!DIGITS.test(ba)) errors.push(`${where}: ba must be digits`);
    else if (name === "") errors.push(`${where}: name is required`);
    else rows.push({ code, ba, name });
  }
  return { rows, errors };
}
