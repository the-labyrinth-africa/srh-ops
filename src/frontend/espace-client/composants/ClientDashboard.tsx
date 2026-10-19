"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { StatusBadge } from "@/frontend/design-system";
import type { OperationStatus } from "@/shared/operations/statuts";

interface OperationClient {
  _id: string;
  natureIntervention: string;
  dateHeurePrevue: string;
  statut: OperationStatus;
  siteId?: { nom?: string; adresse?: string } | string | null;
}

interface ResumeClient {
  total: number;
  demandesEnAttente: number;
  terminees: number;
  recent: OperationClient[];
}

function siteNom(operation: OperationClient) {
  return typeof operation.siteId === "object" && operation.siteId ? operation.siteId.nom : "Site";
}

export function ClientDashboard() {
  const [resume, setResume] = useState<ResumeClient | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/espace-client/dashboard");
      const data = await response.json();
      if (!response.ok) {
        setError(typeof data.error === "string" ? data.error : "Impossible de charger votre espace client.");
        return;
      }
      setResume(data as ResumeClient);
    } catch {
      setError("Connexion au serveur impossible. Vérifiez votre connexion Internet et réessayez.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-margin-mobile py-gutter-lg lg:px-margin-desktop">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-label-sm text-label-sm font-bold uppercase tracking-widest text-primary">Espace client SRH</p>
          <h1 className="mt-2 font-headline-lg-mobile text-headline-lg-mobile font-bold text-on-surface lg:font-headline-lg lg:text-headline-lg">Suivi de vos collectes</h1>
          <p className="mt-2 max-w-2xl font-body-md text-body-md text-on-surface-variant">Consultez les opérations rattachées à votre entreprise ou soumettez une nouvelle demande.</p>
        </div>
        <Link href="/espace-client/nouvelle-demande" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2 font-label-md text-label-md font-bold text-on-primary transition hover:bg-primary/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
          <span aria-hidden="true" className="material-symbols-outlined">add</span>
          Demander une collecte
        </Link>
      </header>

      {error && (
        <div role="alert" className="rounded-xl border border-error/20 bg-error-container p-4 text-on-error-container">
          <p>{error}</p>
          <button type="button" onClick={() => void load()} className="mt-2 min-h-11 font-label-md text-label-md font-semibold underline">Réessayer</button>
        </div>
      )}

      <section aria-label="Synthèse des opérations" className="grid gap-4 sm:grid-cols-3">
        {[
          { label: "Opérations suivies", value: resume?.total },
          { label: "Demandes à traiter", value: resume?.demandesEnAttente },
          { label: "Collectes terminées", value: resume?.terminees },
        ].map((stat) => (
          <article key={stat.label} className="rounded-2xl border border-surface-container-high bg-surface-container-lowest p-5 shadow-sm">
            <p className="font-label-sm text-label-sm font-semibold text-on-surface-variant">{stat.label}</p>
            <p className="mt-2 font-headline-lg text-headline-lg font-bold text-on-surface">
              {loading ? <span className="sr-only">Chargement</span> : stat.value ?? "—"}
              {loading && <span aria-hidden="true" className="inline-block h-8 w-12 animate-pulse rounded bg-surface-container-high" />}
            </p>
          </article>
        ))}
      </section>

      <section className="overflow-hidden rounded-2xl border border-surface-container-high bg-surface-container-lowest shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-surface-container-high px-5 py-4">
          <div>
            <h2 className="font-headline-sm text-headline-sm font-bold text-on-surface">Activité récente</h2>
            <p className="mt-1 font-body-sm text-body-sm text-on-surface-variant">Les demandes publiques non vérifiées n’apparaissent pas ici.</p>
          </div>
          <Link href="/espace-client/operations" className="inline-flex min-h-11 items-center gap-1 font-label-md text-label-md font-semibold text-primary hover:underline">
            Toutes les opérations <span aria-hidden="true" className="material-symbols-outlined">arrow_forward</span>
          </Link>
        </div>
        {loading ? (
          <p role="status" className="p-6 font-body-md text-body-md text-on-surface-variant">Chargement de vos opérations…</p>
        ) : resume?.recent.length ? (
          <ul className="divide-y divide-surface-container-high">
            {resume.recent.map((operation) => (
              <li key={operation._id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-label-md text-label-md font-bold text-on-surface">{operation.natureIntervention}</p>
                  <p className="mt-1 font-body-sm text-body-sm text-on-surface-variant">
                    {siteNom(operation)} · {new Date(operation.dateHeurePrevue).toLocaleString("fr-FR")}
                  </p>
                </div>
                <StatusBadge status={operation.statut} />
              </li>
            ))}
          </ul>
        ) : (
          <div className="px-5 py-8 text-center">
            <p className="font-body-md text-body-md text-on-surface-variant">Aucune opération rattachée pour le moment.</p>
            <Link href="/espace-client/nouvelle-demande" className="mt-3 inline-flex min-h-11 items-center font-label-md text-label-md font-semibold text-primary hover:underline">Soumettre une demande</Link>
          </div>
        )}
      </section>
      <p className="font-body-sm text-body-sm text-on-surface-variant">
        Les informations affichées sont réservées à votre entreprise. Pour toute correction ou question, contactez votre interlocuteur SRH.
      </p>
    </div>
  );
}
