import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { connectDB } from "@/lib/db";
import { requireAuth } from "@/lib/api-auth";
import { User } from "@/models/User";
import { userCreateSchema } from "@/lib/validators/user";
import { generateRandomPassword, sendEmail } from "@/lib/email";

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

  // Envoi de l'e-mail avec les identifiants
  const emailBody = `Bonjour ${nom},\n\nVotre compte sur la plateforme SRH Ops a été créé.\n\nIdentifiants de connexion:\n- Username: ${username}\n- Email: ${email}\n- Mot de passe temporaire: ${generatedPassword}\n- Rôle attribué: ${role}\n\nVeuillez vous connecter et modifier votre mot de passe dès votre première session.\n\nCordialement,\nL'équipe SRH Ops`;

  await sendEmail({
    to: email,
    subject: "Bienvenue sur SRH Ops — Vos identifiants de connexion",
    body: emailBody,
  });

  const createdUser = await User.findById(user._id)
    .select("-motDePasseHash")
    .populate("clientId", "nom")
    .populate("equipeId", "nom")
    .lean();

  return NextResponse.json(
    {
      user: createdUser,
      generatedPassword,
      message: "Utilisateur créé. Un mot de passe temporaire a été généré.",
    },
    { status: 201 }
  );
}
