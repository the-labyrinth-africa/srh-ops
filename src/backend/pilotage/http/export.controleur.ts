import { NextRequest, NextResponse } from "next/server";
import { requireInternalAuth } from "@/backend/comptes";
import { exporterOperations, MAX_OPERATIONS_EXPORT } from "../composition";
import { exporterOperationsCsv } from "../domain/export-csv";

const DATE_ISO = /^\d{4}-\d{2}-\d{2}$/;

function parseDate(value: string | null, endOfDay: boolean): Date | null {
  if (!value || !DATE_ISO.test(value)) return null;
  const date = new Date(`${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? null : date;
}

export async function GET(request: NextRequest) {
  const auth = await requireInternalAuth();
  if (auth.error) return auth.error;

  const debutRaw = request.nextUrl.searchParams.get("dateDebut");
  const finRaw = request.nextUrl.searchParams.get("dateFin");
  const debut = parseDate(debutRaw, false);
  const fin = parseDate(finRaw, true);
  if (!debut || !fin || debut > fin) {
    return NextResponse.json({ error: "Sélectionnez une période valide au format YYYY-MM-DD." }, { status: 400 });
  }
  if (fin.getTime() - debut.getTime() > 366 * 24 * 60 * 60 * 1000) {
    return NextResponse.json({ error: "La période d’export ne peut pas dépasser 366 jours." }, { status: 400 });
  }

  const operations = await exporterOperations(debut, fin);
  if (operations.length > MAX_OPERATIONS_EXPORT) {
    return NextResponse.json(
      { error: `Plus de ${MAX_OPERATIONS_EXPORT} opérations correspondent. Réduisez la période.` },
      { status: 413 }
    );
  }

  const csv = exporterOperationsCsv(operations, new Date());
  const filename = `operations-${debutRaw}-${finRaw}.csv`;
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
