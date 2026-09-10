import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import * as nextAuth from "next-auth";

vi.mock("next-auth", () => ({
  getServerSession: vi.fn(),
}));

import { GET as getDashboardStats } from "@/app/api/dashboard/stats/route";
import { GET as getPlanningEvents } from "@/app/api/operations/planning/route";
import { Client } from "@/models/Client";
import { Site } from "@/models/Site";
import { Operation } from "@/models/Operation";

describe("Dashboard Stats & Planning API Integration Tests", () => {
  beforeEach(async () => {
    vi.resetAllMocks();
    vi.mocked(nextAuth.getServerSession).mockResolvedValue({
      user: {
        id: "507f1f77bcf86cd799439011",
        nom: "Direction Ops",
        email: "dir@srh.ci",
        role: "admin",
      },
    } as any);
  });

  it("should calculate correct KPI counters and return today ops", async () => {
    const client = await Client.create({ nom: "Client Dash" });
    const site = await Site.create({ clientId: client._id, nom: "Site Dash" });

    // Future operation (Planifiée -> counts in prevues)
    const futureDate = new Date(Date.now() + 86400 * 1000 * 5);
    await Operation.create({
      clientId: client._id,
      siteId: site._id,
      natureIntervention: "Futur Collecte",
      dateHeurePrevue: futureDate,
      statut: "Planifiée",
    });

    // Completed operation (Terminée -> counts in terminees)
    await Operation.create({
      clientId: client._id,
      siteId: site._id,
      natureIntervention: "Collecte Terminée",
      dateHeurePrevue: new Date(Date.now() - 86400 * 1000 * 2),
      statut: "Terminée",
    });

    // Past date operation not completed (statut Planifiée + past date -> effective status Retardée)
    await Operation.create({
      clientId: client._id,
      siteId: site._id,
      natureIntervention: "Collecte Retardée Dynamic",
      dateHeurePrevue: new Date(Date.now() - 3600 * 1000 * 3),
      statut: "Planifiée",
    });

    const res = await getDashboardStats();
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.stats).toBeDefined();
    expect(body.stats.prevues).toBe(1);
    expect(body.stats.terminees).toBe(1);
    expect(body.stats.retardees).toBe(1);
    expect(body.stats.totalClients).toBe(1);
    expect(body.stats.totalSites).toBe(1);
  });

  it("should return calendar formatted events for FullCalendar", async () => {
    const client = await Client.create({ nom: "Client Cal" });
    const site = await Site.create({ clientId: client._id, nom: "Site Cal" });

    const startDate = new Date("2026-10-15T09:00:00Z");

    await Operation.create({
      clientId: client._id,
      siteId: site._id,
      natureIntervention: "Planning Event Test",
      dateHeurePrevue: startDate,
      dureeEstimeeMinutes: 120,
      statut: "Affectée",
    });

    const req = new NextRequest(
      "http://localhost:3000/api/operations/planning?dateDebut=2026-10-01&dateFin=2026-10-31"
    );
    const res = await getPlanningEvents(req);
    expect(res.status).toBe(200);

    const events = await res.json();
    expect(Array.isArray(events)).toBe(true);
    expect(events.length).toBe(1);

    const ev = events[0];
    expect(ev.title).toContain("Client Cal");
    expect(ev.title).toContain("Planning Event Test");
    expect(ev.start).toBeDefined();
    expect(ev.end).toBeDefined();
    expect(ev.backgroundColor).toBeDefined();
    expect(ev.extendedProps).toBeDefined();
  });
});
