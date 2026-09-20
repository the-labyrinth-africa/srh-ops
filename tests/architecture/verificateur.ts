// tests/architecture/verificateur.ts
import path from "node:path";

export interface Contexte {
  domainesBackendMigres: string[];
  fonctionnalitesFrontendMigrees: string[];
}

const PAQUETS_INTERDITS_DOMAINE = [
  /^mongoose$/, /^next(\/|$)/, /^next-auth(\/|$)/, /^nodemailer$/, /^bcryptjs$/, /^jspdf(\/|-|$)/, /^exceljs$/,
];
const DOSSIERS_HERITES = ["src/lib/", "src/models/", "src/components/", "src/hooks/", "src/types/"];

/** Transforme un spécificateur d'import en chemin `src/...` (posix) ou en nom de paquet. */
function resoudre(specificateur: string, fichier: string): string {
  if (specificateur.startsWith("@/")) return `src/${specificateur.slice(2)}`;
  if (specificateur.startsWith(".")) {
    return path.posix.normalize(path.posix.join(path.posix.dirname(fichier), specificateur));
  }
  return specificateur;
}

const estPaquet = (cible: string) => !cible.startsWith("src/");

function decouper(fichier: string) {
  const backend = /^src\/backend\/([^/]+)\/(domain|application|infrastructure|http)\//.exec(fichier);
  const frontend = /^src\/frontend\/([^/]+)\//.exec(fichier);
  return {
    domaine: backend?.[1],
    couche: backend?.[2],
    fonctionnalite: frontend?.[1],
    estBackend: fichier.startsWith("src/backend/"),
    estFrontend: fichier.startsWith("src/frontend/"),
  };
}

export function verifierImports(fichier: string, imports: string[], contexte: Contexte): string[] {
  const violations: string[] = [];
  const { domaine, couche, fonctionnalite, estFrontend } = decouper(fichier);
  const signaler = (regle: string, spec: string) => violations.push(`${regle} ${fichier} importe « ${spec} »`);

  for (const spec of imports) {
    const cible = resoudre(spec, fichier);

    // R4 — le frontend n'importe jamais le backend (s'applique à tout src/frontend).
    if (estFrontend && cible.startsWith("src/backend/")) {
      signaler("R4", spec);
      continue;
    }

    // Domaines backend migrés uniquement.
    if (domaine && contexte.domainesBackendMigres.includes(domaine) && couche) {
      const dansDomaine = `src/backend/${domaine}/`;
      const versAutreDomaine = /^src\/backend\/([^/]+)\//.exec(cible);

      if (couche === "domain") {
        const ok = cible.startsWith("src/shared/") || cible.startsWith(`${dansDomaine}domain/`);
        if (!ok) signaler("R1", spec);
        continue;
      }
      if (couche === "application") {
        const ok =
          cible.startsWith("src/shared/") ||
          cible.startsWith(`${dansDomaine}domain/`) ||
          cible.startsWith(`${dansDomaine}application/`) ||
          (estPaquet(cible) && !PAQUETS_INTERDITS_DOMAINE.some((re) => re.test(cible)));
        if (!ok) signaler("R2", spec);
        continue;
      }
      if (couche === "http" && cible.startsWith(`${dansDomaine}infrastructure/`) && !fichier.endsWith("composition.ts")) {
        signaler("R3", spec);
        continue;
      }
      if (couche === "infrastructure" && cible.startsWith(`${dansDomaine}http/`)) {
        signaler("R3", spec);
        continue;
      }
      if (versAutreDomaine && versAutreDomaine[1] !== domaine && versAutreDomaine[1] !== "platform") {
        const autre = versAutreDomaine[1];
        if (cible !== `src/backend/${autre}/index` && cible !== `src/backend/${autre}`) signaler("R5", spec);
      }
    }

    // Fonctionnalités frontend migrées : R5.
    if (fonctionnalite && contexte.fonctionnalitesFrontendMigrees.includes(fonctionnalite)) {
      const versAutre = /^src\/frontend\/([^/]+)\//.exec(cible);
      if (versAutre && versAutre[1] !== fonctionnalite && versAutre[1] !== "design-system") {
        const autre = versAutre[1];
        if (cible !== `src/frontend/${autre}/index`) signaler("R5", spec);
      }
    }
  }
  return violations;
}

export { DOSSIERS_HERITES };
