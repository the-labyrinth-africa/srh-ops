"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { StatusBadge, SignaturePad, formatApiError } from "@/frontend/design-system";
import { TracabiliteOperation } from "@/frontend/tracabilite";
import { getNextStatuses } from "@/shared/operations/transitions";
import { canWrite, isChauffeur } from "@/shared/acces/permissions";
import { compressImageFile } from "../utils/image-compress";
import type { OperationStatus } from "@/shared/operations/statuts";
import type { QuantiteUnite } from "@/shared/operations/quantites";
import { QUANTITE_UNITES } from "@/shared/operations/quantites";
import { useUniteQuantiteGlobale } from "@/frontend/parametres";

interface OperationTerrain {
  _id: string;
  natureIntervention: string;
  dateHeurePrevue: string;
  dateHeureArrivee?: string;
  dateHeureDepart?: string;
  statut: OperationStatus;
  quantiteCollectee?: number;
  uniteQuantite?: QuantiteUnite;
  remarquesTerrain?: string;
  nomSignataireClient?: string;
  signatureClient?: string;
  photos?: { url: string; nom: string }[];
  clientId?: { nom: string; contact?: { email?: string; telephone?: string } };
  siteId?: { nom: string; adresse: string };
  equipeId?: { _id: string; nom: string };
  vehiculeId?: { identification: string };
  informationsParticulieres?: string;
}

interface StationTourneeTerrain {
  site: string;
  commune: string;
  siteId?: string;
  clientId?: string;
  quantiteEstimeeLitres: number;
  dureeEstimeeMinutes: number;
  dateHeureArrivee?: string;
  dateHeureDepart?: string;
  quantiteCollectee?: number;
}

interface AffectationTourneeTerrain {
  _id: string;
  date: string;
  tournee: string;
  secteur: string;
  equipeNom: string;
  vehiculeIdentification: string;
  volumeEstimeLitres: number;
  stations: StationTourneeTerrain[];
}

function dateHeureLocale(dateHeure?: string): string {
  if (!dateHeure) return "";
  const date = new Date(dateHeure);
  const deuxChiffres = (valeur: number) => String(valeur).padStart(2, "0");
  return `${date.getFullYear()}-${deuxChiffres(date.getMonth() + 1)}-${deuxChiffres(date.getDate())}T${deuxChiffres(date.getHours())}:${deuxChiffres(date.getMinutes())}`;
}

