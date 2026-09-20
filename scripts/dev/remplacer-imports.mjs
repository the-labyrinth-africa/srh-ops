// scripts/dev/remplacer-imports.mjs
// Usage : node scripts/dev/remplacer-imports.mjs "@/lib/db" "@/backend/platform/base-de-donnees/connexion"
// Remplace le spécificateur exact (entre guillemets simples ou doubles) dans src/, tests/ et scripts/.
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

const [, , de, vers] = process.argv;
if (!de || !vers) {
  console.error('Usage : node scripts/dev/remplacer-imports.mjs "<de>" "<vers>"');
  process.exit(2);
}

const RACINES = ["src", "tests", "scripts"];
const EXTENSIONS = new Set([".ts", ".tsx", ".mjs"]);

function fichiers(dossier) {
  const resultat = [];
  for (const nom of readdirSync(dossier)) {
    const chemin = path.join(dossier, nom);
    if (statSync(chemin).isDirectory()) resultat.push(...fichiers(chemin));
    else if (EXTENSIONS.has(path.extname(nom))) resultat.push(chemin);
  }
  return resultat;
}

let modifies = 0;
for (const racine of RACINES) {
  try {
    statSync(racine);
  } catch {
    continue;
  }
  for (const fichier of fichiers(racine)) {
    const source = readFileSync(fichier, "utf8");
    const nouveau = source.split(`"${de}"`).join(`"${vers}"`).split(`'${de}'`).join(`'${vers}'`);
    if (nouveau !== source) {
      writeFileSync(fichier, nouveau);
      modifies += 1;
      console.log(`modifié : ${fichier}`);
    }
  }
}
console.log(`${modifies} fichier(s) modifié(s).`);
