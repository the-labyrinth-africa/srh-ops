"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { formatApiError } from "@/lib/api-error";
import { homePathFor } from "@/lib/page-access";
import { roleLabel } from "@/lib/permissions";

export default function ProfilPage() {
  // useSearchParams impose une frontière Suspense pour le rendu statique.
  return (
    <Suspense fallback={null}>
      <ProfilContent />
    </Suspense>
  );
}

function ProfilContent() {
  const { data: session, update } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const forced = searchParams.get("forcer") === "1" || Boolean(session?.user?.mustChangePassword);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function handlePasswordChange(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setError("Le nouveau mot de passe et sa confirmation ne correspondent pas.");
      return;
    }

    setLoading(true);
    setError("");
    setMessage("");

    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });

      const data = await res.json().catch(() => ({}));
      setLoading(false);

      if (!res.ok) {
        setError(formatApiError(data.error, "Erreur lors de la modification"));
        return;
      }

      setMessage("Mot de passe mis à jour avec succès !");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");

      // Le jeton relit la base : le drapeau « mot de passe temporaire » tombe.
      await update();
      if (forced) router.replace(homePathFor(session?.user?.role));
    } catch (err) {
      setLoading(false);
      setError("Erreur de connexion au serveur");
      console.error(err);
    }
  }

  return (
    <div className="flex flex-col gap-gutter-md px-margin-mobile py-gutter-md lg:px-margin-desktop max-w-4xl">
      <div>
        <h1 className="font-headline-lg-mobile text-headline-lg-mobile text-on-surface lg:font-headline-lg lg:text-headline-lg">
          Mon Compte & Sécurité
        </h1>
        <p className="mt-1 font-body-md text-body-md text-on-surface-variant">
          Informations personnelles et modification de votre mot de passe d&apos;accès.
        </p>
      </div>

      {forced && (
        <div
          role="alert"
          className="rounded-xl bg-error-container p-4 font-body-md text-body-md font-medium text-on-error-container"
        >
          Vous utilisez un mot de passe temporaire : choisissez un nouveau mot de passe pour continuer.
        </div>
      )}

      <div className="grid grid-cols-1 gap-gutter-md md:grid-cols-2">
        <div className="rounded-2xl bg-surface-container-lowest p-6 shadow-sm border space-y-4">
          <h2 className="font-headline-sm text-headline-sm text-on-surface flex items-center gap-2">
            <span className="material-symbols-outlined text-primary">account_circle</span>
            Informations du compte
          </h2>

          <div>
            <label className="text-xs font-label-md text-on-surface-variant uppercase">Nom complet</label>
            <div className="font-body-md text-body-md font-bold text-on-surface">{session?.user?.name || "—"}</div>
          </div>

          <div>
            <label className="text-xs font-label-md text-on-surface-variant uppercase">Nom d&apos;utilisateur</label>
            <div className="font-mono text-sm font-semibold text-primary">@{session?.user?.username || "—"}</div>
          </div>

          <div>
            <label className="text-xs font-label-md text-on-surface-variant uppercase">Adresse e-mail</label>
            <div className="font-body-md text-body-md text-on-surface">{session?.user?.email || "—"}</div>
          </div>

          <div>
            <label className="text-xs font-label-md text-on-surface-variant uppercase">Rôle attribué</label>
            <div>
              <span className="inline-flex items-center gap-1 rounded-full bg-primary-container px-3 py-1 text-xs font-bold text-on-primary">
                {roleLabel(session?.user?.role)}
              </span>
            </div>
          </div>
        </div>

        <div className="rounded-2xl bg-surface-container-lowest p-6 shadow-sm border space-y-4">
          <h2 className="font-headline-sm text-headline-sm text-on-surface flex items-center gap-2">
            <span className="material-symbols-outlined text-primary">lock_reset</span>
            Changer le mot de passe
          </h2>

          {message && (
            <div className="rounded-xl bg-status-completed/10 p-3 font-body-md text-body-md text-status-completed font-medium">
              {message}
            </div>
          )}

          {error && (
            <div className="rounded-xl bg-error-container p-3 font-body-md text-body-md text-on-error-container">
              {error}
            </div>
          )}

          <form onSubmit={handlePasswordChange} className="space-y-4">
            <div>
              <label className="mb-1 block font-label-md text-label-md text-on-surface-variant">
                Mot de passe actuel *
              </label>
              <input
                type="password"
                required
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="h-11 w-full rounded-xl bg-surface-container-low px-3 font-body-md text-body-md outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            <div>
              <label className="mb-1 block font-label-md text-label-md text-on-surface-variant">
                Nouveau mot de passe *
              </label>
              <input
                type="password"
                required
                min={6}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="h-11 w-full rounded-xl bg-surface-container-low px-3 font-body-md text-body-md outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            <div>
              <label className="mb-1 block font-label-md text-label-md text-on-surface-variant">
                Confirmer le nouveau mot de passe *
              </label>
              <input
                type="password"
                required
                min={6}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="h-11 w-full rounded-xl bg-surface-container-low px-3 font-body-md text-body-md outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary font-label-md text-label-md text-on-primary hover:bg-primary-container disabled:opacity-50"
            >
              <span className="material-symbols-outlined text-[18px]">save</span>
              {loading ? "Mise à jour..." : "Mettre à jour le mot de passe"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
