import Image from "next/image";
import Link from "next/link";

const LOGO_URL =
  "https://lh3.googleusercontent.com/aida-public/AB6AXuB1xOxGNUjWSBV2jk4DZt3xE-9Srw8jX7XbK5hgKOxsQTlamjCfm-2mAMvEtEnC-KLykmgDkBxuDs8c7o1SPBRM2AduE-2njQSsETOV73grhkotl4Uzs6tfUUzxjUgt8_U9tzeerdggWxLZKX5c8HM6tCM7yzpImj69LA89rUBoFAIQZ5M8I-MpD3rs0APTX2Rlew8DF4TksbmckxhcMoYgXyNxllMLBFolhd-Ki1ZlHvKfJu0rD7qu4qNJPBu79T5QHg";

/**
 * La réinitialisation en libre-service est désactivée (voir
 * app/api/auth/forgot-password/route.ts). La page annonce l'indisponibilité au
 * lieu de laisser croire qu'un e-mail a été envoyé.
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
            src={LOGO_URL}
            alt="SRH Logo"
            width={120}
            height={48}
            className="mb-6 h-12 w-auto object-contain"
          />
          <h1 className="text-center font-headline-md text-headline-md tracking-tight text-on-surface">
            Mot de passe oublié
          </h1>
        </div>

        <div className="flex flex-col gap-6">
          <div className="rounded-xl bg-error-container/40 p-4 text-center font-body-md text-body-md text-on-error-container">
            Réinitialisation en libre-service indisponible. Contactez un administrateur SRH.
          </div>

          <p className="text-center font-body-md text-body-md text-on-surface-variant">
            Un administrateur peut régénérer votre mot de passe temporaire depuis
            l&apos;écran « Utilisateurs &amp; Rôles ». Vous serez invité à le changer à
            votre prochaine connexion.
          </p>

          <Link
            href="/login"
            className="flex h-12 items-center justify-center gap-2 rounded-xl bg-primary font-label-md text-label-md text-on-primary"
          >
            Retour à la page de connexion
          </Link>
        </div>
      </div>
    </main>
  );
}
