import * as React from "react";

import { cn } from "@/lib/utils";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-9 w-full min-w-0 rounded-xl border border-[#E5E7EB] bg-white px-3 py-1 text-[14px] text-[#111827] placeholder:text-[#9CA3AF] shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-[box-shadow,border-color] outline-none",
        "focus:border-[#3B82F6] focus:ring-2 focus:ring-[#3B82F6]/20 focus:ring-offset-0",
        "disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-[#F9FAFB]",
        "file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-[#111827]",
        "aria-invalid:border-[#EF4444] aria-invalid:ring-2 aria-invalid:ring-[#EF4444]/20",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
