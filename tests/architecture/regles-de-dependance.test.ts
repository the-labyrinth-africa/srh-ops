// tests/architecture/regles-de-dependance.test.ts
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { verifierImports, type Contexte } from "./verificateur";

// À compléter à chaque migration de domaine (recette, étape 8).
const contexte: Contexte = {
  domainesBackendMigres: ["equipes", "vehicules", "equipements", "clients-sites"],
  fonctionnalitesFrontendMigrees: ["equipes", "vehicules", "equipements"],
};

function fichiers(dossier: string): string[] {
  const resultat: string[] = [];
  for (const nom of readdirSync(dossier)) {
    const chemin = path.join(dossier, nom);
    if (statSync(chemin).isDirectory()) resultat.push(...fichiers(chemin));
    else if (/\.(ts|tsx)$/.test(nom)) resultat.push(chemin);
  }
  return resultat;
}

function importsDe(source: string): string[] {
  const motifs = [
    /(?:import|export)\s[^"';]*?from\s+["']([^"']+)["']/g,
    /import\s+["']([^"']+)["']/g,
    /import\(\s*["']([^"']+)["']\s*\)/g,
  ];
  const trouves: string[] = [];
  for (const motif of motifs) for (const m of source.matchAll(motif)) trouves.push(m[1]);
  return trouves;
}

describe("règles de dépendance de l'architecture", () => {
  const racine = path.resolve(__dirname, "../..");
  const sources = ["backend", "frontend", "shared"]
    .map((d) => path.join(racine, "src", d))
    .filter((d) => {
      try {
        return statSync(d).isDirectory();
      } catch {
        return false;
      }
    })
    .flatMap(fichiers);

  it("trouve des sources à vérifier", () => {
    expect(sources.length).toBeGreaterThan(0);
  });

  it("n'a aucune violation", () => {
    const violations = sources.flatMap((absolu) => {
      const relatif = path.relative(racine, absolu).split(path.sep).join("/");
      // Les tests collés au code peuvent importer ce qu'ils veulent de leur propre module.
      if (/\.test\.(ts|tsx)$/.test(relatif)) return [];
      return verifierImports(relatif, importsDe(readFileSync(absolu, "utf8")), contexte);
    });
    expect(violations, violations.join("\n")).toEqual([]);
  });
});
