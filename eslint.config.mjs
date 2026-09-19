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
