import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    testTimeout: 30000,
    hookTimeout: 60000,
    // Chaque fichier de test démarre son propre MongoMemoryServer (tests/setup.ts) ; au-delà de
    // ~3 workers concurrents, ces instances se disputent les ports et les démarrages échouent ou
    // expirent de façon intermittente (observé en pratique : suite complète instable en parallélisme
    // par défaut, fiable à `--maxWorkers=2`). Fixé ici pour que `vitest run`/`npm test` soit fiable
    // sans flag manuel ; ne pas relever sans re-vérifier la stabilité sur une machine de développement.
    maxWorkers: 2,
  },
});
