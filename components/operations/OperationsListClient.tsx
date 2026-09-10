"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { useCallback, useEffect, useState } from "react";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { canWrite } from "@/lib/permissions";
import type { OperationStatus } from "@/types";

interface OperationItem {
  _id: string;
  natureIntervention: string;
  dateHeurePrevue: string;
  statut: OperationStatus;
  clientId?: { nom: string };
  siteId?: { nom: string };
  equipeId?: { nom: string };
  vehiculeId?: { identification: string };
}

export function OperationsListClient() {
  const { data: session } = useSession();
  const canEdit = canWrite(session?.user?.role);
  const [items, setItems] = useState<OperationItem[]>([]);
  const [statut, setStatut] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (statut) params.set("statut", statut);
      const res = await fetch(`/api/operations?${params}`);
      if (!res.ok) return;
      const data = await res.json();
      setItems(data.items ?? []);
    } catch (err) {
      console.error("Erreur chargement opérations:", err);
    } finally {
      setLoading(false);
    }
  }, [statut]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="flex flex-col gap-gutter-md p-margin-mobile lg:p-margin-desktop">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-headline-lg-mobile text-headline-lg-mobile text-on-surface lg:font-headline-lg lg:text-headline-lg">
            Interventions
          </h1>
          <p className="font-body-md text-body-md text-on-surface-variant">
            Liste filtrable des opérations de collecte planifiées.
          </p>
        </div>
        {canEdit && (
          <Link
            href="/operations/nouveau"
            className="flex items-center gap-2 self-start rounded-full bg-primary px-5 py-3 font-label-md text-label-md text-on-primary shadow-md"
          >
            <span className="material-symbols-outlined text-[20px]">add</span>
            Planifier une collecte
          </Link>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setStatut("")}
          className={`rounded-full px-4 py-1.5 font-label-md text-label-md ${!statut ? "bg-primary-container text-on-primary-container" : "bg-surface text-on-surface-variant hover:bg-surface-container-high"}`}
        >
          Tous
        </button>
        {(["Planifiée", "Affectée", "En route", "En cours", "Terminée", "Retardée", "Annulée"] as OperationStatus[]).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStatut(s)}
            className={`rounded-full px-4 py-1.5 font-label-md text-label-md ${statut === s ? "bg-primary-container text-on-primary-container" : "bg-surface text-on-surface-variant hover:bg-surface-container-high"}`}
          >
            {s}
          </button>
        ))}
      </div>

      <div className="overflow-hidden rounded-3xl bg-surface-container shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[768px]">
            <thead>
              <tr className="border-b border-outline-variant/30 bg-surface-container-low">
                <th className="px-4 py-3 text-left font-label-md text-label-md uppercase text-on-surface-variant">Intervention</th>
                <th className="px-4 py-3 text-left font-label-md text-label-md uppercase text-on-surface-variant">Client / Site</th>
                <th className="px-4 py-3 text-left font-label-md text-label-md uppercase text-on-surface-variant">Date</th>
                <th className="px-4 py-3 text-left font-label-md text-label-md uppercase text-on-surface-variant">Ressources</th>
                <th className="px-4 py-3 text-left font-label-md text-label-md uppercase text-on-surface-variant">Statut</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} className="px-4 py-8 text-center font-body-md text-body-md text-on-surface-variant">Chargement...</td></tr>
              ) : items.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-8 text-center font-body-md text-body-md text-on-surface-variant">Aucune opération</td></tr>
              ) : (
                items.map((op, i) => (
                  <tr key={op._id} className={`cursor-pointer hover:bg-surface-container-high/50 ${i % 2 === 0 ? "bg-surface-container-lowest" : ""}`}>
                    <td className="px-4 py-4">
                      <Link href={`/operations/${op._id}`} className="font-label-md text-label-md text-on-surface hover:text-primary">
                        {op.natureIntervention}
                      </Link>
                    </td>
                    <td className="px-4 py-4 font-body-md text-body-md text-on-surface-variant">
                      {op.clientId?.nom} — {op.siteId?.nom}
                    </td>
                    <td className="px-4 py-4 font-body-md text-body-md text-on-surface-variant">
                      {new Date(op.dateHeurePrevue).toLocaleString("fr-FR")}
                    </td>
                    <td className="px-4 py-4 font-label-sm text-label-sm text-on-surface-variant">
                      {op.equipeId?.nom ?? "—"} / {op.vehiculeId?.identification ?? "—"}
                    </td>
                    <td className="px-4 py-4">
                      <StatusBadge status={op.statut} />
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
