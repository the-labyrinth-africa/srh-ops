import { jsPDF } from "jspdf";
import fs from "fs";

const PRIMARY: [number, number, number] = [13, 99, 27];
const DARK: [number, number, number] = [7, 30, 39];
const GRAY: [number, number, number] = [120, 120, 120];
const LIGHT: [number, number, number] = [240, 244, 241];
const AMBER: [number, number, number] = [230, 170, 40];

interface Phase {
  num: number;
  nom: string;
  statut: string;
  pct: number;
  livree: string[];
  restante: string[];
  note: string;
}

const phases: Phase[] = [
  {
    num: 1,
    nom: "Planification des Collectes (Module 1)",
    statut: "Terminée",
    pct: 100,
    livree: [
      "Référentiels complets : clients & sites, équipes, véhicules, équipements",
      "Opérations : création, édition, liste filtrable et paginée",
      "Détection automatique des conflits d'affectation (équipe / véhicule)",
      "Workflow de 8 statuts avec historique des transitions",
      "Vue calendrier (FullCalendar) en jour / semaine / mois",
      "Tableau de bord KPI (prévues, en cours, terminées, retardées, annulées)",
      "Authentification multi-rôles et permissions",
      "Collectes récurrentes : modèle, moteur de génération sans doublon, interface",
      "Rapport d'intervention PDF, signature et photos (préparation Phase 2)",
    ],
    restante: ["Aucun élément bloquant - module opérationnel"],
    note: "Sprints S0 à S5 + S1.5 validés. 62/62 tests automatisés verts.",
  },
  {
    num: 2,
    nom: "PWA terrain & rapport digital",
    statut: "En développement",
    pct: 75,
    livree: [
      "Console terrain web (/terrain) avec rôle Chauffeur",
      "Interface responsive utilisable sur téléphone et tablette",
      "Capture photo sur intervention (max 10, base 64)",
      "Signature client (écran tactile)",
      "Relevé des quantités collectées et unités",
      "Génération PDF du rapport d'intervention (détails, quantités, historique, signature, photos)",
    ],
    restante: [
      "Manifest PWA, icônes et installabilité (ajout à l'écran d'accueil)",
      "Service worker et mode hors-ligne",
      "Synchronisation des données saisies hors-ligne",
    ],
    note: "App mobile native abandonnée au profit d'une PWA : la console web existante couvre déjà l'essentiel du périmètre terrain.",
  },
  {
    num: 3,
    nom: "Traçabilité des déchets",
    statut: "Non démarrée",
    pct: 0,
    livree: [],
    restante: [
      "Collection 'traçabilité' liée aux opérations (identifiant de suivi, volumes, traitement)",
      "Suivi de bout en bout (collecte vers traitement)",
      "Interface de consultation / export",
    ],
    note: "Prévue en Phase 3 après stabilisation terrain.",
  },
  {
    num: 4,
    nom: "Espace client & demandes en ligne",
    statut: "Amorcée",
    pct: 5,
    livree: [
      "Rôle 'client' défini dans le modèle et les permissions",
    ],
    restante: [
      "Portail lecture seule des opérations filtré par client",
      "Formulaire de demande en ligne créant une opération 'Demande'",
      "Connexion dédiée et tableaux de bord client",
    ],
    note: "Fondations de modélisation en place, aucun écran livré.",
  },
  {
    num: 5,
    nom: "Notifications & dashboard avancé",
    statut: "Socle en place",
    pct: 10,
    livree: [
      "Service d'e-mail (lib/email) branché sur invitations et réinitialisation de mot de passe",
      "Mot de passe oublié / changement de mot de passe opérationnels",
    ],
    restante: [
      "Alertes automatiques (retards, conflits, opérations du jour)",
      "Graphiques et exports du tableau de bord",
    ],
    note: "Le canal e-mail existe déjà ; les notifications métier restent à bâtir.",
  },
  {
    num: 6,
    nom: "Optimisation des tournées",
    statut: "Préparée",
    pct: 5,
    livree: [
      "Champ de localisation (latitude / longitude) sur les sites",
    ],
    restante: [
      "Moteur d'optimisation des tournées basé sur la localisation",
    ],
    note: "Proche de zéro, mais le modèle de données est prêt.",
  },
];

const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN = 20;

const doc = new jsPDF("p", "mm", "a4");
const pageWidth = doc.internal.pageSize.getWidth();
let y = 0;

const addFooter = (page: number) => {
  doc.setFontSize(8);
  doc.setTextColor(...GRAY);
  doc.text(
    `SRH Recyclage - Rapport d'avancement du projet - Page ${page}`,
    pageWidth / 2,
    PAGE_H - 10,
    { align: "center" }
  );
};

