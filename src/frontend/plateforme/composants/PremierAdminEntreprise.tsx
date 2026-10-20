"use client";

import { useEffect, useState } from "react";

interface ResultatCreation {
  invitation?: "sent" | "not_sent";
  message: string;
  temporaryPassword?: string;
}

export function PremierAdminEntreprise() {
  const [loading, setLoading] = useState(true);
  const [adminInitialCree, setAdminInitialCree] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [statusError, setStatusError] = useState("");
  const [resultat, setResultat] = useState<ResultatCreation | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/plateforme/premier-admin", { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Impossible de vérifier la création du compte.");
        if (!cancelled) setAdminInitialCree(data.adminInitialCree === true);
      })
      .catch((cause: unknown) => {
        if (!cancelled) setStatusError(cause instanceof Error ? cause.message : "Impossible de vérifier le compte.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function creerPremierAdmin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    setSaving(true);
    setError("");
    setResultat(null);
    const form = new FormData(formElement);
    const body = Object.fromEntries(form.entries());

    try {
      const response = await fetch("/api/plateforme/premier-admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (!response.ok) {
        const message = typeof data.error === "string" ? data.error : data.error?.formErrors?.[0];
        throw new Error(message || "Le compte Admin Ops n'a pas pu être créé.");
      }
      setResultat(data);
      setAdminInitialCree(true);
      formElement.reset();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Le compte Admin Ops n'a pas pu être créé.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="mx-auto w-full max-w-3xl space-y-4 rounded-2xl border border-outline-variant/40 bg-surface-container-lowest p-margin-mobile lg:p-margin-desktop">
      <div>
        <h2 className="font-headline-sm text-headline-sm text-on-surface">Premier compte Admin Ops</h2>
        <p className="mt-2 max-w-2xl font-body-md text-body-md text-on-surface-variant">
          Le super administrateur crée ce compte une seule fois. L&apos;Admin Ops pourra ensuite gérer les comptes de son entreprise.
        </p>
      </div>

      {loading ? (
        <p role="status" className="text-on-surface-variant">Vérification du compte initial…</p>
      ) : adminInitialCree ? (
        <p role="status" className="rounded-xl bg-status-completed/5 p-4 text-on-surface">
          Le compte initial de l&apos;entreprise existe déjà. Les prochains comptes se gèrent dans la page Utilisateurs.
        </p>
      ) : statusError ? (
        <p role="alert" className="rounded-xl border border-error/30 bg-error-container p-4 text-on-error-container">
          {statusError}
        </p>
      ) : (
        <form onSubmit={creerPremierAdmin} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="initial-admin-username" className="mb-1 block font-label-md text-label-md text-on-surface">Identifiant</label>
              <input id="initial-admin-username" name="username" required minLength={3} maxLength={32} pattern="[A-Za-z0-9_.-]+" autoComplete="username" className="h-12 w-full rounded-xl bg-surface-container-low px-3 text-on-surface outline-none focus:ring-2 focus:ring-primary" />
            </div>
            <div>
              <label htmlFor="initial-admin-name" className="mb-1 block font-label-md text-label-md text-on-surface">Nom complet</label>
              <input id="initial-admin-name" name="nom" required minLength={2} autoComplete="name" className="h-12 w-full rounded-xl bg-surface-container-low px-3 text-on-surface outline-none focus:ring-2 focus:ring-primary" />
            </div>
            <div>
              <label htmlFor="initial-admin-email" className="mb-1 block font-label-md text-label-md text-on-surface">Adresse e-mail</label>
              <input id="initial-admin-email" name="email" type="email" required autoComplete="email" className="h-12 w-full rounded-xl bg-surface-container-low px-3 text-on-surface outline-none focus:ring-2 focus:ring-primary" />
            </div>
            <div>
              <label htmlFor="initial-admin-phone" className="mb-1 block font-label-md text-label-md text-on-surface">Téléphone (facultatif)</label>
              <input id="initial-admin-phone" name="telephone" type="tel" autoComplete="tel" className="h-12 w-full rounded-xl bg-surface-container-low px-3 text-on-surface outline-none focus:ring-2 focus:ring-primary" />
            </div>
          </div>
          <button type="submit" disabled={saving} className="min-h-11 rounded-xl bg-primary px-5 font-label-md text-label-md text-on-primary disabled:opacity-60">
            {saving ? "Création en cours…" : "Créer l'Admin Ops"}
          </button>
        </form>
      )}

      {error && <p role="alert" className="rounded-xl border border-error/30 bg-error-container p-4 text-on-error-container">{error}</p>}
      {resultat && (
        <div role="status" className="space-y-2 rounded-xl border border-status-completed/30 bg-status-completed/5 p-4 text-on-surface">
          <p>{resultat.message}</p>
          {resultat.temporaryPassword && (
            <p>
              Mot de passe temporaire à transmettre maintenant : <strong className="select-all">{resultat.temporaryPassword}</strong>
            </p>
          )}
        </div>
      )}
    </section>
  );
}
