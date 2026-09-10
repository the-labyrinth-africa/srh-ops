"use client";

import { useSession } from "next-auth/react";
import { useState } from "react";
import { Header } from "./Header";
import { Sidebar } from "./Sidebar";
import { roleLabel } from "@/lib/permissions";

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-surface">
      <Sidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        userName={session?.user?.name}
        userRole={roleLabel(session?.user?.role)}
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
