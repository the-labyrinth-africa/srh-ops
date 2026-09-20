import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // Baseline (lot 0) : le pattern "charger au montage" via useEffect + setState
    // est utilisé partout dans les composants clients ; refactor hors périmètre.
    rules: {
      "react-hooks/set-state-in-effect": "off",
    },
  },
  {
    // Baseline (lot 0) : les tests d'intégration utilisent `any` pour les mocks.
    files: ["tests/**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
  {
    // Architecture : le frontend ne dépend jamais du backend (règle R4).
    files: ["src/frontend/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            { group: ["@/backend/*", "@/backend/**"], message: "Le frontend n'importe jamais le backend (R4) : passer par src/shared." },
          ],
        },
      ],
    },
  },
  {
    // Architecture : domain et application n'importent aucune technologie (règles R1/R2).
    files: ["src/backend/*/domain/**/*.ts", "src/backend/*/application/**/*.ts"],
    ignores: ["**/*.test.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: ["mongoose", "next", "next-auth", "nodemailer", "bcryptjs", "jspdf", "exceljs"].map((name) => ({
            name,
            message: "Le domaine et les cas d'usage ne dépendent d'aucune technologie : passer par un port.",
          })),
          patterns: [
            { group: ["next/*", "next-auth/*", "jspdf-*"], message: "Idem : passer par un port." },
          ],
        },
      ],
    },
  },
  globalIgnores([
    ".next/**",
    "node_modules/**",
    "out/**",
    "build/**",
    "coverage/**",
    "sketch/**",
    ".superpowers/**",
    ".agents/**",
    ".claude/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
