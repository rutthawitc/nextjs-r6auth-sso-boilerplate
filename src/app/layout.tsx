import Link from "next/link";
import type { Metadata } from "next";
import { Space_Grotesk, DM_Sans, Roboto_Mono, IBM_Plex_Sans_Thai } from "next/font/google";

import QueryProvider from "@/components/providers/query-provider";
import LogoutButton from "@/components/logout-button";
import { getValidSessionUser } from "@/lib/session";
import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

// Thai glyphs: DM Sans has none, so this sits after it in the font stack.
const plexThai = IBM_Plex_Sans_Thai({
  variable: "--font-thai",
  subsets: ["thai"],
  weight: ["400", "500", "600", "700"],
});

const robotoMono = Roboto_Mono({
  variable: "--font-roboto-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "PWA Login",
  description: "ระบบตัวอย่างการเข้าสู่ระบบด้วย r6auth (SSO กปภ.ข.6) และการจัดการสิทธิ์ตามบทบาท",
};

// Cookie-only on purpose: it just shows a name and runs on every page, so it
// does not hit the DB. Pages and APIs with real data re-validate themselves.
async function Navigation() {
  const user = await getValidSessionUser();
  const isLoggedIn = Boolean(user);
  const isAdmin = user?.role === "admin";

  return (
    <header className="sticky top-0 z-40 border-b border-[#E5E7EB] bg-white/95 backdrop-blur-sm">
      <nav className="mx-auto flex h-12 w-full max-w-6xl items-center justify-between gap-2 px-3 sm:px-6">
        <Link
          href="/"
          className="text-[17px] font-semibold text-[#111827] tracking-tight"
          style={{ fontFamily: "var(--font-space-grotesk), var(--font-thai), system-ui, sans-serif" }}
        >
          PWA Login
        </Link>
        <div className="flex items-center gap-1">
          <Link
            className="rounded-full px-2.5 py-1.5 text-[13px] sm:px-3 font-medium text-[#6B7280] transition-colors hover:bg-[#F3F4F6] hover:text-[#111827]"
            href="/"
          >
            หน้าหลัก
          </Link>
          {isLoggedIn ? (
            <Link
              className="rounded-full px-2.5 py-1.5 text-[13px] sm:px-3 font-medium text-[#6B7280] transition-colors hover:bg-[#F3F4F6] hover:text-[#111827]"
              href="/profile"
            >
              โปรไฟล์
            </Link>
          ) : null}
          {isAdmin ? (
            <Link
              className="rounded-full px-2.5 py-1.5 text-[13px] sm:px-3 font-medium text-[#6B7280] transition-colors hover:bg-[#F3F4F6] hover:text-[#111827]"
              href="/admin/users"
            >
              ผู้ดูแลระบบ
            </Link>
          ) : null}
          {!isLoggedIn ? (
            <Link
              className="ml-2 rounded-full bg-[#3B82F6] px-4 py-1.5 text-[13px] font-semibold text-white transition-colors hover:bg-[#2563EB] active:bg-[#1D4ED8]"
              href="/login"
            >
              เข้าสู่ระบบ
            </Link>
          ) : (
            <>
              <span className="ml-2 hidden max-w-[12rem] truncate text-[13px] font-medium text-[#111827] sm:inline">
                {user?.displayName || user?.username}
              </span>
              <LogoutButton />
            </>
          )}
        </div>
      </nav>
    </header>
  );
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="th">
      <body
        className={`${spaceGrotesk.variable} ${dmSans.variable} ${plexThai.variable} ${robotoMono.variable} antialiased`}
        style={{ fontFamily: "var(--font-dm-sans), var(--font-thai), system-ui, sans-serif" }}
      >
        <QueryProvider>
          <Navigation />
          <main>{children}</main>
        </QueryProvider>
      </body>
    </html>
  );
}
