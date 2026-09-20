"use client";

import { cn } from "@/lib/utils";

export function EntityModal({
  open,
  title,
  onClose,
  children,
  className,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-inverse-surface/40 p-4 backdrop-blur-sm sm:items-center">
      <div className={cn("w-full max-w-lg rounded-xl bg-surface-container-lowest p-6 shadow-xl", className)}>
        <div className="mb-6 flex items-center justify-between">
          <h2 className="font-headline-sm text-headline-sm text-on-surface">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-on-surface-variant hover:bg-surface-container-high"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
