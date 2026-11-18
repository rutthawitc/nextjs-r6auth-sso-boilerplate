"use client";

interface ActiveStatusToggleProps {
  isActive: boolean;
  onChange: (isActive: boolean) => void;
  disabled?: boolean;
  isLoading?: boolean;
  /** Who the toggle belongs to, for the accessible name. */
  label?: string;
}

export default function ActiveStatusToggle({
  isActive,
  onChange,
  disabled,
  isLoading,
  label,
}: ActiveStatusToggleProps) {
  const action = isActive ? "ระงับการใช้งาน" : "เปิดใช้งาน";
  return (
    <div className="inline-flex items-center gap-2">
      <button
        type="button"
        role="switch"
        aria-checked={isActive}
        onClick={() => onChange(!isActive)}
        disabled={disabled}
        aria-label={label ? `${action} ${label}` : action}
        className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B82F6] focus-visible:ring-offset-2 ${
          isActive ? "bg-[#10B981]" : "bg-[#D1D5DB]"
        } ${disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}
      >
        <span
          className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm transition-transform ${
            isActive ? "translate-x-[18px]" : "translate-x-0.5"
          }`}
        />
      </button>
      <span className={`mp-caption font-semibold ${isActive ? "text-[#065F46]" : "text-[#6B7280]"}`}>
        {isActive ? "ใช้งานอยู่" : "ถูกระงับ"}
      </span>
      {isLoading ? <span className="mp-caption text-[#6B7280]">กำลังบันทึก...</span> : null}
    </div>
  );
}
