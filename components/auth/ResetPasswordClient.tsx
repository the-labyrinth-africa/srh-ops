"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { formatApiError } from "@/lib/api-error";
import { validateNewPassword } from "@/lib/validators/password-form";

const GENERIC_ERROR = "Le service est momentanément indisponible. Réessayez dans quelques instants.";
const INVALID_LINK_MESSAGE = "Lien invalide ou expiré. Demandez un nouveau lien.";
// Début du message constant renvoyé par l'API pour un jeton refusé.
const INVALID_LINK_PREFIX = "Lien invalide";

const INPUT_CLASS =
  "h-12 w-full rounded-DEFAULT border-none bg-surface-container-low pl-10 pr-4 font-body-md text-body-md text-on-surface outline-none transition-all placeholder:text-on-surface-variant/40 focus:bg-surface-container-lowest focus:ring-2 focus:ring-primary";

function NewLinkButton() {
  return (
    <Link
      href="/forgot-password"
      className="flex h-12 items-center justify-center gap-2 rounded-xl bg-primary font-label-md text-label-md text-on-primary"
    >
      Demander un nouveau lien
    </Link>
  );
}

export default function ResetPasswordClient() {
  const searchParams = useSearchParams();
  // Le jeton n'est lu qu'une fois, gardé en mémoire uniquement (jamais affiché ni stocké).
  const [token] = useState(() => searchParams.get("token") ?? "");
  const [newPassword, setNewPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [linkRejected, setLinkRejected] = useState(false);
  const [done, setDone] = useState(false);

  // Retire le jeton de l'URL (historique, Referer, captures d'écran).
  useEffect(() => {
    if (window.location.search) {
      window.history.replaceState(null, "", "/reset-password");
    }
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;

    const localError = validateNewPassword(newPassword, confirmation);
    if (localError) {
      setError(localError);
      return;
    }

    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newPassword }),
      });
      const data = await res.json().catch(() => ({}));

      if (res.ok) {
        setNewPassword("");
        setConfirmation("");
        setDone(true);
        return;
      }

      const message = formatApiError(data?.error, GENERIC_ERROR);
      if (res.status === 400 && message.startsWith(INVALID_LINK_PREFIX)) {
        setLinkRejected(true);
      }
      setError(message);
    } catch {
      setError(GENERIC_ERROR);
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <div className="flex flex-col gap-6">
        <div
          role="status"
          className="rounded-xl bg-surface-container-low p-4 text-center font-body-md text-body-md text-on-surface"
        >
          Mot de passe modifié. Vous pouvez maintenant vous connecter.
        </div>
        <Link
          href="/login"
          className="flex h-12 items-center justify-center gap-2 rounded-xl bg-primary font-label-md text-label-md text-on-primary"
        >
          Aller à la connexion
        </Link>
      </div>
    );
  }

  if (!token || linkRejected) {
    return (
      <div className="flex flex-col gap-6">
        <div
          role="alert"
          className="rounded-xl bg-error-container/40 p-4 text-center font-body-md text-body-md text-on-error-container"
        >
          {error || INVALID_LINK_MESSAGE}
        </div>
        <NewLinkButton />
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      {error && (
        <div role="alert" className="rounded-DEFAULT bg-error-container px-4 py-3 font-body-md text-body-md text-on-error-container">
          {error}
        </div>
      )}

      <div className="relative flex flex-col gap-1">
        <label htmlFor="new-password" className="font-label-sm text-label-sm uppercase tracking-wider text-on-surface">
          Nouveau mot de passe
        </label>
        <div className="relative flex items-center">
          <span className="material-symbols-outlined pointer-events-none absolute left-3 text-on-surface-variant/50">
            lock
          </span>
          <input
            id="new-password"
            type="password"
            required
            minLength={6}
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="••••••••"
            className={INPUT_CLASS}
          />
        </div>
      </div>

      <div className="relative flex flex-col gap-1">
        <label htmlFor="confirm-password" className="font-label-sm text-label-sm uppercase tracking-wider text-on-surface">
          Confirmation
        </label>
        <div className="relative flex items-center">
          <span className="material-symbols-outlined pointer-events-none absolute left-3 text-on-surface-variant/50">
            lock
          </span>
          <input
            id="confirm-password"
            type="password"
            required
            minLength={6}
            autoComplete="new-password"
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            placeholder="••••••••"
            className={INPUT_CLASS}
          />
        </div>
      </div>

      <button
        type="submit"
        disabled={loading}
        className="relative flex h-12 w-full items-center justify-center overflow-hidden rounded-DEFAULT bg-primary font-label-md text-label-md text-on-primary shadow-sm transition-all hover:bg-surface-tint hover:shadow-md active:scale-[0.98] disabled:opacity-70"
      >
        {loading ? (
          <span className="material-symbols-outlined animate-spin text-[20px]">progress_activity</span>
        ) : (
          "Modifier le mot de passe"
        )}
      </button>

      <Link href="/login" className="text-center font-label-sm text-label-sm text-primary hover:underline">
        Retour à la connexion
      </Link>
    </form>
  );
}
