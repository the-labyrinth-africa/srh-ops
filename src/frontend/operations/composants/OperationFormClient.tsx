"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { formatApiError } from "@/frontend/design-system";
import { QUANTITE_UNITES, type QuantiteUnite } from "@/shared/operations/quantites";

interface Option { _id: string; nom?: string; }

function dateHeureLocale(): string {
  const date = new Date();
  const deuxChiffres = (valeur: number) => String(valeur).padStart(2, "0");
  return `${date.getFullYear()}-${deuxChiffres(date.getMonth() + 1)}-${deuxChiffres(date.getDate())}T${deuxChiffres(date.getHours())}:${deuxChiffres(date.getMinutes())}`;
}

export function OperationFormClient() {
  const router = useRouter();
  const [clients, setClients] = useState<Option[]>([]);
  const [sites, setSites] = useState<Option[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [chargementReferentiels, setChargementReferentiels] = useState(true);
  const [uniteQuantiteGlobale, setUniteQuantiteGlobale] = useState<QuantiteUnite | null>(null);
  const [form, setForm] = useState({
    clientId: "", siteId: "", dateCollecte: dateHeureLocale(),
    quantiteCollectee: "", uniteQuantite: "Litres", natureIntervention: "Collecte d'huiles usagées", remarquesTerrain: "",
  });

  useEffect(() => {
    let actif = true;
    async function chargerReferentiels() {
      try {
        const [clientsResponse, uniteResponse] = await Promise.all([
          fetch("/api/clients"),
          fetch("/api/plateforme/unite-quantite"),
        ]);
        if (!clientsResponse.ok || !uniteResponse.ok) throw new Error("Impossible de charger les clients ou les paramètres d'unité.");
        const [clientsData, uniteData] = await Promise.all([
          clientsResponse.json() as Promise<unknown>,
          uniteResponse.json() as Promise<{ uniteQuantiteGlobale?: unknown }>,
        ]);
        if (!Array.isArray(clientsData)) throw new Error("La liste des clients reçue est invalide.");
        const uniteGlobale = QUANTITE_UNITES.find((unite) => unite === uniteData.uniteQuantiteGlobale) ?? null;
        if (actif) {
          setClients(clientsData);
          setUniteQuantiteGlobale(uniteGlobale);
          if (uniteGlobale) setForm((previous) => ({ ...previous, uniteQuantite: uniteGlobale }));
        }
      } catch (cause) {
        if (actif) setError(cause instanceof Error ? cause.message : "Erreur réseau lors du chargement des paramètres.");
      } finally {
        if (actif) setChargementReferentiels(false);
      }
    }
    void chargerReferentiels();
    return () => { actif = false; };
  }, []);

  async function handleClientChange(clientId: string) {
    setForm((prev) => ({ ...prev, clientId, siteId: "" }));
    setError("");
    if (!clientId) {
      setSites([]);
      return;
    }
    try {
      const response = await fetch(`/api/sites?clientId=${clientId}`);
      const data: unknown = await response.json();
      if (!response.ok || !Array.isArray(data)) throw new Error("Impossible de charger les sites de ce client.");
      setSites(data);
    } catch (cause) {
      setSites([]);
      setError(cause instanceof Error ? cause.message : "Erreur réseau lors du chargement des sites.");
    }
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const response = await fetch("/api/operations/collectes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, quantiteCollectee: Number(form.quantiteCollectee), dateCollecte: new Date(form.dateCollecte).toISOString() }),
      });
      if (!response.ok) {
        const data = await response.json();
        setError(formatApiError(data.error));
        return;
      }
      router.push("/operations");
      router.refresh();
    } catch {
      setError("Erreur réseau lors de l'enregistrement de la collecte.");
    } finally {
      setLoading(false);
    }
  }

  return <div className="mx-auto max-w-3xl space-y-gutter-md p-margin-mobile lg:p-margin-desktop">
    <div className="flex items-center gap-3">
      <Link href="/operations" aria-label="Retour à l’historique" className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg p-2 text-on-surface-variant hover:bg-surface-container-high"><span aria-hidden="true" className="material-symbols-outlined text-[20px]">arrow_back</span></Link>
      <div><h1 className="font-headline-lg text-headline-lg font-bold text-on-surface">Enregistrer une collecte</h1><p className="font-body-md text-body-md text-on-surface-variant">Saisissez une collecte réalisée ; elle sera ajoutée à l’historique utilisé pour les prochaines prévisions.</p></div>
    </div>
    {error && <div role="alert" className="rounded-xl bg-error-container p-gutter-sm text-on-error-container">{error}</div>}
    <form onSubmit={handleSubmit} className="space-y-6 rounded-xl border border-surface-container-high bg-surface-container-lowest p-gutter-md">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="font-label-md text-label-md font-semibold text-on-surface">Client *
          <select required value={form.clientId} onChange={(event) => void handleClientChange(event.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-outline-variant bg-surface px-3 py-2 font-body-md text-on-surface"><option value="">Sélectionner un client</option>{clients.map((item) => <option key={item._id} value={item._id}>{item.nom}</option>)}</select>
        </label>
        <label className="font-label-md text-label-md font-semibold text-on-surface">Site *
          <select required disabled={!form.clientId} value={form.siteId} onChange={(event) => setForm({ ...form, siteId: event.target.value })} className="mt-1 min-h-11 w-full rounded-xl border border-outline-variant bg-surface px-3 py-2 font-body-md text-on-surface disabled:opacity-50"><option value="">Sélectionner un site</option>{sites.map((item) => <option key={item._id} value={item._id}>{item.nom}</option>)}</select>
        </label>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="font-label-md text-label-md font-semibold text-on-surface">Date et heure de collecte *<input required type="datetime-local" value={form.dateCollecte} onChange={(event) => setForm({ ...form, dateCollecte: event.target.value })} className="mt-1 min-h-11 w-full rounded-xl border border-outline-variant bg-surface px-3 py-2 font-body-md text-on-surface" /></label>
        <div className="grid grid-cols-[1fr_130px] gap-2">
          <label className="font-label-md text-label-md font-semibold text-on-surface">Quantité collectée *<input required type="number" min="0.01" step="0.01" value={form.quantiteCollectee} onChange={(event) => setForm({ ...form, quantiteCollectee: event.target.value })} className="mt-1 min-h-11 w-full rounded-xl border border-outline-variant bg-surface px-3 py-2 font-body-md text-on-surface" /></label>
          <label className="font-label-md text-label-md font-semibold text-on-surface">Unité
            <select disabled={Boolean(uniteQuantiteGlobale)} value={uniteQuantiteGlobale ?? form.uniteQuantite} onChange={(event) => setForm({ ...form, uniteQuantite: event.target.value })} className="mt-1 min-h-11 w-full rounded-xl border border-outline-variant bg-surface px-3 py-2 font-body-md text-on-surface disabled:opacity-70">
              {QUANTITE_UNITES.map((unite) => <option key={unite}>{unite}</option>)}
            </select>
          </label>
        </div>
      </div>
      {uniteQuantiteGlobale && <p className="font-body-sm text-on-surface-variant">L’unité est imposée par les paramètres de l’entreprise.</p>}
      <label className="block font-label-md text-label-md font-semibold text-on-surface">Nature de la collecte<input required value={form.natureIntervention} onChange={(event) => setForm({ ...form, natureIntervention: event.target.value })} className="mt-1 min-h-11 w-full rounded-xl border border-outline-variant bg-surface px-3 py-2 font-body-md text-on-surface" /></label>
      <label className="block font-label-md text-label-md font-semibold text-on-surface">Remarques<textarea rows={3} value={form.remarquesTerrain} onChange={(event) => setForm({ ...form, remarquesTerrain: event.target.value })} className="mt-1 w-full rounded-xl border border-outline-variant bg-surface px-3 py-2 font-body-md text-on-surface" /></label>
      <div className="flex justify-end gap-3"><Link href="/operations" className="inline-flex min-h-11 items-center rounded-xl border border-outline-variant px-4 py-2.5 font-label-md font-semibold text-on-surface">Annuler</Link><button type="submit" disabled={loading || chargementReferentiels} className="min-h-11 rounded-xl bg-primary px-5 py-2.5 font-label-md font-semibold text-on-primary disabled:opacity-50">{loading ? "Enregistrement…" : chargementReferentiels ? "Chargement…" : "Enregistrer la collecte"}</button></div>
    </form>
  </div>;
}
