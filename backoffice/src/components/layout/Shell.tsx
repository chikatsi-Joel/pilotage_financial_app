import { useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { NAV_ITEMS, SideNav } from "./SideNav";

const TITLES: Record<string, { title: string; subtitle: string }> = {
  "/": { title: "Vue d'ensemble", subtitle: "Utilisateurs et activité des 30 derniers jours" },
  "/notifications": { title: "Notifications", subtitle: "Envois push, historique et diffusion" },
  "/flags": { title: "Flags", subtitle: "Firebase Remote Config de l'app mobile" },
  "/sql": { title: "Requêtes SQL", subtitle: "Coût des requêtes PostgreSQL (pg_stat_statements)" },
  "/settings": { title: "Configuration", subtitle: "Clés et réglages généraux du serveur" },
};

export function Shell() {
  const [collapsed, setCollapsed] = useState(false);
  const { email, logout } = useAuth();
  const { pathname } = useLocation();
  const page = TITLES[pathname] ?? TITLES["/"];

  return (
    <div className="flex h-screen overflow-hidden text-zinc-900">
      <SideNav collapsed={collapsed} onLogout={() => void logout()} />

      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="sticky top-0 z-10">
          <div className="mx-auto max-w-[1400px] px-3 pt-3 lg:px-6">
            <div className="flex items-center justify-between gap-3 rounded-2xl border border-zinc-200 bg-white/90 px-3 py-3 shadow-sm backdrop-blur">
              <div className="flex min-w-0 items-center gap-3">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setCollapsed((c) => !c)}
                  className="hidden h-10 w-10 md:inline-flex"
                  aria-label="Replier le menu"
                >
                  <Menu className="h-4 w-4" />
                </Button>
                <div className="min-w-0">
                  <h1 className="truncate text-base font-semibold text-zinc-900">{page.title}</h1>
                  <p className="hidden truncate text-xs text-zinc-500 sm:block">{page.subtitle}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 rounded-xl border border-zinc-200 bg-white py-1.5 pl-1.5 pr-3">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700">
                  {email?.[0]?.toUpperCase() ?? "A"}
                </span>
                <span className="hidden max-w-48 truncate text-sm font-medium text-zinc-700 sm:inline">{email}</span>
              </div>
            </div>

            {/* Mobile : onglets à la place de la barre latérale */}
            <nav className="scrollbar-modern mt-2 flex gap-1 overflow-x-auto md:hidden">
              {NAV_ITEMS.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === "/"}
                  className={({ isActive }) =>
                    cn(
                      "whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium",
                      isActive ? "bg-brand-600 text-white" : "bg-white text-zinc-600 ring-1 ring-zinc-200",
                    )
                  }
                >
                  {item.label}
                </NavLink>
              ))}
              <button onClick={() => void logout()} className="whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium text-rose-600">
                Déconnexion
              </button>
            </nav>
          </div>
        </header>

        <div className="scrollbar-modern flex-1 overflow-auto">
          <div className="animate-fade-in mx-auto max-w-[1400px] px-3 py-4 lg:px-6 lg:py-5" key={pathname}>
            <Outlet />
          </div>
        </div>
      </main>
    </div>
  );
}
