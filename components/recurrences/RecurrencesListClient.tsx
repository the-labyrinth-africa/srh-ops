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
  const [message, setMessage] = useState("");

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<RecurrenceItem | null>(null);

  const fetchRecurrences = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/recurrences");
      const data = await res.json();
      setItems(data.items || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRecurrences();
  }, [fetchRecurrences]);

  async function handleGenerateNow() {
    setGenerating(true);
    setMessage("");
    try {
      const res = await fetch("/api/recurrences/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ horizonDays: 30 }),
      });
      const data = await res.json();
      setMessage(data.message || "Génération terminée.");
      fetchRecurrences();
    } catch (err) {
      setMessage("Erreur lors de la génération automatique.");
      console.error(err);
    } finally {
      setGenerating(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Voulez-vous vraiment supprimer cette programmation récurrente ?")) return;
    try {
      await fetch(`/api/recurrences/${id}`, { method: "DELETE" });
      fetchRecurrences();
    } catch (err) {
      console.error(err);
    }
  }

  function formatFrequenceText(item: RecurrenceItem) {
    if (item.frequence === "hebdomadaire") {
      const jour = item.jourSemaine !== undefined ? JOURS_SEMAINE[item.jourSemaine] : "jour";
      return `Hebdomadaire (Chaque ${jour})`;
    }
    if (item.frequence === "mensuelle") {
      return `Mensuelle (Le ${item.jourMois ?? 1} du mois)`;
    }
    if (item.frequence === "personnalisee") {
      return `Tous les ${item.intervalleJours ?? 14} jours`;
    }
    return item.frequence;
  }

  return (
    <div className="flex flex-col gap-gutter-md px-margin-mobile py-gutter-md lg:px-margin-desktop">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="font-headline-lg-mobile text-headline-lg-mobile text-on-surface lg:font-headline-lg lg:text-headline-lg">
            Collectes Récurrentes
          </h1>
          <p className="mt-1 font-body-md text-body-md text-on-surface-variant">
            Programmation et génération automatique des interventions périodiques (Section 4 du Cadrage).
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={handleGenerateNow}
            disabled={generating}
            className="flex items-center gap-2 rounded-xl bg-secondary px-4 py-2.5 font-label-md text-label-md text-on-secondary shadow-sm hover:opacity-90 disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-[18px]">autorenew</span>
            {generating ? "Génération..." : "Générer les 30 prochains jours"}
          </button>
          <button
            onClick={() => {
              setEditingItem(null);
              setIsModalOpen(true);
            }}
            className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 font-label-md text-label-md text-on-primary shadow-sm hover:bg-primary-container"
          >
            <span className="material-symbols-outlined text-[18px]">add</span>
            Nouvelle récurrence
          </button>
        </div>
      </div>

      {message && (
        <div className="rounded-xl bg-surface-container-high p-4 font-body-md text-body-md text-primary font-bold">
          {message}
        </div>
      )}

      <div className="rounded-2xl bg-surface-container-lowest shadow-sm overflow-hidden border">
        {loading ? (
          <div className="p-8 text-center font-body-md text-on-surface-variant">Chargement des programmations...</div>
        ) : items.length === 0 ? (
          <div className="p-8 text-center font-body-md text-on-surface-variant">
            Aucune programmation récurrente configurée. Cliquez sur &quot;Nouvelle récurrence&quot; pour en ajouter une.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left font-body-md text-body-md">
              <thead className="bg-surface-container-low font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-3">Client & Site</th>
                  <th className="px-4 py-3">Nature</th>
                  <th className="px-4 py-3">Fréquence</th>
                  <th className="px-4 py-3">Heure</th>
                  <th className="px-4 py-3">Affectations</th>
                  <th className="px-4 py-3">Statut</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {items.map((item) => (
                  <tr key={item._id} className="hover:bg-surface-container-low/50">
                    <td className="px-4 py-3">
                      <div className="font-bold text-on-surface">{item.clientId?.nom || "Client inconnu"}</div>
                      <div className="text-xs text-on-surface-variant">{item.siteId?.nom || "Site inconnu"}</div>
                    </td>
                    <td className="px-4 py-3 font-medium text-on-surface">{item.natureIntervention}</td>
                    <td className="px-4 py-3 text-on-surface-variant">
                      <div className="flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-[16px] text-primary">update</span>
                        {formatFrequenceText(item)}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-on-surface font-semibold">{item.heurePrevue}</td>
                    <td className="px-4 py-3 text-xs text-on-surface-variant">
                      <div>Equipe: {item.equipeId?.nom || "—"}</div>
                      <div>Véhicule: {item.vehiculeId?.identification || "—"}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold ${
                          item.active
                            ? "bg-status-completed/10 text-status-completed"
                            : "bg-outline/10 text-outline"
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
