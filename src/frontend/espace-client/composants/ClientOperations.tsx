"use client";

import { useCallback, useEffect, useState } from "react";
import { StatusBadge } from "@/frontend/design-system";
import { OPERATION_STATUSES, type OperationStatus } from "@/shared/operations/statuts";

interface OperationClient {
  _id: string;
  natureIntervention: string;
  dateHeurePrevue: string;
  statut: OperationStatus;
  quantiteCollectee?: number;
  uniteQuantite: string;
  siteId?: { nom?: string; adresse?: string } | string | null;
}

const PAGE_SIZE = 20;

function nomSite(site: OperationClient["siteId"]) {
  return typeof site === "object" && site ? site.nom ?? "Site" : "Site";
}

export function ClientOperations() {
  const [items, setItems] = useState<OperationClient[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [statut, setStatut] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const query = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
    if (statut) query.set("statut", statut);
    try {
      const response = await fetch(`/api/espace-client/operations?${query}`);
      const data = await response.json();
      if (!response.ok) {
        setError(typeof data.error === "string" ? data.error : "Impossible de charger vos opérations.");
        return;
      }
      setItems(data.items);
      setTotal(data.total);
    } catch {
      setError("Connexion au serveur impossible. Vérifiez votre connexion Internet et réessayez.");
    } finally {
      setLoading(false);
    }
  }, [page, statut]);

  useEffect(() => {
    void load();
  }, [load]);

  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="mx-auto max-w-6xl space-y-5 px-margin-mobile py-gutter-lg lg:px-margin-desktop">
      <header>
        <p className="font-label-sm text-label-sm font-bold uppercase tracking-widest text-primary">Espace client</p>
        <h1 className="mt-2 font-headline-lg-mobile text-headline-lg-mobile font-bold text-on-surface lg:font-headline-lg lg:text-headline-lg">Vos opérations</h1>
        <p className="mt-2 font-body-md text-body-md text-on-surface-variant">La liste est limitée aux opérations de votre entreprise.</p>
      </header>

      <div className="flex flex-col gap-3 rounded-2xl border border-surface-container-high bg-surface-container-lowest p-4 sm:flex-row sm:items-end sm:justify-between">
        <label className="max-w-sm space-y-1 font-label-sm text-label-sm font-semibold text-on-surface">
          Filtrer par statut
          <select value={statut} onChange={(event) => { setStatut(event.target.value); setPage(1); }} className="min-h-11 w-full rounded-xl border border-outline-variant bg-surface px-3 text-body-md text-on-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
            <option value="">Tous les statuts</option>
            {OPERATION_STATUSES.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
        <span className="font-body-sm text-body-sm text-on-surface-variant">{total} opération{total > 1 ? "s" : ""}</span>
      </div>

      {error && <div role="alert" className="rounded-xl bg-error-container p-4 text-on-error-container">{error}<button type="button" onClick={() => void load()} className="ml-3 min-h-11 underline">Réessayer</button></div>}

      <section aria-label="Liste des opérations" className="overflow-hidden rounded-2xl border border-surface-container-high bg-surface-container-lowest">
        {loading ? <p role="status" className="p-6 text-on-surface-variant">Chargement des opérations…</p> :
          items.length ? <ul className="divide-y divide-surface-container-high">
            {items.map((item) => <li key={item._id} className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-label-md text-label-md font-bold text-on-surface">{item.natureIntervention}</p>
                <p className="mt-1 font-body-sm text-body-sm text-on-surface-variant">{nomSite(item.siteId)} · {new Date(item.dateHeurePrevue).toLocaleString("fr-FR")}</p>
                {item.quantiteCollectee !== undefined && <p className="mt-1 font-body-sm text-body-sm text-on-surface">{item.quantiteCollectee} {item.uniteQuantite} collectés</p>}
              </div>
              <StatusBadge status={item.statut} />
            </li>)}
          </ul> : <p className="p-8 text-center font-body-md text-body-md text-on-surface-variant">Aucune opération ne correspond à ce filtre.</p>}
      </section>

      <nav aria-label="Pagination des opérations" className="flex items-center justify-between">
        <button type="button" disabled={page <= 1 || loading} onClick={() => setPage((current) => current - 1)} className="min-h-11 rounded-xl border border-outline-variant px-4 py-2 font-label-md text-label-md font-semibold text-on-surface disabled:opacity-50">Précédent</button>
        <span aria-live="polite" className="font-body-sm text-body-sm text-on-surface-variant">Page {page} sur {lastPage}</span>
        <button type="button" disabled={page >= lastPage || loading} onClick={() => setPage((current) => current + 1)} className="min-h-11 rounded-xl border border-outline-variant px-4 py-2 font-label-md text-label-md font-semibold text-on-surface disabled:opacity-50">Suivant</button>
      </nav>
    </div>
  );
}
