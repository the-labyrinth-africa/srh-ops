import { describe, it, expect } from "vitest";
import mongoose from "mongoose";
import { checkAssignmentConflicts } from "@/lib/conflicts";
import { Operation } from "@/models/Operation";
import { Client } from "@/models/Client";
import { Site } from "@/models/Site";

describe("Assignment Conflicts Checking (lib/conflicts.ts)", () => {
  it("should return no conflicts when no operations exist", async () => {
    const conflicts = await checkAssignmentConflicts({
      dateHeurePrevue: new Date("2026-10-01T08:00:00Z"),
      dureeEstimeeMinutes: 120,
      equipeId: new mongoose.Types.ObjectId().toString(),
      vehiculeId: new mongoose.Types.ObjectId().toString(),
    });

    expect(conflicts).toHaveLength(0);
  });

  it("should detect overlapping conflict for same equipe or vehicule", async () => {
    const client = await Client.create({ nom: "Client Test" });
    const site = await Site.create({ clientId: client._id, nom: "Site Test" });

    const equipeId = new mongoose.Types.ObjectId();
    const vehiculeId = new mongoose.Types.ObjectId();

    // Existing operation from 08:00 to 10:00
    const op1 = await Operation.create({
      clientId: client._id,
      siteId: site._id,
      natureIntervention: "Intervention 1",
      dateHeurePrevue: new Date("2026-10-01T08:00:00Z"),
      dureeEstimeeMinutes: 120,
      equipeId,
      vehiculeId,
      statut: "Affectée",
    });

    // Check overlapping window: 09:00 to 11:00 (overlaps with 08:00-10:00)
    const conflicts = await checkAssignmentConflicts({
      dateHeurePrevue: new Date("2026-10-01T09:00:00Z"),
      dureeEstimeeMinutes: 120,
      equipeId: equipeId.toString(),
      vehiculeId: vehiculeId.toString(),
    });

    expect(conflicts.length).toBeGreaterThanOrEqual(2);
    expect(conflicts.some((c) => c.message?.includes("équipe"))).toBe(true);
    expect(conflicts.some((c) => c.message?.includes("véhicule"))).toBe(true);
  });

  it("should ignore cancelled or completed operations when checking conflicts", async () => {
    const client = await Client.create({ nom: "Client Test 2" });
    const site = await Site.create({ clientId: client._id, nom: "Site Test 2" });

    const equipeId = new mongoose.Types.ObjectId();

    // Cancelled operation
    await Operation.create({
      clientId: client._id,
      siteId: site._id,
      natureIntervention: "Intervention Annulée",
      dateHeurePrevue: new Date("2026-10-01T08:00:00Z"),
      dureeEstimeeMinutes: 120,
      equipeId,
      statut: "Annulée",
    });

    const conflicts = await checkAssignmentConflicts({
      dateHeurePrevue: new Date("2026-10-01T08:30:00Z"),
      dureeEstimeeMinutes: 120,
      equipeId: equipeId.toString(),
    });

    expect(conflicts).toHaveLength(0);
  });

  it("should detect a conflict with a long operation (300 min) that started long before, on the same equipe", async () => {
    const client = await Client.create({ nom: "Client Long Equipe" });
    const site = await Site.create({ clientId: client._id, nom: "Site Long Equipe" });
    const equipeId = new mongoose.Types.ObjectId();

    // Existing operation from 08:00 to 13:00
    const existing = await Operation.create({
      clientId: client._id,
      siteId: site._id,
      natureIntervention: "Opération longue",
      dateHeurePrevue: new Date("2026-10-01T08:00:00Z"),
      dureeEstimeeMinutes: 300,
      equipeId,
      statut: "Affectée",
    });

    // New operation at 12:30 (started 4h30 after the existing one)
    const conflicts = await checkAssignmentConflicts({
      dateHeurePrevue: new Date("2026-10-01T12:30:00Z"),
      dureeEstimeeMinutes: 60,
      equipeId: equipeId.toString(),
    });

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].message).toContain("équipe");
    expect(conflicts[0].conflictingOperationId).toBe(String(existing._id));
  });

  it("should detect a conflict with a long operation (300 min) that started long before, on the same vehicule", async () => {
    const client = await Client.create({ nom: "Client Long Vehicule" });
    const site = await Site.create({ clientId: client._id, nom: "Site Long Vehicule" });
    const vehiculeId = new mongoose.Types.ObjectId();

    await Operation.create({
      clientId: client._id,
      siteId: site._id,
      natureIntervention: "Opération longue véhicule",
      dateHeurePrevue: new Date("2026-10-01T08:00:00Z"),
      dureeEstimeeMinutes: 300,
      vehiculeId,
      statut: "Affectée",
    });

    const conflicts = await checkAssignmentConflicts({
      dateHeurePrevue: new Date("2026-10-01T12:30:00Z"),
      dureeEstimeeMinutes: 60,
      vehiculeId: vehiculeId.toString(),
    });

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].message).toContain("véhicule");
  });

  it("should not flag a conflict when the existing operation ends exactly when the new one starts", async () => {
    const client = await Client.create({ nom: "Client Bord" });
    const site = await Site.create({ clientId: client._id, nom: "Site Bord" });
    const equipeId = new mongoose.Types.ObjectId();

    // Existing operation from 08:00 to 13:00
    await Operation.create({
      clientId: client._id,
      siteId: site._id,
      natureIntervention: "Opération se terminant à 13:00",
      dateHeurePrevue: new Date("2026-10-01T08:00:00Z"),
      dureeEstimeeMinutes: 300,
      equipeId,
      statut: "Affectée",
    });

    const conflicts = await checkAssignmentConflicts({
      dateHeurePrevue: new Date("2026-10-01T13:00:00Z"),
      dureeEstimeeMinutes: 60,
      equipeId: equipeId.toString(),
    });

    expect(conflicts).toHaveLength(0);
  });

  it("should ignore completed and reported operations, and operations on other resources", async () => {
    const client = await Client.create({ nom: "Client Statuts" });
    const site = await Site.create({ clientId: client._id, nom: "Site Statuts" });
    const equipeId = new mongoose.Types.ObjectId();

    for (const statut of ["Terminée", "Rapportée"] as const) {
      await Operation.create({
        clientId: client._id,
        siteId: site._id,
        natureIntervention: `Opération ${statut}`,
        dateHeurePrevue: new Date("2026-10-01T08:00:00Z"),
        dureeEstimeeMinutes: 300,
        equipeId,
        statut,
      });
    }
    // Active operation on another equipe, same slot
    await Operation.create({
      clientId: client._id,
      siteId: site._id,
      natureIntervention: "Autre équipe",
      dateHeurePrevue: new Date("2026-10-01T08:00:00Z"),
      dureeEstimeeMinutes: 300,
      equipeId: new mongoose.Types.ObjectId(),
      statut: "Affectée",
    });

    const conflicts = await checkAssignmentConflicts({
      dateHeurePrevue: new Date("2026-10-01T12:30:00Z"),
      dureeEstimeeMinutes: 60,
      equipeId: equipeId.toString(),
    });

    expect(conflicts).toHaveLength(0);
  });

  it("should return no conflicts when neither equipe nor vehicule is provided", async () => {
    const conflicts = await checkAssignmentConflicts({
      dateHeurePrevue: new Date("2026-10-01T12:30:00Z"),
      dureeEstimeeMinutes: 60,
    });

    expect(conflicts).toHaveLength(0);
  });

  it("should exclude current operation id during update checks", async () => {
    const client = await Client.create({ nom: "Client Test 3" });
    const site = await Site.create({ clientId: client._id, nom: "Site Test 3" });

    const equipeId = new mongoose.Types.ObjectId();

    const op = await Operation.create({
      clientId: client._id,
      siteId: site._id,
      natureIntervention: "Opération à modifier",
      dateHeurePrevue: new Date("2026-10-01T08:00:00Z"),
      dureeEstimeeMinutes: 120,
      equipeId,
      statut: "Affectée",
    });

    // Check conflict excluding op._id
    const conflicts = await checkAssignmentConflicts({
      dateHeurePrevue: new Date("2026-10-01T08:00:00Z"),
      dureeEstimeeMinutes: 120,
      equipeId: equipeId.toString(),
      excludeOperationId: String(op._id),
    });

    expect(conflicts).toHaveLength(0);
  });
});
