"use client";

import { useState } from "react";

interface TemporaryPasswordPanelProps {
  password: string;
}

/**
 * Affiche un mot de passe temporaire une seule fois, avec un bouton de copie.
 * Le mot de passe reste uniquement dans l'état React de l'appelant : il n'est
 * ni journalisé, ni stocké (localStorage, URL).
 */
export function TemporaryPasswordPanel({ password }: TemporaryPasswordPanelProps) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(password);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  }

  return (
    <div className="rounded-xl border border-primary/30 bg-surface-container-low p-4">
      <p className="font-label-md text-label-md text-on-surface-variant">
        Mot de passe temporaire — à communiquer à l&apos;utilisateur, il ne sera plus affiché
      </p>
      <div className="mt-3 flex items-center gap-2">
        <code
          data-testid="temporary-password"
          className="flex-1 select-all break-all rounded-lg bg-surface-container-lowest px-3 py-2 font-mono text-base font-semibold text-on-surface"
        >
          {password}
        </code>
        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center gap-1 rounded-xl bg-primary px-3 py-2 font-label-md text-label-md text-on-primary hover:bg-primary-container"
        >
          <span className="material-symbols-outlined text-[18px]">content_copy</span>
          {copyState === "copied" ? "Copié" : "Copier"}
        </button>
      </div>
      {copyState === "failed" && (
        <p className="mt-2 text-xs text-error" role="alert">
          Copie impossible : sélectionnez le mot de passe et copiez-le manuellement.
        </p>
      )}
    </div>
  );
}