const ensureSpace = (needed: number) => {
  if (y + needed > PAGE_H - 20) {
    doc.addPage();
    y = 20;
  }
};

// ---- En-tête ----
doc.setFillColor(...PRIMARY);
doc.rect(0, 0, pageWidth, 45, "F");
doc.setTextColor(255, 255, 255);
doc.setFontSize(20);
doc.setFont("helvetica", "bold");
doc.text("SRH Recyclage", MARGIN, 18);
doc.setFontSize(13);
doc.setFont("helvetica", "normal");
doc.text("Rapport d'Avancement du Projet", MARGIN, 29);
doc.setFontSize(9);
doc.text("Digitalisation des Opérations  |  Plateforme SRH Ops", MARGIN, 37);

y = 52;

// ---- Introduction ----
doc.setTextColor(...DARK);
doc.setFont("helvetica", "bold");
doc.setFontSize(12);
doc.text("1. Contexte", MARGIN, y);
y += 6;
doc.setFont("helvetica", "normal");
doc.setFontSize(10);
const intro = doc.splitTextToSize(
  "La plateforme SRH Ops digitalise les opérations de collecte de SRH. La Phase 1 (Module 1 - Planification des Collectes) est terminée à 100% et sert de socle aux phases suivantes. Ce rapport présente l'état d'avancement réel de chaque phase, les livrables terminés et le reste à faire, sur la base des contrôles effectués le 17 septembre 2026 (tests 62/62, lint, build de production, vérification des routes et des API).",
  pageWidth - 2 * MARGIN
);
doc.text(intro, MARGIN, y);
y += intro.length * 4.8 + 6;

// ---- Synthèse des phases ----
doc.setFont("helvetica", "bold");
doc.setFontSize(12);
doc.text("2. Avancement par phase", MARGIN, y);
y += 6;

// Table header
const colX = MARGIN;
const colW = pageWidth - 2 * MARGIN;
const barW = 46;
const rowH = 9;

