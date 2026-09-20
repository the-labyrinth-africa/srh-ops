import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "@/lib/db";
import { requireInternalAuth } from "@/lib/api-auth";
import { checkAssignmentConflicts } from "@/lib/conflicts";
import { Recurrence, IRecurrence } from "@/models/Recurrence";
import { Operation } from "@/models/Operation";
import type { OperationStatus } from "@/shared/operations/statuts";

/** Borne de sécurité sur le parcours des occurrences d'une récurrence. */
const MAX_OCCURRENCES_SCAN = 1000;

interface ConflitGeneration {
  recurrenceId: string;
  date: string;
  message: string;
}

/**
 * Occurrences d'une récurrence « personnalisée ».
 *
 * L'ancre est la dernière occurrence réellement générée (`derniereGeneration`),
 * à défaut la création de la récurrence. Auparavant `derniereGeneration` était
 * écrasée par « maintenant » à chaque passage : l'intervalle repartait de la
 * date d'exécution, ce qui faisait glisser les dates et pouvait dupliquer des
 * occurrences d'un jour sur l'autre.
 */
function customOccurrences(
  rec: IRecurrence,
  now: Date,
  endDate: Date,
  hours: number,
  minutes: number
): Date[] {
  const interval = rec.intervalleJours || 7;
  const anchor = new Date(rec.derniereGeneration || rec.createdAt);
  const occurrences: Date[] = [];

  // Une récurrence dormante (ancre très ancienne) ne doit pas épuiser la borne
  // de sécurité dans le passé : on démarre au dernier rang possiblement encore
  // dû. Le `- 1` couvre l'heure prévue postérieure à l'heure de l'ancre (une
  // occurrence du rang `ceil - 1` peut encore être à venir le jour même).
  const firstK = Math.max(
    1,
    Math.ceil((now.getTime() - anchor.getTime()) / (interval * 86_400_000)) - 1
  );

  for (let k = firstK; k < firstK + MAX_OCCURRENCES_SCAN; k++) {
    const scheduled = new Date(anchor);
    scheduled.setDate(scheduled.getDate() + interval * k);
    scheduled.setHours(hours, minutes, 0, 0);

    if (scheduled > endDate) break;
    if (scheduled >= now) occurrences.push(scheduled);
  }

  return occurrences;
}

/** Occurrences des récurrences hebdomadaires / mensuelles, par balayage des jours. */
function calendarOccurrences(
  rec: IRecurrence,
  now: Date,
  endDate: Date,
  hours: number,
  minutes: number
): Date[] {
  const occurrences: Date[] = [];
  const currentDate = new Date(now);
  currentDate.setHours(0, 0, 0, 0);

  while (currentDate <= endDate) {
    let isMatch = false;

    if (rec.frequence === "hebdomadaire") {
      isMatch = rec.jourSemaine !== undefined && currentDate.getDay() === rec.jourSemaine;
    } else if (rec.frequence === "mensuelle") {
      isMatch = rec.jourMois !== undefined && currentDate.getDate() === rec.jourMois;
    }

    if (isMatch) {
      const scheduledTime = new Date(currentDate);
      scheduledTime.setHours(hours, minutes, 0, 0);
      if (scheduledTime >= now) occurrences.push(scheduledTime);
    }

    currentDate.setDate(currentDate.getDate() + 1);
  }

  return occurrences;
}

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
  const conflits: ConflitGeneration[] = [];

  for (const rec of activeRecurrences) {
    const [hours, minutes] = (rec.heurePrevue || "08:00").split(":").map(Number);

    const targetDates =
      rec.frequence === "personnalisee"
        ? customOccurrences(rec, now, endDate, hours, minutes)
        : calendarOccurrences(rec, now, endDate, hours, minutes);

    let lastGeneratedDate: Date | null = null;

    for (const dateHeurePrevue of targetDates) {
      // Éviter les doublons sur le même site à la même date/heure
      const existing = await Operation.findOne({
        clientId: rec.clientId,
        siteId: rec.siteId,
        dateHeurePrevue,
      });

      if (existing) continue;

      // I7 : la génération respecte la détection de conflits. En cas de
      // chevauchement, l'occurrence est créée sans ressource, à replanifier.
      let equipeId = rec.equipeId;
      let vehiculeId = rec.vehiculeId;

      const detected = await checkAssignmentConflicts({
        dateHeurePrevue,
        dureeEstimeeMinutes: rec.dureeEstimeeMinutes || 120,
        equipeId: equipeId ? String(equipeId) : undefined,
        vehiculeId: vehiculeId ? String(vehiculeId) : undefined,
      });

      const blocking = detected.filter((c) => c.hasConflict);
      if (blocking.length > 0) {
        conflits.push({
          recurrenceId: String(rec._id),
          date: dateHeurePrevue.toISOString(),
          message: blocking.map((c) => c.message).filter(Boolean).join(" ; "),
        });
        equipeId = undefined;
        vehiculeId = undefined;
      }

      const statut: OperationStatus = equipeId && vehiculeId ? "Affectée" : "Planifiée";

      const op = await Operation.create({
        clientId: rec.clientId,
        siteId: rec.siteId,
        natureIntervention: rec.natureIntervention,
        dateHeurePrevue,
        dureeEstimeeMinutes: rec.dureeEstimeeMinutes || 120,
        equipeId,
        vehiculeId,
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
      if (!lastGeneratedDate || dateHeurePrevue > lastGeneratedDate) {
        lastGeneratedDate = dateHeurePrevue;
      }
    }

    // I6 : l'ancre n'avance que si une occurrence a réellement été créée, et
    // elle porte la date de l'occurrence, pas la date d'exécution.
    if (lastGeneratedDate) {
      await Recurrence.findByIdAndUpdate(rec._id, {
        derniereGeneration: lastGeneratedDate,
      });
    }
  }

  return NextResponse.json({
    message: `${generatedCount} opération(s) récurrente(s) générée(s) avec succès.`,
    generatedCount,
    horizonDays,
    conflits,
  });
}
