export const dynamic = "force-dynamic";

import Link from "next/link";
import { connectDB } from "@/lib/db";
import { computeEffectiveStatus } from "@/lib/status-transitions";
import { Client } from "@/models/Client";
import { Site } from "@/models/Site";
import { Operation } from "@/models/Operation";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type { OperationStatus } from "@/types";

async function getDashboardData() {
  await connectDB();
  const operations = await Operation.find().lean();
  const effectiveStatuses = operations.map((op) =>
    computeEffectiveStatus(op.statut as OperationStatus, new Date(op.dateHeurePrevue))
  );

  const stats = {
    prevues: effectiveStatuses.filter((s) => ["Planifiée", "Affectée"].includes(s)).length,
    enCours: effectiveStatuses.filter((s) => ["En route", "En cours"].includes(s)).length,
    terminees: effectiveStatuses.filter((s) => ["Terminée", "Rapportée"].includes(s)).length,
    retardees: effectiveStatuses.filter((s) => s === "Retardée").length,
  };

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  const [todayOps, totalClients, totalSites] = await Promise.all([
    Operation.find({ dateHeurePrevue: { $gte: todayStart, $lte: todayEnd } })
      .populate("clientId", "nom")
      .populate("siteId", "nom")
      .sort({ dateHeurePrevue: 1 })
      .lean(),
    Client.countDocuments(),
    Site.countDocuments(),
  ]);

  return { stats, todayOps, totalClients, totalSites };
}

const KPI_CARDS = [
  { key: "prevues" as const, label: "Prévues", sub: "missions", icon: "event", accent: "bg-status-planned", iconCls: "text-status-planned bg-status-planned/10" },
  { key: "enCours" as const, label: "En cours", sub: "actives", icon: "local_shipping", accent: "bg-status-in-progress", iconCls: "text-status-in-progress bg-status-in-progress/10" },
  { key: "terminees" as const, label: "Réalisées", sub: "terminées", icon: "check_circle", accent: "bg-status-completed", iconCls: "text-status-completed bg-status-completed/10" },
  { key: "retardees" as const, label: "En retard", sub: "alertes", icon: "warning", accent: "bg-status-delayed", iconCls: "text-status-delayed bg-status-delayed/10" },
];

export default async function DashboardPage() {
  const { stats, todayOps, totalClients, totalSites } = await getDashboardData();

  return (
    <div className="relative w-full overflow-hidden px-margin-mobile py-6 lg:px-margin-desktop lg:py-8">
      <div className="absolute right-0 top-0 -z-10 h-96 w-96 translate-x-1/3 -translate-y-1/3 rounded-full bg-primary-fixed/30 opacity-50 blur-3xl mix-blend-multiply" />

      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between lg:mb-8">
        <div>
          <p className="mb-2 font-label-sm text-label-sm uppercase tracking-widest text-primary">
            Overview
          </p>
          <h1 className="font-headline-lg-mobile text-headline-lg-mobile text-on-surface lg:font-headline-lg lg:text-headline-lg">
            Tableau de Bord <span className="font-light italic text-on-surface-variant">Direction</span>
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/operations/planning"
            className="flex items-center gap-2 rounded-lg bg-surface-container px-4 py-2 font-label-md text-label-md text-on-surface shadow-sm transition-colors hover:bg-surface-container-high"
          >
            <span className="material-symbols-outlined text-[18px]">calendar_month</span>
            Aujourd&apos;hui
          </Link>
          <Link
            href="/operations/nouveau"
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 font-label-md text-label-md text-on-primary shadow-md transition-colors hover:bg-surface-tint"
          >
            <span className="material-symbols-outlined text-[18px]">add</span>
            Nouvelle collecte
          </Link>
        </div>
      </div>

      <div className="relative z-10 mb-gutter-md grid grid-cols-1 gap-gutter-md sm:grid-cols-2 xl:grid-cols-4">
        {KPI_CARDS.map((card) => (
          <div
            key={card.key}
            className="group relative overflow-hidden rounded-2xl bg-surface-container-lowest p-5 shadow-sm"
          >
            <div className={`absolute left-0 top-0 h-full w-1 ${card.accent} opacity-0 transition-opacity group-hover:opacity-100`} />
            <div className="mb-4 flex items-start justify-between">
              <span className="font-label-md text-label-md uppercase tracking-wider text-on-surface-variant">
                {card.label}
              </span>
              <span className={`material-symbols-outlined rounded-lg p-1.5 ${card.iconCls}`}>
                {card.icon}
              </span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="font-kpi-value text-kpi-value text-on-surface">{stats[card.key]}</span>
              <span className="font-body-md text-body-md text-on-surface-variant">{card.sub}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="mb-gutter-md grid grid-cols-1 gap-gutter-md sm:grid-cols-2">
        <div className="rounded-2xl bg-surface-container p-6 shadow-sm">
          <span className="material-symbols-outlined mb-4 text-[28px] text-primary">domain</span>
          <p className="mb-1 font-label-md text-label-md uppercase tracking-wider text-on-surface-variant">
            Total Clients
          </p>
          <p className="font-kpi-value text-kpi-value text-on-surface">{totalClients}</p>
        </div>
        <div className="rounded-2xl bg-surface-container p-6 shadow-sm">
          <span className="material-symbols-outlined mb-4 text-[28px] text-secondary">factory</span>
          <p className="mb-1 font-label-md text-label-md uppercase tracking-wider text-on-surface-variant">
            Sites Actifs
          </p>
          <p className="font-kpi-value text-kpi-value text-on-surface">{totalSites}</p>
        </div>
      </div>

      <div className="rounded-2xl bg-surface-container-lowest p-6 shadow-sm">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="flex items-center gap-2 font-headline-sm text-headline-sm text-on-surface">
            <span className="material-symbols-outlined text-status-in-progress">today</span>
            Opérations du jour
          </h2>
          <Link href="/operations" className="font-label-md text-label-md text-primary hover:underline">
            Voir tout
          </Link>
        </div>
        {todayOps.length === 0 ? (
          <p className="font-body-md text-body-md text-on-surface-variant">
            Aucune opération planifiée aujourd&apos;hui.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {todayOps.map((op) => {
              const id = String(op._id);
              const statut = computeEffectiveStatus(
                op.statut as OperationStatus,
                new Date(op.dateHeurePrevue)
              );
              return (
                <Link
                  key={id}
                  href={`/operations/${id}`}
                  className="group relative flex items-start gap-3 overflow-hidden rounded-xl bg-surface p-4 transition-shadow hover:shadow-md"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-container-high">
                    <span className="material-symbols-outlined text-[20px] text-on-surface-variant">
                      local_shipping
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex flex-wrap items-start justify-between gap-2">
                      <h3 className="truncate font-label-md text-label-md text-on-surface">
                        {op.natureIntervention}
                      </h3>
                      <StatusBadge status={statut} />
                    </div>
                    <p className="truncate font-body-md text-body-md text-on-surface-variant">
                      {(op.clientId as { nom?: string })?.nom} — {(op.siteId as { nom?: string })?.nom}
                    </p>
                    <p className="mt-1 font-label-sm text-label-sm uppercase tracking-widest text-on-surface-variant/70">
                      {new Date(op.dateHeurePrevue).toLocaleTimeString("fr-FR", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