function heureStationAffichee(dateHeure?: string): string {
  if (!dateHeure) return "";
  return new Date(dateHeure).toLocaleString("fr-FR", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

export function TerrainViewClient() {
  const { data: session } = useSession();
  const { uniteQuantiteGlobale } = useUniteQuantiteGlobale();
  const canEditTraceabilite = canWrite(session?.user?.role) || isChauffeur(session?.user?.role);

  const [operations, setOperations] = useState<OperationTerrain[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState("");
  const [selectedOp, setSelectedOp] = useState<OperationTerrain | null>(null);
  const [actionError, setActionError] = useState("");
  const [actionSuccess, setActionSuccess] = useState("");
  const [saving, setSaving] = useState(false);
  const [tourneesDuJour, setTourneesDuJour] = useState<AffectationTourneeTerrain[]>([]);
  const [chargementTournee, setChargementTournee] = useState(false);
  const [erreurTournee, setErreurTournee] = useState("");
  const [messagePointage, setMessagePointage] = useState("");
  const [pointageEnCours, setPointageEnCours] = useState("");
  const [quantitesTournee, setQuantitesTournee] = useState<Record<string, string>>({});

  // Formulaire d'édition de terrain
  const [nextStatut, setNextStatut] = useState<OperationStatus | "">("");
  const [quantite, setQuantite] = useState("");
  const [heureArrivee, setHeureArrivee] = useState("");
  const [heureDepart, setHeureDepart] = useState("");
  const [heureArriveeModifiee, setHeureArriveeModifiee] = useState(false);
  const [heureDepartModifiee, setHeureDepartModifiee] = useState(false);
  const [unite, setUnite] = useState<QuantiteUnite>("Litres");
  const [remarques, setRemarques] = useState("");
  const [nomSignataire, setNomSignataire] = useState("");
  const [signatureData, setSignatureData] = useState("");
  const quantiteModifiee = selectedOp
    ? quantite !== (selectedOp.quantiteCollectee === undefined ? "" : String(selectedOp.quantiteCollectee))
    : false;
  const uniteAffichee = uniteQuantiteGlobale && !quantiteModifiee
    ? selectedOp?.uniteQuantite ?? uniteQuantiteGlobale
    : uniteQuantiteGlobale ?? unite;

  // Envoi de rapport par email
  const [emailClient, setEmailClient] = useState("");
  const [showEmailInput, setShowEmailInput] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);

  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  const fetchTerrainOps = useCallback(async () => {
    setLoading(true);
    setListError("");
    try {
      const res = await fetch("/api/operations");
      const data = await res.json();
      if (!res.ok) {
        setListError(formatApiError(data.error));
        return;
      }
      setOperations(Array.isArray(data.items) ? data.items : []);
    } catch {
      setListError("Impossible de charger les opérations. Vérifiez votre connexion Internet puis réessayez.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTerrainOps();
  }, [fetchTerrainOps]);

  useEffect(() => {
    let actif = true;
    if (!isChauffeur(session?.user?.role)) {
      setTourneesDuJour([]);
      return () => { actif = false; };
    }

    setChargementTournee(true);
    setErreurTournee("");
    fetch("/api/previsions/tournees/aujourdhui")
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(formatApiError(data.error));
        return data as { affectations: AffectationTourneeTerrain[] };
      })
      .then((data) => { if (actif) setTourneesDuJour(data.affectations); })
      .catch((error: Error) => { if (actif) setErreurTournee(error.message); })
      .finally(() => { if (actif) setChargementTournee(false); });
    return () => { actif = false; };
  }, [session?.user?.role]);

  const enregistrerPointageTournee = async (
    affectation: AffectationTourneeTerrain,
    indexStation: number,
    action: "arrivee" | "depart"
  ) => {
    const cle = `${affectation._id}:${indexStation}`;
    setErreurTournee("");
    setMessagePointage("");
    const quantite = quantitesTournee[cle];
    if (action === "depart" && (quantite === undefined || quantite === "" || !Number.isFinite(Number(quantite)) || Number(quantite) < 0)) {
      setErreurTournee("Saisissez la quantité réelle récupérée en litres (0 est accepté).");
      return;
    }

    setPointageEnCours(cle);
    try {
      const response = await fetch("/api/previsions/tournees/visites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          affectationId: affectation._id,
          indexStation,
          action,
          ...(action === "depart" ? { quantiteCollectee: Number(quantite) } : {}),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(formatApiError(data.error));
      setTourneesDuJour((precedentes) => precedentes.map((item) => item._id === affectation._id
        ? { ...data.affectation, equipeNom: item.equipeNom, vehiculeIdentification: item.vehiculeIdentification }
        : item));
      const collecteNonRattachee = action === "depart" && Number(quantite) > 0 && data.collecteOperationEnregistree === false;
      setMessagePointage(collecteNonRattachee
        ? "Pointage enregistré dans la tournée, mais la station n’est pas rattachée à un client/site : la collecte ne figure pas dans l’historique central des opérations."
        : action === "arrivee" ? "Heure d’arrivée enregistrée." : "Heure de départ et collecte enregistrées.");
    } catch (error) {
      setErreurTournee(error instanceof Error ? error.message : "Impossible d’enregistrer le pointage.");
    } finally {
      setPointageEnCours("");
    }
  };

  const selectOperation = (op: OperationTerrain) => {
    setSelectedOp(op);
    setNextStatut("");
    setQuantite(op.quantiteCollectee ? String(op.quantiteCollectee) : "");
    setHeureArrivee(dateHeureLocale(op.dateHeureArrivee));
    setHeureDepart(dateHeureLocale(op.dateHeureDepart));
    setHeureArriveeModifiee(false);
    setHeureDepartModifiee(false);
    setUnite(op.uniteQuantite || "Litres");
    setRemarques(op.remarquesTerrain || "");
    setNomSignataire(op.nomSignataireClient || "");
    setSignatureData(op.signatureClient || "");
    setEmailClient(op.clientId?.contact?.email || "");
    setShowEmailInput(false);
    setActionError("");
    setActionSuccess("");
  };

  const handleUpdateStatus = async (targetStatus: OperationStatus) => {
    if (!selectedOp) return;
    setActionError("");
    setActionSuccess("");
    if (heureArriveeModifiee && (!heureArrivee || !Number.isFinite(new Date(heureArrivee).getTime()))) {
      setActionError("Saisissez une heure d’arrivée valide.");
      return;
    }
    if (targetStatus === "Terminée" && heureDepartModifiee && (!heureDepart || !Number.isFinite(new Date(heureDepart).getTime()))) {
      setActionError("Saisissez une heure de départ valide.");
      return;
    }
    if (targetStatus === "Terminée" && (!quantite || !Number.isFinite(Number(quantite)) || Number(quantite) <= 0)) {
      setActionError("Saisissez une quantité collectée supérieure à zéro avant de quitter la station.");
      return;
    }
    const dateArriveeVerifiee = heureArriveeModifiee
      ? new Date(heureArrivee)
      : selectedOp.dateHeureArrivee
        ? new Date(selectedOp.dateHeureArrivee)
        : new Date();
    const dateDepartVerifiee = heureDepartModifiee ? new Date(heureDepart) : new Date();
    if (targetStatus === "Terminée" && dateDepartVerifiee < dateArriveeVerifiee) {
      setActionError("L’heure de départ doit être postérieure ou égale à l’heure d’arrivée.");
      return;
    }
    setSaving(true);

    const payload = {
      statut: targetStatus,
      ...(heureArriveeModifiee && (targetStatus === "En cours" || targetStatus === "Terminée")
        ? { dateHeureArrivee: new Date(heureArrivee).toISOString() }
        : {}),
      ...(targetStatus === "Terminée" && heureDepartModifiee
        ? { dateHeureDepart: new Date(heureDepart).toISOString() }
        : {}),
      quantiteCollectee: quantite ? Number(quantite) : undefined,
      uniteQuantite: quantite ? uniteAffichee : undefined,
      remarquesTerrain: remarques || undefined,
      nomSignataireClient: nomSignataire || undefined,
      signatureClient: signatureData || undefined,
    };

    try {
      const res = await fetch(`/api/operations/${selectedOp._id}/statut`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json();
        setActionError(formatApiError(data.error));
        return;
      }

      setActionSuccess(`Statut mis à jour : ${targetStatus}`);
      const updatedOperation = await res.json() as OperationTerrain;
      await fetchTerrainOps();
      setSelectedOp(updatedOperation);
      setHeureArrivee(dateHeureLocale(updatedOperation.dateHeureArrivee));
      setHeureDepart(dateHeureLocale(updatedOperation.dateHeureDepart));
      setHeureArriveeModifiee(false);
      setHeureDepartModifiee(false);
    } catch {
      setActionError("Impossible de mettre à jour le statut. Vérifiez votre connexion Internet puis réessayez.");
    } finally {
      setSaving(false);
    }
  };

  const handleTakePhoto = async (files: FileList | null) => {
    if (!files || files.length === 0 || !selectedOp) return;
    setActionError("");
    setActionSuccess("");
    setUploadingPhoto(true);

    let dataUrl: string | null = null;
    try {
      const file = files[0];
      dataUrl = await compressImageFile(file);
      if (!dataUrl) {
        setActionError("Image trop lourde même après compression.");
        return;
      }

      const res = await fetch(`/api/operations/${selectedOp._id}/photos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photo: dataUrl, nom: file.name }),
      });

      if (!res.ok) {
        const data = await res.json();
        setActionError(formatApiError(data.error));
        return;
      }

      const saved = await res.json();
      setSelectedOp((prev) =>
        prev
          ? {
              ...prev,
              photos: [...(prev.photos || []), saved.photo],
            }
          : null
      );
      setActionSuccess("Photo ajoutée avec succès.");
      await fetchTerrainOps();
    } catch {
      setActionError("Impossible d'enregistrer la photo. Vérifiez votre connexion Internet puis réessayez.");
    } finally {
      setUploadingPhoto(false);
      if (cameraInputRef.current) cameraInputRef.current.value = "";
    }
  };

  const handleSendReportEmail = async () => {
    if (!selectedOp) return;
    setActionError("");
    setActionSuccess("");
    setSendingEmail(true);

    try {
      const res = await fetch(`/api/operations/${selectedOp._id}/rapport`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: emailClient || undefined }),
      });

      const data = await res.json();
      if (!res.ok) {
        setActionError(formatApiError(data.error));
        return;
      }

      setActionSuccess(`Rapport officiel envoyé par e-mail à ${data.destinataire}.`);
      setShowEmailInput(false);
      setSelectedOp((prev) => (prev ? { ...prev, statut: "Rapportée" } : null));
      setOperations((prev) =>
        prev.map((op) => (op._id === selectedOp._id ? { ...op, statut: "Rapportée" } : op))
      );
    } catch {
      setActionError("Erreur réseau lors de l'envoi du rapport par e-mail.");
    } finally {
      setSendingEmail(false);
    }
  };

  const operationsAffichees = Array.isArray(operations) ? operations : [];

  return (
    <div className="mx-auto max-w-lg space-y-gutter-md p-margin-mobile">
      {/* En-tête mobile */}
      <div className="flex items-center justify-between rounded-xl border border-surface-container-high bg-surface-container-lowest p-gutter-sm">
        <div>
          <h1 className="font-headline-sm text-headline-sm font-bold text-on-surface">
            Console Terrain
          </h1>
          <p className="font-label-sm text-label-sm text-on-surface-variant">
            {session?.user?.name || "Chauffeur"} • WOM
          </p>
        </div>
        <Link
          href="/"
          className="rounded-lg bg-surface-container-high p-2 text-on-surface-variant hover:text-on-surface"
          title="Accueil"
        >
          <span className="material-symbols-outlined text-[20px]">home</span>
        </Link>
      </div>

      {isChauffeur(session?.user?.role) && (
        <section aria-labelledby="tournee-du-jour-titre" className="space-y-4 rounded-xl border border-primary/30 bg-surface-container-lowest p-gutter-md shadow-sm">
          <div>
            <p className="font-label-sm text-label-sm font-semibold uppercase tracking-wide text-primary">Affectation terrain</p>
            <h2 id="tournee-du-jour-titre" className="mt-1 font-title-lg text-title-lg font-bold text-on-surface">Ma tournée d’aujourd’hui</h2>
            <p className="mt-1 font-body-sm text-on-surface-variant">Enregistrez l’arrivée à chaque station, puis le départ et le volume réellement collecté.</p>
          </div>
          {erreurTournee && <p role="alert" className="rounded-lg border border-error/30 bg-error-container/20 p-3 font-body-sm text-error">{erreurTournee}</p>}
          {messagePointage && <p role="status" className="rounded-lg border border-primary/20 bg-primary/5 p-3 font-body-sm text-on-surface">{messagePointage}</p>}
          {chargementTournee ? <p className="font-body-sm text-on-surface-variant">Chargement de votre tournée…</p>
            : tourneesDuJour.length === 0 ? <p className="rounded-lg bg-surface-container-low p-3 font-body-sm text-on-surface-variant">Aucune tournée ne vous est affectée aujourd’hui. Contactez le dispatcher si cela semble incorrect.</p>
              : tourneesDuJour.map((affectation) => (
                <article key={affectation._id} className="space-y-3 rounded-xl border border-outline/20 bg-surface-container-lowest p-3">
                  <header className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <h3 className="font-title-md text-title-md font-bold text-on-surface">{affectation.tournee} · {affectation.secteur}</h3>
                      <p className="font-label-sm text-label-sm text-on-surface-variant">{affectation.vehiculeIdentification || "Véhicule"} · {affectation.volumeEstimeLitres.toLocaleString("fr-FR")} L estimés · {affectation.stations.length} stations</p>
                    </div>
                    <span className="rounded-full bg-primary/10 px-3 py-1 font-label-sm text-label-sm font-semibold text-primary">{affectation.equipeNom}</span>
                  </header>
                  <ol className="space-y-3">
                    {affectation.stations.map((station, index) => {
                      const cle = `${affectation._id}:${index}`;
                      const enCours = pointageEnCours === cle;
                      const terminee = Boolean(station.dateHeureDepart);
                      return <li key={`${affectation._id}-${station.site}-${index}`} className="rounded-lg border border-outline/15 bg-surface-container-low p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <h4 className="font-label-md text-label-md font-bold text-on-surface">{index + 1}. {station.site}</h4>
                            <p className="font-body-sm text-on-surface-variant">{station.commune} · prévu ≈ {station.quantiteEstimeeLitres.toLocaleString("fr-FR")} L · ≈ {station.dureeEstimeeMinutes} min</p>
                          </div>
                          <span className={`shrink-0 rounded-full px-2 py-1 font-label-sm text-label-sm font-semibold ${terminee ? "bg-primary/10 text-primary" : station.dateHeureArrivee ? "bg-amber-500/10 text-amber-800 dark:text-amber-300" : "bg-surface-container-high text-on-surface-variant"}`}>
                            {terminee ? "Terminée" : station.dateHeureArrivee ? "Sur site" : "À faire"}
                          </span>
                        </div>
                        <dl className="mt-3 grid grid-cols-2 gap-2 font-body-sm">
                          <div className="rounded-md bg-surface-container-lowest p-2"><dt className="text-on-surface-variant">Arrivée réelle</dt><dd className="font-semibold text-on-surface">{heureStationAffichee(station.dateHeureArrivee) || "Non enregistrée"}</dd></div>
                          <div className="rounded-md bg-surface-container-lowest p-2"><dt className="text-on-surface-variant">Départ réel</dt><dd className="font-semibold text-on-surface">{heureStationAffichee(station.dateHeureDepart) || "Non enregistré"}</dd></div>
                        </dl>
                        {station.quantiteCollectee !== undefined && <p className="mt-2 font-label-sm text-label-sm font-semibold text-on-surface">Collecté : {station.quantiteCollectee.toLocaleString("fr-FR")} L</p>}
                        {!station.dateHeureArrivee && <button type="button" onClick={() => enregistrerPointageTournee(affectation, index, "arrivee")} disabled={enCours} className="mt-3 min-h-11 w-full rounded-lg bg-primary px-4 font-label-md text-label-md font-semibold text-on-primary disabled:opacity-50">{enCours ? "Enregistrement…" : "Enregistrer mon arrivée"}</button>}
                        {station.dateHeureArrivee && !terminee && <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
                          <label className="flex min-h-11 flex-col gap-1 font-label-sm text-label-sm font-semibold text-on-surface">
                            Quantité réellement collectée (L)
                            <input type="number" min="0" step="1" inputMode="numeric" required value={quantitesTournee[cle] ?? ""} onChange={(event) => setQuantitesTournee((precedentes) => ({ ...precedentes, [cle]: event.target.value }))} className="min-h-11 rounded-lg border border-outline/40 bg-surface-container-lowest px-3 text-on-surface" />
                          </label>
                          <button type="button" onClick={() => enregistrerPointageTournee(affectation, index, "depart")} disabled={enCours} className="min-h-11 rounded-lg bg-primary px-4 font-label-md text-label-md font-semibold text-on-primary disabled:opacity-50">{enCours ? "Enregistrement…" : "Enregistrer mon départ"}</button>
                        </div>}
                      </li>;
                    })}
                  </ol>
                </article>
              ))}
        </section>
      )}

      {/* Vue détail / action sur opération sélectionnée */}
      {selectedOp ? (
        <div className="space-y-4 rounded-xl border border-surface-container-high bg-surface-container-lowest p-gutter-md shadow-sm">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setSelectedOp(null)}
              className="flex items-center gap-1 font-label-md text-label-md font-semibold text-primary"
            >
              <span className="material-symbols-outlined text-[18px]">arrow_back</span>
              Retour aux opérations
            </button>
            <StatusBadge status={selectedOp.statut} compact />
          </div>

          <div>
            <h2 className="font-headline-sm text-headline-sm font-bold text-on-surface">
              {selectedOp.natureIntervention}
            </h2>
            <p className="font-body-md text-body-md text-on-surface-variant font-semibold mt-0.5">
              {selectedOp.clientId?.nom || "Client inconnu"}
            </p>
            <p className="font-label-sm text-label-sm text-outline mt-0.5">
              {selectedOp.siteId?.nom} • {selectedOp.siteId?.adresse}
            </p>
          </div>

          <section
            aria-labelledby="horaires-station-titre"
            className="rounded-xl border-l-4 border-primary bg-primary/5 p-4"
          >
            <h3 id="horaires-station-titre" className="flex items-center gap-2 font-label-md text-label-md font-bold text-on-surface">
              <span aria-hidden="true" className="material-symbols-outlined text-[20px]">schedule</span>
              Horaires réels de cette station
            </h3>
            <p className="mt-1 font-body-sm text-on-surface-variant">
              Le responsable du camion enregistre l’heure d’arrivée en se présentant sur le site, puis l’heure de départ avant de quitter la station.
            </p>
            <dl className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div className="rounded-lg bg-surface-container-lowest p-3">
                <dt className="font-label-sm text-label-sm font-semibold text-on-surface-variant">Arrivée à la station</dt>
                <dd className="mt-1 font-body-md text-body-md font-bold text-on-surface">
                  {heureStationAffichee(selectedOp.dateHeureArrivee) || (
                    selectedOp.statut === "En route"
                      ? "À confirmer par le responsable"
                      : selectedOp.statut === "En cours"
                        ? "Heure non enregistrée"
                        : "En attente de l’arrivée"
                  )}
                </dd>
              </div>
              <div className="rounded-lg bg-surface-container-lowest p-3">
                <dt className="font-label-sm text-label-sm font-semibold text-on-surface-variant">Départ de la station</dt>
                <dd className="mt-1 font-body-md text-body-md font-bold text-on-surface">
                  {heureStationAffichee(selectedOp.dateHeureDepart) || (
                    selectedOp.statut === "En cours"
                      ? "À confirmer avant de quitter le site"
                      : selectedOp.statut === "Terminée" || selectedOp.statut === "Rapportée"
                        ? "Heure non enregistrée"
                        : "En attente de la collecte"
                  )}
                </dd>
              </div>
            </dl>
            {(selectedOp.statut === "En route" || selectedOp.statut === "En cours") && (
              <p className="mt-3 rounded-lg bg-surface-container-lowest px-3 py-2 font-label-sm text-label-sm font-semibold text-primary">
                {selectedOp.statut === "En route"
                  ? "À l’arrivée : vérifiez ou corrigez l’heure ci-dessous, puis confirmez votre arrivée."
                  : "Avant de quitter la station : vérifiez ou corrigez les deux heures ci-dessous, saisissez la quantité et clôturez la collecte."}
              </p>
            )}
          </section>

          {selectedOp.informationsParticulieres && (
            <div className="rounded-xl bg-surface-container-low p-3">
              <span className="font-label-sm text-label-sm font-bold text-outline uppercase">Consignes</span>
              <p className="font-body-md text-body-md text-on-surface mt-0.5">
                {selectedOp.informationsParticulieres}
              </p>
            </div>
          )}

          {actionSuccess && (
            <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/30 p-3 font-body-md text-body-md text-emerald-800 dark:text-emerald-300">
              {actionSuccess}
            </div>
          )}

          {actionError && (
            <div className="rounded-xl bg-error-container p-3 font-body-md text-body-md text-on-error-container">
              {actionError}
            </div>
          )}

          {/* Action rapide selon le stade actuel de l'intervention (PDF §6) */}
          <div className="pt-2 border-t border-surface-container-high space-y-3">
            {(selectedOp.statut === "Planifiée" || selectedOp.statut === "Affectée") && (
              <button
                type="button"
                disabled={saving}
                onClick={() => handleUpdateStatus("En route")}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3.5 font-label-md text-label-md font-bold text-on-primary shadow-md hover:bg-primary/90 disabled:opacity-50"
              >
                <span className="material-symbols-outlined text-[20px]">directions_car</span>
                {saving ? "Mise à jour..." : "1. Prendre la route (En route)"}
              </button>
            )}

            {selectedOp.statut === "En route" && (
              <div className="space-y-3">
                <label className="block font-label-md text-label-md font-semibold text-on-surface">
                  Heure réelle d’arrivée
                  <input
                    type="datetime-local"
                    value={heureArrivee}
                    onChange={(event) => {
                      setHeureArrivee(event.target.value);
                      setHeureArriveeModifiee(true);
                    }}
                    className="mt-1 min-h-11 w-full rounded-xl border border-outline-variant bg-surface px-3 py-2 font-body-md text-on-surface"
                  />
                  <span className="mt-1 block text-xs font-normal text-on-surface-variant">
                    Laissez vide pour enregistrer automatiquement l’heure de confirmation, ou corrigez-la si nécessaire.
                  </span>
                </label>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void handleUpdateStatus("En cours")}
                  className="min-h-11 w-full flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3.5 font-label-md text-label-md font-bold text-on-primary shadow-md hover:bg-primary/90 disabled:opacity-50"
                >
                  <span aria-hidden="true" className="material-symbols-outlined text-[20px]">pin_drop</span>
                  {saving ? "Enregistrement..." : "2. Confirmer l’arrivée"}
                </button>
              </div>
            )}

            {/* Formulaire de collecte (actif quand en cours ou modifiable) */}
            {(selectedOp.statut === "En cours" || selectedOp.statut === "Retardée" || nextStatut) && (
              <div className="space-y-4 pt-2">
                <label className="block font-label-md text-label-md font-semibold text-on-surface">
                  Heure réelle d’arrivée
                  <input
                    type="datetime-local"
                    value={heureArrivee}
                    onChange={(event) => {
                      setHeureArrivee(event.target.value);
                      setHeureArriveeModifiee(true);
                    }}
                    className="mt-1 min-h-11 w-full rounded-xl border border-outline-variant bg-surface px-3 py-2 font-body-md text-on-surface"
                  />
                  <span className="mt-1 block text-xs font-normal text-on-surface-variant">
                    Vous pouvez corriger l’heure enregistrée à l’arrivée.
                  </span>
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-label-md text-label-md font-semibold text-on-surface">
                      Quantité collectée
                    </label>
                    <input
                      required
                      type="number"
                      min="0.01"
                      step="0.1"
                      placeholder="0.0"
                      value={quantite}
                      onChange={(e) => setQuantite(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-outline-variant bg-surface px-3 py-2.5 font-body-md text-body-md text-on-surface outline-none"
                    />
                  </div>
                  <div>
                    <label className="block font-label-md text-label-md font-semibold text-on-surface">
                      Unité
                    </label>
                    {uniteQuantiteGlobale ? (
                      <p className="mt-1 flex min-h-11 items-center rounded-xl border border-outline-variant bg-surface-container-low px-3 font-body-md text-body-md text-on-surface">
                        {uniteAffichee} <span className="ml-2 text-sm text-on-surface-variant">
                          {quantiteModifiee ? "(unité globale)" : "(unité enregistrée)"}
                        </span>
                      </p>
                    ) : (
                      <select
                        value={unite}
                        onChange={(e) => setUnite(e.target.value as QuantiteUnite)}
                        className="mt-1 w-full rounded-xl border border-outline-variant bg-surface px-3 py-2.5 font-body-md text-body-md text-on-surface outline-none"
                      >
                        {QUANTITE_UNITES.map((unit) => <option key={unit} value={unit}>{unit}</option>)}
                      </select>
                    )}
                  </div>
                </div>

                {(selectedOp.statut === "En cours" || nextStatut === "Terminée") && (
                  <label className="block font-label-md text-label-md font-semibold text-on-surface">
                    Heure réelle de départ
                    <input
                      type="datetime-local"
                      value={heureDepart}
                      onChange={(event) => {
                        setHeureDepart(event.target.value);
                        setHeureDepartModifiee(true);
                      }}
                      className="mt-1 min-h-11 w-full rounded-xl border border-outline-variant bg-surface px-3 py-2 font-body-md text-on-surface"
                    />
                    <span className="mt-1 block text-xs font-normal text-on-surface-variant">
                      Laissez vide pour enregistrer automatiquement l’heure de clôture, ou corrigez-la si nécessaire.
                    </span>
                  </label>
                )}

                <div>
                  <label className="block font-label-md text-label-md font-semibold text-on-surface">
                    Remarques terrain
                  </label>
                  <textarea
                    rows={2}
                    placeholder="Observations, état du bac, propreté..."
                    value={remarques}
                    onChange={(e) => setRemarques(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-outline-variant bg-surface px-3 py-2 font-body-md text-body-md text-on-surface outline-none"
                  />
                </div>

                <div>
                  <label className="block font-label-md text-label-md font-semibold text-on-surface">
                    Nom du signataire client
                  </label>
                  <input
                    type="text"
                    placeholder="Nom du responsable sur site"
                    value={nomSignataire}
                    onChange={(e) => setNomSignataire(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-outline-variant bg-surface px-3 py-2 font-body-md text-body-md text-on-surface outline-none"
                  />
                </div>

                <div>
                  <label className="block font-label-md text-label-md font-semibold text-on-surface mb-2">
                    Signature du client
                  </label>
                  <SignaturePad
                    onSignature={setSignatureData}
                    existingSignature={selectedOp.signatureClient}
                  />
                </div>

                {/* Prise de photos terrain */}
                <div>
                  <input
                    ref={cameraInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={(e) => handleTakePhoto(e.target.files)}
                  />
                  <button
                    type="button"
                    disabled={uploadingPhoto}
                    onClick={() => cameraInputRef.current?.click()}
                    className="w-full flex items-center justify-center gap-2 rounded-xl border border-outline-variant bg-surface-container-low px-4 py-3 font-label-md text-label-md font-semibold text-on-surface hover:bg-surface-container-high disabled:opacity-50"
                  >
                    <span className="material-symbols-outlined text-[20px]">photo_camera</span>
                    {uploadingPhoto ? "Traitement de la photo..." : "Prendre une photo"}
                  </button>

                  {selectedOp.photos && selectedOp.photos.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {selectedOp.photos.map((p, i) => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          key={i}
                          src={p.url}
                          alt={p.nom}
                          className="h-16 w-16 rounded-lg object-cover border border-outline-variant"
                        />
                      ))}
                    </div>
                  )}
                </div>

                {selectedOp.statut === "En cours" && (
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void handleUpdateStatus("Terminée")}
                    className="min-h-11 w-full flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3.5 font-label-md text-label-md font-bold text-on-primary shadow-md hover:bg-primary/90 disabled:opacity-50"
                  >
                    <span aria-hidden="true" className="material-symbols-outlined text-[20px]">task_alt</span>
                    {saving ? "Enregistrement..." : "3. Clôturer l'intervention (Terminée)"}
                  </button>
                )}
              </div>
            )}

            {/* Actions post-intervention : rapport PDF et e-mail client */}
            {(selectedOp.statut === "Terminée" || selectedOp.statut === "Rapportée") && (
              <div className="space-y-3 pt-2">
                {selectedOp.statut === "Rapportée" && (
                  <div className="flex items-center gap-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-3 text-emerald-800 dark:text-emerald-300 font-label-md text-label-md font-semibold">
                    <span className="material-symbols-outlined text-[20px]">mark_email_read</span>
                    Rapport officiel transmis au client
                  </div>
                )}

                <div className="flex flex-col gap-2 sm:flex-row">
                  <a
                    href={`/api/operations/${selectedOp._id}/rapport`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex-1 flex items-center justify-center gap-2 rounded-xl border border-outline-variant bg-surface px-4 py-3 font-label-md text-label-md font-semibold text-on-surface hover:bg-surface-container-high"
                  >
                    <span className="material-symbols-outlined text-[20px]">download</span>
                    Télécharger le PDF
                  </a>

                  <button
                    type="button"
                    onClick={() => setShowEmailInput((v) => !v)}
                    className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 font-label-md text-label-md font-bold text-on-primary hover:bg-primary/90"
                  >
                    <span className="material-symbols-outlined text-[20px]">send</span>
                    Envoyer par e-mail
                  </button>
                </div>

                {showEmailInput && (
                  <div className="rounded-xl border border-primary/30 bg-surface-container-low p-4 space-y-3">
                    <label className="block font-label-md text-label-md font-semibold text-on-surface">
                      Adresse e-mail de réception du client :
                    </label>
                    <input
                      type="email"
                      placeholder="contact@client.ci"
                      value={emailClient}
                      onChange={(e) => setEmailClient(e.target.value)}
                      className="w-full rounded-xl border border-outline-variant bg-surface px-3 py-2 font-body-md text-body-md text-on-surface outline-none"
                    />
                    <button
                      type="button"
                      disabled={sendingEmail || !emailClient}
                      onClick={handleSendReportEmail}
                      className="w-full flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 font-label-md text-label-md font-bold text-on-primary hover:bg-primary/90 disabled:opacity-50"
                    >
                      <span className="material-symbols-outlined text-[18px]">outgoing_mail</span>
                      {sendingEmail ? "Envoi du rapport..." : "Envoyer le rapport"}
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Sélecteur de statut libre pour cas exceptionnels (Retardée, Annulée) */}
            <div className="pt-2">
              <details className="text-xs text-outline cursor-pointer">
                <summary className="font-semibold hover:text-on-surface py-1">
                  Changement de statut alternatif (Retardée, Annulée)...
                </summary>
                <div className="mt-2 flex flex-wrap gap-2 pt-2 border-t border-surface-container-high">
                  {getNextStatuses(selectedOp.statut).map((st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => setNextStatut(st)}
                      className={`rounded-xl border px-3 py-1.5 font-label-sm text-label-sm transition-all ${
                        nextStatut === st
                          ? "border-primary bg-primary-container font-bold text-on-primary"
                          : "border-outline-variant bg-surface text-on-surface-variant hover:bg-surface-container-high"
                      }`}
                    >
                      Passer à « {st} »
                    </button>
                  ))}
                </div>
                {nextStatut && (
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => handleUpdateStatus(nextStatut as OperationStatus)}
                    className="mt-3 w-full rounded-xl bg-surface-container-high px-3 py-2 font-label-md text-label-md font-bold text-on-surface hover:bg-surface-container-highest"
                  >
                    Valider le statut « {nextStatut} »
                  </button>
                )}
              </details>
            </div>
          </div>

          <TracabiliteOperation operationId={selectedOp._id} canEdit={canEditTraceabilite} />
        </div>
      ) : (
        /* Liste des opérations du chauffeur */
        <div className="space-y-3">
          {loading ? (
            <div className="p-gutter-md text-center text-outline">Chargement des opérations...</div>
          ) : listError ? (
            <div role="alert" className="rounded-xl border border-error/30 bg-error-container p-gutter-md text-center text-on-error-container">
              <p>{listError}</p>
              <button
                type="button"
                onClick={() => void fetchTerrainOps()}
                className="mt-3 rounded-lg bg-primary px-4 py-2 font-label-md text-label-md font-semibold text-on-primary"
              >
                Réessayer
              </button>
            </div>
          ) : operationsAffichees.length === 0 ? (
            <div className="rounded-xl border border-surface-container-high bg-surface-container-lowest p-gutter-md text-center text-outline">
              Aucune opération affectée à votre équipe.
            </div>
          ) : (
            operationsAffichees.map((op) => (
              <button
                key={op._id}
                type="button"
                onClick={() => selectOperation(op)}
                className="w-full text-left rounded-xl border border-surface-container-high bg-surface-container-lowest p-gutter-md shadow-sm transition-all hover:border-primary/50"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="font-headline-sm text-headline-sm font-bold text-on-surface block">
                      {op.natureIntervention}
                    </span>
                    <span className="font-body-md text-body-md font-semibold text-on-surface-variant block mt-0.5">
                      {op.clientId?.nom || "Client inconnu"}
                    </span>
                  </div>
                  <StatusBadge status={op.statut} compact />
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 font-label-sm text-label-sm text-outline">
                  <span className="flex items-center gap-1">
                    <span className="material-symbols-outlined text-[16px]">schedule</span>
                    {new Date(op.dateHeurePrevue).toLocaleTimeString("fr-FR", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                  <span className="flex items-center gap-1 truncate">
                    <span className="material-symbols-outlined text-[16px]">location_on</span>
                    {op.siteId?.nom}
                  </span>
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
