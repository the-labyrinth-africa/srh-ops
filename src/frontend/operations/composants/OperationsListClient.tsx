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

  const fetchOperations = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statutFilter) params.set("statut", statutFilter);
      if (dateDebut) params.set("dateDebut", dateDebut);
      if (dateFin) params.set("dateFin", dateFin);

      const res = await fetch(`/api/operations?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setItems(Array.isArray(data.items) ? data.items : []);
      }
    } catch {
      // Ignorer
    } finally {
      setLoading(false);
    }
  }, [statutFilter, dateDebut, dateFin]);

  useEffect(() => {
    fetchOperations();
  }, [fetchOperations]);

  return (
    <div className="space-y-gutter-md p-margin-mobile lg:p-margin-desktop">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-headline-lg text-headline-lg font-bold text-on-surface">
            Interventions & Opérations
          </h1>
          <p className="font-body-md text-body-md text-on-surface-variant">
            Suivi des opérations de collecte sur le terrain.
          </p>
        </div>
        {canEdit && (
          <Link
            href="/operations/nouveau"
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 font-label-md text-label-md font-semibold text-on-primary shadow-sm transition-all hover:bg-primary/90"
          >
            <span className="material-symbols-outlined text-[20px]">add</span>
            Nouvelle opération
          </Link>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-surface-container-high bg-surface-container-lowest p-gutter-sm">
        <select
          value={statutFilter}
          onChange={(e) => setStatutFilter(e.target.value)}
          className="rounded-lg border border-outline-variant bg-surface px-3 py-2 font-body-md text-body-md text-on-surface outline-none"
        >
          <option value="">Tous les statuts</option>
          <option value="Planifiée">Planifiée</option>
          <option value="Affectée">Affectée</option>
          <option value="En route">En route</option>
          <option value="En cours">En cours</option>
          <option value="Terminée">Terminée</option>
          <option value="Rapportée">Rapportée</option>
          <option value="Retardée">Retardée</option>
          <option value="Annulée">Annulée</option>
        </select>

        <input
          type="date"
          value={dateDebut}
          onChange={(e) => setDateDebut(e.target.value)}
          className="rounded-lg border border-outline-variant bg-surface px-3 py-2 font-body-md text-body-md text-on-surface outline-none"
        />

        <input
          type="date"
          value={dateFin}
          onChange={(e) => setDateFin(e.target.value)}
          className="rounded-lg border border-outline-variant bg-surface px-3 py-2 font-body-md text-body-md text-on-surface outline-none"
        />

        {(statutFilter || dateDebut || dateFin) && (
          <button
            type="button"
            onClick={() => {
              setStatutFilter("");
              setDateDebut("");
              setDateFin("");
            }}
            className="font-label-md text-label-md text-outline hover:text-on-surface"
          >
            Réinitialiser
          </button>
        )}
      </div>

      <div className="overflow-hidden rounded-xl border border-surface-container-high bg-surface-container-lowest">
        <div className="overflow-x-auto">
          <table className="w-full text-left font-body-md text-body-md">
            <thead className="bg-surface-container-low font-label-md text-label-md text-on-surface-variant">
              <tr>
                <th className="px-gutter-md py-3 font-semibold">Client / Site</th>
                <th className="px-gutter-md py-3 font-semibold">Nature</th>
                <th className="px-gutter-md py-3 font-semibold">Date prévue</th>
                <th className="px-gutter-md py-3 font-semibold">Équipe / Véhicule</th>
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
                    Aucune opération trouvée.
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
                    <td className="px-gutter-md py-3">
                      <div>{op.equipeId?.nom || "Non affectée"}</div>
                      <div className="font-label-sm text-label-sm text-outline">
                        {op.vehiculeId?.identification || ""}
                      </div>
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
    </div>
  );
}
