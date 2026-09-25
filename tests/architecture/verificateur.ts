// tests/architecture/verificateur.ts
import path from "node:path";

export interface Contexte {
  domainesBackendMigres: string[];
  fonctionnalitesFrontendMigrees: string[];
}

const PAQUETS_INTERDITS_DOMAINE = [
  /^(mongoose|mongodb|bson|nodemailer|bcryptjs|exceljs)(\/|$)/,
  /^next(\/|$)/,
  /^next-auth(\/|$)/,
  /^jspdf(\/|-|$)/,
];

export const DOSSIERS_HERITES = ["src/lib/", "src/models/", "src/components/", "src/hooks/"];

/**
 * Tolérance transitoire : tant que l'ancien code existe, un domaine migré peut encore
 * l'importer depuis `http/`, `infrastructure/` et `composition.ts` (et une fonctionnalité
 * frontend migrée, partout). Cette tolérance disparaît à R9 (clôture du chantier).
 */
export const AJOUT_HERITAGE = {
  couchesTolerees: ["http", "infrastructure", "composition"],
  retraitPrevu: "R9",
} as const;

const COUCHES = ["domain", "application", "infrastructure", "http"] as const;
type Couche = (typeof COUCHES)[number] | "composition" | "index" | "inconnu";

// Seul module de `platform` autorisé à importer les domaines (voir enregistrement-modeles.ts).
const EXCEPTION_PLATFORM = "src/backend/platform/base-de-donnees/enregistrement-modeles.ts";

/**
 * Transforme un spécificateur d'import en chemin `src/...` normalisé (posix, sans extension
 * ni requête) ou en nom de paquet (sans requête).
 */
