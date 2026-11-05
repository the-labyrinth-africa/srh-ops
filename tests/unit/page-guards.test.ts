import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.join(process.cwd(), "src", "app", "(dashboard)");

// La route legacy des récurrences redirige vers les prévisions, qui appliquent leurs propres gardes.
const EXEMPT = new Set(["recurrences/page.tsx"]);

describe("pages du tableau de bord", () => {
  const pages = (readdirSync(ROOT, { recursive: true }) as string[])
    .map((p) => p.split(path.sep).join("/"))
    .filter((p) => /(^|\/)page\.(tsx|ts|jsx)$/.test(p));

  it("en trouve plus d'une dizaine (le test ne doit pas passer à vide)", () => {
    expect(pages.length).toBeGreaterThanOrEqual(13);
  });

  it.each(pages.filter((p) => !EXEMPT.has(p)))("%s appelle requirePageAccess", (page) => {
    const source = readFileSync(path.join(ROOT, page), "utf8");
    expect(source).toMatch(/await requirePageAccess\(/);
  });

  it("redirige la page historique des récurrences vers les prévisions", () => {
    const source = readFileSync(path.join(ROOT, "recurrences/page.tsx"), "utf8");
    expect(source).toMatch(/redirect\(["']\/previsions["']\)/);
  });
});
