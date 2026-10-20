"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { formatApiError } from "@/frontend/design-system";

interface SiteClient {
  id: string;
  nom: string;
  adresse: string;
}

const CHAMP =
  "min-h-11 w-full rounded-xl border border-outline-variant bg-surface px-3 py-2 text-body-md text-on-surface outline-none transition focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/30";

function prochaineDateLocale() {
  const date = new Date(Date.now() + 60 * 60 * 1000);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}

export function ClientRequestForm() {
  const router = useRouter();
  const [sites, setSites] = useState<SiteClient[]>([]);
  const [loadingSites, setLoadingSites] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [minDate] = useState(prochaineDateLocale);

  const loadSites = useCallback(async () => {
    setLoadingSites(true);
    setError("");
    try {
      const response = await fetch("/api/espace-client/sites");
      const data = await response.json();
      if (!response.ok) {
        setError(formatApiError(data.error));
        return;
      }
      setSites(data);
    } catch {
      setError("Impossible de charger vos sites. Vérifiez votre connexion Internet puis réessayez.");
    } finally {
      setLoadingSites(false);
    }
  }, []);

  useEffect(() => {
    void loadSites();
  }, [loadSites]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSaving(true);
    const form = new FormData(event.currentTarget);
    const dateLocale = String(form.get("dateSouhaitee") ?? "");
    try {
      const response = await fetch("/api/espace-client/demandes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          siteId: form.get("siteId"),
          natureIntervention: form.get("natureIntervention"),
          dateSouhaitee: new Date(dateLocale).toISOString(),
          informationsParticulieres: form.get("informationsParticulieres"),
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(formatApiError(data.error));
        return;
      }
      router.push("/espace-client/operations");
      router.refresh();
    } catch {
      setError("Votre demande n’a pas pu être transmise. Vérifiez votre connexion Internet puis réessayez.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-margin-mobile py-gutter-lg lg:px-margin-desktop">
      <Link href="/espace-client" className="inline-flex min-h-11 items-center gap-2 font-label-md text-label-md font-semibold text-primary hover:underline">
        <span aria-hidden="true" className="material-symbols-outlined">arrow_back</span>
        Retour à l’espace client
      </Link>
      <header>
        <p className="font-label-sm text-label-sm font-bold uppercase tracking-widest text-primary">Nouvelle demande</p>
        <h1 className="mt-2 font-headline-lg-mobile text-headline-lg-mobile font-bold text-on-surface lg:font-headline-lg lg:text-headline-lg">Demander une intervention</h1>
        <p className="mt-2 font-body-md text-body-md text-on-surface-variant">Votre demande sera enregistrée sous le statut « Demande ». La date souhaitée reste à confirmer par votre équipe.</p>
      </header>
      {error && <div role="alert" className="rounded-xl bg-error-container p-4 text-on-error-container">{error}<button type="button" onClick={() => void loadSites()} className="ml-3 min-h-11 underline">Réessayer</button></div>}
      {!loadingSites && sites.length === 0 ? (
        <div className="rounded-2xl border border-surface-container-high bg-surface-container-lowest p-6">
          <p className="font-body-md text-body-md text-on-surface-variant">Aucun site n’est rattaché à votre entreprise. Contactez votre interlocuteur habituel pour ajouter un site avant de soumettre une demande.</p>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-5 rounded-2xl border border-surface-container-high bg-surface-container-lowest p-5 shadow-sm sm:p-8">
          {loadingSites ? <p role="status" className="font-body-md text-body-md text-on-surface-variant">Chargement de vos sites…</p> : null}
          <label className="block space-y-1 font-label-sm text-label-sm font-semibold text-on-surface">
            Site concerné <span aria-hidden="true">*</span>
            <select name="siteId" required disabled={loadingSites || sites.length === 0} className={CHAMP}>
              <option value="">Sélectionner un site…</option>
              {sites.map((site) => <option key={site.id} value={site.id}>{site.nom}{site.adresse ? ` — ${site.adresse}` : ""}</option>)}
            </select>
          </label>
          <label className="block space-y-1 font-label-sm text-label-sm font-semibold text-on-surface">
            Nature de l’intervention <span aria-hidden="true">*</span>
            <input name="natureIntervention" required minLength={2} maxLength={150} className={CHAMP} placeholder="Ex. collecte ou pompage" />
          </label>
          <label className="block space-y-1 font-label-sm text-label-sm font-semibold text-on-surface">
            Date et heure souhaitées <span aria-hidden="true">*</span>
            <input name="dateSouhaitee" type="datetime-local" required min={minDate} className={CHAMP} />
          </label>
          <label className="block space-y-1 font-label-sm text-label-sm font-semibold text-on-surface">
            Précisions utiles
            <textarea name="informationsParticulieres" rows={4} maxLength={2000} className={CHAMP} placeholder="Déchets concernés, accès, contraintes particulières…" />
          </label>
          <button type="submit" disabled={saving || loadingSites || sites.length === 0} className="min-h-12 w-full rounded-xl bg-primary px-5 py-3 font-label-md text-label-md font-bold text-on-primary transition hover:bg-primary/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto">
            {saving ? "Transmission…" : "Envoyer la demande"}
          </button>
        </form>
      )}
    </div>
  );
}
