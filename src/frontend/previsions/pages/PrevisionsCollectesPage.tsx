"use client";

import { useEffect, useMemo, useState } from "react";

interface Prevision {
  site: string;
  commune: string;
  datePrevue: string;
  derniereCollecte?: string;
  intervalleEstimeJours: number;
  quantiteEstimeeLitres?: number;
  dureeEstimeeMinutes: number;
  capaciteVehiculeLitres?: number;
  numeroPassage: number;
  passagesHistoriques: number;
  confiance: "élevée" | "moyenne" | "faible";
  tournee: string;
  secteur: string;
  vehicule?: string;
  equipements: string[];
}

interface EquipeDisponible {
  id: string;
  nom: string;
  disponibilite: boolean;
}

interface VehiculeDisponible {
  id: string;
  identification: string;
  capacite: number;
  disponibilite: boolean;
}

interface AffectationTournee {
  _id: string;
  date: string;
  tournee: string;
  equipeId: string;
  vehiculeId: string;
  stations: { site: string; siteId?: string; clientId?: string }[];
}

const MOIS = new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" });
const DATE = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", timeZone: "UTC" });

function moisCourant(): string {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function PrevisionsCollectesPage({ peutConfigurer }: { peutConfigurer: boolean }) {
  const [mois, setMois] = useState(moisCourant());
  const [lignes, setLignes] = useState<Prevision[]>([]);
  const [stationsSansHistorique, setStationsSansHistorique] = useState<string[]>([]);
  const [objectifParStation, setObjectifParStation] = useState(2000);
  const [objectifEdite, setObjectifEdite] = useState("2000");
  const [stationsTotal, setStationsTotal] = useState(40);
  const [enregistrement, setEnregistrement] = useState(false);
  const [loading, setLoading] = useState(true);
  const [erreur, setErreur] = useState("");
  const [affectations, setAffectations] = useState<AffectationTournee[]>([]);
  const [equipes, setEquipes] = useState<EquipeDisponible[]>([]);
  const [vehicules, setVehicules] = useState<VehiculeDisponible[]>([]);
  const [choixAffectation, setChoixAffectation] = useState<Record<string, { equipeId: string; vehiculeId: string }>>({});
  const [affectationEnCours, setAffectationEnCours] = useState("");

  useEffect(() => {
    let actif = true;
    setLoading(true);
    setErreur("");
    const charger = async () => {
      const [response, affectationsResponse, equipesResponse, vehiculesResponse] = await Promise.all([
        fetch(`/api/previsions/collectes?mois=${mois}`),
        peutConfigurer ? fetch(`/api/previsions/tournees?mois=${mois}`) : Promise.resolve(null),
        peutConfigurer ? fetch("/api/equipes") : Promise.resolve(null),
        peutConfigurer ? fetch("/api/vehicules") : Promise.resolve(null),
      ]);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Impossible de charger les prévisions.");
      const resultat = {
        previsions: data as { previsions: Prevision[]; stationsSansHistorique: string[]; nombreStations: number; objectifLitresParStation: number },
        affectations: [] as AffectationTournee[],
        equipes: [] as EquipeDisponible[],
        vehicules: [] as VehiculeDisponible[],
      };
      if (affectationsResponse && equipesResponse && vehiculesResponse) {
        const [affectationsData, equipesData, vehiculesData] = await Promise.all([
          affectationsResponse.json(),
          equipesResponse.json(),
          vehiculesResponse.json(),
        ]);
        if (!affectationsResponse.ok || !equipesResponse.ok || !vehiculesResponse.ok) {
          throw new Error("Impossible de charger les équipes, véhicules ou affectations.");
        }
        resultat.affectations = affectationsData.affectations;
        resultat.equipes = equipesData;
        resultat.vehicules = vehiculesData;
      }
      return resultat;
    };
    charger()
      .then(({ previsions, affectations: affectationsMois, equipes: equipesDisponibles, vehicules: vehiculesDisponibles }) => {
        if (actif) {
          setLignes(previsions.previsions);
          setStationsSansHistorique(previsions.stationsSansHistorique);
          setStationsTotal(previsions.nombreStations);
          setObjectifParStation(previsions.objectifLitresParStation);
          setObjectifEdite(String(previsions.objectifLitresParStation));
          setAffectations(affectationsMois);
          setEquipes(equipesDisponibles);
          setVehicules(vehiculesDisponibles);
        }
      })
      .catch((error: Error) => { if (actif) setErreur(error.message); })
      .finally(() => { if (actif) setLoading(false); });
    return () => { actif = false; };
  }, [mois, peutConfigurer]);

  async function enregistrerObjectif(event: React.FormEvent) {
    event.preventDefault();
    setEnregistrement(true);
    setErreur("");
    try {
      const response = await fetch("/api/previsions/parametres", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ objectifLitresParStation: Number(objectifEdite) }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Impossible d'enregistrer cet objectif.");
      setObjectifParStation(data.objectifLitresParStation);
      const recalcul = await fetch(`/api/previsions/collectes?mois=${mois}`);
      const result = await recalcul.json();
      if (!recalcul.ok) throw new Error(result.error ?? "Impossible de recalculer les tournées.");
      setLignes(result.previsions);
      setStationsSansHistorique(result.stationsSansHistorique);
    } catch (error) {
      setErreur(error instanceof Error ? error.message : "Erreur réseau.");
    } finally {
      setEnregistrement(false);
    }
  }

  const parTournee = useMemo(() => {
    const groupes = new Map<string, Prevision[]>();
    for (const ligne of lignes) {
      const cle = `${ligne.datePrevue}::${ligne.tournee}`;
      groupes.set(cle, [...(groupes.get(cle) ?? []), ligne]);
    }
    return [...groupes.entries()];
  }, [lignes]);

  function exporterCSV() {
    const contenu = [
      ["Date de tournée", "Tournée", "Passage", "Secteur", "Commune", "Station", "Volume estimé (L)", "Temps estimé sur site (min)", "Véhicule", "Capacité véhicule (L)", "Dernier passage", "Intervalle estimé (jours)", "Passages historiques", "Confiance"],
      ...lignes.map((ligne) => [ligne.datePrevue, ligne.tournee, String(ligne.numeroPassage), ligne.secteur, ligne.commune, ligne.site, ligne.quantiteEstimeeLitres === undefined ? "À confirmer" : String(ligne.quantiteEstimeeLitres), String(ligne.dureeEstimeeMinutes), ligne.vehicule ?? "À affecter", ligne.capaciteVehiculeLitres === undefined ? "Non configurée" : String(ligne.capaciteVehiculeLitres), ligne.derniereCollecte ?? "Aucun historique", String(ligne.intervalleEstimeJours), String(ligne.passagesHistoriques), ligne.confiance]),
    ].map((colonnes) => colonnes.map((valeur) => `"${valeur.replaceAll('"', '""')}"`).join(";"));
    const lien = document.createElement("a");
    lien.href = URL.createObjectURL(new Blob(["\uFEFF" + contenu.join("\r\n")], { type: "text/csv;charset=utf-8" }));
    lien.download = `tournees-collectes-${mois}.csv`;
    lien.click();
    URL.revokeObjectURL(lien.href);
  }

  const dateTitre = MOIS.format(new Date(`${mois}-01T12:00:00Z`));
  const sites = new Set(lignes.map((ligne) => ligne.site)).size;
  const faibleConfiance = lignes.filter((ligne) => ligne.confiance === "faible").length;
  const volumeMensuelPrevu = lignes.reduce((total, ligne) => total + (ligne.quantiteEstimeeLitres ?? 0), 0);

  return (
    <main className="flex flex-col gap-gutter-md px-margin-mobile py-gutter-md lg:px-margin-desktop">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="font-label-md text-label-md font-semibold uppercase tracking-wide text-primary">Aide à la décision</p>
          <h1 className="mt-1 font-headline-lg-mobile text-headline-lg-mobile font-bold text-on-surface lg:font-headline-lg lg:text-headline-lg">Prévision des collectes</h1>
          <p className="mt-2 max-w-2xl font-body-md text-body-md text-on-surface-variant">Tournées par secteur, limitées à la capacité des véhicules disponibles. Les heures de présence sur site affinent les durées estimées.</p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex min-h-11 flex-col gap-1 font-label-md text-label-md font-medium text-on-surface">
            Mois à prévoir
            <input aria-label="Mois à prévoir" type="month" value={mois} onChange={(event) => setMois(event.target.value)} className="min-h-11 rounded-lg border border-outline/40 bg-surface-container-lowest px-3 text-on-surface" />
          </label>
          <button type="button" onClick={exporterCSV} disabled={loading || lignes.length === 0} className="min-h-11 rounded-lg bg-primary px-4 font-label-md text-label-md font-semibold text-on-primary hover:opacity-90 disabled:opacity-50">Exporter le planning</button>
        </div>
      </header>

      <section aria-label="Résumé du planning" className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <div className="rounded-xl border border-outline/20 bg-surface-container-lowest p-4"><p className="font-label-md text-label-md text-on-surface-variant">Stations prévues</p><p className="mt-1 text-2xl font-bold text-on-surface">{sites} / {stationsTotal}</p></div>
        <div className="rounded-xl border border-outline/20 bg-surface-container-lowest p-4"><p className="font-label-md text-label-md text-on-surface-variant">Jours / tournées / passages</p><p className="mt-1 text-2xl font-bold text-on-surface">{new Set(lignes.map((ligne) => ligne.datePrevue)).size} / {parTournee.length} / {lignes.length}</p></div>
        <div className="rounded-xl border border-outline/20 bg-surface-container-lowest p-4"><p className="font-label-md text-label-md text-on-surface-variant">Volume mensuel cible</p><p className="mt-1 text-2xl font-bold text-on-surface">{(stationsTotal * objectifParStation).toLocaleString("fr-FR")} L</p></div>
        <div className="rounded-xl border border-outline/20 bg-surface-container-lowest p-4"><p className="font-label-md text-label-md text-on-surface-variant">Volume mensuel prévisionnel</p><p className="mt-1 text-2xl font-bold text-on-surface">{volumeMensuelPrevu.toLocaleString("fr-FR")} L</p></div>
        <div className="rounded-xl border border-outline/20 bg-surface-container-lowest p-4"><p className="font-label-md text-label-md text-on-surface-variant">À confirmer / confiance faible</p><p className="mt-1 text-2xl font-bold text-on-surface">{stationsSansHistorique.length} / {faibleConfiance}</p></div>
      </section>

      {peutConfigurer && <form onSubmit={enregistrerObjectif} className="flex flex-wrap items-end gap-3 rounded-xl border border-outline/20 bg-surface-container-lowest p-4">
        <label className="flex flex-col gap-1 font-label-md text-label-md font-medium text-on-surface">Objectif mensuel par station (L)
          <input type="number" min="1" step="1" required value={objectifEdite} onChange={(event) => setObjectifEdite(event.target.value)} className="min-h-11 w-48 rounded-lg border border-outline/40 bg-surface-container-lowest px-3 text-on-surface" />
        </label>
        <button type="submit" disabled={enregistrement || Number(objectifEdite) === objectifParStation} className="min-h-11 rounded-lg bg-primary px-4 font-label-md text-label-md font-semibold text-on-primary disabled:opacity-50">{enregistrement ? "Enregistrement…" : "Enregistrer l'objectif"}</button>
        <p className="font-body-sm text-on-surface-variant">{stationsTotal} stations × {Number(objectifEdite || 0).toLocaleString("fr-FR")} L = {(stationsTotal * Number(objectifEdite || 0)).toLocaleString("fr-FR")} L par mois</p>
      </form>}
      <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 font-body-sm text-on-surface">
        <strong>Prévision à valider avant l’opération.</strong> Le planning est calculé à partir des collectes réelles saisies ou importées. Les tournées sont réparties selon les capacités configurées des véhicules ; un objectif qui dépasse la capacité disponible est fractionné en plusieurs passages. Les prévisions ne créent pas d’opérations réalisées.
      </div>
      <div className="rounded-xl border border-outline/20 bg-surface-container-lowest p-4 font-body-sm text-on-surface-variant">
        Le référentiel officiel contient 40 stations, réparties en secteurs : nord (Cocody, Bingerville, Songon), sud (Marcory, Port-Bouët) et centre. Les volumes par station combinent l’objectif configuré et les volumes mensuels réellement observés ; les durées s’appuient sur la médiane des heures d’arrivée et de départ déjà relevées.
      </div>
      <p className="font-body-sm text-on-surface-variant">Saisissez les collectes depuis « Nouvelle collecte » ou importez les bilans depuis « Import Excel ». Les lignes importées sont enregistrées et enrichissent les prévisions suivantes.</p>
      {stationsSansHistorique.length > 0 && <div className="rounded-xl border border-outline/20 bg-surface-container-lowest p-4 font-body-sm text-on-surface-variant"><strong className="text-on-surface">Stations sans historique :</strong> {stationsSansHistorique.join(", ")}. Leur estimation suit l’objectif mensuel configuré jusqu’à l’enregistrement de leurs premières collectes.</div>}

      {erreur && <p role="alert" className="rounded-lg border border-error/30 bg-error-container/20 p-4 text-error">{erreur}</p>}
      <section className="overflow-hidden rounded-2xl border border-outline/20 bg-surface-container-lowest shadow-sm">
        <div className="flex items-center justify-between border-b border-outline/15 px-4 py-3"><h2 className="font-title-md text-title-md font-bold capitalize text-on-surface">Tournées estimées — {dateTitre}</h2><span className="font-label-md text-label-md text-on-surface-variant">{loading ? "Calcul…" : `${parTournee.length} tournées`}</span></div>
        {loading ? <p className="p-6 text-on-surface-variant">Calcul des dates à partir des historiques…</p> : lignes.length === 0 ? <p className="p-6 text-on-surface-variant">Aucun passage prévisionnel dans ce mois.</p> : <div className="divide-y divide-outline/15">
          {parTournee.map(([cle, items]) => {
            const date = items[0]?.datePrevue ?? "";
            const volume = items.reduce((total, item) => total + (item.quantiteEstimeeLitres ?? 0), 0);
            const duree = items.reduce((total, item) => total + item.dureeEstimeeMinutes, 0);
            const affectation = affectations.find((item) => item.date === date && item.tournee === items[0]?.tournee);
            const choix = choixAffectation[cle] ?? {
              equipeId: affectation?.equipeId ?? "",
              vehiculeId: affectation?.vehiculeId ?? vehicules.find((item) => item.identification === items[0]?.vehicule)?.id ?? "",
            };
            const vehiculeChoisi = vehicules.find((item) => item.id === choix.vehiculeId);
            const stationsSansCorrespondance = affectation?.stations
              .filter((station) => !station.siteId || !station.clientId)
              .map((station) => station.site) ?? [];
            const affectationPossible = Boolean(
              choix.equipeId &&
              equipes.some((item) => item.id === choix.equipeId && item.disponibilite) &&
              vehiculeChoisi?.disponibilite &&
              vehiculeChoisi.capacite >= volume
            );
            return <div key={cle} className="grid gap-3 p-4 md:grid-cols-[180px_1fr]">
              <div><p className="font-title-sm text-title-sm font-bold capitalize text-on-surface">{DATE.format(new Date(`${date}T12:00:00Z`))}</p><p className="text-sm text-on-surface-variant">{items.length} station{items.length === 1 ? "" : "s"}</p><p className="mt-1 text-xs text-on-surface-variant">{items[0]?.secteur}</p></div>
              <div>
                <p className="mb-1 font-label-md text-label-md font-semibold text-on-surface">{items[0]?.tournee} · {volume.toLocaleString("fr-FR")} L estimés · {duree} min sur site</p>
                <p className="mb-2 text-xs text-on-surface-variant">Véhicule suggéré : {items[0]?.vehicule ?? "à affecter"}{items[0]?.capaciteVehiculeLitres ? ` · capacité ${items[0].capaciteVehiculeLitres.toLocaleString("fr-FR")} L` : ""} · Équipements : {items[0]?.equipements.join(", ") || "à affecter"}</p>
                {peutConfigurer && <form
                  onSubmit={async (event) => {
                    event.preventDefault();
                    setErreur("");
                    setAffectationEnCours(cle);
                    try {
                      const response = await fetch("/api/previsions/tournees", {
                        method: "PUT",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ date, tournee: items[0]?.tournee, ...choix }),
                      });
                      const data = await response.json();
                      if (!response.ok) throw new Error(data.error ?? "Impossible d’affecter cette tournée.");
                      setAffectations((precedentes) => [
                        ...precedentes.filter((item) => item.date !== date || item.tournee !== items[0]?.tournee),
                        data.affectation,
                      ]);
                    } catch (error) {
                      setErreur(error instanceof Error ? error.message : "Erreur réseau pendant l’affectation.");
                    } finally {
                      setAffectationEnCours("");
                    }
                  }}
                  className="mb-3 grid gap-2 rounded-xl border border-outline/20 bg-surface-container-low p-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
                >
                  <label className="flex min-h-11 flex-col gap-1 font-label-sm text-label-sm font-semibold text-on-surface">
                    Équipe
                    <select
                      required
                      value={choix.equipeId}
                      onChange={(event) => setChoixAffectation((precedents) => ({ ...precedents, [cle]: { ...choix, equipeId: event.target.value } }))}
                      className="min-h-11 rounded-lg border border-outline/40 bg-surface-container-lowest px-3 text-on-surface"
                    >
                      <option value="">Choisir une équipe</option>
                      {equipes.map((equipe) => <option key={equipe.id} value={equipe.id} disabled={!equipe.disponibilite && equipe.id !== choix.equipeId}>{equipe.nom}{equipe.disponibilite ? "" : " (indisponible)"}</option>)}
                    </select>
                  </label>
                  <label className="flex min-h-11 flex-col gap-1 font-label-sm text-label-sm font-semibold text-on-surface">
                    Véhicule — capacité ≥ {volume.toLocaleString("fr-FR")} L
                    <select
                      required
                      value={choix.vehiculeId}
                      onChange={(event) => setChoixAffectation((precedents) => ({ ...precedents, [cle]: { ...choix, vehiculeId: event.target.value } }))}
                      className="min-h-11 rounded-lg border border-outline/40 bg-surface-container-lowest px-3 text-on-surface"
                    >
                      <option value="">Choisir un véhicule</option>
                      {vehicules.map((vehicule) => <option key={vehicule.id} value={vehicule.id} disabled={(!vehicule.disponibilite || vehicule.capacite < volume) && vehicule.id !== choix.vehiculeId}>{vehicule.identification} · {vehicule.capacite.toLocaleString("fr-FR")} L{vehicule.disponibilite ? "" : " (indisponible)"}</option>)}
                    </select>
                  </label>
                  <button type="submit" disabled={!affectationPossible || date < new Date().toISOString().slice(0, 10) || affectationEnCours === cle} className="min-h-11 rounded-lg bg-primary px-4 font-label-sm text-label-sm font-semibold text-on-primary hover:opacity-90 disabled:opacity-50">
                    {affectationEnCours === cle ? "Enregistrement…" : affectation ? "Mettre à jour" : "Affecter"}
                  </button>
                  {affectation && <p className="sm:col-span-3 font-label-sm text-label-sm text-on-surface-variant">Affectée à {equipes.find((item) => item.id === affectation.equipeId)?.nom ?? "une équipe"} avec {vehicules.find((item) => item.id === affectation.vehiculeId)?.identification ?? "un véhicule"}.</p>}
                  {affectation && stationsSansCorrespondance.length > 0 && <p role="status" className="sm:col-span-3 rounded-lg bg-amber-500/10 p-2 font-body-sm text-amber-900 dark:text-amber-200">Sites non rattachés au référentiel : {stationsSansCorrespondance.join(", ")}. Les pointages seront conservés dans la tournée et les prévisions ; ces collectes ne pourront pas être ajoutées à l’historique central des opérations.</p>}
                </form>}
                <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{items.map((item, index) => <li key={`${cle}-${item.site}-${index}`} className="rounded-lg bg-surface-container-low px-3 py-2"><p className="font-label-md text-label-md font-semibold text-on-surface">{item.site} <span className="font-normal text-on-surface-variant">· {item.commune}</span></p><p className="mt-1 text-xs text-on-surface-variant">Passage {item.numeroPassage} · ≈ {item.quantiteEstimeeLitres?.toLocaleString("fr-FR")} L · ≈ {item.dureeEstimeeMinutes} min sur site · médiane tous les {item.intervalleEstimeJours} j · historique {item.passagesHistoriques} passage{item.passagesHistoriques > 1 ? "s" : ""} · confiance {item.confiance}</p></li>)}</ul>
              </div>
            </div>;
          })}
          </div>}
      </section>
    </main>
  );
}
