import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { connectDB } from "@/lib/db";
import { requireAuth } from "@/lib/api-auth";
import { User } from "@/models/User";
import { userCreateSchema } from "@/lib/validators/user";
import { generateRandomPassword } from "@/lib/email";
import { findScopeError } from "@/lib/users/scope";
import { appBaseUrl } from "@/lib/app-url";
import { issueResetToken } from "@/lib/auth/reset-token";
import { sendInvitationMail } from "@/lib/auth/account-mail";

export async function GET(req: NextRequest) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  if (auth.user.role !== "admin") {
    return NextResponse.json({ error: "Accès réservé aux administrateurs" }, { status: 403 });
  }

  const sp = req.nextUrl.searchParams;
  const filter: Record<string, unknown> = {};
  if (sp.get("role")) filter.role = sp.get("role");

  await connectDB();
  const users = await User.find(filter)
    .select("-motDePasseHash")
    .populate("clientId", "nom")
    .populate("equipeId", "nom")
    .sort({ createdAt: -1 })
    .lean();

  return NextResponse.json(users);
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth(true);
  if (auth.error) return auth.error;

  if (auth.user.role !== "admin") {
    return NextResponse.json({ error: "Accès réservé aux administrateurs" }, { status: 403 });
  }

  const body = await req.json();
  const parsed = userCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { username, nom, email, role, telephone, clientId, equipeId } = parsed.data;

  await connectDB();

  const scopeError = await findScopeError({ clientId, equipeId });
  if (scopeError) return NextResponse.json({ error: scopeError }, { status: 400 });

  // Vérification doublon email / username
  const existing = await User.findOne({
    $or: [{ email: email.toLowerCase() }, { username: username.toLowerCase() }],
  });

  if (existing) {
    const isEmail = existing.email.toLowerCase() === email.toLowerCase();
    return NextResponse.json(
      { error: isEmail ? "Cet e-mail est déjà utilisé" : "Ce nom d'utilisateur est déjà utilisé" },
      { status: 409 }
    );
  }

  // Génération automatique du mot de passe temporaire
  const generatedPassword = generateRandomPassword(10);
  const hash = await bcrypt.hash(generatedPassword, 10);

  const user = await User.create({
    username: username.toLowerCase(),
    nom,
    email: email.toLowerCase(),
    motDePasseHash: hash,
    role,
    telephone,
    clientId: clientId || undefined,
    equipeId: equipeId || undefined,
    mustChangePassword: true,
  });

  // Invitation : lien d'activation valable 72 h ; le mot de passe temporaire ne sert qu'en repli.
  let invitationSent = false;
  try {
    const { token } = await issueResetToken(String(user._id), "invitation");
    const link = `${appBaseUrl()}/reset-password?token=${token}`;
    const result = await sendInvitationMail({ nom, email: email.toLowerCase() }, link);
    invitationSent = result.ok;
  } catch (error) {
    console.error("[invitation] impossible de préparer l'e-mail :", error instanceof Error ? error.name : "erreur");
  }

  const createdUser = await User.findById(user._id)
    .select("-motDePasseHash")
    .populate("clientId", "nom")
    .populate("equipeId", "nom")
    .lean();

  // Le mot de passe temporaire n'est renvoyé qu'en repli (e-mail non envoyé) ; jamais dans `message`.
  const responseBody = invitationSent
    ? { user: createdUser, invitation: "sent", message: `Invitation envoyée à ${email.toLowerCase()}.` }
    : {
        user: createdUser,
        invitation: "not_sent",
        generatedPassword,
        message: "L'e-mail n'a pas pu être envoyé : communiquez le mot de passe temporaire à l'utilisateur.",
      };

  // Réponse pouvant contenir un secret : ne jamais la mettre en cache.
  return NextResponse.json(responseBody, { status: 201, headers: { "Cache-Control": "no-store" } });
}
