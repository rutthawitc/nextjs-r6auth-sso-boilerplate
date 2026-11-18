"use client";

import { useTransition } from "react";

export default function LogoutButton() {
  const [isPending, startTransition] = useTransition();

  const handleLogout = () => {
    startTransition(async () => {
      let redirectTo = "/login";
      try {
        const res = await fetch("/api/auth/logout", { method: "POST" });
        const body = (await res.json()) as { redirectTo?: unknown };
        if (typeof body.redirectTo === "string" && body.redirectTo) redirectTo = body.redirectTo;
      } catch {
        // Fall back to the local login page.
      }
      // Full page load: SSO users continue to r6auth's logout.php.
      window.location.assign(redirectTo);
    });
  };

  return (
    <button
      type="button"
      onClick={handleLogout}
      disabled={isPending}
      className="ml-1 shrink-0 whitespace-nowrap rounded-full bg-[#F3F4F6] px-3 py-1.5 text-[13px] font-medium text-[#4B5563] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3B82F6] transition-colors hover:bg-[#E5E7EB] hover:text-[#111827] disabled:opacity-50"
    >
      {isPending ? "กำลังออกจากระบบ..." : "ออกจากระบบ"}
    </button>
  );
}
