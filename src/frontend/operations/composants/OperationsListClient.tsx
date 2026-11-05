"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { useCallback, useEffect, useState } from "react";
import { StatusBadge } from "@/frontend/design-system";
import { canWrite } from "@/shared/acces/permissions";
import type { OperationStatus } from "@/shared/operations/statuts";

interface OperationItem {
  _id: string;
  natureIntervention: string;
  dateHeurePrevue: string;
  statut: OperationStatus;
  quantiteCollectee?: number;
  uniteQuantite?: "Litres" | "Kg" | "M3" | "Bacs";
  nomSignataireClient?: string;
  signatureClient?: string;
  photos?: { url: string; nom: string }[];
  rapportPdf?: string;
  clientId?: { nom: string };
  siteId?: { nom: string };
  equipeId?: { nom: string };
  vehiculeId?: { identification: string };
}

export function OperationsListClient() {
  const { data: session } = useSession();
  const canEdit = canWrite(session?.user?.role);
  const [items, setItems] = useState<OperationItem[]>([]);
  const [loading, setLoading] = useState(true);

  const [statutFilter, setStatutFilter] = useState("");
  const [dateDebut, setDateDebut] = useState("");
  const [dateFin, setDateFin] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState("");

  const fetchOperations = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      params.set("collectes", "1");
      if (statutFilter) params.set("statut", statutFilter);
      if (dateDebut) params.set("dateDebut", dateDebut);
      if (dateFin) params.set("dateFin", dateFin);
      params.set("page", String(page));
      params.set("limit", "20");

      const res = await fetch(`/api/operations?${params.toString()}`);
      const data: { items?: unknown; total?: unknown; error?: unknown } = await res.json();
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Impossible de charger l'historique des collectes.");
      if (!Array.isArray(data.items) || typeof data.total !== "number") {
        throw new Error("La réponse de l'historique des collectes est invalide.");
      }
      setItems(data.items as OperationItem[]);
      setTotal(data.total);
    } catch (cause) {
      setItems([]);
      setTotal(0);
      setError(cause instanceof Error ? cause.message : "Erreur réseau lors du chargement des collectes.");
    } finally {
      setLoading(false);
    }
  }, [statutFilter, dateDebut, dateFin, page]);

  useEffect(() => {
    fetchOperations();
  }, [fetchOperations]);

  return (
    <div className="space-y-gutter-md p-margin-mobile lg:p-margin-desktop">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-headline-lg text-headline-lg font-bold text-on-surface">
            Historique des collectes
          </h1>
          <p className="font-body-md text-body-md text-on-surface-variant">
            Consultez les collectes réellement enregistrées, saisies dans l’application ou importées depuis Excel.
          </p>
        </div>
        {canEdit && (
          <Link
            href="/operations/nouveau"
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 font-label-md text-label-md font-semibold text-on-primary shadow-sm transition-all hover:bg-primary/90"
          >
            <span className="material-symbols-outlined text-[20px]">add</span>
            Enregistrer une collecte
          </Link>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-surface-container-high bg-surface-container-lowest p-gutter-sm">
        <label className="flex flex-col gap-1 font-label-sm text-label-sm font-medium text-on-surface">
          Statut
          <select
            value={statutFilter}
            onChange={(e) => { setStatutFilter(e.target.value); setPage(1); }}
            className="min-h-11 rounded-lg border border-outline-variant bg-surface px-3 py-2 font-body-md text-body-md text-on-surface outline-none"
          >
            <option value="">Tous les statuts</option>
            <option value="Terminée">Terminée</option>
            <option value="Rapportée">Rapportée</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 font-label-sm text-label-sm font-medium text-on-surface">
          Du
          <input
            aria-label="Date de début"
            type="date"
            value={dateDebut}
            onChange={(e) => { setDateDebut(e.target.value); setPage(1); }}
            className="min-h-11 rounded-lg border border-outline-variant bg-surface px-3 py-2 font-body-md text-body-md text-on-surface outline-none"
          />
        </label>
        <label className="flex flex-col gap-1 font-label-sm text-label-sm font-medium text-on-surface">
          Au
          <input
            aria-label="Date de fin"
            type="date"
            value={dateFin}
            onChange={(e) => { setDateFin(e.target.value); setPage(1); }}
            className="min-h-11 rounded-lg border border-outline-variant bg-surface px-3 py-2 font-body-md text-body-md text-on-surface outline-none"
          />
        </label>

        {(statutFilter || dateDebut || dateFin) && (
          <button
            type="button"
            onClick={() => {
              setStatutFilter("");
              setDateDebut("");
              setDateFin("");
              setPage(1);
            }}
            className="min-h-11 rounded-lg px-3 font-label-md text-label-md text-outline hover:text-on-surface"
          >
            Réinitialiser
          </button>
        )}
      </div>

      {error && <p role="alert" className="rounded-lg border border-error/30 bg-error-container/20 p-4 text-error">{error}</p>}

      <div className="overflow-hidden rounded-xl border border-surface-container-high bg-surface-container-lowest">
        <div className="overflow-x-auto">
          <table className="w-full text-left font-body-md text-body-md">
            <thead className="bg-surface-container-low font-label-md text-label-md text-on-surface-variant">
              <tr>
                <th className="px-gutter-md py-3 font-semibold">Client / Site</th>
                <th className="px-gutter-md py-3 font-semibold">Nature</th>
                <th className="px-gutter-md py-3 font-semibold">Date de collecte</th>
                <th className="px-gutter-md py-3 font-semibold">Quantité</th>
                <th className="px-gutter-md py-3 font-semibold">Statut</th>
                <th className="px-gutter-md py-3 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-container-high">
              {loading ? (
                <tr>
                  <td colSpan={6} className="p-gutter-md text-center text-outline">
                    Chargement...
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-gutter-md text-center text-outline">
                    Aucune collecte trouvée.
                  </td>
                </tr>
              ) : (
                items.map((op) => (
                  <tr key={op._id} className="hover:bg-surface-container-low/50">
                    <td className="px-gutter-md py-3">
                      <div className="font-semibold text-on-surface">{op.clientId?.nom || "—"}</div>
                      <div className="font-label-sm text-label-sm text-on-surface-variant">
                        {op.siteId?.nom || "—"}
                      </div>
                    </td>
                    <td className="px-gutter-md py-3 text-on-surface">{op.natureIntervention}</td>
                    <td className="px-gutter-md py-3 text-on-surface-variant">
                      {new Date(op.dateHeurePrevue).toLocaleString("fr-FR", {
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="px-gutter-md py-3 font-semibold text-on-surface">
                      {op.quantiteCollectee?.toLocaleString("fr-FR") ?? "—"} {op.uniteQuantite ?? "Litres"}
                    </td>
                    <td className="px-gutter-md py-3">
                      <StatusBadge status={op.statut} compact />
                    </td>
                    <td className="px-gutter-md py-3 text-right">
                      <Link
                        href={`/operations/${op._id}`}
                        className="inline-flex items-center gap-1 font-label-md text-label-md font-semibold text-primary hover:underline"
                      >
                        Détails
                        <span className="material-symbols-outlined text-[16px]">chevron_right</span>
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      <div className="flex items-center justify-between gap-3">
        <p className="font-body-sm text-on-surface-variant">{total.toLocaleString("fr-FR")} collecte(s)</p>
        <div className="flex items-center gap-2">
          <button type="button" disabled={loading || page <= 1} onClick={() => setPage((value) => value - 1)} className="min-h-11 rounded-lg border border-outline-variant px-3 font-label-md text-label-md text-on-surface disabled:opacity-50">Précédent</button>
          <span aria-live="polite" className="font-label-md text-label-md text-on-surface-variant">Page {page} / {Math.max(1, Math.ceil(total / 20))}</span>
          <button type="button" disabled={loading || page >= Math.ceil(total / 20)} onClick={() => setPage((value) => value + 1)} className="min-h-11 rounded-lg border border-outline-variant px-3 font-label-md text-label-md text-on-surface disabled:opacity-50">Suivant</button>
        </div>
      </div>
    </div>
  );
}
