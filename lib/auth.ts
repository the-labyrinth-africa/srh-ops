import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { connectDB } from "@/lib/db";
import { User } from "@/models/User";
import { needsRefresh, refreshTokenFromDb } from "@/lib/auth-refresh";
import type { UserRole } from "@/types";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name: string;
      email: string;
      username: string;
      role: UserRole;
      clientId?: string;
      equipeId?: string;
      mustChangePassword?: boolean;
    };
  }

  interface User {
    username: string;
    role: UserRole;
    clientId?: string;
    equipeId?: string;
    mustChangePassword?: boolean;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    username: string;
    role: UserRole;
    clientId?: string;
    equipeId?: string;
    mustChangePassword?: boolean;
    /** Vrai quand le compte n'existe plus : la session est alors refusée partout. */
    invalid?: boolean;
    /** Horodatage (ms) de la dernière relecture du compte en base. */
    refreshedAt?: number;
  }
}

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        identifier: { label: "Email ou Nom d'utilisateur", type: "text" },
        password: { label: "Mot de passe", type: "password" },
      },
      async authorize(credentials) {
        const identifier = credentials?.identifier?.trim() || (credentials as Record<string, string>)?.email?.trim();
        const password = credentials?.password;

        if (!identifier || !password) return null;

        await connectDB();
        const query = identifier.includes("@")
          ? { email: identifier.toLowerCase() }
          : { username: identifier.toLowerCase() };

        const user = await User.findOne(query);
        if (!user) return null;

        const valid = await bcrypt.compare(password, user.motDePasseHash);
        if (!valid) return null;

        return {
          id: user._id.toString(),
          name: user.nom,
          email: user.email,
          username: user.username || user.email.split("@")[0],
          role: user.role,
          clientId: user.clientId ? user.clientId.toString() : undefined,
          equipeId: user.equipeId ? user.equipeId.toString() : undefined,
          mustChangePassword: user.mustChangePassword,
        };
      },
    }),
  ],
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  callbacks: {
    async jwt({ token, user, trigger }) {
      if (user) {
        token.id = user.id;
        token.username = user.username;
        token.role = user.role;
        token.clientId = user.clientId;
        token.equipeId = user.equipeId;
        token.mustChangePassword = user.mustChangePassword;
        token.refreshedAt = Date.now();
        return token;
      }
      if (trigger === "update" || needsRefresh(token)) {
        return refreshTokenFromDb(token);
      }
      return token;
    },
    async session({ session, token }) {
      // Compte supprimé : session sans utilisateur, donc refusée partout (401 / redirection /login).
      if (token.invalid) return { ...session, user: undefined } as never;
      if (session.user) {
        session.user.id = token.id;
        session.user.username = token.username;
        session.user.role = token.role;
        session.user.clientId = token.clientId;
        session.user.equipeId = token.equipeId;
        session.user.mustChangePassword = token.mustChangePassword;
      }
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
};
