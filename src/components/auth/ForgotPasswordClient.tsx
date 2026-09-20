"use client";

import Link from "next/link";
import { useState } from "react";
import { formatApiError } from "@/lib/api-error";

const GENERIC_ERROR = "Le service est momentanément indisponible. Réessayez dans quelques instants.";

export default function ForgotPasswordClient() {
  const [identifier, setIdentifier] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [confirmation, setConfirmation] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: identifier.trim() }),
      });
      const data = await res.json().catch(() => ({}));

      if (res.ok) {
        // Message renvoyé par l'API, identique quel que soit le compte.
        setConfirmation(formatApiError(data?.message, "Si un compte correspond, un e-mail vient d'être envoyé."));
        return;
      }
      setError(formatApiError(data?.error, GENERIC_ERROR));
    } catch {
      setError(GENERIC_ERROR);
    } finally {
      setLoading(false);
    }
  }

  if (confirmation !== null) {
    return (
      <div className="flex flex-col gap-6">
        <div
          role="status"
          className="rounded-xl bg-surface-container-low p-4 text-center font-body-md text-body-md text-on-surface"
        >
          {confirmation}
        </div>
        <Link
          href="/login"
          className="flex h-12 items-center justify-center gap-2 rounded-xl bg-primary font-label-md text-label-md text-on-primary"
        >
          Retour à la connexion
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      <p className="text-center font-body-md text-body-md text-on-surface-variant">
        Saisissez votre e-mail ou votre nom d&apos;utilisateur. Si un compte correspond, vous
        recevrez un lien pour choisir un nouveau mot de passe.
      </p>

      {error && (
        <div role="alert" className="rounded-DEFAULT bg-error-container px-4 py-3 font-body-md text-body-md text-on-error-container">
          {error}
        </div>
      )}

      <div className="relative flex flex-col gap-1">
        <label htmlFor="identifier" className="font-label-sm text-label-sm uppercase tracking-wider text-on-surface">
          E-mail ou nom d&apos;utilisateur
        </label>
        <div className="relative flex items-center">
          <span className="material-symbols-outlined pointer-events-none absolute left-3 text-on-surface-variant/50">
            person
          </span>
          <input
            id="identifier"
            type="text"
            required
            maxLength={254}
            autoComplete="username"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            placeholder="username ou email@srh.com"
            className="h-12 w-full rounded-DEFAULT border-none bg-surface-container-low pl-10 pr-4 font-body-md text-body-md text-on-surface outline-none transition-all placeholder:text-on-surface-variant/40 focus:bg-surface-container-lowest focus:ring-2 focus:ring-primary"
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
          "Envoyer le lien"
        )}
      </button>

      <Link href="/login" className="text-center font-label-sm text-label-sm text-primary hover:underline">
        Retour à la connexion
      </Link>
    </form>
  );
}
