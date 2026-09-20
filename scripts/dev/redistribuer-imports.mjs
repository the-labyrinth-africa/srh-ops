// scripts/dev/redistribuer-imports.mjs
// Usage : node scripts/dev/redistribuer-imports.mjs carte.json
// carte.json = { "de": "@/types", "carte": { "UserRole": "@/shared/acces/roles", ... } }
// Réécrit chaque `import { A, B } from "<de>"` en imports groupés par nouveau module.
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

const [, , cheminCarte] = process.argv;
if (!cheminCarte) {
  console.error("Usage : node scripts/dev/redistribuer-imports.mjs carte.json");
  process.exit(2);
}
const { de, carte } = JSON.parse(readFileSync(cheminCarte, "utf8"));

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

const echapper = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const MOTIF = new RegExp(
  `import\\s+(type\\s+)?\\{([^}]*)\\}\\s+from\\s+["']${echapper(de)}["'];?`,
  "g"
);

let modifies = 0;
const erreurs = [];
for (const racine of RACINES) {
  try {
    statSync(racine);
  } catch {
    continue;
  }
  for (const fichier of fichiers(racine)) {
    const source = readFileSync(fichier, "utf8");
    const nouveau = source.replace(MOTIF, (_tout, typeSeul, liste) => {
      const groupes = new Map();
      for (const brut of liste.split(",").map((s) => s.trim()).filter(Boolean)) {
        const typeInline = brut.startsWith("type ");
        const sansType = typeInline ? brut.slice(5).trim() : brut;
        const nomSource = sansType.split(/\s+as\s+/)[0].trim();
        const cible = carte[nomSource];
        if (!cible) {
          erreurs.push(`${fichier} : symbole inconnu « ${nomSource} » importé depuis ${de}`);
          return _tout;
        }
        if (!groupes.has(cible)) groupes.set(cible, []);
        groupes.get(cible).push(typeInline ? `type ${sansType}` : sansType);
      }
      return [...groupes.entries()]
        .map(([module, noms]) =>
          typeSeul
            ? `import type { ${noms.join(", ")} } from "${module}";`
            : `import { ${noms.join(", ")} } from "${module}";`
        )
        .join("\n");
    });
    if (nouveau !== source) {
      writeFileSync(fichier, nouveau);
      modifies += 1;
      console.log(`modifié : ${fichier}`);
    }
  }
}
if (erreurs.length > 0) {
  console.error(erreurs.join("\n"));
  process.exit(1);
}
console.log(`${modifies} fichier(s) modifié(s).`);