function resoudre(specificateur: string, fichier: string): string {
  const spec = specificateur.replace(/[?#].*$/, "");
  let cible: string;
  if (spec.startsWith("@/")) cible = path.posix.normalize(`src/${spec.slice(2)}`);
  else if (spec.startsWith(".")) cible = path.posix.normalize(path.posix.join(path.posix.dirname(fichier), spec));
  else return spec;
  return cible.replace(/\/+$/, "").replace(/\.(tsx?|jsx?|mjs)$/, "");
}

const estPaquet = (cible: string) => !cible.startsWith("src/");

/** `cible` est le dossier `dossier` ou se trouve dedans (les imports de dossier comptent). */
const dans = (cible: string, dossier: string) => {
  const d = dossier.replace(/\/+$/, "");
  return cible === d || cible.startsWith(`${d}/`);
};

const estPaquetInterdit = (cible: string) => estPaquet(cible) && PAQUETS_INTERDITS_DOMAINE.some((re) => re.test(cible));
const estHerite = (cible: string) => DOSSIERS_HERITES.some((d) => dans(cible, d));

function decouper(fichier: string) {
  const backend = /^src\/backend\/([^/]+)\/(.+)$/.exec(fichier);
  const frontend = /^src\/frontend\/([^/]+)\//.exec(fichier);
  let couche: Couche | undefined;
  let premier: string | undefined;
  if (backend) {
    const reste = backend[2];
    premier = reste.split("/")[0];
    if (reste.includes("/") && (COUCHES as readonly string[]).includes(premier)) couche = premier as Couche;
    else if (reste === "composition.ts") couche = "composition";
    else if (reste === "index.ts") couche = "index";
    else couche = "inconnu";
  }
  return {
    domaine: backend?.[1],
    couche,
    premier,
    fonctionnalite: frontend?.[1],
    estBackend: fichier.startsWith("src/backend/"),
    estFrontend: fichier.startsWith("src/frontend/"),
    estShared: fichier.startsWith("src/shared/"),
  };
}

export function verifierImports(fichier: string, imports: string[], contexte: Contexte): string[] {
  const violations: string[] = [];
  const { domaine, couche, premier, fonctionnalite, estBackend, estFrontend, estShared } = decouper(fichier);
  const signaler = (regle: string, spec: string) => violations.push(`${regle} ${fichier} importe « ${spec} »`);

  const domaineMigre = domaine !== undefined && domaine !== "platform" && contexte.domainesBackendMigres.includes(domaine);
  if (domaineMigre && couche === "inconnu") {
    violations.push(`STRUCTURE ${fichier} : dossier ou fichier inconnu (src/backend/${domaine}/${premier})`);
  }

  for (const spec of imports) {
    const cible = resoudre(spec, fichier);

    // shared est la couche de base : rien d'autre que shared et des paquets neutres (R1).
    if (estShared) {
      if (estPaquet(cible) ? estPaquetInterdit(cible) : !dans(cible, "src/shared")) signaler("R1", spec);
      continue;
    }

    // Le backend n'importe jamais le frontend ni app (inverse de R4).
    if (estBackend && (dans(cible, "src/frontend") || dans(cible, "src/app"))) {
      signaler("R4-inverse", spec);
      continue;
    }

    // platform n'importe aucun domaine (sauf le registre des modèles).
    if (domaine === "platform" && fichier !== EXCEPTION_PLATFORM) {
      const vers = /^src\/backend\/([^/]+)(\/|$)/.exec(cible);
      if (vers && vers[1] !== "platform") {
        signaler("R5", spec);
        continue;
      }
    }

    // R4 — le frontend n'importe jamais le backend ni src/app ; ni mongoose, ni les modèles hérités.
    if (estFrontend) {
      if (dans(cible, "src/app")) {
        signaler("R4", spec);
        continue;
      }
      if (dans(cible, "src/backend") || cible === "mongoose" || /^mongoose\//.test(cible) || dans(cible, "src/models")) {
        signaler("R4", spec);
        continue;
      }
    }

    // Domaines backend migrés uniquement.
    if (domaineMigre && couche) {
      const dansDomaine = `src/backend/${domaine}`;
      const versAutreDomaine = /^src\/backend\/([^/]+)(\/|$)/.exec(cible);

      if (couche === "domain") {
        const ok = dans(cible, "src/shared") || dans(cible, `${dansDomaine}/domain`);
        if (!ok) signaler("R1", spec);
        continue;
      }
      if (couche === "application") {
        const ok =
          dans(cible, "src/shared") ||
          dans(cible, `${dansDomaine}/domain`) ||
          dans(cible, `${dansDomaine}/application`) ||
          (estPaquet(cible) && !estPaquetInterdit(cible));
        if (!ok) signaler("R2", spec);
        continue;
      }
      if (couche === "index") {
        const ok =
          dans(cible, "src/shared") ||
          dans(cible, `${dansDomaine}/domain`) ||
          dans(cible, `${dansDomaine}/application`) ||
          cible === `${dansDomaine}/composition`;
        if (!ok) signaler("INDEX", spec);
        continue;
      }
      if (couche === "http" && dans(cible, `${dansDomaine}/infrastructure`)) {
        signaler("R3", spec);
        continue;
      }
      if (couche === "infrastructure" && dans(cible, `${dansDomaine}/http`)) {
        signaler("R3", spec);
        continue;
      }
      if (couche === "composition" && dans(cible, `${dansDomaine}/http`)) {
        signaler("R3", spec);
        continue;
      }
      // R5 — un autre domaine, uniquement par son index (platform toujours autorisé).
      if (versAutreDomaine && versAutreDomaine[1] !== domaine && versAutreDomaine[1] !== "platform") {
        const autre = versAutreDomaine[1];
        if (cible !== `src/backend/${autre}/index` && cible !== `src/backend/${autre}`) {
          signaler("R5", spec);
          continue;
        }
      }
      // Héritage : toléré seulement dans http, infrastructure, composition (jusqu'à R9).
      if (estHerite(cible) && !(AJOUT_HERITAGE.couchesTolerees as readonly string[]).includes(couche)) {
        signaler("HERITAGE", spec);
        continue;
      }
    }

    // Fonctionnalités frontend migrées : R5 (l'héritage y est toléré jusqu'à R9).
    if (fonctionnalite && contexte.fonctionnalitesFrontendMigrees.includes(fonctionnalite)) {
      const versAutre = /^src\/frontend\/([^/]+)(\/|$)/.exec(cible);
      if (versAutre && versAutre[1] !== fonctionnalite && versAutre[1] !== "design-system") {
        const autre = versAutre[1];
        if (cible !== `src/frontend/${autre}/index` && cible !== `src/frontend/${autre}`) signaler("R5", spec);
      }
    }
  }
  return violations;
}
