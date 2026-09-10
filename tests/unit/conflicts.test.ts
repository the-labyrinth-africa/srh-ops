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
