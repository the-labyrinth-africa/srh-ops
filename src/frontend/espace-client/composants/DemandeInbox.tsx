"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { formatApiError } from "@/frontend/design-system";

type StatutDemande = "en_attente" | "conversion_en_cours" | "convertie" | "refusee";

interface DemandePublique {
  _id: string;
  nomClient: string;
  nomContact: string;
  email: string;
  telephone: string;
  nomSite: string;
  adresseSite: string;
  natureIntervention: string;
  dateSouhaitee: string;
  informationsParticulieres: string;
  statut: StatutDemande;
  motifRefus?: string;
  operationId?: string;
  createdAt: string;
}

interface Client {
  _id: string;
  nom: string;
}

interface Site {
  _id: string;
  nom: string;
  adresse: string;
  clientId?: string | { _id: string };
}

const STATUS_LABELS: Record<StatutDemande, string> = {
  en_attente: "À traiter",
  conversion_en_cours: "Traitement en cours",
  convertie: "Convertie en opération",
  refusee: "Refusée",
};

function clientReference(site: Site) {
  return typeof site.clientId === "object" && site.clientId ? site.clientId._id : site.clientId;
}

export function DemandeInbox() {
  const [items, setItems] = useState<DemandePublique[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [clientId, setClientId] = useState("");
  const [siteId, setSiteId] = useState("");
  const [motifRefus, setMotifRefus] = useState("");
  const [filter, setFilter] = useState<"a_traiter" | "toutes">("a_traiter");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [demandesResponse, clientsResponse, sitesResponse] = await Promise.all([
        fetch("/api/demandes"),
        fetch("/api/clients"),
        fetch("/api/sites"),
      ]);
      const [demandesData, clientsData, sitesData] = await Promise.all([
        demandesResponse.json(),
        clientsResponse.json(),
        sitesResponse.json(),
      ]);
      if (!demandesResponse.ok || !clientsResponse.ok || !sitesResponse.ok) {
        setError("Impossible de charger la boîte de demandes ou les référentiels associés.");
        return;
      }
      setItems(Array.isArray(demandesData.items) ? demandesData.items : []);
      setClients(Array.isArray(clientsData) ? clientsData : []);
      setSites(Array.isArray(sitesData) ? sitesData : []);
    } catch {
      setError("Connexion au serveur impossible. Vérifiez votre connexion Internet et réessayez.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const current = useMemo(() => items.find((item) => item._id === selected) ?? null, [items, selected]);
  const filtered = items.filter((item) =>
    filter === "toutes" || item.statut === "en_attente" || item.statut === "conversion_en_cours"
  );
  const matchingSites = sites.filter((site) => clientReference(site) === clientId);

  const startReview = (item: DemandePublique) => {
    setSelected(item._id);
    setClientId("");
    setSiteId("");
    setMotifRefus("");
    setError("");
    setSuccess("");
  };

  async function convert() {
    if (!current || !clientId || !siteId) return;
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const response = await fetch(`/api/demandes/${current._id}/convertir`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, siteId }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(formatApiError(data.error));
        return;
      }
      setSuccess("Demande validée et convertie en opération au statut « Demande ».");
      setSelected(null);
      await load();
    } catch {
      setError("Conversion impossible. Vérifiez votre connexion Internet puis réessayez.");
    } finally {
      setBusy(false);
    }
  }

  async function refuse(item: DemandePublique) {
    if (!window.confirm(`Refuser la demande de ${item.nomClient} ?`)) return;
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const response = await fetch(`/api/demandes/${item._id}/refuser`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ motif: motifRefus }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(formatApiError(data.error));
        return;
      }
      setSuccess("Demande refusée. Elle reste conservée dans l’historique interne.");
      if (selected === item._id) setSelected(null);
      await load();
    } catch {
      setError("Impossible de traiter la demande. Vérifiez votre connexion Internet puis réessayez.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-margin-mobile py-gutter-lg lg:px-margin-desktop">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-label-sm text-label-sm font-bold uppercase tracking-widest text-primary">Espace interne</p>
          <h1 className="mt-2 font-headline-lg-mobile text-headline-lg-mobile font-bold text-on-surface lg:font-headline-lg lg:text-headline-lg">Demandes clients</h1>
          <p className="mt-2 font-body-md text-body-md text-on-surface-variant">Vérifiez les coordonnées puis rattachez chaque demande à un client et un site avant sa création en opération.</p>
        </div>
        <Link href="/clients" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-outline-variant px-4 py-2 font-label-md text-label-md font-semibold text-on-surface hover:bg-surface-container-high">
          <span aria-hidden="true" className="material-symbols-outlined">store</span>
          Gérer clients et sites
        </Link>
      </header>

      {error && <div role="alert" className="rounded-xl bg-error-container p-4 text-on-error-container">{error}<button type="button" onClick={() => void load()} className="ml-3 min-h-11 underline">Réessayer</button></div>}
      {success && <div role="status" className="rounded-xl border border-primary/20 bg-primary/5 p-4 text-on-surface">{success}</div>}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(19rem,0.8fr)]">
        <section aria-label="Boîte des demandes" className="overflow-hidden rounded-2xl border border-surface-container-high bg-surface-container-lowest">
          <div className="flex items-center justify-between gap-3 border-b border-surface-container-high p-4">
            <h2 className="font-headline-sm text-headline-sm font-bold text-on-surface">{filter === "a_traiter" ? "À examiner" : "Toutes les demandes"}</h2>
            <select aria-label="Filtrer les demandes" value={filter} onChange={(event) => setFilter(event.target.value as "a_traiter" | "toutes")} className="min-h-11 rounded-lg border border-outline-variant bg-surface px-2 font-body-sm text-body-sm text-on-surface">
              <option value="a_traiter">À traiter</option>
              <option value="toutes">Toutes</option>
            </select>
          </div>
          {loading ? <p role="status" className="p-5 text-on-surface-variant">Chargement des demandes…</p> :
            filtered.length ? <ul className="divide-y divide-surface-container-high">
              {filtered.map((item) => (
                <li key={item._id}>
                  <button type="button" onClick={() => startReview(item)} className={`w-full p-4 text-left transition hover:bg-surface-container-low focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary ${selected === item._id ? "bg-primary/5" : ""}`}>
                    <span className="flex items-start justify-between gap-3">
                      <span>
                        <span className="block font-label-md text-label-md font-bold text-on-surface">{item.nomClient}</span>
                        <span className="mt-1 block font-body-sm text-body-sm text-on-surface-variant">{item.natureIntervention} · {item.nomSite}</span>
                        <span className="mt-1 block font-body-sm text-body-sm text-on-surface-variant">{new Date(item.createdAt).toLocaleDateString("fr-FR")}</span>
                      </span>
                      <span className="shrink-0 rounded-full bg-surface-container-high px-2.5 py-1 font-label-sm text-label-sm font-semibold text-on-surface">{STATUS_LABELS[item.statut]}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul> : <p className="p-6 text-center font-body-md text-body-md text-on-surface-variant">Aucune demande dans cette vue.</p>}
        </section>

        <section aria-label="Détails et qualification" className="rounded-2xl border border-surface-container-high bg-surface-container-lowest p-5">
          {current ? (
            <div className="space-y-5">
              <div>
                <p className="font-label-sm text-label-sm font-bold uppercase tracking-widest text-primary">Vérification</p>
                <h2 className="mt-2 font-headline-sm text-headline-sm font-bold text-on-surface">{current.nomClient}</h2>
              </div>
              <dl className="grid gap-3 text-body-sm text-on-surface">
                <div><dt className="font-label-sm font-semibold text-on-surface-variant">Contact</dt><dd>{current.nomContact} · <a href={`mailto:${current.email}`} className="text-primary underline">{current.email}</a>{current.telephone && <> · <a href={`tel:${current.telephone}`} className="text-primary underline">{current.telephone}</a></>}</dd></div>
                <div><dt className="font-label-sm font-semibold text-on-surface-variant">Site communiqué</dt><dd>{current.nomSite} — {current.adresseSite}</dd></div>
                <div><dt className="font-label-sm font-semibold text-on-surface-variant">Intervention souhaitée</dt><dd>{current.natureIntervention} · {new Date(current.dateSouhaitee).toLocaleString("fr-FR")}</dd></div>
                {current.informationsParticulieres && <div><dt className="font-label-sm font-semibold text-on-surface-variant">Précisions</dt><dd className="whitespace-pre-wrap">{current.informationsParticulieres}</dd></div>}
              </dl>

              {current.statut === "en_attente" || current.statut === "conversion_en_cours" ? (
                <>
                  <div className="space-y-3 border-t border-surface-container-high pt-4">
                    <h3 className="font-label-md text-label-md font-bold text-on-surface">Rattacher avant conversion</h3>
                    <label className="block space-y-1 font-label-sm text-label-sm font-semibold text-on-surface">
                      Client
                      <select value={clientId} onChange={(event) => { setClientId(event.target.value); setSiteId(""); }} className="min-h-11 w-full rounded-xl border border-outline-variant bg-surface px-3 font-body-md text-body-md" disabled={busy}>
                        <option value="">Sélectionner un client vérifié…</option>
                        {clients.map((client) => <option key={client._id} value={client._id}>{client.nom}</option>)}
                      </select>
                    </label>
                    <label className="block space-y-1 font-label-sm text-label-sm font-semibold text-on-surface">
                      Site du client
                      <select value={siteId} onChange={(event) => setSiteId(event.target.value)} className="min-h-11 w-full rounded-xl border border-outline-variant bg-surface px-3 font-body-md text-body-md" disabled={!clientId || busy}>
                        <option value="">Sélectionner un site vérifié…</option>
                        {matchingSites.map((site) => <option key={site._id} value={site._id}>{site.nom}{site.adresse ? ` — ${site.adresse}` : ""}</option>)}
                      </select>
                    </label>
                    {clientId && matchingSites.length === 0 && <p className="font-body-sm text-body-sm text-on-surface-variant">Aucun site n’est encore enregistré pour ce client. Ajoutez-le dans Clients &amp; Sites puis actualisez cette page.</p>}
                    <button type="button" onClick={() => void convert()} disabled={busy || !clientId || !siteId} className="min-h-11 w-full rounded-xl bg-primary px-4 py-2 font-label-md text-label-md font-bold text-on-primary hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50">
                      {busy ? "Traitement…" : current.statut === "conversion_en_cours" ? "Relancer la conversion" : "Valider et créer l’opération"}
                    </button>
                    <label className="block space-y-1 font-label-sm text-label-sm font-semibold text-on-surface">
                      Motif du refus (facultatif)
                      <textarea value={motifRefus} onChange={(event) => setMotifRefus(event.target.value)} maxLength={500} rows={2} disabled={busy} className="w-full rounded-xl border border-outline-variant bg-surface px-3 py-2 font-body-md text-body-md" />
                    </label>
                    <button type="button" onClick={() => void refuse(current)} disabled={busy || current.statut !== "en_attente"} className="min-h-11 w-full rounded-xl border border-error/30 px-4 py-2 font-label-md text-label-md font-semibold text-error hover:bg-error-container disabled:opacity-50">
                      Refuser la demande
                    </button>
                  </div>
                </>
              ) : (
                <div className="rounded-xl bg-surface-container-low p-3 font-body-sm text-body-sm text-on-surface-variant">
                  {STATUS_LABELS[current.statut]}
                  {current.operationId && <p className="mt-1">Opération créée : {current.operationId}</p>}
                  {current.motifRefus && <p className="mt-1">Motif : {current.motifRefus}</p>}
                </div>
              )}
            </div>
          ) : (
            <div className="flex min-h-64 flex-col items-center justify-center text-center">
              <span aria-hidden="true" className="material-symbols-outlined text-4xl text-outline">fact_check</span>
              <h2 className="mt-3 font-headline-sm text-headline-sm font-bold text-on-surface">Sélectionnez une demande</h2>
              <p className="mt-2 max-w-sm font-body-sm text-body-sm text-on-surface-variant">Les demandes publiques restent séparées des opérations et du portail client tant qu&apos;elles n&apos;ont pas été vérifiées.</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
