import Link from "next/link";
import type { TendanceMensuelle } from "@/shared/pilotage/tendance-mensuelle";
import { ExportOperations } from "../composants/ExportOperations";
import { StatusBadge } from "@/frontend/design-system";
import type { OperationStatus } from "@/shared/operations/statuts";

type DashboardStats = {
  prevues: number;
  enCours: number;
  terminees: number;
  retardees: number;
};

type TodayOperation = {
  id: string;
  natureIntervention: string;
  statut: OperationStatus;
  dateHeurePrevue: Date | string;
  clientNom?: string;
  siteNom?: string;
};

export function TableauDeBordDirection({
  stats,
  todayOps,
  totalClients,
  totalSites,
  tendance,
  dateDebutExport,
  dateFinExport,
}: {
  stats: DashboardStats;
  todayOps: TodayOperation[];
  totalClients: number;
  totalSites: number;
  tendance: TendanceMensuelle[];
  dateDebutExport: string;
  dateFinExport: string;
}) {
  const maximum = Math.max(1, ...tendance.flatMap((mois) => [
    mois.prevues,
    mois.enCours,
    mois.terminees,
    mois.retardees,
  ]));

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

      <section aria-labelledby="tendance-title" className="mb-gutter-md rounded-2xl bg-surface-container-lowest p-6 shadow-sm">
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 id="tendance-title" className="font-headline-sm text-headline-sm text-on-surface">
              Tendance des opérations
            </h2>
            <p className="mt-1 font-body-md text-body-md text-on-surface-variant">
              Répartition mensuelle par statut effectif sur les six derniers mois.
            </p>
          </div>
          <ExportOperations dateDebutInitiale={dateDebutExport} dateFinInitiale={dateFinExport} />
        </div>
        <div
          role="img"
          aria-label={tendance
            .map((mois) => `${labelMois(mois.mois)} : ${mois.prevues} prévues, ${mois.enCours} en cours, ${mois.terminees} terminées, ${mois.retardees} retardées`)
            .join(". ")}
          className="grid grid-cols-3 gap-4 sm:grid-cols-6"
        >
          {tendance.map((mois) => (
            <div key={mois.mois} className="flex min-w-0 flex-col items-center gap-2">
              <div className="flex h-32 w-full items-end justify-center gap-1 border-b border-outline-variant px-1" aria-hidden="true">
                <BarreTendance value={mois.prevues} maximum={maximum} color="bg-status-planned" />
                <BarreTendance value={mois.enCours} maximum={maximum} color="bg-status-in-progress" />
                <BarreTendance value={mois.terminees} maximum={maximum} color="bg-status-completed" />
                <BarreTendance value={mois.retardees} maximum={maximum} color="bg-status-delayed" />
              </div>
              <span className="font-label-sm text-label-sm text-on-surface-variant">{labelMois(mois.mois)}</span>
              <span className="font-label-sm text-label-sm font-semibold text-on-surface">
                {mois.prevues + mois.enCours + mois.terminees + mois.retardees} opérations
              </span>
            </div>
          ))}
        </div>
        <ul className="mt-5 flex flex-wrap gap-x-5 gap-y-2 font-label-sm text-label-sm text-on-surface-variant" aria-label="Légende du graphique">
          {[
            ["bg-status-planned", "Prévues"],
            ["bg-status-in-progress", "En cours"],
            ["bg-status-completed", "Terminées"],
            ["bg-status-delayed", "Retardées"],
          ].map(([color, label]) => (
            <li key={label} className="flex items-center gap-2">
              <span aria-hidden="true" className={`h-3 w-3 rounded-sm ${color}`} />
              {label}
            </li>
          ))}
        </ul>
        <div className="mt-5 overflow-x-auto">
          <table className="w-full table-fixed border-collapse text-left font-label-sm text-label-sm">
            <caption className="sr-only">Valeurs mensuelles exactes du graphique par statut effectif</caption>
            <thead>
              <tr className="border-b border-outline-variant text-on-surface-variant">
                <th scope="col" className="w-1/5 px-1 py-2">Mois</th>
                <th scope="col" className="px-1 py-2">Prévues</th>
                <th scope="col" className="px-1 py-2">En cours</th>
                <th scope="col" className="px-1 py-2">Terminées</th>
                <th scope="col" className="px-1 py-2">Retardées</th>
              </tr>
            </thead>
            <tbody>
              {tendance.map((mois) => (
                <tr key={mois.mois} className="border-b border-outline-variant/60 text-on-surface">
                  <th scope="row" className="px-1 py-2 font-semibold">{labelMois(mois.mois)}</th>
                  <td className="px-1 py-2">{mois.prevues}</td>
                  <td className="px-1 py-2">{mois.enCours}</td>
                  <td className="px-1 py-2">{mois.terminees}</td>
                  <td className="px-1 py-2">{mois.retardees}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

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
            {todayOps.map((op) => (
              <Link
                key={op.id}
                href={`/operations/${op.id}`}
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
                    <StatusBadge status={op.statut} />
                  </div>
                  <p className="truncate font-body-md text-body-md text-on-surface-variant">
                    {op.clientNom} — {op.siteNom}
                  </p>
                  <p className="mt-1 font-label-sm text-label-sm uppercase tracking-widest text-on-surface-variant/70">
                    {new Date(op.dateHeurePrevue).toLocaleTimeString("fr-FR", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function BarreTendance({ value, maximum, color }: { value: number; maximum: number; color: string }) {
  return (
    <span
      className={`w-full max-w-4 rounded-t-sm ${color}`}
      style={{ height: `${Math.max(value === 0 ? 0 : 4, (value / maximum) * 112)}px` }}
    />
  );
}

function labelMois(mois: string): string {
  const [annee, numero] = mois.split("-").map(Number);
  return new Intl.DateTimeFormat("fr-FR", { month: "short" }).format(new Date(annee, numero - 1, 1));
}

const KPI_CARDS = [
  { key: "prevues" as const, label: "Prévues", sub: "missions", icon: "event", accent: "bg-status-planned", iconCls: "text-status-planned bg-status-planned/10" },
  { key: "enCours" as const, label: "En cours", sub: "actives", icon: "local_shipping", accent: "bg-status-in-progress", iconCls: "text-status-in-progress bg-status-in-progress/10" },
  { key: "terminees" as const, label: "Réalisées", sub: "terminées", icon: "check_circle", accent: "bg-status-completed", iconCls: "text-status-completed bg-status-completed/10" },
  { key: "retardees" as const, label: "En retard", sub: "alertes", icon: "warning", accent: "bg-status-delayed", iconCls: "text-status-delayed bg-status-delayed/10" },
];
