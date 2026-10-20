import { Suspense } from "react";
import Image from "next/image";
import { ResetPasswordClient } from "@/frontend/comptes";

/**
 * Page publique de choix d'un nouveau mot de passe (lien reçu par e-mail).
 * Pas de requirePageAccess : le jeton du lien fait office d'autorisation.
 * Suspense requis par useSearchParams dans le composant client.
 */
export default function ResetPasswordPage() {
  return (
    <main className="relative flex min-h-screen w-full flex-col items-center justify-center p-margin-mobile lg:p-margin-desktop">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute left-[-10%] top-[-20%] h-[60%] w-[60%] rounded-full bg-primary/5 blur-3xl mix-blend-multiply" />
      </div>

      <div className="group relative z-10 w-full max-w-md overflow-hidden rounded-xl bg-surface-container-lowest p-8 shadow-xl lg:p-12">
        <div className="mb-8 flex flex-col items-center">
          <Image
            src="/icons/icon.svg"
            alt="Logo WOM"
            width={64}
            height={64}
            className="mb-6 h-16 w-16 object-contain"
          />
          <h1 className="text-center font-headline-md text-headline-md tracking-tight text-on-surface">
            Nouveau mot de passe
          </h1>
        </div>

        <Suspense fallback={null}>
          <ResetPasswordClient />
        </Suspense>
      </div>
    </main>
  );
}
