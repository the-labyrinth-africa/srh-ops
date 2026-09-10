import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "@/lib/db";
import { requireAuth } from "@/lib/api-auth";
import { checkAssignmentConflicts } from "@/lib/conflicts";
import { Operation } from "@/models/Operation";
import { operationSchema } from "@/lib/validators/operation";
import type { OperationStatus } from "@/types";

export async function GET(req: NextRequest) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  const sp = req.nextUrl.searchParams;
  const filter: Record<string, unknown> = {};

  if (sp.get("clientId")) filter.clientId = sp.get("clientId");
  if (sp.get("siteId")) filter.siteId = sp.get("siteId");
  if (sp.get("equipeId")) filter.equipeId = sp.get("equipeId");
  if (sp.get("vehiculeId")) filter.vehiculeId = sp.get("vehiculeId");
  if (sp.get("statut")) filter.statut = sp.get("statut");

  const dateDebut = sp.get("dateDebut");
  const dateFin = sp.get("dateFin");
  if (dateDebut || dateFin) {
    filter.dateHeurePrevue = {};
    if (dateDebut) (filter.dateHeurePrevue as Record<string, Date>).$gte = new Date(dateDebut);
    if (dateFin) (filter.dateHeurePrevue as Record<string, Date>).$lte = new Date(dateFin);
  }

  const page = Math.max(1, parseInt(sp.get("page") || "1", 10));
  const limit = Math.min(100, parseInt(sp.get("limit") || "20", 10));
  const skip = (page - 1) * limit;

  await connectDB();
  const [items, total] = await Promise.all([
    Operation.find(filter)
      .populate("clientId", "nom")
      .populate("siteId", "nom adresse")
      .populate("equipeId", "nom")
      .populate("vehiculeId", "identification")
      .sort({ dateHeurePrevue: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Operation.countDocuments(filter),
  ]);

  return NextResponse.json({ items, total, page, limit });
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth(true);
  if (auth.error) return auth.error;

  const body = await req.json();
  const parsed = operationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const data = parsed.data;
  const dateHeurePrevue = new Date(data.dateHeurePrevue);

  const conflicts = await checkAssignmentConflicts({
    dateHeurePrevue,
    dureeEstimeeMinutes: data.dureeEstimeeMinutes,
    equipeId: data.equipeId,
    vehiculeId: data.vehiculeId,
  });

  if (conflicts.some((c) => c.hasConflict)) {
    return NextResponse.json(
      { error: "Conflit d'affectation", conflicts },
      { status: 409 }
    );
  }

  const statut: OperationStatus =
    data.equipeId && data.vehiculeId ? "Affectée" : "Planifiée";

  await connectDB();
  const operation = await Operation.create({
    ...data,
    dateHeurePrevue,
    statut,
    historiqueStatuts: [
      {
        statut,
        date: new Date(),
        parUtilisateur: new mongoose.Types.ObjectId(auth.user.id),
      },
    ],
  });

  const populated = await Operation.findById(operation._id)
    .populate("clientId", "nom")
    .populate("siteId", "nom")
    .populate("equipeId", "nom")
    .populate("vehiculeId", "identification")
    .lean();

  return NextResponse.json(populated, { status: 201 });
}
