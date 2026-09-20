"use client";

import { useSession } from "next-auth/react";
import { useState } from "react";
import { Header } from "./Header";
import { Sidebar } from "./Sidebar";

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-surface">
      {/* Rôle brut : la Sidebar filtre la navigation sur les identifiants de
          rôle ("admin", "dispatcher"…) et n'applique roleLabel qu'à
          l'affichage. Lui passer le libellé français masquait les entrées
          Utilisateurs et Import à leurs propres destinataires. */}
      <Sidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        userName={session?.user?.name}
        userRole={session?.user?.role}
      />
      <div className="lg:pl-sidebar-width">
        <Header
          onMenuClick={() => setSidebarOpen(true)}
          userName={session?.user?.name}
          userRole={session?.user?.role}
        />
        <main className="min-h-screen w-full bg-surface pt-16">{children}</main>
      </div>
    </div>
  );
}
