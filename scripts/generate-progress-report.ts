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
      "Workflow de statuts avec historique des transitions, dont Demande (Phase 4)",
      "Vue calendrier (FullCalendar) en jour / semaine / mois",
      "Tableau de bord KPI (prévues, en cours, terminées, retardées, annulées)",
      "Authentification multi-rôles et permissions : matrice d'accès unique par rôle appliquée aux pages et à l'API, rattachement client/équipe des comptes, chauffeur limité à son équipe",
      "Collectes récurrentes : modèle, moteur de génération sans doublon, interface",
      "Rapport d'intervention PDF, signature et photos (préparation Phase 2)",
    ],
    restante: ["Aucun élément bloquant - module opérationnel"],
    note: "Sprints S0 à S5 + S1.5 validés. Suite de tests automatisés : 74/74 verts au 19 septembre 2026.",
  },
  {
    num: 2,
    nom: "Console terrain & rapport digital",
    statut: "Terminée",
    pct: 100,
    livree: [
      "Console terrain web (/terrain) avec rôle Chauffeur",
      "Interface responsive utilisable sur téléphone et tablette",
      "Capture photo sur intervention (max 10, réduites côté navigateur, 2 Mo par photo et 8 Mo par opération, stockées en base 64)",
      "Signature client (écran tactile)",
      "Relevé des quantités collectées et unités",
      "Génération PDF du rapport d'intervention (détails, quantités, historique, signature, photos)",
      "Application installable avec manifest et icônes ; toutes les pages et actions nécessitent une connexion Internet",
      "Rapport PDF envoyé par e-mail au client avec transition automatique vers le statut Rapportée",
    ],
    restante: [],
    note: "Phase livrée. L'application fonctionne en ligne uniquement ; les erreurs réseau sont signalées sans stockage local ni synchronisation différée.",
  },
  {
    num: 3,
    nom: "Traçabilité des déchets",
    statut: "Terminée",
    pct: 100,
    livree: [
      "Traçabilité multi-flux par opération avec identifiant de suivi unique, quantité, unité et traitement",
      "Saisie et correction par le terrain et le dispatch ; consultation synthétique pour la direction",
      "Permissions contrôlées par rôle et périmètre d'équipe du chauffeur",
    ],
    restante: [],
    note: "Fonctionnalité disponible en ligne ; la saisie et la consultation nécessitent une connexion Internet.",
  },
  {
    num: 4,
    nom: "Espace client & demandes en ligne",
    statut: "Terminée",
    pct: 100,
    livree: [
      "Formulaire public sans compte, validation serveur, corps limité et débit limité par IP et e-mail",
      "Demandes conservées séparément jusqu'à vérification ; qualification interne Admin/Dispatcher, refus audité et conversion idempotente en opération Demande",
      "Portail client avec tableau de bord, liste filtrable/paginée et demande authentifiée liée à un site de son client",
      "Isolation client imposée côté serveur et réponses excluant les données opérationnelles internes",
      "Matrice de rôles, navigation, statut Demande, tests d'intégration et documentation",
    ],
    restante: [],
    note: "Parcours public et client disponibles en ligne. Les nouvelles demandes alertent le dispatch ; les demandes qualifiées et changements de statut notifient les comptes client rattachés.",
  },
  {
    num: 5,
    nom: "Notifications & dashboard avancé",
    statut: "Terminée",
    pct: 100,
    livree: [
      "Canal e-mail livré : transport SMTP (mot de passe hors Git), invitation par e-mail à la création d'un compte, e-mail de test administrateur",
      "Réinitialisation du mot de passe par jeton à usage unique (30 min, réponse identique, débit limité), action administrateur « Envoyer un lien de réinitialisation », liens révoqués à la régénération du mot de passe ou au changement d'e-mail",
      "Changement de mot de passe opérationnel et imposé à la première connexion (mot de passe temporaire) ; régénération par un administrateur depuis « Utilisateurs & Rôles »",
      "File persistante et idempotente de notifications métier, avec huit tentatives et délai exponentiel",
      "Alertes de nouvelle demande, qualification, changements de statut, rappels à 24 heures et retards quotidiens via Cron authentifié",
      "Tendance mensuelle par statut effectif et export CSV avec périmètre interne, limites de volume et protection contre l'injection de formules",
    ],
    restante: [],
    note: "La livraison effective des e-mails requiert SMTP configuré et CRON_SECRET défini sur l'environnement de déploiement.",
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
  "La plateforme SRH Ops digitalise les opérations de collecte de SRH. La Phase 1 (Module 1 - Planification des Collectes) est terminée à 100% et sert de socle aux phases suivantes. Ce rapport présente l'état d'avancement réel de chaque phase, les livrables terminés et le reste à faire, sur la base des contrôles rejoués le 19 septembre 2026 (tests, lint, TypeScript) et d'une relecture du code. Le build de production et les vérifications navigateur/API n'ont pas été rejoués depuis le passage à Next 16.",
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
  ["Date des contrôles", "19 septembre 2026"],
  ["Tests unitaires et d'intégration", "74/74 validés (Vitest + MongoDB en mémoire)"],
  ["Lint (ESLint)", "0 erreur, 9 avertissements"],
  ["TypeScript (tsc --noEmit)", "Propre"],
  ["Build de production", "Non rejoué depuis le passage à Next 16"],
  ["Pages navigateur et endpoints API", "Non rejoués (vérification de fumée à refaire)"],
  ["Règles métier", "Conflits (409, y compris opérations longues), transitions de statut et retard automatique couverts par les tests"],
  ["Sécurité du build", "Seed au build désactivé sauf SEED_ON_BUILD=true"],
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
  `Moyenne d'avancement des phases 2 à 6 : ${pct2to6}%. Prise en compte de la Phase 1, l'avancement global du projet est d'environ ${pctGlobal}%. Le socle (Phase 1) est opérationnel ; la Phase 2 est partiellement livrée et comporte des défauts connus (voir section 3).`,
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