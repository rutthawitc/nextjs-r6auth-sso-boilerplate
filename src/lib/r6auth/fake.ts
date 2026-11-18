/**
 * Development/test stand-in for r6auth. Codes look like `fake:<username>`;
 * `fake:down` simulates an outage. Never used in production (see isFakeActive).
 */
import type { R6AuthClient } from "./client";
import { InvalidGrantError, R6AuthUnavailableError } from "./errors";
import type { R6AuthResult, R6AuthUser } from "./types";

const SESSION_SECONDS = 8 * 60 * 60;

const user = (over: Partial<R6AuthUser> & Pick<R6AuthUser, "username">): R6AuthUser => ({
  sub: `fake-${over.username}`,
  name: "",
  first_name: "",
  last_name: "",
  name_en: "",
  email: "",
  title: "",
  level: "",
  company: "",
  division: "",
  department: "",
  office: "",
  costcenter: "",
  ba: "",
  ...over,
});

export const FAKE_SSO_USERS: readonly R6AuthUser[] = [
  user({
    username: "10001",
    name: "นายสมชาย ใจดี",
    first_name: "สมชาย",
    last_name: "ใจดี",
    name_en: "Mr.Somchai Jaidee",
    email: "somchai@example.com",
    title: "นักวิชาการคอมพิวเตอร์",
    level: "7",
    division: "กองตัวอย่าง",
    department: "แผนกตัวอย่าง",
    office: "งานตัวอย่าง",
    costcenter: "101932",
    ba: "1059",
  }),
  user({
    username: "10002",
    name: "นางสาวสมหญิง รักดี",
    first_name: "สมหญิง",
    last_name: "รักดี",
    email: "somying@example.com",
    title: "พนักงานบัญชี",
    level: "5",
    office: "งานบัญชีตัวอย่าง",
    costcenter: "101931",
    ba: "1059",
  }),
  user({
    username: "10003",
    name: "นายสมศักดิ์ มั่นคง",
    first_name: "สมศักดิ์",
    last_name: "มั่นคง",
    email: "somsak@example.com",
    title: "ช่างตัวอย่าง",
    level: "4",
    office: "งานสาขาตัวอย่าง",
    costcenter: "100405",
    ba: "1060",
  }),
];

export class FakeR6AuthClient implements R6AuthClient {
  constructor(private readonly now: () => Date = () => new Date()) {}

  async exchangeCode(code: string): Promise<R6AuthResult> {
    if (code === "fake:down") throw new R6AuthUnavailableError("fake r6auth is down");
    const match = FAKE_SSO_USERS.find((u) => code === `fake:${u.username}`);
    if (!match) throw new InvalidGrantError();
    const loginAt = Math.floor(this.now().getTime() / 1000);
    return { user: { ...match }, loginAt, expiresAt: loginAt + SESSION_SECONDS };
  }
}
