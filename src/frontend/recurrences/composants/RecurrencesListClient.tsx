"use client";

import { useEffect, useState, useCallback } from "react";
import { RecurrenceFormModal } from "./RecurrenceFormModal";

interface RecurrenceItem {
  _id: string;
  clientId?: { _id: string; nom: string };
  siteId?: { _id: string; nom: string; adresse: string };
  natureIntervention: string;
  frequence: "hebdomadaire" | "mensuelle" | "personnalisee";
  jourSemaine?: number;
  jourMois?: number;
  intervalleJours?: number;
  heurePrevue: string;
  equipeId?: { _id: string; nom: string };
  vehiculeId?: { _id: string; identification: string };
  active: boolean;
  derniereGeneration?: string;
}

const JOURS_SEMAINE = [
  "Dimanche",
  "Lundi",
  "Mardi",
  "Mercredi",
  "Jeudi",
  "Vendredi",
  "Samedi",
];

export function RecurrencesListClient() {
  const [items, setItems] = useState<RecurrenceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [genMessage, setGenMessage] = useState("");

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<RecurrenceItem | null>(null);

  const fetchRecurrences = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/recurrences");
      const data = await res.json();
      setItems(Array.isArray(data) ? data : []);
    } catch {
      // Ignorer
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRecurrences();
  }, [fetchRecurrences]);

  async function handleDelete(id: string) {
    if (!confirm("Voulez-vous vraiment supprimer cette programmation récurrente ?")) return;
    try {
      const res = await fetch(`/api/recurrences/${id}`, { method: "DELETE" });
      if (res.ok) fetchRecurrences();
    } catch {
      // Ignorer
    }
  }

  async function handleGenerate(horizonDays = 30) {
    setGenerating(true);
    setGenMessage("");
    try {
      const res = await fetch("/api/recurrences/generer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ horizonDays }),
      });
      const data = await res.json();
      if (res.ok) {
        setGenMessage(
          `${data.operationsCrees} opérations générées sur l'horizon de ${horizonDays} jours.`
        );
        fetchRecurrences();
      } else {
        setGenMessage(data.error || "Erreur lors de la génération.");
      }
    } catch {
      setGenMessage("Erreur réseau.");
    } finally {
      setGenerating(false);
    }
  }

  function formatFrequence(item: RecurrenceItem) {
    if (item.frequence === "hebdomadaire") {
      const j = item.jourSemaine !== undefined ? JOURS_SEMAINE[item.jourSemaine] : "Lundi";
      return `Chaque ${j} à ${item.heurePrevue}`;
    }
    if (item.frequence === "mensuelle") {
      return `Chaque ${item.jourMois ?? 1} du mois à ${item.heurePrevue}`;
    }
    return `Tous les ${item.intervalleJours ?? 14} jours à ${item.heurePrevue}`;
  }

  return (
    <div className="flex flex-col gap-gutter-md px-margin-mobile py-gutter-md lg:px-margin-desktop">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="font-headline-lg-mobile text-headline-lg-mobile font-bold text-on-surface lg:font-headline-lg lg:text-headline-lg">
            Programmation des Collectes Récurrentes
          </h1>
          <p className="mt-1 font-body-md text-body-md text-on-surface-variant">
            Planifiez la création automatique des opérations régulières (hebdomadaires, mensuelles ou à intervalle fixe).
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => handleGenerate(30)}
            disabled={generating}
            className="flex items-center gap-2 rounded-xl border border-primary px-4 py-2.5 font-label-md text-label-md font-semibold text-primary hover:bg-primary-container/20 disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-[18px]">autorenew</span>
            {generating ? "Génération..." : "Générer les 30 prochains jours"}
          </button>
          <button
            onClick={() => {
              setEditingItem(null);
              setIsModalOpen(true);
            }}
            className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 font-label-md text-label-md font-semibold text-on-primary shadow-sm hover:bg-primary-container"
          >
            <span className="material-symbols-outlined text-[18px]">add</span>
            Nouvelle récurrence
          </button>
        </div>
      </div>

      {genMessage && (
        <div className="rounded-xl border border-primary/30 bg-surface-container-low p-4 font-body-md text-body-md text-on-surface">
          {genMessage}
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border bg-surface-container-lowest shadow-sm">
        {loading ? (
          <div className="p-8 text-center font-body-md text-on-surface-variant">Chargement...</div>
        ) : items.length === 0 ? (
          <div className="p-8 text-center font-body-md text-on-surface-variant">
            Aucune collecte récurrente programmée.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left font-body-md text-body-md">
              <thead className="bg-surface-container-low font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-3">Client / Site</th>
                  <th className="px-4 py-3">Nature</th>
                  <th className="px-4 py-3">Fréquence & Heure</th>
                  <th className="px-4 py-3">Équipe / Véhicule</th>
                  <th className="px-4 py-3">Statut</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {items.map((item) => (
                  <tr key={item._id} className="hover:bg-surface-container-low/50">
                    <td className="px-4 py-3 font-bold text-on-surface">
                      <div>{item.clientId?.nom || "—"}</div>
                      <div className="text-xs font-normal text-on-surface-variant">{item.siteId?.nom}</div>
                    </td>
                    <td className="px-4 py-3 text-on-surface font-semibold">{item.natureIntervention}</td>
                    <td className="px-4 py-3 text-xs text-on-surface-variant">{formatFrequence(item)}</td>
                    <td className="px-4 py-3 text-xs text-on-surface-variant">
                      <div>{item.equipeId?.nom || "Non affectée"}</div>
                      <div className="text-outline">{item.vehiculeId?.identification}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold ${
                          item.active
                            ? "bg-status-completed/10 text-status-completed border border-status-completed/30"
                            : "bg-surface-container-high text-outline"
                        }`}
                      >
                        {item.active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => {
                            setEditingItem(item);
                            setIsModalOpen(true);
                          }}
                          className="rounded-lg p-1.5 text-on-surface-variant hover:bg-surface-container-high hover:text-primary"
                          title="Modifier"
                        >
                          <span className="material-symbols-outlined text-[18px]">edit</span>
                        </button>
                        <button
                          onClick={() => handleDelete(item._id)}
                          className="rounded-lg p-1.5 text-error hover:bg-error-container/20"
                          title="Supprimer"
                        >
                          <span className="material-symbols-outlined text-[18px]">delete</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <RecurrenceFormModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSuccess={fetchRecurrences}
        initialData={editingItem}
      />
    </div>
  );
}
