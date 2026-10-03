import { AucuneLigneExploitable, ClientIntrouvable } from "../domain/erreurs";
import {
  OBSERVATION_SITE_IMPORTE,
  REMARQUE_OPERATION_IMPORTEE,
  TYPE_DECHETS_PAR_DEFAUT,
  dateHeurePrevueImportee,
  historiqueImporte,
  normaliserNomSite,
  resumerLecture,
  sitesDistincts,
  type ResumeImport,
} from "../domain/import";
import type { LectureClasseur } from "../domain/lecture";
import type { CollectesRealisees, LecteurExcel, SitesDuClient } from "../domain/ports";

export interface DependancesImport {
  lecteur: LecteurExcel;
  sites: SitesDuClient;
  collectes: CollectesRealisees;
}

export interface Analyse {
  lecture: LectureClasseur;
  resume: ResumeImport;
}

export interface ResultatImport {
  created: number;
  duplicates: number;
  /** Identifiant canonique du client destinataire. */
  clientId: string;
}

export function creerCasDUsageImport({ lecteur, sites, collectes }: DependancesImport) {
  return {
    /** Lit le classeur et le résume ; ne touche pas la base. */
    async analyser(contenu: Uint8Array, nomFichier: string): Promise<Analyse> {
      const lecture = await lecteur.lire(contenu, nomFichier);
      if (lecture.rows.length === 0) throw new AucuneLigneExploitable(lecture.errors);
      return { lecture, resume: resumerLecture(lecture) };
    },

    /**
     * Enregistre les collectes lues pour le client destinataire. Le client est explicite, vérifié,
     * et jamais créé à la volée (I2) ; les sites manquants sont créés chez ce client.
     */
    async importer(lecture: LectureClasseur, clientId: string, natureIntervention: string): Promise<ResultatImport> {
      const client = await sites.identifiantDuClient(clientId);
      if (!client) throw new ClientIntrouvable();

      // Résolution ou création des sites, une fois par nom lu.
      const siteParNom = new Map<string, string>();
      for (const nomLu of sitesDistincts(lecture)) {
        const nom = nomLu.trim();
        // I1 : la recherche est bornée au client destinataire, sinon un site homonyme d'un autre
        // client se retrouverait rattaché aux opérations importées.
        const existant = await sites.trouverParNom(client, nom);
        if (existant) {
          siteParNom.set(normaliserNomSite(nomLu), existant);
          continue;
        }
        const cree = await sites.creer({
          clientId: client,
          nom,
          adresse: "",
          localisation: { lat: 0, lng: 0 },
          typeDechets: [TYPE_DECHETS_PAR_DEFAUT],
          observations: OBSERVATION_SITE_IMPORTE,
        });
        siteParNom.set(normaliserNomSite(nomLu), cree);
      }

      let created = 0;
      let duplicates = 0;

      for (const ligne of lecture.rows) {
        const siteId = siteParNom.get(normaliserNomSite(ligne.site));
        if (!siteId) continue;

        const dateHeurePrevue = dateHeurePrevueImportee(ligne.date);

        if (await collectes.existe(siteId, dateHeurePrevue, ligne.quantite)) {
          duplicates++;
          continue;
        }

        await collectes.enregistrer({
          clientId: client,
          siteId,
          natureIntervention,
          dateHeurePrevue,
          dureeEstimeeMinutes: 120,
          informationsParticulieres: "",
          statut: "Rapportée",
          historiqueStatuts: historiqueImporte(dateHeurePrevue),
          quantiteCollectee: ligne.quantite,
          uniteQuantite: "Litres",
          remarquesTerrain: REMARQUE_OPERATION_IMPORTEE,
        });
        created++;
      }

      return { created, duplicates, clientId: client };
    },
  };
}

export type CasDUsageImport = ReturnType<typeof creerCasDUsageImport>;
