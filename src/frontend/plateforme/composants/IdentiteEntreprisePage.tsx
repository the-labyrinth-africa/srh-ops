"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import type { IdentiteEntreprise } from "@/shared/entreprise/identite";

const INITIAL: IdentiteEntreprise = {
  nomEntreprise: "",
  sigle: "",
  siteWeb: "",
  logoDataUrl: null,
};

export function IdentiteEntreprisePage() {
  const [identite, setIdentite] = useState(INITIAL);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [removeLogo, setRemoveLogo] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/plateforme/entreprise", { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Impossible de charger la configuration.");
        if (!cancelled) setIdentite(data);
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "Impossible de charger la configuration.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function choisirLogo(file?: File) {
    if (!file) return;
    if (!["image/png", "image/jpeg"].includes(file.type)) {
      setError("Choisissez une image au format PNG ou JPEG.");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setError("Le logo doit peser au maximum 2 Mo.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") {
        setError("Impossible de lire cette image.");
        return;
      }
      setLogoFile(file);
      setLogoPreview(reader.result);
      setRemoveLogo(false);
      setError("");
    };
    reader.onerror = () => setError("Impossible de lire cette image.");
    reader.readAsDataURL(file);
  }

  async function enregistrer(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");

    const form = new FormData();
    form.set("nomEntreprise", identite.nomEntreprise);
    form.set("sigle", identite.sigle);
    form.set("siteWeb", identite.siteWeb);
    form.set("removeLogo", String(removeLogo));
    if (logoFile) form.set("logo", logoFile);

    try {
      const response = await fetch("/api/plateforme/entreprise", { method: "PUT", body: form });
      const data = await response.json();
      if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "La configuration n'a pas pu être enregistrée.");
      setIdentite(data);
      setLogoFile(null);
      setLogoPreview(null);
      setRemoveLogo(false);
      setMessage("Les paramètres de l'entreprise ont été enregistrés.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "La configuration n'a pas pu être enregistrée.");
    } finally {
      setSaving(false);
    }
  }

  const logo = removeLogo ? null : logoPreview ?? identite.logoDataUrl;

  return (
    <section className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-margin-mobile lg:p-margin-desktop">
      <header>
        <p className="mb-2 font-label-sm text-label-sm uppercase tracking-wider text-outline">Administration plateforme</p>
        <h1 className="font-headline-lg-mobile text-headline-lg-mobile text-on-surface lg:font-headline-lg lg:text-headline-lg">
          Identité de l&apos;entreprise
        </h1>
        <p className="mt-2 max-w-2xl font-body-md text-body-md text-on-surface-variant">
          Ces informations identifient l&apos;entreprise cliente sur ses rapports et dans l&apos;application.
          Seul le super administrateur peut les modifier.
        </p>
      </header>

      {error && <p role="alert" className="rounded-xl border border-error/30 bg-error-container p-4 text-on-error-container">{error}</p>}
      {message && <p role="status" className="rounded-xl border border-status-completed/30 bg-status-completed/5 p-4 text-on-surface">{message}</p>}

      {loading ? (
        <p role="status" className="rounded-2xl bg-surface-container-lowest p-6 text-on-surface-variant">Chargement des paramètres…</p>
      ) : (
        <form onSubmit={enregistrer} className="space-y-5 rounded-2xl border border-outline-variant/40 bg-surface-container-lowest p-5 sm:p-7">
          <div>
            <label htmlFor="company-name" className="mb-1 block font-label-md text-label-md text-on-surface">Nom de l&apos;entreprise</label>
            <input
              id="company-name"
              required
              maxLength={120}
              value={identite.nomEntreprise}
              onChange={(event) => setIdentite({ ...identite, nomEntreprise: event.target.value })}
              className="h-12 w-full rounded-xl bg-surface-container-low px-3 font-body-md text-body-md text-on-surface outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <label htmlFor="company-acronym" className="mb-1 block font-label-md text-label-md text-on-surface">Sigle</label>
              <input
                id="company-acronym"
                required
                maxLength={16}
                value={identite.sigle}
                onChange={(event) => setIdentite({ ...identite, sigle: event.target.value })}
                className="h-12 w-full rounded-xl bg-surface-container-low px-3 font-body-md text-body-md text-on-surface outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label htmlFor="company-website" className="mb-1 block font-label-md text-label-md text-on-surface">Site web</label>
              <input
                id="company-website"
                type="url"
                placeholder="https://exemple.com"
                value={identite.siteWeb}
                onChange={(event) => setIdentite({ ...identite, siteWeb: event.target.value })}
                className="h-12 w-full rounded-xl bg-surface-container-low px-3 font-body-md text-body-md text-on-surface outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          </div>

          <div>
            <p className="mb-2 font-label-md text-label-md text-on-surface">Logo de l&apos;entreprise</p>
            <div className="flex flex-col gap-4 rounded-xl border border-outline-variant/40 p-4 sm:flex-row sm:items-center">
              <div className="relative flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-surface-container-low">
                {logo ? (
                  <Image src={logo} alt="Aperçu du logo de l'entreprise" fill unoptimized className="object-contain p-2" />
                ) : (
                  <Image src="/icons/icon.svg" alt="Logo WOM par défaut" fill unoptimized className="object-contain p-2" />
                )}
              </div>
              <div className="flex min-w-0 flex-1 flex-wrap gap-3">
                <input
                  ref={inputRef}
                  type="file"
                  accept="image/png,image/jpeg"
                  aria-label="Choisir un logo PNG ou JPEG"
                  onChange={(event) => choisirLogo(event.target.files?.[0])}
                  className="sr-only"
                />
                <button type="button" onClick={() => inputRef.current?.click()} className="min-h-11 rounded-xl bg-surface-container-high px-4 font-label-md text-label-md text-on-surface hover:bg-surface-container-highest">
                  Choisir une image
                </button>
                {logo && (
                  <button
                    type="button"
                    onClick={() => {
                      setLogoFile(null);
                      setLogoPreview(null);
                      setRemoveLogo(true);
                    }}
                    className="min-h-11 rounded-xl px-4 font-label-md text-label-md text-error hover:bg-error-container/40"
                  >
                    Retirer le logo
                  </button>
                )}
                <p className="basis-full text-sm leading-6 text-on-surface-variant">PNG ou JPEG, 2 Mo maximum. L&apos;image est redimensionnée avant son enregistrement.</p>
              </div>
            </div>
          </div>

          <div className="flex justify-end border-t border-outline-variant/30 pt-5">
            <button type="submit" disabled={saving} className="min-h-12 w-full rounded-xl bg-primary px-6 font-label-md text-label-md font-bold text-on-primary hover:bg-primary-container disabled:cursor-wait disabled:opacity-60 sm:w-auto">
              {saving ? "Enregistrement…" : "Enregistrer les paramètres"}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
