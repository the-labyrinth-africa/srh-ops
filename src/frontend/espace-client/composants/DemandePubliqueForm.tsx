"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { formatApiError } from "@/frontend/design-system";

function prochaineDateLocale() {
  const date = new Date(Date.now() + 60 * 60 * 1000);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}

const CHAMP =
  "min-h-11 w-full rounded-xl border border-outline-variant bg-surface px-3 py-2 text-body-md text-on-surface outline-none transition focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/30";

export function DemandePubliqueForm() {
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [saving, setSaving] = useState(false);
  const [minDate] = useState(prochaineDateLocale);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSaving(true);
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const dateLocale = String(form.get("dateSouhaitee") ?? "");
    try {
      const response = await fetch("/api/demandes/publiques", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nomClient: form.get("nomClient"),
          nomContact: form.get("nomContact"),
          email: form.get("email"),
          telephone: form.get("telephone"),
          nomSite: form.get("nomSite"),
          adresseSite: form.get("adresseSite"),
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
      setSuccess(true);
      formElement.reset();
    } catch {
      setError("Envoi impossible. Vérifiez votre connexion Internet puis réessayez.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-surface px-margin-mobile py-10 lg:px-margin-desktop">
      <div className="mx-auto max-w-3xl">
        <Link href="/login" className="inline-flex min-h-11 items-center gap-2 font-label-md text-label-md font-semibold text-primary hover:underline">
          <span aria-hidden="true" className="material-symbols-outlined">arrow_back</span>
          Connexion client
        </Link>
        <header className="mb-8 mt-6">
          <p className="font-label-sm text-label-sm font-bold uppercase tracking-widest text-primary">SRH Recyclage</p>
          <h1 className="mt-2 font-headline-lg-mobile text-headline-lg-mobile font-bold text-on-surface lg:font-headline-lg lg:text-headline-lg">
            Demander une collecte
          </h1>
          <p className="mt-3 max-w-2xl font-body-md text-body-md text-on-surface-variant">
            Transmettez les informations de votre entreprise, du site et de l’intervention souhaitée.
            L’équipe SRH vérifiera votre demande et vous recontactera avant toute planification.
          </p>
        </header>

        {success ? (
          <section role="status" className="rounded-2xl border border-primary/20 bg-surface-container-lowest p-6 shadow-sm">
            <span aria-hidden="true" className="material-symbols-outlined text-3xl text-primary">mark_email_read</span>
            <h2 className="mt-3 font-headline-sm text-headline-sm font-bold text-on-surface">Demande transmise</h2>
            <p className="mt-2 font-body-md text-body-md text-on-surface-variant">
              Votre demande a été transmise à l’équipe SRH pour vérification. Cet accusé de réception
              ne confirme pas encore une intervention ni un créneau.
            </p>
            <button type="button" onClick={() => setSuccess(false)} className="mt-5 min-h-11 rounded-xl bg-primary px-4 py-2 font-label-md text-label-md font-semibold text-on-primary hover:bg-primary/90">
              Envoyer une autre demande
            </button>
          </section>
        ) : (
          <form onSubmit={submit} className="space-y-6 rounded-2xl border border-surface-container-high bg-surface-container-lowest p-5 shadow-sm sm:p-8">
            {error && <div role="alert" className="rounded-xl bg-error-container p-3 font-body-sm text-body-sm text-on-error-container">{error}</div>}

            <fieldset className="space-y-4">
              <legend className="font-headline-sm text-headline-sm font-bold text-on-surface">Votre entreprise et votre contact</legend>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="space-y-1 font-label-sm text-label-sm font-semibold text-on-surface">
                  Entreprise <span aria-hidden="true">*</span>
                  <input name="nomClient" required minLength={2} maxLength={120} autoComplete="organization" className={CHAMP} />
                </label>
                <label className="space-y-1 font-label-sm text-label-sm font-semibold text-on-surface">
                  Nom du contact <span aria-hidden="true">*</span>
                  <input name="nomContact" required minLength={2} maxLength={120} autoComplete="name" className={CHAMP} />
                </label>
                <label className="space-y-1 font-label-sm text-label-sm font-semibold text-on-surface">
                  E-mail professionnel <span aria-hidden="true">*</span>
                  <input name="email" type="email" required maxLength={254} autoComplete="email" className={CHAMP} />
                </label>
                <label className="space-y-1 font-label-sm text-label-sm font-semibold text-on-surface">
                  Téléphone
                  <input name="telephone" type="tel" maxLength={40} autoComplete="tel" className={CHAMP} />
                </label>
              </div>
            </fieldset>

            <fieldset className="space-y-4 border-t border-surface-container-high pt-5">
              <legend className="font-headline-sm text-headline-sm font-bold text-on-surface">Site et intervention</legend>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="space-y-1 font-label-sm text-label-sm font-semibold text-on-surface">
                  Nom du site <span aria-hidden="true">*</span>
                  <input name="nomSite" required minLength={2} maxLength={120} className={CHAMP} />
                </label>
                <label className="space-y-1 font-label-sm text-label-sm font-semibold text-on-surface">
                  Adresse du site <span aria-hidden="true">*</span>
                  <input name="adresseSite" required minLength={4} maxLength={250} autoComplete="street-address" className={CHAMP} />
                </label>
                <label className="space-y-1 font-label-sm text-label-sm font-semibold text-on-surface">
                  Nature de l’intervention <span aria-hidden="true">*</span>
                  <input name="natureIntervention" required minLength={2} maxLength={150} className={CHAMP} placeholder="Ex. collecte ou pompage" />
                </label>
                <label className="space-y-1 font-label-sm text-label-sm font-semibold text-on-surface">
                  Date et heure souhaitées <span aria-hidden="true">*</span>
                  <input name="dateSouhaitee" type="datetime-local" required min={minDate} className={CHAMP} />
                </label>
              </div>
              <label className="block space-y-1 font-label-sm text-label-sm font-semibold text-on-surface">
                Précisions utiles
                <textarea name="informationsParticulieres" maxLength={2000} rows={4} className={CHAMP} placeholder="Nature des déchets, accès au site, contraintes particulières…" />
              </label>
            </fieldset>

            <p className="font-body-sm text-body-sm text-on-surface-variant">
              Les informations sont utilisées par SRH pour examiner et recontacter votre entreprise.
              La demande publique reste en attente de validation et n’est pas visible dans un espace client.
            </p>
            <button type="submit" disabled={saving} className="min-h-12 w-full rounded-xl bg-primary px-5 py-3 font-label-md text-label-md font-bold text-on-primary transition hover:bg-primary/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto">
              {saving ? "Transmission…" : "Transmettre à SRH"}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
