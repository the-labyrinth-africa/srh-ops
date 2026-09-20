"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { UserFormModal } from "./UserFormModal";
import { TemporaryPasswordPanel } from "./TemporaryPasswordPanel";
import { roleLabel } from "@/lib/permissions";
import { formatApiError } from "@/lib/api-error";

interface UserItem {
  _id: string;
  username: string;
  nom: string;
  email: string;
  role: string;
  telephone?: string;
  clientId?: { _id: string; nom: string };
  equipeId?: { _id: string; nom: string };
  mustChangePassword?: boolean;
}

export function UsersListClient() {
  const [users, setUsers] = useState<UserItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [roleFilter, setRoleFilter] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserItem | null>(null);

  // Mot de passe régénéré : uniquement en mémoire (état React), jamais persisté.
  const [resetResult, setResetResult] = useState<{ nom: string; password: string } | null>(null);
  // Identifiant de l'utilisateur dont une action de ligne (régénérer, envoyer un lien, modifier, supprimer)
  // est en cours : garde anti-double-clic UNIQUE et partagée par les quatre actions.
  const [busyId, setBusyId] = useState<string | null>(null);
  // Miroir synchrone de busyId : le state ne se met à jour qu'au rendu suivant,
  // ce qui laisserait passer deux appels dans le même tick.
  const busyRef = useRef<string | null>(null);
  // Action en cours de la ligne verrouillée (libellé de progression).
  const [busyAction, setBusyAction] = useState<"reset" | "link" | "delete" | null>(null);

  function lock(id: string, action: "reset" | "link" | "delete" | null): boolean {
    if (busyRef.current !== null) return false;
    busyRef.current = id;
    setBusyId(id);
    setBusyAction(action);
    return true;
  }

  function unlock() {
    busyRef.current = null;
    setBusyId(null);
    setBusyAction(null);
  }

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const query = roleFilter ? `?role=${roleFilter}` : "";
      const res = await fetch(`/api/users${query}`);
      const data = await res.json();
      setUsers(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [roleFilter]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  async function handleDelete(id: string) {
    if (busyRef.current !== null) return;
    if (!confirm("Voulez-vous vraiment supprimer cet utilisateur ?")) return;
    if (!lock(id, "delete")) return;
    try {
      const res = await fetch(`/api/users/${id}`, { method: "DELETE" });
      if (res.ok) {
        fetchUsers();
      } else {
        const data = await res.json();
        alert(formatApiError(data.error, "Erreur lors de la suppression"));
      }
    } catch (err) {
      console.error(err);
    } finally {
      unlock();
    }
  }

  async function handleResetPassword(user: UserItem) {
    if (busyRef.current !== null) return;
    if (
      !confirm(
        `Régénérer le mot de passe de ${user.nom} ? L'ancien mot de passe ne fonctionnera plus et l'utilisateur devra en choisir un nouveau à sa prochaine connexion.`
      )
    ) {
      return;
    }
    if (!lock(user._id, "reset")) return;
    try {
      const res = await fetch(`/api/users/${user._id}/reset-password`, { method: "POST" });
      const data = await res.json();
      // Ne publier le résultat que si cette requête est toujours la requête courante.
      if (busyRef.current !== user._id) return;
      if (res.ok && typeof data.generatedPassword === "string") {
        setResetResult({ nom: user.nom, password: data.generatedPassword });
      } else {
        alert(formatApiError(data.error, "Erreur lors de la régénération du mot de passe"));
      }
    } catch {
      alert("Erreur lors de la régénération du mot de passe");
    } finally {
      unlock();
    }
  }

  async function handleSendResetLink(user: UserItem) {
    if (busyRef.current !== null) return;
    if (!confirm(`Envoyer un lien de réinitialisation du mot de passe à ${user.email} ?`)) return;
    if (!lock(user._id, "link")) return;
    try {
      const res = await fetch(`/api/users/${user._id}/send-reset-link`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.sent === true) {
        alert(`Lien envoyé à ${user.email}.`);
      } else if (res.status === 502) {
        alert("L'envoi a échoué : vérifiez les paramètres SMTP.");
      } else {
        alert(formatApiError(data.error, "Erreur lors de l'envoi du lien"));
      }
    } catch {
      alert("Erreur lors de l'envoi du lien");
    } finally {
      unlock();
    }
  }

  const filteredUsers = users.filter((u) => {
    const query = searchQuery.toLowerCase();
    return (
      u.nom.toLowerCase().includes(query) ||
      u.username.toLowerCase().includes(query) ||
      u.email.toLowerCase().includes(query)
    );
  });

  return (
    <div className="flex flex-col gap-gutter-md px-margin-mobile py-gutter-md lg:px-margin-desktop">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="font-headline-lg-mobile text-headline-lg-mobile text-on-surface lg:font-headline-lg lg:text-headline-lg">
            Gestion des Utilisateurs & Accès
          </h1>
          <p className="mt-1 font-body-md text-body-md text-on-surface-variant">
            Gestion des comptes, attribution des 5 rôles métier et communication des accès par un administrateur (invitation par e-mail à la création ; mot de passe temporaire affiché en repli ou à la régénération).
          </p>
        </div>
        <div>
          <button
            onClick={() => {
              setEditingUser(null);
              setIsModalOpen(true);
            }}
            className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 font-label-md text-label-md text-on-primary shadow-sm hover:bg-primary-container"
          >
            <span className="material-symbols-outlined text-[18px]">person_add</span>
            Ajouter un utilisateur
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-4 rounded-xl bg-surface-container-lowest p-4 shadow-sm md:flex-row md:items-center md:justify-between">
        <div className="relative flex-1 max-w-md">
          <span className="material-symbols-outlined absolute left-3 top-2.5 text-[20px] text-on-surface-variant">
            search
          </span>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Rechercher par nom, username, email..."
            className="h-10 w-full rounded-xl bg-surface-container-low pl-10 pr-4 font-body-md text-body-md outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="font-label-md text-label-md text-on-surface-variant">Filtrer par rôle:</label>
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="h-10 rounded-xl bg-surface-container-low px-3 font-body-md text-body-md outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="">Tous les rôles</option>
            <option value="admin">Administrateur System</option>
            <option value="dispatcher">Dispatcher</option>
            <option value="chauffeur">Chauffeur / Terrain</option>
            <option value="client">Client</option>
            <option value="lecture">Lecture seule</option>
          </select>
        </div>
      </div>

      <div className="rounded-2xl bg-surface-container-lowest shadow-sm overflow-hidden border">
        {loading ? (
          <div className="p-8 text-center font-body-md text-on-surface-variant">Chargement des utilisateurs...</div>
        ) : filteredUsers.length === 0 ? (
          <div className="p-8 text-center font-body-md text-on-surface-variant">
            Aucun utilisateur trouvé.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left font-body-md text-body-md">
              <thead className="bg-surface-container-low font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-3">Utilisateur</th>
                  <th className="px-4 py-3">Identifiant / Email</th>
                  <th className="px-4 py-3">Rôle attribué</th>
                  <th className="px-4 py-3">Rattachement</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filteredUsers.map((u) => (
                  <tr key={u._id} className="hover:bg-surface-container-low/50">
                    <td className="px-4 py-3 font-bold text-on-surface">
                      <div>{u.nom}</div>
                      {u.telephone && <div className="text-xs text-on-surface-variant font-normal">{u.telephone}</div>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-mono text-xs font-semibold text-primary">@{u.username}</div>
                      <div className="text-xs text-on-surface-variant">{u.email}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1 rounded-full bg-surface-container-high px-2.5 py-1 text-xs font-bold text-on-surface">
                        {roleLabel(u.role)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-on-surface-variant">
                      {u.clientId?.nom ? (
                        <div>Client: <strong className="text-on-surface">{u.clientId.nom}</strong></div>
                      ) : u.equipeId?.nom ? (
                        <div>Équipe: <strong className="text-on-surface">{u.equipeId.nom}</strong></div>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => {
                            if (busyRef.current !== null) return;
                            setEditingUser(u);
                            setIsModalOpen(true);
                          }}
                          disabled={busyId !== null}
                          className="rounded-lg p-1.5 text-on-surface-variant hover:bg-surface-container-high hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
                          title="Modifier"
                        >
                          <span className="material-symbols-outlined text-[18px]">edit</span>
                        </button>
                        <button
                          onClick={() => handleResetPassword(u)}
                          disabled={busyId !== null}
                          className="flex items-center gap-1 rounded-lg p-1.5 text-on-surface-variant hover:bg-surface-container-high hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
                          title="Régénérer le mot de passe"
                          aria-label="Régénérer le mot de passe"
                        >
                          <span className="material-symbols-outlined text-[18px]">key</span>
                          {busyId === u._id && busyAction === "reset" && <span className="text-xs">Régénération…</span>}
                        </button>
                        <button
                          onClick={() => handleSendResetLink(u)}
                          disabled={busyId !== null}
                          className="flex items-center gap-1 rounded-lg p-1.5 text-on-surface-variant hover:bg-surface-container-high hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
                          title="Envoyer un lien de réinitialisation"
                          aria-label="Envoyer un lien de réinitialisation"
                        >
                          <span className="material-symbols-outlined text-[18px]">forward_to_inbox</span>
                          {busyId === u._id && busyAction === "link" && <span className="text-xs">Envoi…</span>}
                        </button>
                        <button
                          onClick={() => handleDelete(u._id)}
                          disabled={busyId !== null}
                          className="rounded-lg p-1.5 text-error hover:bg-error-container/20 disabled:cursor-not-allowed disabled:opacity-50"
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

      <UserFormModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSuccess={fetchUsers}
        initialData={editingUser}
      />

      {resetResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-inverse-surface/40 backdrop-blur-sm p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="reset-password-title"
            className="w-full max-w-lg rounded-2xl bg-surface-container-lowest p-6 shadow-xl"
          >
            <h2
              id="reset-password-title"
              className="mb-4 border-b pb-4 font-headline-sm text-headline-sm text-on-surface"
            >
              Nouveau mot de passe de {resetResult.nom}
            </h2>
            <div className="space-y-4">
              <TemporaryPasswordPanel password={resetResult.password} />
              <button
                onClick={() => setResetResult(null)}
                className="w-full h-11 rounded-xl bg-primary font-label-md text-label-md text-on-primary"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
