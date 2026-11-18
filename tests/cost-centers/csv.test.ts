import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { parseCostCenterCsv } from "@/lib/cost-centers/csv";

describe("parseCostCenterCsv", () => {
  it("strips BOM and title line", () => {
    const r = parseCostCenterCsv("﻿รหัสศูนย์ต้นทุน,,\ncctr,ba,cctrname\n900001,9001,หน่วย ก\n");
    expect(r).toEqual({ rows: [{ code: "900001", ba: "9001", name: "หน่วย ก" }], errors: [] });
  });

  it("trims cells and skips blank lines", () => {
    const r = parseCostCenterCsv("cctr,ba,cctrname\n 900001 , 9001 , หน่วย ก \n\n");
    expect(r.rows).toEqual([{ code: "900001", ba: "9001", name: "หน่วย ก" }]);
  });

  it("rejects non-digit code with line number", () => {
    const r = parseCostCenterCsv("cctr,ba,cctrname\n9000A1,9001,x\n900002,,y\n900003,9001,\n");
    expect(r.rows).toEqual([]);
    expect(r.errors).toEqual([
      "line 2: code must be digits",
      "line 3: ba must be digits",
      "line 4: name is required",
    ]);
  });

  it("reports a missing header", () => {
    expect(parseCostCenterCsv("900001,9001,x\n").errors).toEqual(["header cctr,ba,cctrname not found"]);
  });

  it("fixture parses 3 rows", () => {
    const text = readFileSync(path.resolve(__dirname, "../fixtures/cost-centers.csv"), "utf8");
    const r = parseCostCenterCsv(text);
    expect(r.errors).toEqual([]);
    expect(r.rows.map((x) => x.code)).toEqual(["900001", "900002", "900003"]);
  });
});
