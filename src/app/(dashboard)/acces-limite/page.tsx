import { requirePageAccess } from "@/backend/comptes";

export default async function AccesLimitePage() {
  await requirePageAccess("/acces-limite");

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4 px-margin-mobile py-gutter-md lg:px-margin-desktop">
      <h1 className="font-headline-lg-mobile text-headline-lg-mobile text-on-surface lg:font-headline-lg lg:text-headline-lg">
        Espace client SRH
      </h1>
      <p className="font-body-md text-body-md text-on-surface-variant">
        Votre compte est actif. Le suivi de vos collectes et de vos rapports sera
        disponible prochainement. En attendant, contactez votre interlocuteur SRH
        pour toute demande.
      </p>
    </div>
  );
}