const tableHeader = () => {
  doc.setFillColor(...PRIMARY);
  doc.rect(colX, y, colW, 9, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(8.5);
  doc.setFont("helvetica", "bold");
  doc.text("Phase", colX + 4, y + 6);
  doc.text("Module", colX + 26, y + 6);
  doc.text("Statut", colX + colW - 98, y + 6);
  doc.text("Avancement", colX + colW - 60, y + 6);
};
tableHeader();
y += 9;

phases.forEach((p) => {
  ensureSpace(10);
  const fill = y % 2 === 0 ? LIGHT : [255, 255, 255] as [number, number, number];
  doc.setFillColor(fill[0], fill[1], fill[2]);
  doc.rect(colX, y, colW, 9, "F");

  doc.setTextColor(...DARK);
  doc.setFontSize(8.5);
  doc.setFont("helvetica", "bold");
  doc.text(String(p.num), colX + 4, y + 6);
  doc.setFont("helvetica", "normal");
  const nom = doc.splitTextToSize(p.nom, 60);
  doc.text(nom[0], colX + 26, y + 6);
  doc.setTextColor(...(p.pct === 100 ? PRIMARY : p.pct === 0 ? [190, 40, 40] as [number, number, number] : AMBER));
  doc.setFont("helvetica", "bold");
  doc.text(p.statut, colX + colW - 98, y + 6);
  doc.setTextColor(...DARK);
  doc.setFont("helvetica", "normal");
  doc.text(`${p.pct}%`, colX + colW - 60, y + 6);

  // Barre de progression
  const barX = pageWidth - MARGIN - barW;
  const barY = y + 2.5;
  doc.setFillColor(215, 220, 216);
  doc.roundedRect(barX, barY, barW, 4, 1, 1, "F");
  if (p.pct > 0) {
    doc.setFillColor(...PRIMARY);
    doc.roundedRect(barX, barY, (barW * p.pct) / 100, 4, 1, 1, "F");
  }
  y += 9;
});

y += 4;

// ---- Détail par phase ----
ensureSpace(12);
doc.setFont("helvetica", "bold");
doc.setFontSize(12);
doc.text("3. Détail par phase", MARGIN, y);
y += 6;

phases.forEach((p) => {
  const header = `3.${p.num}  Phase ${p.num} - ${p.nom}  (${p.pct}% - ${p.statut})`;
  ensureSpace(34);
  doc.setFillColor(...PRIMARY);
  doc.rect(MARGIN, y, colW, 9, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  const headerLines = doc.splitTextToSize(header, colW - 8);
  doc.text(headerLines[0], MARGIN + 4, y + 6);
  y += 9;

  const bullet = (label: string, items: string[], color: [number, number, number]) => {
    if (items.length === 0) return;
    ensureSpace(15);
    doc.setTextColor(...color);
    doc.setFontSize(9.5);
    doc.setFont("helvetica", "bold");
    doc.text(label, MARGIN + 3, y);
    y += 5;
    doc.setTextColor(...DARK);
    doc.setFont("helvetica", "normal");
    items.forEach((it) => {
      const lines = doc.splitTextToSize(it, colW - 22);
      ensureSpace(lines.length * 4.6 + 2);
      doc.setFontSize(9);
      doc.text("- " + lines[0], MARGIN + 8, y);
      y += 5;
      for (let i = 1; i < lines.length; i++) {
        doc.text(lines[i], MARGIN + 12, y);
        y += 5;
      }
    });
  };

  bullet("Livré :", p.livree, PRIMARY);
  bullet("Reste à faire :", p.restante, AMBER);

  ensureSpace(8);
  doc.setTextColor(...GRAY);
  doc.setFontSize(8.5);
  doc.setFont("helvetica", "italic");
  const note = doc.splitTextToSize("Note : " + p.note, colW - 8);
  doc.text(note[0], MARGIN + 3, y);
  y += 5;
  for (let i = 1; i < note.length; i++) {
    doc.text(note[i], MARGIN + 3, y);
    y += 5;
  }
  y += 4;

  if (p.num !== phases.length) {
    doc.setDrawColor(215, 220, 216);
    doc.line(MARGIN, y, MARGIN + colW, y);
    y += 5;
  }
});

// ---- Santé du projet ----
ensureSpace(18);
doc.setFont("helvetica", "bold");
doc.setFontSize(12);
doc.text("4. Santé du projet et contrôles effectués", MARGIN, y);
y += 6;

const checks: [string, string][] = [
  ["Tests unitaires et d'intégration", "62/62 validés (Vitest + MongoDB en mémoire)"],
  ["Lint (ESLint)", "Aucune erreur (3 avertissements cosmétiques sur les polices)"],
  ["Build de production", "Validé - 31 pages/routes générées"],
  ["Pages surfacées (navigateur)", "14/14 accessibles en 200"],
  ["Endpoints API", "10/10 en 200, workflow complet testé"],
  ["Règles métier", "Conflits (409), transitions de statut, retard automatique validés"],
  ["Robustesse", "IDs invalides → 400 (au lieu de 500), comptes semés corrigés"],
];

doc.setTextColor(...DARK);
doc.setFontSize(9);
checks.forEach(([k, v]) => {
  ensureSpace(6);
  doc.setFont("helvetica", "bold");
  doc.text(`•  ${k} : `, MARGIN + 3, y);
  const w1 = doc.getTextWidth(`•  ${k} : `);
  doc.setFont("helvetica", "normal");
  const vlines = doc.splitTextToSize(v, colW - w1 - 6);
  doc.text(vlines[0], MARGIN + 3 + w1, y);
  y += 5;
  for (let i = 1; i < vlines.length; i++) {
    doc.text(vlines[i], MARGIN + 3 + w1, y);
    y += 5;
  }
});

y += 4;
doc.setTextColor(...GRAY);
doc.setFontSize(8.5);
doc.setFont("helvetica", "italic");
const pct2to6 = Math.round((phases.slice(1).reduce((a, p) => a + p.pct, 0) / (phases.length - 1)) * 10) / 10;
const pctGlobal = Math.round((phases.reduce((a, p) => a + p.pct, 0) / phases.length) * 10) / 10;
const rapide = doc.splitTextToSize(
  `Moyenne d'avancement des phases 2 à 6 : ${pct2to6}%. Prise en compte de la Phase 1, l'avancement global du projet est d'environ ${pctGlobal}%. Le socle (Phase 1) est totalement opérationnel et stabilisé.`,
  colW
);
rapide.forEach((l: string) => {
  doc.text(l, MARGIN + 3, y);
  y += 5;
});

// ---- Pieds de page ----
const totalPages = doc.getNumberOfPages();
for (let i = 1; i <= totalPages; i++) {
  doc.setPage(i);
  addFooter(i);
}

const outFile = "rapports/Rapport_Avancement_Projet.pdf";
const buffer = Buffer.from(doc.output("arraybuffer"));
fs.mkdirSync("rapports", { recursive: true });
fs.writeFileSync(outFile, buffer);
console.log(`Rapport généré : ${outFile} (${buffer.length} octets, ${totalPages} page(s))`);