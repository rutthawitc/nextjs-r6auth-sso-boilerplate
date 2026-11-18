import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { db } from "@/lib/db";
import { systemSettings } from "@/db/schema";
import SettingsClient from "./settings-client";

export default async function SettingsPage() {
  const session = await getSession();
  if (!session?.user || session.user.role !== "admin") redirect("/login");

  const settings = await db.select().from(systemSettings);
  const mode = settings.find(s => s.key === "registration_mode")?.value ?? "allow_new_users";

  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6">
      <div className="mb-6">
        <h1
          className="mp-headline text-[#111827]"
        >
          ตั้งค่าระบบ
        </h1>
        <p className="mp-body mt-1 text-[#4B5563]">กำหนดพฤติกรรมของระบบ</p>
      </div>
      <div className="max-w-lg">
        <SettingsClient currentMode={mode as "allow_new_users" | "must_approve"} />
      </div>
    </div>
  );
}
