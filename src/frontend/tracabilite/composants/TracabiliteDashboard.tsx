"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { formatApiError } from "@/frontend/design-system";
import type { TraceabiliteView } from "../types";

export function TracabiliteDashboard() {
  const [items, setItems] = useState<TraceabiliteView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/tracabilite");
      const data = await response.json();
      if (!response.ok) {
        setError(formatApiError(data.error));
        return;
      }
      if (!Array.isArray(data.items)) {
        setError("Réponse de traçabilité invalide.");
        return;
      }
      setItems(data.items);
    } catch {
      setError("Impossible de charger les données de traçabilité. Vérifiez votre connexion puis réessayez.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const visibles = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("fr");
    if (!needle) return items;
    return items.filter((item) =>
      [
        item.identifiantSuivi,
        item.typeDechet,
        item.traitement,
        item.operation?.natureIntervention,
        item.operation?.client?.nom,
        item.operation?.site?.nom,
      ]
        .filter((value): value is string => typeof value === "string")
        .some((value) => value.toLocaleLowerCase("fr").includes(needle))
    );
  }, [items, query]);
  const dataDisponible = !loading && !error;

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-margin-mobile lg:p-margin-desktop">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-label-sm text-label-sm font-semibold uppercase tracking-wider text-primary">
            Phase 3 · Suivi des flux
          </p>
          <h1 className="mt-1 font-headline-lg text-headline-lg font-bold text-on-surface">
            Traçabilité des déchets
          </h1>
          <p className="mt-2 max-w-2xl font-body-md text-body-md text-on-surface-variant">
            Retrouvez les identifiants, quantités et traitements associés aux collectes.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="min-h-11 self-start rounded-xl border border-outline-variant bg-surface px-4 py-2 font-label-md text-label-md font-semibold text-on-surface hover:bg-surface-container-high focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-50 sm:self-auto"
        >
          Actualiser
        </button>
      </header>

      <div className="grid gap-3 sm:grid-cols-3">
        <article className="rounded-xl border border-surface-container-high bg-surface-container-lowest p-4">
          <p className="font-label-sm text-label-sm text-on-surface-variant">Lignes de traçabilité</p>
          <p className="mt-1 font-headline-md text-headline-md font-bold text-on-surface">{dataDisponible ? items.length : "—"}</p>
        </article>
        <article className="rounded-xl border border-surface-container-high bg-surface-container-lowest p-4">
          <p className="font-label-sm text-label-sm text-on-surface-variant">Types de déchets</p>
          <p className="mt-1 font-headline-md text-headline-md font-bold text-on-surface">
            {dataDisponible ? new Set(items.map((item) => item.typeDechet.toLocaleLowerCase("fr"))).size : "—"}
          </p>
        </article>
        <article className="rounded-xl border border-surface-container-high bg-surface-container-lowest p-4">
          <p className="font-label-sm text-label-sm text-on-surface-variant">Opérations suivies</p>
          <p className="mt-1 font-headline-md text-headline-md font-bold text-on-surface">
            {dataDisponible ? new Set(items.map((item) => item.operationId)).size : "—"}
          </p>
        </article>
      </div>

      <section className="space-y-4 rounded-xl border border-surface-container-high bg-surface-container-lowest p-4 lg:p-6">
        <div>
          <label htmlFor="traceability-search" className="block font-label-md text-label-md font-semibold text-on-surface">
            Rechercher
          </label>
          <input
            id="traceability-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Identifiant, déchet, client, site ou traitement"
            className="mt-1 min-h-11 w-full rounded-lg border border-outline-variant bg-surface px-3 py-2 text-on-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary sm:max-w-xl"
          />
        </div>

        {error && (
          <div role="alert" className="rounded-xl bg-error-container p-3 text-on-error-container">
            {error}
          </div>
        )}
        {loading ? (
          <p role="status" className="py-8 text-center text-on-surface-variant">Chargement des enregistrements...</p>
        ) : error ? null : visibles.length === 0 ? (
          <p className="rounded-xl border border-dashed border-outline-variant p-6 text-center text-on-surface-variant">
            {items.length === 0 ? "Aucune donnée de traçabilité n'a encore été saisie." : "Aucun résultat pour cette recherche."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse text-left">
              <thead>
                <tr className="border-b border-outline-variant text-label-sm text-on-surface-variant">
                  <th scope="col" className="px-3 py-3 font-semibold">Suivi / déchet</th>
                  <th scope="col" className="px-3 py-3 font-semibold">Quantité</th>
                  <th scope="col" className="px-3 py-3 font-semibold">Traitement</th>
                  <th scope="col" className="px-3 py-3 font-semibold">Opération / site</th>
                  <th scope="col" className="px-3 py-3 font-semibold">Enregistré le</th>
                </tr>
              </thead>
              <tbody>
                {visibles.map((item) => (
                  <tr key={item.id} className="border-b border-surface-container-high last:border-0">
                    <td className="px-3 py-4">
                      <span className="block font-label-md text-label-md font-semibold text-on-surface">{item.identifiantSuivi}</span>
                      <span className="block font-body-sm text-body-sm text-on-surface-variant">{item.typeDechet}</span>
                    </td>
                    <td className="px-3 py-4 font-body-md text-body-md text-on-surface">{item.volume} {item.unite}</td>
                    <td className="px-3 py-4 font-body-md text-body-md text-on-surface">{item.traitement}</td>
                    <td className="px-3 py-4">
                      {item.operation ? (
                        <Link
                          href={`/operations/${item.operationId}`}
                          className="rounded-sm font-label-md text-label-md font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                        >
                          {item.operation.natureIntervention}
                          <span className="block font-body-sm text-body-sm font-normal text-on-surface-variant">
                            {item.operation.client?.nom ?? "Client"} · {item.operation.site?.nom ?? "Site"}
                          </span>
                        </Link>
                      ) : (
                        <span className="text-on-surface-variant">Opération introuvable</span>
                      )}
                    </td>
                    <td className="px-3 py-4 font-body-sm text-body-sm text-on-surface-variant">
                      {new Date(item.createdAt).toLocaleDateString("fr-FR")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {dataDisponible && items.length > 0 && (
          <p className="font-label-sm text-label-sm text-on-surface-variant">
            {visibles.length} résultat{visibles.length === 1 ? "" : "s"} sur {items.length}
          </p>
        )}
      </section>
    </div>
  );
}
