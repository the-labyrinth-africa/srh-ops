"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const LOGO_URL =
  "https://lh3.googleusercontent.com/aida/AEtjO1UIOMOlwpX4WXcEJVQ2Ohnr_h8CJr8ezeAviwWd6bfftDfVYPIHz7hMK1R8At9R37SRIjsDzZHGgXwp7eYlpJZJj8cOIqbXk-0m3ywbzjSN4ZgLm4M1ssU9PKwfychAFZEOmhDJJGzY8OVK5QwCYl8QQT2Om6hjZLJSR5FnZqNP_hasv6LbUU1UBo9xK-OyywfTZmk6No7iNtUiNgFcRwQetY0ebRGhHR2YO9vWUV0tbrQcl_EYwfTc5xxs_vA8BAjmFAKzspyUYQ";

interface NavItem {
  href: string;
  label: string;
  icon: string;
  match?: (path: string) => boolean;
}

interface NavSection {
  title?: string;
  items: NavItem[];
}

const NAV_SECTIONS: NavSection[] = [
  {
    items: [
      { href: "/", label: "Tableau de bord", icon: "dashboard", match: (p) => p === "/" },
    ],
  },
  {
    title: "Opérations",
    items: [
      {
        href: "/operations/planning",
        label: "Planning",
        icon: "calendar_month",
        match: (p) => p.startsWith("/operations/planning"),
      },
      {
        href: "/operations",
        label: "Interventions",
        icon: "local_shipping",
        match: (p) =>
          p.startsWith("/operations") && !p.startsWith("/operations/planning"),
      },
    ],
  },
  {
    title: "Gestion",
    items: [
      {
        href: "/clients",
        label: "Clients & Sites",
        icon: "store",
        match: (p) => p.startsWith("/clients"),
      },
      {
        href: "/equipes",
        label: "Équipes & Chauffeurs",
        icon: "groups",
        match: (p) => p.startsWith("/equipes"),
      },
      {
        href: "/vehicules",
        label: "Flotte de véhicules",
        icon: "directions_car",
        match: (p) => p.startsWith("/vehicules"),
      },
      {
        href: "/equipements",
        label: "Équipements & Cuves",
        icon: "oil_barrel",
        match: (p) => p.startsWith("/equipements"),
      },
    ],
  },
];

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
        <div className="flex h-16 items-center gap-3 px-gutter-md">
          <Image src={LOGO_URL} alt="SRH Logo" width={32} height={32} className="h-8 w-auto object-contain" />
          <div className="flex flex-col">
            <span className="font-label-md text-label-md font-bold uppercase tracking-tight text-primary">
              SRH Recyclage
            </span>
            <span className="font-label-sm text-label-sm text-on-surface-variant">
              Service de Récupération d&apos;Huiles Usagées
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
          {NAV_SECTIONS.map((section, si) => (
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
          ))}
        </nav>

        <div className="m-gutter-sm rounded-xl bg-surface-container-lowest p-gutter-sm shadow-[0_1px_8px_rgba(0,0,0,0.04)]">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary">
                <span className="material-symbols-outlined text-[18px] text-on-primary">person</span>
              </div>
              <span className="absolute bottom-0 right-0 h-2 w-2 rounded-full bg-status-reported" />
            </div>
            <div className="min-w-0 flex-1">
              <span className="block truncate font-label-md text-label-md font-bold text-on-surface">
                {userName ?? "Utilisateur"}
              </span>
              <span className="block truncate font-label-sm text-label-sm text-on-surface-variant">
                {userRole ?? "Admin"}
              </span>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
