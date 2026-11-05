import "server-only";
import stationsFournies from "./stations-shell-2026.json";

export interface StationShell {
  numero: number;
  commune: string;
  site: string;
}

export interface HistoriqueCollecte {
  site: string;
  date: Date;
  quantite: number;
  dateHeureArrivee?: Date;
  dateHeureDepart?: Date;
}

export interface RessourceTournee {
  id: string;
  nom: string;
  capacite?: number;
}

export interface PrevisionCollecte {
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

const ALIAS_SITES: Record<string, string> = {
  "7ETRAZNCHE1": "ANGRE7ETRANCHE1",
  "7ETRANCHE1": "ANGRE7ETRANCHE1",
  "ANGRE7ETRANCHE2": "7ETRANCHE2",
  "ANGRE8ETRANCHE": "LAANGRE8ETRANCHE",
  "8ETRANCHE": "LAANGRE8ETRANCHE",
  LA8ETRANCHE: "LAANGRE8ETRANCHE",
  ANONO: "SHELLANONO",
  SSANGRECHU: "ANGRECHU",
  SAINTJEAN: "STJEANT",
  STJEAN: "STJEANT",
  COCODYSTJEAN: "STJEANT",
  POABATA: "POABATTA",
  ABATA: "POABATTA",
  GFCI: "GFCI2",
  "GFCI2": "GFCI2",
  STETHERESE: "SAINTETHERESE",
  CHRISTIANI: "AVENUECHRISTIANI",
  AUTOROUTE: "AUTOROUTESUD",
  ZONEINDUSTRIELLE: "ZINDUSTRIELLE",
  KOUMASSIZI: "ZINDUSTRIELLE",
  SHELLROUME: "ROUME",
  SSROUME: "ROUME",
  SSPARIS: "PARIS",
  SSSORTIERUEDESJARDINS: "RUEDESJARDINS",
  LATRIILLEB: "LATRILLEB",
  LATRILLMEA: "LATRILLEA",
  LATB: "LATRILLEB",
  LAANONO: "SHELLANONO",
  SSPROMOTO: "SSPREMOTO",
  PREMOTO: "SSPREMOTO",
  LAKOUMASSI: "CAMPCOMMANDO",
};

function cleSite(nom: string): string {
  return nom.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

const STATIONS = stationsFournies as StationShell[];
const STATION_PAR_CLE = new Map(STATIONS.map((station) => [cleSite(station.site), station]));

function rapprocherSite(nom: string): StationShell | undefined {
  const cle = cleSite(nom);
  return STATION_PAR_CLE.get(ALIAS_SITES[cle] ?? cle);
}

/** Référentiel officiel des 40 stations fourni par SRH. */
export function listerStationsShell(): StationShell[] {
  return STATIONS;
}

/** Rapproche les libellés historiques persistés aux 40 stations du référentiel Shell. */
export function rapprocherNomStation(nom: string): StationShell | undefined {
  return rapprocherSite(nom);
}

function jourISO(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function mediane(valeurs: number[]): number {
  const tries = [...valeurs].sort((a, b) => a - b);
  const milieu = Math.floor(tries.length / 2);
  return Math.round(tries.length % 2 ? tries[milieu] : (tries[milieu - 1] + tries[milieu]) / 2);
}

function secteurDe(commune: string): "Nord" | "Sud" | "Centre" {
  if (["COCODY", "BINGERVILLE", "SONGON"].includes(commune.toUpperCase())) return "Nord";
  if (["MARCORY", "PORT-BOUET"].includes(commune.toUpperCase())) return "Sud";
  return "Centre";
}

function dateTournee(mois: string, jour: number): Date {
  const [annee, moisNumero] = mois.split("-").map(Number);
  const dernierJour = new Date(Date.UTC(annee, moisNumero, 0)).getUTCDate();
  let date = new Date(Date.UTC(annee, moisNumero - 1, Math.min(jour, dernierJour)));
  // L'historique contient des tournées le samedi, mais pas le dimanche.
  if (date.getUTCDay() === 0) date = new Date(Date.UTC(annee, moisNumero - 1, Math.min(jour + 1, dernierJour)));
  return date;
}

interface ProfilStation {
  station: StationShell;
  dates: Date[];
  intervalle: number;
  volumeMensuelObserve: number;
  dureeVisite: number;
  confiance: PrevisionCollecte["confiance"];
  passages: number;
}

interface PassageTournee {
  profil: ProfilStation;
  index: number;
  quantite: number;
}

function profilsStations(historique: HistoriqueCollecte[]): ProfilStation[] {
  const datesHistorique = historique.map((ligne) => ligne.date.getTime()).filter(Number.isFinite);
  const debut = datesHistorique.length ? new Date(Math.min(...datesHistorique)) : new Date();
  const fin = datesHistorique.length ? new Date(Math.max(...datesHistorique)) : debut;
  const moisObserves = Math.max(1, (fin.getUTCFullYear() - debut.getUTCFullYear()) * 12 + fin.getUTCMonth() - debut.getUTCMonth() + 1);
  return STATIONS.map((station) => {
    const passages = historique.filter((ligne) => ligne.site === station.site);
    const dates = [...new Map(passages.map((ligne) => [jourISO(ligne.date), ligne.date])).values()].sort((a, b) => a.getTime() - b.getTime());
    const intervalles = dates.slice(1)
      .map((date, index) => Math.round((date.getTime() - dates[index].getTime()) / 86_400_000))
      .filter((jours) => jours >= 7 && jours <= 35)
      .slice(-4);
    const intervalle = intervalles.length ? mediane(intervalles) : 30;
    const volumeMensuelObserve = passages.reduce((total, passage) => total + passage.quantite, 0) / moisObserves;
    const dureesVisite = passages.flatMap((passage) => {
      if (!passage.dateHeureArrivee || !passage.dateHeureDepart) return [];
      const minutes = (passage.dateHeureDepart.getTime() - passage.dateHeureArrivee.getTime()) / 60_000;
      return Number.isFinite(minutes) && minutes > 0 && minutes <= 12 * 60 ? [minutes] : [];
    });
    const confiance = intervalles.length >= 3 ? "élevée" : intervalles.length ? "moyenne" : "faible";
    const dureeVisite = dureesVisite.length ? mediane(dureesVisite) : 120;
    return { station, dates, intervalle, volumeMensuelObserve, confiance, passages: passages.length, dureeVisite };
  });
}

function profilVisite(
  profil: ProfilStation,
  mois: string,
  jourTournee: number,
  tournee: string,
  secteur: string,
  quantiteEstimeeLitres: number,
  ressources: { vehicule?: RessourceTournee; equipements: string[] }
): PrevisionCollecte {
  const derniere = profil.dates.at(-1);
  const datePrevue = dateTournee(mois, jourTournee);
  return {
    site: profil.station.site,
    commune: profil.station.commune,
    datePrevue: jourISO(datePrevue),
    derniereCollecte: derniere ? jourISO(derniere) : undefined,
    intervalleEstimeJours: profil.intervalle,
    quantiteEstimeeLitres,
    dureeEstimeeMinutes: profil.dureeVisite,
    capaciteVehiculeLitres: ressources.vehicule?.capacite,
    numeroPassage: 1,
    passagesHistoriques: profil.passages,
    confiance: profil.confiance,
    tournee,
    secteur,
    vehicule: ressources.vehicule?.nom,
    equipements: ressources.equipements,
  };
}

function datesTournees(mois: string, nombre: number): string[] {
  const [annee, numeroMois] = mois.split("-").map(Number);
  const dernierJour = new Date(Date.UTC(annee, numeroMois, 0)).getUTCDate();
  const joursOuvres: string[] = [];
  for (let jour = 1; jour <= dernierJour; jour++) {
    const date = new Date(Date.UTC(annee, numeroMois - 1, jour));
    if (date.getUTCDay() !== 0 && date.getUTCDay() !== 6) joursOuvres.push(jourISO(date));
  }
  return Array.from({ length: nombre }, (_, index) => joursOuvres[Math.floor(((index + 0.5) * joursOuvres.length) / nombre)] ?? joursOuvres.at(-1) ?? "");
}

/** Prévoit les passages depuis les collectes persistées, le volume cible et les ressources disponibles. */
export async function prevoirCollectes(
  mois: string,
  historique: HistoriqueCollecte[],
  objectifLitresParStation = 2000,
  vehicules: RessourceTournee[] = [],
  equipements: RessourceTournee[] = []
): Promise<PrevisionCollecte[]> {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mois)) throw new Error("Mois invalide");
  const profils = profilsStations(historique);
  const ressourcesVehicules = vehicules.filter((item) => item.capacite && item.capacite > 0).sort((a, b) => (a.capacite ?? 0) - (b.capacite ?? 0));
  const capaciteMaximale = ressourcesVehicules.at(-1)?.capacite ?? Number.POSITIVE_INFINITY;
  const ressourcesEquipements = equipements.map((item) => item.nom);
  const cibleBrute = profils.map((profil) => (objectifLitresParStation + profil.volumeMensuelObserve) / 2);
  const totalBrut = cibleBrute.reduce((sum, volume) => sum + volume, 0) || profils.length;
  const objectifParStation = new Map(
    profils.map((profil, index) => [
      profil.station.site,
      Math.round(cibleBrute[index] * objectifLitresParStation * profils.length / totalBrut),
    ])
  );
  const profilsRepetitionParSecteur = new Map<string, number>();
  for (const profil of profils) {
    if (profil.passages >= 3 && profil.intervalle <= 21) {
      const secteur = secteurDe(profil.station.commune);
      profilsRepetitionParSecteur.set(secteur, (profilsRepetitionParSecteur.get(secteur) ?? 0) + 1);
    }
  }
  const passagesBaseParStation = new Map(profils.map((profil) => {
    const secteur = secteurDe(profil.station.commune);
    const passagesBase = profil.passages >= 3 && profil.intervalle <= 21 && (profilsRepetitionParSecteur.get(secteur) ?? 0) >= 5 && (profilsRepetitionParSecteur.get(secteur) ?? 0) <= 8
      ? Math.min(3, Math.max(1, Math.ceil(30 / profil.intervalle))): 1;
    return [profil.station.site, passagesBase] as const;
  }));
  const vehiculePlusPetit = ressourcesVehicules[0];
  const vehiculePlusGrand = ressourcesVehicules.at(-1);
  const repartirEntreVehicules = Boolean(
    vehiculePlusPetit &&
    vehiculePlusGrand &&
    vehiculePlusPetit.id !== vehiculePlusGrand.id &&
    (vehiculePlusPetit.capacite ?? 0) < (vehiculePlusGrand.capacite ?? 0)
  );
  const volumeMaxParStationEtTournee = capaciteMaximale / MINIMUM_STATIONS_PAR_TOURNEE;
  const volumePetitCamionParStation = repartirEntreVehicules
    ? Math.floor((vehiculePlusPetit?.capacite ?? 0) / MINIMUM_STATIONS_PAR_TOURNEE)
    : 0;
  const passagesParVehicule = new Map<RessourceTournee | undefined, PassageTournee[]>();
  const ajouterPassage = (
    vehicule: RessourceTournee | undefined,
    profil: ProfilStation,
    index: number,
    quantite: number
  ) => {
    const passages = passagesParVehicule.get(vehicule) ?? [];
    passages.push({ profil, index, quantite });
    passagesParVehicule.set(vehicule, passages);
  };

  for (const profil of profils) {
    const volumeMensuel = objectifParStation.get(profil.station.site) ?? objectifLitresParStation;
    const volumePetitCamion = Math.min(volumeMensuel, volumePetitCamionParStation);
    const volumeRestant = volumeMensuel - volumePetitCamion;
    if (volumePetitCamion > 0) {
      ajouterPassage(vehiculePlusPetit, profil, 0, volumePetitCamion);
    }
    if (volumeRestant <= 0) continue;

    const nombrePassages = Math.max(
      passagesBaseParStation.get(profil.station.site) ?? 1,
      Math.ceil(volumeRestant / volumeMaxParStationEtTournee)
    );
    const volumeParPassage = Math.floor(volumeRestant / nombrePassages);
    const volumeRestantARepartir = volumeRestant - volumeParPassage * nombrePassages;
    for (let index = 0; index < nombrePassages; index++) {
      ajouterPassage(
        vehiculePlusGrand,
        profil,
        index + (volumePetitCamion > 0 ? 1 : 0),
        volumeParPassage + (index < volumeRestantARepartir ? 1 : 0)
      );
    }
  }

  const groupes: { vehicule?: RessourceTournee; passages: PassageTournee[] }[] = [];
  for (const [vehicule, passages] of passagesParVehicule) {
    while (passages.length % MINIMUM_STATIONS_PAR_TOURNEE !== 0) {
      const passageAScinder = passages
        .filter((passage) => passage.quantite > 0)
        .sort((a, b) => b.quantite - a.quantite)[0];
      if (!passageAScinder) throw new Error("Impossible de compléter une tournée avec cinq stations.");
      passageAScinder.quantite /= 2;
      const indexSuivant = Math.max(
        ...passages.filter((passage) => passage.profil === passageAScinder.profil).map((passage) => passage.index)
      ) + 1;
      passages.push({
        ...passageAScinder,
        index: indexSuivant,
        quantite: passageAScinder.quantite,
      });
    }

    const groupesVehicule: PassageTournee[][] = Array.from(
      { length: passages.length / MINIMUM_STATIONS_PAR_TOURNEE },
      () => []
    );
    const passagesTries = [...passages].sort((a, b) =>
      a.index - b.index ||
      b.quantite - a.quantite ||
      secteurDe(a.profil.station.commune).localeCompare(secteurDe(b.profil.station.commune), "fr") ||
      a.profil.station.site.localeCompare(b.profil.station.site, "fr")
    );
    for (const passage of passagesTries) {
      const groupe = groupesVehicule.find((candidat) =>
        candidat.length < MINIMUM_STATIONS_PAR_TOURNEE &&
        !candidat.some((item) => item.profil.station.site === passage.profil.station.site)
      );
      if (!groupe) throw new Error("Impossible de composer une tournée avec cinq stations distinctes.");
      groupe.push(passage);
    }
    groupes.push(...groupesVehicule.map((groupe) => ({ vehicule, passages: groupe })));
  }
  if (groupes.length === 0) return [];
  const dates = datesTournees(mois, groupes.length);
  const resultats: PrevisionCollecte[] = [];
  groupes.forEach(({ vehicule, passages }, index) => {
    const secteurs = [...new Set(passages.map(({ profil }) => secteurDe(profil.station.commune)))];
    const secteur = secteurs.length === 1 ? secteurs[0] : secteurs.join(" · ");
    const nomTournee = `Tournée ${index + 1}`;
    for (const { profil, index: numeroPassage, quantite } of passages) {
      const visite = profilVisite(profil, mois, 1, nomTournee, secteur, quantite, {
        vehicule,
        equipements: ressourcesEquipements,
      });
      visite.datePrevue = dates[index];
      visite.tournee = nomTournee;
      visite.numeroPassage = numeroPassage + 1;
      resultats.push(visite);
    }
  });
  return resultats.sort((a, b) => a.datePrevue.localeCompare(b.datePrevue) || a.tournee.localeCompare(b.tournee, "fr") || a.site.localeCompare(b.site, "fr"));
}

const MINIMUM_STATIONS_PAR_TOURNEE = 5;
