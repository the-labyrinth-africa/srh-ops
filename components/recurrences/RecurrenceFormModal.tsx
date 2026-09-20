"use client";

import { useEffect, useState } from "react";
import { formatApiError } from "@/lib/api-error";

interface Option {
  _id: string;
  nom?: string;
  identification?: string;
}

interface RecurrenceFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  initialData?: {
    _id?: string;
    clientId?: string | { _id: string; nom?: string };
    siteId?: string | { _id: string; nom?: string; adresse?: string };
    natureIntervention?: string;
    frequence?: "hebdomadaire" | "mensuelle" | "personnalisee";
    jourSemaine?: number;
    jourMois?: number;
    intervalleJours?: number;
    heurePrevue?: string;
    dureeEstimeeMinutes?: number;
    equipeId?: string | { _id: string; nom?: string };
    vehiculeId?: string | { _id: string; identification?: string };
    equipementIds?: (string | { _id: string; nom?: string })[];
    informationsParticulieres?: string;
    active?: boolean;
  } | null;
}

export function RecurrenceFormModal({
  isOpen,
  onClose,
  onSuccess,
  initialData,
}: RecurrenceFormModalProps) {
  const [clients, setClients] = useState<Option[]>([]);
  const [sites, setSites] = useState<Option[]>([]);
  const [equipes, setEquipes] = useState<Option[]>([]);
  const [vehicules, setVehicules] = useState<Option[]>([]);
  const [equipements, setEquipements] = useState<Option[]>([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [form, setForm] = useState({
    clientId: "",
    siteId: "",
    natureIntervention: "",
    frequence: "hebdomadaire" as "hebdomadaire" | "mensuelle" | "personnalisee",
    jourSemaine: "1", // Lundi by default
    jourMois: "1",
    intervalleJours: "14",
    heurePrevue: "08:00",
    dureeEstimeeMinutes: "120",
    equipeId: "",
    vehiculeId: "",
    equipementIds: [] as string[],
    informationsParticulieres: "",
    active: true,
  });

  useEffect(() => {
    if (isOpen) {
      Promise.all([
        fetch("/api/clients").then((r) => r.json()),
        fetch("/api/equipes").then((r) => r.json()),
        fetch("/api/vehicules").then((r) => r.json()),
        fetch("/api/equipements").then((r) => r.json()),
      ]).then(([c, e, v, eq]) => {
        setClients(Array.isArray(c) ? c : []);
        setEquipes(Array.isArray(e) ? e : []);
        setVehicules(Array.isArray(v) ? v : []);
        setEquipements(Array.isArray(eq) ? eq : []);
      });
    }
  }, [isOpen]);

  useEffect(() => {
    if (initialData) {
      const clientId =
        typeof initialData.clientId === "object"
          ? (initialData.clientId as { _id: string })._id
          : initialData.clientId || "";

      const siteId =
        typeof initialData.siteId === "object"
          ? (initialData.siteId as { _id: string })._id
          : initialData.siteId || "";

      const equipeId =
        typeof initialData.equipeId === "object"
          ? (initialData.equipeId as { _id: string })._id
          : initialData.equipeId || "";

      const vehiculeId =
        typeof initialData.vehiculeId === "object"
          ? (initialData.vehiculeId as { _id: string })._id
          : initialData.vehiculeId || "";

      const equipementIds = (initialData.equipementIds || []).map((eq) =>
        typeof eq === "object" ? (eq as { _id: string })._id : eq
      );

      setForm({
        clientId,
        siteId,
        natureIntervention: initialData.natureIntervention || "",
        frequence: initialData.frequence || "hebdomadaire",
        jourSemaine: initialData.jourSemaine?.toString() ?? "1",
        jourMois: initialData.jourMois?.toString() ?? "1",
        intervalleJours: initialData.intervalleJours?.toString() ?? "14",
        heurePrevue: initialData.heurePrevue || "08:00",
        dureeEstimeeMinutes: initialData.dureeEstimeeMinutes?.toString() ?? "120",
        equipeId,
        vehiculeId,
        equipementIds,
        informationsParticulieres: initialData.informationsParticulieres || "",
        active: initialData.active ?? true,
      });

      if (clientId) {
        fetch(`/api/sites?clientId=${clientId}`)
          .then((r) => r.json())
          .then((data) => setSites(Array.isArray(data) ? data : []));
      }
    } else {
      setForm({
        clientId: "",
        siteId: "",
        natureIntervention: "",
        frequence: "hebdomadaire",
        jourSemaine: "1",
        jourMois: "1",
        intervalleJours: "14",
        heurePrevue: "08:00",
        dureeEstimeeMinutes: "120",
        equipeId: "",
        vehiculeId: "",
        equipementIds: [],
        informationsParticulieres: "",
        active: true,
      });
      setSites([]);
    }
  }, [initialData, isOpen]);

  useEffect(() => {
    if (form.clientId) {
      fetch(`/api/sites?clientId=${form.clientId}`)
        .then((r) => r.json())
        .then((data) => setSites(Array.isArray(data) ? data : []));
    } else {
      setSites([]);
    }
  }, [form.clientId]);

  if (!isOpen) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const payload = {
      ...form,
      jourSemaine: form.frequence === "hebdomadaire" ? parseInt(form.jourSemaine, 10) : undefined,
      jourMois: form.frequence === "mensuelle" ? parseInt(form.jourMois, 10) : undefined,
      intervalleJours: form.frequence === "personnalisee" ? parseInt(form.intervalleJours, 10) : undefined,
      dureeEstimeeMinutes: parseInt(form.dureeEstimeeMinutes, 10),
    };

    const isEdit = Boolean(initialData?._id);
    const url = isEdit ? `/api/recurrences/${initialData!._id}` : "/api/recurrences";
    const method = isEdit ? "PUT" : "POST";

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    setLoading(false);

    if (!res.ok) {
      setError(formatApiError(data.error, "Une erreur est survenue"));
      return;
    }

    onSuccess();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-inverse-surface/40 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="w-full max-w-2xl rounded-2xl bg-surface-container-lowest p-6 shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b pb-4 mb-4">
          <h2 className="font-headline-sm text-headline-sm text-on-surface">
            {initialData?._id ? "Modifier la programmation récurrente" : "Nouvelle collecte récurrente"}
          </h2>
          <button onClick={onClose} className="rounded-lg p-1 hover:bg-surface-container-high">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded-xl bg-error-container p-3 font-body-md text-body-md text-on-error-container">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block font-label-md text-label-md text-on-surface-variant">Client *</label>
              <select
                required
                value={form.clientId}
                onChange={(e) => setForm({ ...form, clientId: e.target.value, siteId: "" })}
                className="h-11 w-full rounded-xl bg-surface-container-low px-3 font-body-md text-body-md outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="">Sélectionner...</option>
                {clients.map((c) => (
                  <option key={c._id} value={c._id}>{c.nom}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block font-label-md text-label-md text-on-surface-variant">Site *</label>
              <select
                required
                disabled={!form.clientId}
                value={form.siteId}
                onChange={(e) => setForm({ ...form, siteId: e.target.value })}
                className="h-11 w-full rounded-xl bg-surface-container-low px-3 font-body-md text-body-md outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
              >
                <option value="">Sélectionner...</option>
                {sites.map((s) => (
                  <option key={s._id} value={s._id}>{s.nom}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="mb-1 block font-label-md text-label-md text-on-surface-variant">Nature de l&apos;intervention *</label>
            <input
              required
              value={form.natureIntervention}
              onChange={(e) => setForm({ ...form, natureIntervention: e.target.value })}
              placeholder="Ex: Vidange et pompage récurrent"
              className="h-11 w-full rounded-xl bg-surface-container-low px-3 font-body-md text-body-md outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div>
              <label className="mb-1 block font-label-md text-label-md text-on-surface-variant">Fréquence *</label>
              <select
                value={form.frequence}
                onChange={(e) => setForm({ ...form, frequence: e.target.value as "hebdomadaire" | "mensuelle" | "personnalisee" })}
                className="h-11 w-full rounded-xl bg-surface-container-low px-3 font-body-md text-body-md outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="hebdomadaire">Hebdomadaire</option>
                <option value="mensuelle">Mensuelle</option>
                <option value="personnalisee">Personnalisée (Intervalle)</option>
              </select>
            </div>

            {form.frequence === "hebdomadaire" && (
              <div>
                <label className="mb-1 block font-label-md text-label-md text-on-surface-variant">Jour de la semaine</label>
                <select
                  value={form.jourSemaine}
                  onChange={(e) => setForm({ ...form, jourSemaine: e.target.value })}
                  className="h-11 w-full rounded-xl bg-surface-container-low px-3 font-body-md text-body-md outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="1">Lundi</option>
                  <option value="2">Mardi</option>
                  <option value="3">Mercredi</option>
                  <option value="4">Jeudi</option>
                  <option value="5">Vendredi</option>
                  <option value="6">Samedi</option>
                  <option value="0">Dimanche</option>
                </select>
              </div>
            )}

            {form.frequence === "mensuelle" && (
              <div>
                <label className="mb-1 block font-label-md text-label-md text-on-surface-variant">Jour du mois (1-31)</label>
                <input
                  type="number"
                  min={1}
                  max={31}
                  value={form.jourMois}
                  onChange={(e) => setForm({ ...form, jourMois: e.target.value })}
                  className="h-11 w-full rounded-xl bg-surface-container-low px-3 font-body-md text-body-md outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
            )}

            {form.frequence === "personnalisee" && (
              <div>
                <label className="mb-1 block font-label-md text-label-md text-on-surface-variant">Intervalle (en jours)</label>
                <input
                  type="number"
                  min={1}
                  value={form.intervalleJours}
                  onChange={(e) => setForm({ ...form, intervalleJours: e.target.value })}
                  className="h-11 w-full rounded-xl bg-surface-container-low px-3 font-body-md text-body-md outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
            )}

            <div>
              <label className="mb-1 block font-label-md text-label-md text-on-surface-variant">Heure prévue (HH:mm)</label>
              <input
                type="time"
                value={form.heurePrevue}
                onChange={(e) => setForm({ ...form, heurePrevue: e.target.value })}
                className="h-11 w-full rounded-xl bg-surface-container-low px-3 font-body-md text-body-md outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block font-label-md text-label-md text-on-surface-variant">Équipe par défaut</label>
              <select
                value={form.equipeId}
                onChange={(e) => setForm({ ...form, equipeId: e.target.value })}
                className="h-11 w-full rounded-xl bg-surface-container-low px-3 font-body-md text-body-md outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="">Non affectée</option>
                {equipes.map((e) => (
                  <option key={e._id} value={e._id}>{e.nom}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block font-label-md text-label-md text-on-surface-variant">Véhicule par défaut</label>
              <select
                value={form.vehiculeId}
                onChange={(e) => setForm({ ...form, vehiculeId: e.target.value })}
                className="h-11 w-full rounded-xl bg-surface-container-low px-3 font-body-md text-body-md outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="">Non affecté</option>
                {vehicules.map((v) => (
                  <option key={v._id} value={v._id}>{v.identification}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="mb-1 block font-label-md text-label-md text-on-surface-variant">Équipements récurrents</label>
            <div className="flex max-h-32 flex-col gap-2 overflow-y-auto rounded-xl bg-surface-container-low p-3">
              {equipements.map((eq) => (
                <label key={eq._id} className="flex items-center gap-2 font-body-md text-body-md text-on-surface cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.equipementIds.includes(eq._id)}
                    onChange={(e) => {
                      const ids = e.target.checked
                        ? [...form.equipementIds, eq._id]
                        : form.equipementIds.filter((id) => id !== eq._id);
                      setForm({ ...form, equipementIds: ids });
                    }}
                    className="accent-primary"
                  />
                  {eq.nom}
                </label>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2 pt-2">
            <input
              type="checkbox"
              id="activeRec"
              checked={form.active}
              onChange={(e) => setForm({ ...form, active: e.target.checked })}
              className="h-4 w-4 accent-primary"
            />
            <label htmlFor="activeRec" className="font-body-md text-body-md text-on-surface cursor-pointer">
              Programmation active
            </label>
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl bg-surface-container-high px-4 py-2.5 font-label-md text-label-md text-on-surface"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 font-label-md text-label-md text-on-primary hover:bg-primary-container disabled:opacity-50"
            >
              <span className="material-symbols-outlined text-[18px]">save</span>
              {loading ? "Enregistrement..." : "Enregistrer"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
