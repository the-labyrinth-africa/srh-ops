import Image from "next/image";
import { ForgotPasswordClient } from "@/frontend/comptes";

/**
 * Page publique de demande de réinitialisation du mot de passe : le formulaire
 * appelle POST /api/auth/forgot-password, dont la réponse est identique que le
 * compte existe ou non. Aucune garde de session (middleware.ts l'exclut).
 */
export default function ForgotPasswordPage() {
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
            Mot de passe oublié
          </h1>
        </div>

        <ForgotPasswordClient />
      </div>
    </main>
  );
}
