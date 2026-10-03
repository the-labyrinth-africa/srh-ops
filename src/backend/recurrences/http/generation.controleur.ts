import { NextRequest, NextResponse } from "next/server";
import { requireInternalAuth } from "@/backend/comptes";
import { genererOccurrences } from "../composition";
import { horizonEnJours } from "../domain/occurrences";

export async function POST(req: NextRequest) {
  const auth = await requireInternalAuth(true);
  if (auth.error) return auth.error;

  // Corps absent ou illisible, horizon absent ou non numérique : horizon par défaut.
  const body = await req.json().catch(() => ({}));
  const horizonDays = horizonEnJours(body.horizonDays);

  const { generatedCount, conflits } = await genererOccurrences(auth.user.id, horizonDays);

  return NextResponse.json({
    message: `${generatedCount} opération(s) récurrente(s) générée(s) avec succès.`,
    generatedCount,
    horizonDays,
    conflits,
  });
}
