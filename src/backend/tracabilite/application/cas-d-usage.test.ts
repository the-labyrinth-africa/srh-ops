import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Acteur } from "@/shared/acces/acteur";
import { IdentifiantSuiviDuplique, TraceabiliteIntrouvable } from "../domain/erreurs";
import type { Traceabilite } from "../domain/tracabilite";
import { creerCasDUsageTracabilite } from "./cas-d-usage";

const ACTEUR: Acteur = { id: "507f1f77bcf86cd799439011", role: "dispatcher" };
const OPERATION_ID = "507f1f77bcf86cd799439012";
const AUTRE_OPERATION_ID = "507f1f77bcf86cd799439013";
const SAISIE = {
  identifiantSuivi: " bsd-2026-001 ",
  typeDechet: "Huiles usagées",
  volume: 250,
  unite: "Litres" as const,
  traitement: "Valorisation",
};

const TRACE: Traceabilite = {
  id: "507f1f77bcf86cd799439014",
  operationId: OPERATION_ID,
  identifiantSuivi: "BSD-2026-001",
  typeDechet: "Huiles usagées",
  volume: 250,
  unite: "Litres",
  traitement: "Valorisation",
  creePar: ACTEUR.id,
  modifiePar: ACTEUR.id,
  createdAt: new Date("2026-01-01T10:00:00.000Z"),
  updatedAt: new Date("2026-01-01T10:00:00.000Z"),
};

describe("cas d'usage de traçabilité", () => {
  const repository = {
    lister: vi.fn(),
    trouverParId: vi.fn(),
    creer: vi.fn(),
    modifier: vi.fn(),
  };
  const verifierAccesOperation = vi.fn();
  const cas = creerCasDUsageTracabilite({
    tracabilites: repository,
    verifierAccesOperation,
  });

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("vérifie l'accès à l'opération avant de lister ses lignes", async () => {
    repository.lister.mockResolvedValue([TRACE]);

    await expect(cas.listerParOperation(ACTEUR, OPERATION_ID)).resolves.toEqual([TRACE]);
    expect(verifierAccesOperation).toHaveBeenCalledWith(ACTEUR, OPERATION_ID);
    expect(repository.lister).toHaveBeenCalledWith(OPERATION_ID);
  });

  it("normalise l'identifiant et signe la saisie avec l'acteur", async () => {
    repository.creer.mockResolvedValue({ ...TRACE, identifiantSuivi: "BSD-2026-001" });

    await cas.creer(ACTEUR, OPERATION_ID, SAISIE);

    expect(repository.creer).toHaveBeenCalledWith(
      OPERATION_ID,
      { ...SAISIE, identifiantSuivi: "BSD-2026-001" },
      ACTEUR.id
    );
  });

  it("traduit une collision d'identifiant en erreur métier", async () => {
    repository.creer.mockRejectedValue({ code: 11000 });

    await expect(cas.creer(ACTEUR, OPERATION_ID, SAISIE)).rejects.toBeInstanceOf(
      IdentifiantSuiviDuplique
    );
  });

  it("refuse de modifier une ligne liée à une autre opération", async () => {
    repository.trouverParId.mockResolvedValue({ ...TRACE, operationId: AUTRE_OPERATION_ID });

    await expect(
      cas.modifier(ACTEUR, OPERATION_ID, TRACE.id, SAISIE)
    ).rejects.toBeInstanceOf(TraceabiliteIntrouvable);
    expect(repository.modifier).not.toHaveBeenCalled();
  });

  it("refuse de modifier une ligne qui n'existe pas", async () => {
    repository.trouverParId.mockResolvedValue(null);

    await expect(cas.modifier(ACTEUR, OPERATION_ID, TRACE.id, SAISIE)).rejects.toBeInstanceOf(
      TraceabiliteIntrouvable
    );
    expect(repository.modifier).not.toHaveBeenCalled();
  });
});
