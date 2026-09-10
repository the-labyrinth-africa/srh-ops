"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useCallback, useEffect, useState } from "react";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { getNextStatuses } from "@/lib/status-transitions";
import { canWrite } from "@/lib/permissions";
import type { OperationStatus } from "@/types";

interface OperationDetail {
  _id: string;
  natureIntervention: string;
  dateHeurePrevue: string;
  dureeEstimeeMinutes: number;
  statut: OperationStatus;
  informationsParticulieres: string;
  clientId?: { nom: string; contact?: { email: string; telephone: string } };
  siteId?: { nom: string; adresse: string; typeDechets?: string[] };
  equipeId?: { nom: string; membres?: string[] };
  vehiculeId?: { identification: string; type: string };
  equipementIds?: { nom: string; type: string }[];
  historiqueStatuts?: {
    statut: OperationStatus;
    date: string;
    ancienStatut?: OperationStatus;
    parUtilisateur?: { nom: string };
  }[];
}

export function OperationDetailClient({ id }: { id: string }) {
  const router = useRouter();
  const { data: session } = useSession();
  const canEdit = canWrite(session?.user?.role);
  const [op, setOp] = useState<OperationDetail | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const res = await fetch(`/api/operations/${id}`);
    if (!res.ok) {
      router.push("/operations");
      return;
    }
    setOp(await res.json());
    setLoading(false);
  }, [id, router]);

  useEffect(() => {
    load();
  }, [load]);

  async function changeStatus(statut: OperationStatus) {
    const res = await fetch(`/api/operations/${id}/statut`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ statut }),
    });
    if (res.ok) load();
  }

  if (loading || !op) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center font-body-md text-body-md text-on-surface-variant">
        Chargement...
      </div>
    );
  }

  const nextStatuses = getNextStatuses(op.statut);

  return (
    <div className="flex flex-col gap-gutter-md px-margin-mobile py-gutter-md lg:px-margin-desktop">
      <div>
        <nav className="mb-2 flex items-center gap-2 font-label-sm text-label-sm uppercase tracking-wider text-outline">
          <Link href="/operations" className="hover:text-primary">Opérations</Link>
          <span className="material-symbols-outlined text-[14px]">chevron_right</span>
          <span className="font-bold text-on-surface">#{op._id.slice(-6).toUpperCase()}</span>
        </nav>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-headline-lg-mobile text-headline-lg-mobile text-on-surface lg:font-headline-lg lg:text-headline-lg">
              {op.natureIntervention}
            </h1>
            <StatusBadge status={op.statut} />
          </div>
        </div>
      </div>

      <section className="rounded-xl bg-surface-container-lowest p-gutter-md shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <span className="material-symbols-outlined text-[20px] text-primary">linear_scale</span>
          <span className="font-label-md text-label-md font-bold uppercase tracking-wider text-on-surface">
            Avancement du protocole
          </span>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          {(op.historiqueStatuts ?? []).map((h, i) => (
            <div key={i} className="flex items-start gap-3 md:flex-col md:items-center md:text-center">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-status-completed text-on-primary">
                <span className="material-symbols-outlined text-[20px]">check</span>
              </div>
              <div>
                <span className="font-label-md text-label-md font-bold text-on-surface">{h.statut}</span>
                <p className="font-label-sm text-label-sm text-on-surface-variant">
                  {new Date(h.date).toLocaleString("fr-FR")}
                </p>
              </div>
            </div>
          ))}
        </div>
        {canEdit && nextStatuses.length > 0 && (
          <div className="mt-6 flex flex-wrap gap-2 border-t border-outline-variant/30 pt-4">
            <span className="w-full font-label-md text-label-md text-on-surface-variant">Changer le statut :</span>
            {nextStatuses.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => changeStatus(s)}
                className="rounded-lg bg-surface-container px-4 py-2 font-label-md text-label-md text-on-surface hover:bg-primary hover:text-on-primary"
              >
                → {s}
              </button>
            ))}
          </div>
        )}
      </section>

      <div className="grid grid-cols-1 gap-gutter-md lg:grid-cols-2">
        <section className="rounded-xl bg-surface-container-lowest p-gutter-md shadow-sm">
          <h2 className="mb-4 font-headline-sm text-headline-sm text-on-surface">Client & Site</h2>
          <dl className="space-y-3 font-body-md text-body-md">
            <div><dt className="font-label-md text-label-md text-on-surface-variant">Client</dt><dd>{op.clientId?.nom}</dd></div>
            <div><dt className="font-label-md text-label-md text-on-surface-variant">Site</dt><dd>{op.siteId?.nom} — {op.siteId?.adresse}</dd></div>
            <div><dt className="font-label-md text-label-md text-on-surface-variant">Date prévue</dt><dd>{new Date(op.dateHeurePrevue).toLocaleString("fr-FR")}</dd></div>
            <div><dt className="font-label-md text-label-md text-on-surface-variant">Durée</dt><dd>{op.dureeEstimeeMinutes} min</dd></div>
          </dl>
        </section>
        <section className="rounded-xl bg-surface-container-lowest p-gutter-md shadow-sm">
          <h2 className="mb-4 font-headline-sm text-headline-sm text-on-surface">Ressources affectées</h2>
          <dl className="space-y-3 font-body-md text-body-md">
            <div><dt className="font-label-md text-label-md text-on-surface-variant">Équipe</dt><dd>{op.equipeId?.nom ?? "—"}</dd></div>
            <div><dt className="font-label-md text-label-md text-on-surface-variant">Véhicule</dt><dd>{op.vehiculeId?.identification ?? "—"}</dd></div>
            <div><dt className="font-label-md text-label-md text-on-surface-variant">Équipements</dt><dd>{op.equipementIds?.map((e) => e.nom).join(", ") || "—"}</dd></div>
            {op.informationsParticulieres && (
              <div><dt className="font-label-md text-label-md text-on-surface-variant">Notes</dt><dd>{op.informationsParticulieres}</dd></div>
            )}
          </dl>
        </section>
      </div>
    </div>
  );
}
