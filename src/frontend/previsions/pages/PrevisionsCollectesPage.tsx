"use client";

import { useEffect, useMemo, useState } from "react";

interface Prevision {
  site: string;
  datePrevue: string;
  derniereCollecte: string;
  intervalleEstimeJours: number;
  passagesHistoriques: number;
  confiance: "élevée" | "moyenne" | "faible";
}

const MOIS = new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" });
const DATE = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", timeZone: "UTC" });

function moisCourant(): string {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function PrevisionsCollectesPage({ peutImporter }: { peutImporter: boolean }) {
  const [mois, setMois] = useState("2026-11");
  const [lignes, setLignes] = useState<Prevision[]>([]);
  const [sitesSansPrevision, setSitesSansPrevision] = useState<string[]>([]);
  const [classeurs, setClasseurs] = useState<File[]>([]);
  const [loading, setLoading] = useState(true);
  const [erreur, setErreur] = useState("");

  useEffect(() => {
    if (mois !== "2026-11") setMois(moisCourant());
  }, []);

  useEffect(() => {
    let actif = true;
    setLoading(true);
    setErreur("");
    const charger = async () => {
      let response: Response;
      if (classeurs.length > 0) {
        const formulaire = new FormData();
        formulaire.set("mois", mois);
        classeurs.forEach((fichier) => formulaire.append("fichiers", fichier));
        response = await fetch("/api/previsions/collectes", { method: "POST", body: formulaire });
      } else {
        response = await fetch(`/api/previsions/collectes?mois=${mois}`);
      }
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Impossible de charger les prévisions.");
      return data as { previsions: Prevision[]; sitesSansPrevision: string[] };
    };
    charger()
      .then((data) => {
        if (actif) {
          setLignes(data.previsions);
          setSitesSansPrevision(data.sitesSansPrevision);
        }
      })
      .catch((error: Error) => { if (actif) setErreur(error.message); })
      .finally(() => { if (actif) setLoading(false); });
    return () => { actif = false; };
  }, [mois, classeurs]);

  const parDate = useMemo(() => {
    const groupes = new Map<string, Prevision[]>();
    for (const ligne of lignes) groupes.set(ligne.datePrevue, [...(groupes.get(ligne.datePrevue) ?? []), ligne]);
    return [...groupes.entries()];
  }, [lignes]);

  function exporterCSV() {
    const contenu = [
      ["Date prévue", "Site", "Dernier passage", "Intervalle estimé (jours)", "Historique disponible", "Confiance"],
      ...lignes.map((ligne) => [ligne.datePrevue, ligne.site, ligne.derniereCollecte, String(ligne.intervalleEstimeJours), String(ligne.passagesHistoriques), ligne.confiance]),
    ].map((colonnes) => colonnes.map((valeur) => `"${valeur.replaceAll('"', '""')}"`).join(";"));
    const lien = document.createElement("a");
    lien.href = URL.createObjectURL(new Blob(["\uFEFF" + contenu.join("\r\n")], { type: "text/csv;charset=utf-8" }));
    lien.download = `previsions-collectes-${mois}.csv`;
    lien.click();
    URL.revokeObjectURL(lien.href);
  }

  const dateTitre = MOIS.format(new Date(`${mois}-01T12:00:00Z`));
  const sites = new Set(lignes.map((ligne) => ligne.site)).size;
  const faibleConfiance = lignes.filter((ligne) => ligne.confiance === "faible").length;

  return (
    <main className="flex flex-col gap-gutter-md px-margin-mobile py-gutter-md lg:px-margin-desktop">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="font-label-md text-label-md font-semibold uppercase tracking-wide text-primary">Aide à la décision</p>
          <h1 className="mt-1 font-headline-lg-mobile text-headline-lg-mobile font-bold text-on-surface lg:font-headline-lg lg:text-headline-lg">Prévision des collectes</h1>
          <p className="mt-2 max-w-2xl font-body-md text-body-md text-on-surface-variant">Dates estimées à partir des passages et quantités enregistrés dans les bilans Excel de juin à octobre 2026.</p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          {peutImporter && <label className="flex min-h-11 flex-col gap-1 font-label-md text-label-md font-medium text-on-surface">
            Bilans historiques (.xlsx)
            <input type="file" accept=".xlsx" multiple onChange={(event) => setClasseurs(Array.from(event.target.files ?? []))} className="max-w-64 text-sm text-on-surface-variant file:mr-2 file:min-h-11 file:rounded-lg file:border-0 file:bg-surface-container-high file:px-3 file:font-semibold file:text-on-surface" />
          </label>}
          <label className="flex min-h-11 flex-col gap-1 font-label-md text-label-md font-medium text-on-surface">
            Mois à prévoir
            <input aria-label="Mois à prévoir" type="month" value={mois} onChange={(event) => setMois(event.target.value)} className="min-h-11 rounded-lg border border-outline/40 bg-surface-container-lowest px-3 text-on-surface" />
          </label>
          <button type="button" onClick={exporterCSV} disabled={loading || lignes.length === 0} className="min-h-11 rounded-lg bg-primary px-4 font-label-md text-label-md font-semibold text-on-primary hover:opacity-90 disabled:opacity-50">Exporter le planning</button>
        </div>
      </header>

      <section aria-label="Résumé du planning" className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-outline/20 bg-surface-container-lowest p-4"><p className="font-label-md text-label-md text-on-surface-variant">Sites couverts</p><p className="mt-1 text-2xl font-bold text-on-surface">{sites}</p></div>
        <div className="rounded-xl border border-outline/20 bg-surface-container-lowest p-4"><p className="font-label-md text-label-md text-on-surface-variant">Passages prévus</p><p className="mt-1 text-2xl font-bold text-on-surface">{lignes.length}</p></div>
        <div className="rounded-xl border border-outline/20 bg-surface-container-lowest p-4"><p className="font-label-md text-label-md text-on-surface-variant">Prévisions peu documentées</p><p className="mt-1 text-2xl font-bold text-on-surface">{faibleConfiance}</p></div>
        <div className="rounded-xl border border-outline/20 bg-surface-container-lowest p-4"><p className="font-label-md text-label-md text-on-surface-variant">Sites sans date ce mois</p><p className="mt-1 text-2xl font-bold text-on-surface">{sitesSansPrevision.length}</p></div>
      </section>

      <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 font-body-sm text-on-surface">
        <strong>À confirmer avant affectation.</strong> L’intervalle proposé est la médiane des intervalles historiques (7 à 35 jours). Une confiance faible signifie qu’un seul intervalle exploitable ou aucun n’est disponible. Ces prévisions ne créent pas automatiquement d’opérations.
      </div>
      <div className="rounded-xl border border-outline/20 bg-surface-container-lowest p-4 font-body-sm text-on-surface-variant">
        Le bilan d’octobre contient 38 libellés de site, tandis que les quatre classeurs font apparaître davantage de sites après rapprochement des variantes. Le référentiel des 40 sites n’étant pas fourni, confirmez la liste des sites avant de transformer ces estimations en affectations.
      </div>
      {classeurs.length > 0 && <p aria-live="polite" className="font-body-sm text-on-surface-variant">Prévisions recalculées depuis {classeurs.length} classeur{classeurs.length > 1 ? "s" : ""}. Ces fichiers ne sont pas enregistrés par l’application.</p>}
      {sitesSansPrevision.length > 0 && <div className="rounded-xl border border-outline/20 bg-surface-container-lowest p-4 font-body-sm text-on-surface-variant"><strong className="text-on-surface">Aucun passage estimé ce mois :</strong> {sitesSansPrevision.join(", ")}. La prochaine date calculée tombe après le mois sélectionné.</div>}

      {erreur && <p role="alert" className="rounded-lg border border-error/30 bg-error-container/20 p-4 text-error">{erreur}</p>}
      <section className="overflow-hidden rounded-2xl border border-outline/20 bg-surface-container-lowest shadow-sm">
        <div className="flex items-center justify-between border-b border-outline/15 px-4 py-3"><h2 className="font-title-md text-title-md font-bold capitalize text-on-surface">Tournées estimées — {dateTitre}</h2><span className="font-label-md text-label-md text-on-surface-variant">{loading ? "Calcul…" : `${parDate.length} jours de collecte`}</span></div>
        {loading ? <p className="p-6 text-on-surface-variant">Calcul des dates à partir des historiques…</p> : lignes.length === 0 ? <p className="p-6 text-on-surface-variant">Aucun passage prévisionnel dans ce mois.</p> : <div className="divide-y divide-outline/15">
          {parDate.map(([date, items]) => <div key={date} className="grid gap-3 p-4 md:grid-cols-[150px_1fr]">
            <div><p className="font-title-sm text-title-sm font-bold capitalize text-on-surface">{DATE.format(new Date(`${date}T12:00:00Z`))}</p><p className="text-sm text-on-surface-variant">{items.length} site{items.length > 1 ? "s" : ""}</p></div>
            <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{items.map((item) => <li key={`${date}-${item.site}`} className="rounded-lg bg-surface-container-low px-3 py-2"><p className="font-label-md text-label-md font-semibold text-on-surface">{item.site}</p><p className="mt-1 text-xs text-on-surface-variant">Dernier passage {DATE.format(new Date(`${item.derniereCollecte}T12:00:00Z`))} · tous les {item.intervalleEstimeJours} j · confiance {item.confiance}</p></li>)}</ul>
          </div>)}
        </div>}
      </section>
    </main>
  );
}
