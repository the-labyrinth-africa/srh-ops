import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "@/lib/db";
import { requireInternalAuth } from "@/lib/api-auth";
import { Recurrence, IRecurrence } from "@/models/Recurrence";
import { Operation } from "@/models/Operation";
import type { OperationStatus } from "@/types";

export async function POST(req: NextRequest) {
  const auth = await requireInternalAuth(true);
  if (auth.error) return auth.error;

  const body = await req.json().catch(() => ({}));
  const horizonDays = Math.min(90, Math.max(1, body.horizonDays || 30));

  await connectDB();
  const activeRecurrences = (await Recurrence.find({ active: true }).lean()) as unknown as IRecurrence[];

  const now = new Date();
  const endDate = new Date();
  endDate.setDate(endDate.getDate() + horizonDays);

  let generatedCount = 0;
  const createdOperations = [];

  for (const rec of activeRecurrences) {
    const targetDates: Date[] = [];
    const currentDate = new Date(now);
    currentDate.setHours(0, 0, 0, 0);

    const [hours, minutes] = (rec.heurePrevue || "08:00").split(":").map(Number);

    while (currentDate <= endDate) {
      let isMatch = false;

      if (rec.frequence === "hebdomadaire") {
        if (rec.jourSemaine !== undefined && currentDate.getDay() === rec.jourSemaine) {
          isMatch = true;
        }
      } else if (rec.frequence === "mensuelle") {
        if (rec.jourMois !== undefined && currentDate.getDate() === rec.jourMois) {
          isMatch = true;
        }
      } else if (rec.frequence === "personnalisee") {
        const interval = rec.intervalleJours || 7;
        const startDate = rec.derniereGeneration || rec.createdAt;
        const diffTime = Math.abs(currentDate.getTime() - new Date(startDate).getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        if (diffDays > 0 && diffDays % interval === 0) {
          isMatch = true;
        }
      }

      if (isMatch) {
        const scheduledTime = new Date(currentDate);
        scheduledTime.setHours(hours, minutes, 0, 0);

        if (scheduledTime >= now) {
          targetDates.push(scheduledTime);
        }
      }

      currentDate.setDate(currentDate.getDate() + 1);
    }

    for (const dateHeurePrevue of targetDates) {
      // Éviter les doublons sur le même site à la même date/heure
      const existing = await Operation.findOne({
        clientId: rec.clientId,
        siteId: rec.siteId,
        dateHeurePrevue,
      });

      if (!existing) {
        const statut: OperationStatus =
          rec.equipeId && rec.vehiculeId ? "Affectée" : "Planifiée";

        const op = await Operation.create({
          clientId: rec.clientId,
          siteId: rec.siteId,
          natureIntervention: rec.natureIntervention,
          dateHeurePrevue,
          dureeEstimeeMinutes: rec.dureeEstimeeMinutes || 120,
          equipeId: rec.equipeId,
          vehiculeId: rec.vehiculeId,
          equipementIds: rec.equipementIds || [],
          informationsParticulieres: rec.informationsParticulieres || "",
          statut,
          historiqueStatuts: [
            {
              statut,
              date: new Date(),
              parUtilisateur: new mongoose.Types.ObjectId(auth.user.id),
            },
          ],
        });

        createdOperations.push(op._id);
        generatedCount++;
      }
    }

    await Recurrence.findByIdAndUpdate(rec._id, {
      derniereGeneration: new Date(),
    });
  }

  return NextResponse.json({
    message: `${generatedCount} opération(s) récurrente(s) générée(s) avec succès.`,
    generatedCount,
    horizonDays,
  });
}
