"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { cn } from "@/frontend/design-system/utils";
import { roleLabel } from "@/shared/acces/permissions";
import { IDENTITE_ENTREPRISE_PAR_DEFAUT, type IdentiteEntreprise } from "@/shared/entreprise/identite";
import { navForRole, type NavItem } from "../nav";

function isActive(pathname: string, item: NavItem) {
  return item.match ? item.match(pathname) : pathname === item.href;
}

export function Sidebar({
  open,
  onClose,
  userName,
  userRole,
}: {
  open: boolean;
  onClose: () => void;
  userName?: string | null;
  userRole?: string | null;
}) {
  const pathname = usePathname();
  const [identite, setIdentite] = useState(IDENTITE_ENTREPRISE_PAR_DEFAUT);

  useEffect(() => {
    if (!userRole) return;
    fetch("/api/plateforme/entreprise", { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Impossible de charger l'identité de l'entreprise.");
        setIdentite(data as IdentiteEntreprise);
      })
      .catch((error: unknown) => {
        console.error("Chargement de l'identité de l'entreprise impossible.", error);
      });
  }, [userRole]);

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-40 bg-inverse-surface/40 backdrop-blur-sm lg:hidden"
          onClick={onClose}
          aria-hidden
        />
      )}

      <aside
        className={cn(
          "fixed left-0 top-0 z-50 flex h-full w-sidebar-width flex-col bg-surface-container-low shadow-[1px_0_8px_rgba(0,0,0,0.02)] transition-transform duration-300",
          "lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}
      >
        <div className="flex h-16 items-center gap-3 px-gutter-md border-b border-surface-container-high">
          <div className="relative h-9 w-9 shrink-0">
            <Image
              src={identite.logoDataUrl || "/icons/icon.svg"}
              alt={identite.logoDataUrl ? `Logo ${identite.nomEntreprise}` : "Logo WOM"}
              fill
              unoptimized
              className="object-contain"
            />
          </div>
          <div className="flex min-w-0 flex-col">
            <span title={identite.nomEntreprise} className="truncate font-label-md text-label-md font-bold uppercase tracking-tight text-primary">
              {identite.sigle}
            </span>
            <span className="truncate font-label-sm text-label-sm text-on-surface-variant">
              Waste Operations Manager
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="ml-auto rounded-lg p-1 text-on-surface-variant hover:bg-surface-container-high lg:hidden"
            aria-label="Fermer le menu"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-gutter-sm py-unit">
          {navForRole(userRole).map((section, si) => {
            return (
              <div key={si}>
                {section.title && (
                  <div className="px-unit pb-unit pt-gutter-sm">
                    <span className="font-label-sm text-label-sm uppercase tracking-wider text-outline">
                      {section.title}
                    </span>
                  </div>
                )}
                {section.items.map((item) => {
                  const active = isActive(pathname, item);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={onClose}
                      className={cn(
                        "flex items-center gap-3 rounded-xl px-gutter-sm py-2 font-label-md text-label-md transition-all",
                        active
                          ? "bg-primary-container font-bold text-on-primary shadow-[0_1px_8px_rgba(0,0,0,0.04)]"
                          : "text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface"
                      )}
                    >
                      <span className="material-symbols-outlined text-[20px]">{item.icon}</span>
                      <span>{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            );
          })}
        </nav>

        <Link
          href="/profil"
          onClick={onClose}
          className="m-gutter-sm rounded-xl bg-surface-container-lowest p-gutter-sm shadow-[0_1px_8px_rgba(0,0,0,0.04)] hover:bg-surface-container-high transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary font-bold text-on-primary">
                <span className="material-symbols-outlined text-[18px]">person</span>
              </div>
              <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-status-reported border-2 border-white" />
            </div>
            <div className="min-w-0 flex-1">
              <span className="block truncate font-label-md text-label-md font-bold text-on-surface">
                {userName ?? "Utilisateur"}
              </span>
              <span className="block truncate font-label-sm text-label-sm text-on-surface-variant">
                {roleLabel(userRole)}
              </span>
            </div>
          </div>
        </Link>
      </aside>
    </>
  );
}
