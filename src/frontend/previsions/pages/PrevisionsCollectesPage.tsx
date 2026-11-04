"use client";

import { useEffect, useMemo, useState } from "react";

interface Prevision {
  site: string;
  commune: string;
  datePrevue: string;
  derniereCollecte?: string;
  intervalleEstimeJours: number;
  quantiteEstimeeLitres?: number;
  passagesHistoriques: number;
  confiance: "élevée" | "moyenne" | "faible";
  tournee: string;
  secteur: string;
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
  const [stationsSansHistorique, setStationsSansHistorique] = useState<string[]>([]);
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
      return data as { previsions: Prevision[]; stationsSansHistorique: string[] };
    };
    charger()
      .then((data) => {
        if (actif) {
          setLignes(data.previsions);
          setStationsSansHistorique(data.stationsSansHistorique);
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
      ["Date de tournée", "Tournée", "Secteur", "Commune", "Station", "Volume estimé (L)", "Dernier passage", "Intervalle estimé (jours)", "Passages historiques", "Confiance"],
      ...lignes.map((ligne) => [ligne.datePrevue, ligne.tournee, ligne.secteur, ligne.commune, ligne.site, ligne.quantiteEstimeeLitres === undefined ? "À confirmer" : String(ligne.quantiteEstimeeLitres), ligne.derniereCollecte ?? "Aucun historique", String(ligne.intervalleEstimeJours), String(ligne.passagesHistoriques), ligne.confiance]),
    ].map((colonnes) => colonnes.map((valeur) => `"${valeur.replaceAll('"', '""')}"`).join(";"));
    const lien = document.createElement("a");
    lien.href = URL.createObjectURL(new Blob(["\uFEFF" + contenu.join("\r\n")], { type: "text/csv;charset=utf-8" }));
    lien.download = `tournees-collectes-${mois}.csv`;
    lien.click();
    URL.revokeObjectURL(lien.href);
  }

  const dateTitre = MOIS.format(new Date(`${mois}-01T12:00:00Z`));
  const sites = new Set(lignes.map((ligne) => ligne.site)).size;
  const volumeTotal = lignes.reduce((total, ligne) => total + (ligne.quantiteEstimeeLitres ?? 0), 0);
  const faibleConfiance = lignes.filter((ligne) => ligne.confiance === "faible").length;

  return (
    <main className="flex flex-col gap-gutter-md px-margin-mobile py-gutter-md lg:px-margin-desktop">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="font-label-md text-label-md font-semibold uppercase tracking-wide text-primary">Aide à la décision</p>
          <h1 className="mt-1 font-headline-lg-mobile text-headline-lg-mobile font-bold text-on-surface lg:font-headline-lg lg:text-headline-lg">Prévision des collectes</h1>
          <p className="mt-2 max-w-2xl font-body-md text-body-md text-on-surface-variant">Tournées regroupées par secteur, avec les quantités historiques estimées et un minimum de cinq stations par date.</p>
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
        <div className="rounded-xl border border-outline/20 bg-surface-container-lowest p-4"><p className="font-label-md text-label-md text-on-surface-variant">Stations planifiées</p><p className="mt-1 text-2xl font-bold text-on-surface">{sites} / 40</p></div>
        <div className="rounded-xl border border-outline/20 bg-surface-container-lowest p-4"><p className="font-label-md text-label-md text-on-surface-variant">Tournées / passages</p><p className="mt-1 text-2xl font-bold text-on-surface">{parDate.length} / {lignes.length}</p></div>
        <div className="rounded-xl border border-outline/20 bg-surface-container-lowest p-4"><p className="font-label-md text-label-md text-on-surface-variant">Volume estimé historique</p><p className="mt-1 text-2xl font-bold text-on-surface">{volumeTotal.toLocaleString("fr-FR")} L</p></div>
        <div className="rounded-xl border border-outline/20 bg-surface-container-lowest p-4"><p className="font-label-md text-label-md text-on-surface-variant">À confirmer / confiance faible</p><p className="mt-1 text-2xl font-bold text-on-surface">{stationsSansHistorique.length} / {faibleConfiance}</p></div>
      </section>

      <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 font-body-sm text-on-surface">
        <strong>À confirmer avant affectation.</strong> Chaque station reçoit au moins un passage mensuel ; un second passage est ajouté quand les historiques montrent au moins trois collectes et une cadence médiane de 21 jours ou moins. Les quantités affichées sont des médianes observées, pas des commandes garanties. Aucun historique signifie volume à confirmer.
      </div>
      <div className="rounded-xl border border-outline/20 bg-surface-container-lowest p-4 font-body-sm text-on-surface-variant">
        Le référentiel officiel contient 40 stations, réparties en secteurs : nord (Cocody, Bingerville, Songon), sud (Marcory, Port-Bouët) et centre (Treichville, Plateau, Koumassi). Les affectations sont équilibrées d’après les volumes historiques afin de répartir la charge entre tournées.
      </div>
      <p className="font-body-sm text-on-surface-variant">Lors d’un import, seules les lignes rapprochées avec l’une des 40 stations officielles sont prises en compte. Les autres libellés sont ignorés.</p>
      {classeurs.length > 0 && <p aria-live="polite" className="font-body-sm text-on-surface-variant">Prévisions recalculées depuis {classeurs.length} classeur{classeurs.length > 1 ? "s" : ""}. Ces fichiers ne sont pas enregistrés par l’application.</p>}
      {stationsSansHistorique.length > 0 && <div className="rounded-xl border border-outline/20 bg-surface-container-lowest p-4 font-body-sm text-on-surface-variant"><strong className="text-on-surface">Stations sans historique de quantité :</strong> {stationsSansHistorique.join(", ")}. Elles sont incluses dans une tournée, avec quantité à confirmer.</div>}

      {erreur && <p role="alert" className="rounded-lg border border-error/30 bg-error-container/20 p-4 text-error">{erreur}</p>}
      <section className="overflow-hidden rounded-2xl border border-outline/20 bg-surface-container-lowest shadow-sm">
        <div className="flex items-center justify-between border-b border-outline/15 px-4 py-3"><h2 className="font-title-md text-title-md font-bold capitalize text-on-surface">Tournées estimées — {dateTitre}</h2><span className="font-label-md text-label-md text-on-surface-variant">{loading ? "Calcul…" : `${parDate.length} jours de collecte`}</span></div>
        {loading ? <p className="p-6 text-on-surface-variant">Calcul des dates à partir des historiques…</p> : lignes.length === 0 ? <p className="p-6 text-on-surface-variant">Aucun passage prévisionnel dans ce mois.</p> : <div className="divide-y divide-outline/15">
          {parDate.map(([date, items]) => <div key={date} className="grid gap-3 p-4 md:grid-cols-[180px_1fr]">
            <div><p className="font-title-sm text-title-sm font-bold capitalize text-on-surface">{DATE.format(new Date(`${date}T12:00:00Z`))}</p><p className="text-sm text-on-surface-variant">{items.length} stations</p><p className="mt-1 text-xs text-on-surface-variant">{items[0]?.secteur}</p></div>
            <div><p className="mb-2 font-label-md text-label-md font-semibold text-on-surface">Tournée {items[0]?.tournee} · {items.reduce((n, item) => n + (item.quantiteEstimeeLitres ?? 0), 0).toLocaleString("fr-FR")} L estimés</p><ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{items.map((item) => <li key={`${date}-${item.site}`} className="rounded-lg bg-surface-container-low px-3 py-2"><p className="font-label-md text-label-md font-semibold text-on-surface">{item.site} <span className="font-normal text-on-surface-variant">· {item.commune}</span></p><p className="mt-1 text-xs text-on-surface-variant">{item.quantiteEstimeeLitres === undefined ? "Volume à confirmer" : `≈ ${item.quantiteEstimeeLitres} L`} · médiane tous les {item.intervalleEstimeJours} j · historique {item.passagesHistoriques} passage{item.passagesHistoriques > 1 ? "s" : ""} · confiance {item.confiance}</p></li>)}</ul></div>
          </div>)}
        </div>}
      </section>
    </main>
  );
}
