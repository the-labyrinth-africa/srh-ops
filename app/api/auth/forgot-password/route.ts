import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { connectDB } from "@/lib/db";
import { User } from "@/models/User";
import { forgotPasswordSchema } from "@/lib/validators/user";
import { generateRandomPassword, sendEmail } from "@/lib/email";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = forgotPasswordSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const identifier = parsed.data.identifier.trim().toLowerCase();

  await connectDB();
  const query = identifier.includes("@")
    ? { email: identifier }
    : { username: identifier };

  const user = await User.findOne(query);

  // Pour des raisons de sécurité, répondre positivement même si l'utilisateur n'existe pas
  if (!user) {
    return NextResponse.json({
      message: "Si un compte correspond à cet identifiant, un nouveau mot de passe a été envoyé par e-mail.",
    });
  }

  // Générer un nouveau mot de passe temporaire
  const newPassword = generateRandomPassword(10);
  const hash = await bcrypt.hash(newPassword, 10);

  await User.updateOne(
    { _id: user._id },
    { $set: { motDePasseHash: hash, mustChangePassword: true } }
  );

  // Envoi de l'e-mail
  const username = user.username || user.email.split("@")[0];
  const emailBody = `Bonjour ${user.nom},\n\nVous avez demandé la réinitialisation de votre mot de passe pour votre compte SRH Ops.\n\nVotre nouveau mot de passe temporaire est: ${newPassword}\n\nVeuillez vous connecter avec cet identifiant (${username}) et modifier votre mot de passe.\n\nCordialement,\nL'équipe SRH Ops`;

  await sendEmail({
    to: user.email,
    subject: "SRH Ops — Réinitialisation de votre mot de passe",
    body: emailBody,
  });

  return NextResponse.json({
    message: "Si un compte correspond à cet identifiant, un nouveau mot de passe a été envoyé par e-mail.",
    debugPassword: process.env.NODE_ENV === "development" ? newPassword : undefined,
  });
}
