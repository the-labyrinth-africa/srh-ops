"use client";

import { signOut } from "next-auth/react";
import { roleLabel } from "@/lib/permissions";

export function Header({
  onMenuClick,
  userName,
  userRole,
}: {
  onMenuClick: () => void;
  userName?: string | null;
  userRole?: string | null;
}) {
  return (
    <header className="fixed left-0 right-0 top-0 z-40 flex h-16 items-center justify-between bg-surface/90 px-margin-mobile shadow-[0_1px_8px_rgba(0,0,0,0.04)] backdrop-blur-xl lg:left-sidebar-width lg:px-margin-desktop">
      <div className="flex flex-1 items-center gap-gutter-sm">
        <button
          type="button"
          onClick={onMenuClick}
          className="rounded-xl p-2 text-on-surface-variant transition-colors hover:bg-surface-container-high lg:hidden"
          aria-label="Ouvrir le menu"
        >
          <span className="material-symbols-outlined text-[22px]">menu</span>
        </button>
        <div className="flex w-full max-w-xl items-center gap-2 rounded-xl bg-surface-container-lowest px-gutter-sm py-1.5 shadow-[0_1px_8px_rgba(0,0,0,0.04)]">
          <span className="material-symbols-outlined text-[20px] text-on-surface-variant">search</span>
          <input
            type="text"
            placeholder="Rechercher une opération, client, site..."
            className="w-full border-0 bg-transparent font-body-md text-body-md text-on-surface outline-none placeholder:text-outline"
          />
        </div>
      </div>

      <div className="flex items-center gap-gutter-md">
        <div className="hidden items-center gap-2 rounded-full bg-surface-container-low px-3 py-1 font-label-sm text-label-sm text-status-reported lg:flex">
          <span className="h-2 w-2 animate-pulse rounded-full bg-status-reported" />
          <span>Système opérationnel</span>
        </div>
        <div className="hidden h-6 w-px bg-surface-variant lg:block" />
        <button
          type="button"
          className="relative rounded-xl p-2 text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-on-surface"
        >
          <span className="material-symbols-outlined text-[22px]">notifications</span>
          <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-status-action-req" />
        </button>
        <button
          type="button"
          onClick={() => signOut({ callbackUrl: `${window.location.origin}/login` })}
          className="flex items-center gap-3 pl-2"
          title="Déconnexion"
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary">
            <span className="material-symbols-outlined text-[18px] text-on-primary">person</span>
          </div>
          <div className="hidden flex-col text-left xl:flex">
            <span className="font-label-md text-label-md font-semibold leading-tight text-on-surface">
              {userName ?? "Utilisateur"}
            </span>
            <span className="font-label-sm text-label-sm leading-tight text-on-surface-variant">
              {roleLabel(userRole)}
            </span>
          </div>
        </button>
      </div>
    </header>
  );
}
