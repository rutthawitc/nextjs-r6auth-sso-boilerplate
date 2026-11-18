"use client";

import { Check, Copy } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";

/** Copy via the Clipboard API, falling back to execCommand on plain-HTTP origins. */
async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to the legacy path
  }
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.style.position = "fixed";
  area.style.opacity = "0";
  document.body.appendChild(area);
  area.select();
  try {
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    area.remove();
  }
}

export function CopyButton({ value, label = "คัดลอก" }: { value: string; label?: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");

  useEffect(() => {
    if (state === "idle") return;
    const timer = setTimeout(() => setState("idle"), 2000);
    return () => clearTimeout(timer);
  }, [state]);

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={async () => setState((await copyText(value)) ? "copied" : "failed")}
      aria-live="polite"
    >
      {state === "copied" ? <Check className="text-[#16A34A]" /> : <Copy />}
      {state === "copied" ? "คัดลอกแล้ว" : state === "failed" ? "คัดลอกไม่สำเร็จ" : label}
    </Button>
  );
}
