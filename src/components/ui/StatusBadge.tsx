import { STATUS_CONFIG } from "@/lib/status-styles";
import { cn } from "@/lib/utils";
import type { OperationStatus } from "@/types";

export function StatusBadge({
  status,
  compact = false,
  className,
}: {
  status: OperationStatus;
  compact?: boolean;
  className?: string;
}) {
  const config = STATUS_CONFIG[status];

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 font-label-md text-label-md",
        config.color,
        config.bg,
        config.border,
        className
      )}
    >
      <span className="material-symbols-outlined text-[16px]">{config.icon}</span>
      {!compact && <span>{config.label}</span>}
    </span>
  );
}
