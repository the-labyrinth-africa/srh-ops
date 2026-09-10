import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { canRead, canWrite } from "@/lib/permissions";

export async function requireAuth(requireWrite = false) {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return { error: NextResponse.json({ error: "Non authentifié" }, { status: 401 }) };
  }

  const role = session.user.role;

  if (!canRead(role)) {
    return { error: NextResponse.json({ error: "Accès refusé" }, { status: 403 }) };
  }

  if (requireWrite && !canWrite(role)) {
    return { error: NextResponse.json({ error: "Permission insuffisante" }, { status: 403 }) };
  }

  return { session, user: session.user };
}
