"use client";

import { FormEvent, useState } from "react";
import { useMutation } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AUTH_MESSAGES } from "@/lib/auth/messages";
import { safeRedirectPath } from "@/lib/auth/redirect";

interface LoginResponse {
  isLoggedIn: boolean;
  displayName?: string;
  role?: string;
  error?: string;
  code?: string;
}

interface LoginFormProps {
  /** Extra server-provided notice (e.g. contract ended). */
  notice?: string;
  /** Already sanitised on the server; sanitised again before navigating. */
  redirectTo?: string;
}

export default function LoginForm({ notice, redirectTo }: LoginFormProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const loginMutation = useMutation({
    mutationFn: submitLogin,
    onError: (err: unknown) => {
      setError(err instanceof Error ? err.message : AUTH_MESSAGES.unavailable);
      setPassword("");
    },
    onSuccess: () => {
      // Full page load, not router.push: the client router may hold a cached
      // redirect for the target (e.g. /profile -> /login after the session
      // expired) and would replay it; router.refresh() clears only the current
      // route. safeRedirectPath keeps the target a same-origin path.
      window.location.assign(safeRedirectPath(redirectTo));
    },
  });

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (loginMutation.isPending) return;
    setError(null);
    loginMutation.mutate({ username: username.trim(), password });
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-4"
      aria-describedby={error ? "login-error" : undefined}
    >
      {notice && !error ? (
        <div
          className="rounded-lg border border-[#FDE68A] bg-[#FFFBEB] px-3 py-2"
          role="status"
        >
          <p className="mp-body-sm text-[#92400E]">{notice}</p>
        </div>
      ) : null}

      {error ? (
        <div
          className="rounded-lg border border-[#FECACA] bg-[#FEF2F2] px-3 py-2"
          role="alert"
          id="login-error"
        >
          <p className="mp-body-sm text-[#991B1B]">{error}</p>
        </div>
      ) : null}

      <div className="flex flex-col gap-1">
        <label className="mp-body-sm font-medium text-[#111827]" htmlFor="username">
          ชื่อผู้ใช้
        </label>
        <Input
          id="username"
          name="username"
          type="text"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          required
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          aria-describedby="username-hint"
        />
        <p id="username-hint" className="mp-caption text-[#6B7280]">
          รหัสลูกจ้าง หรือชื่อผู้ใช้ผู้ดูแลระบบ
        </p>
      </div>

      <div className="flex flex-col gap-1">
        <label className="mp-body-sm font-medium text-[#111827]" htmlFor="password">
          รหัสผ่าน
        </label>
        <Input
          id="password"
          name="password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
          autoComplete="current-password"
          autoCapitalize="none"
          spellCheck={false}
        />
      </div>

      <Button type="submit" disabled={loginMutation.isPending} className="w-full">
        {loginMutation.isPending ? "กำลังเข้าสู่ระบบ..." : "เข้าสู่ระบบ"}
      </Button>
    </form>
  );
}

async function submitLogin(params: {
  username: string;
  password: string;
}): Promise<LoginResponse> {
  let response: Response;
  try {
    response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });
  } catch {
    throw new Error(AUTH_MESSAGES.unavailable);
  }

  const payload = (await response.json().catch(() => null)) as LoginResponse | null;

  if (!response.ok) {
    // Covers 401/403/429/503: the server already sends a Thai message.
    throw new Error(payload?.error ?? AUTH_MESSAGES.unavailable);
  }

  return payload as LoginResponse;
}
