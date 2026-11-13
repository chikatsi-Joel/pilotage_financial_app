import type { ComponentType } from "react";
import { NavLink } from "react-router-dom";
import { Bell, Database, Flag, LayoutGrid, LogOut, SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";

type Icon = ComponentType<{ className?: string; width?: number; height?: number; strokeWidth?: number }>;

export interface NavItem {
  to: string;
  label: string;
  icon: Icon;
  hint?: string;
}

export const NAV_ITEMS: NavItem[] = [
  { to: "/", label: "Vue d'ensemble", icon: LayoutGrid },
  { to: "/notifications", label: "Notifications", icon: Bell },
  { to: "/flags", label: "Flags", icon: Flag, hint: "Remote Config" },
  { to: "/sql", label: "Requêtes SQL", icon: Database },
  { to: "/settings", label: "Configuration", icon: SlidersHorizontal },
];

interface SideNavProps {
  collapsed: boolean;
  onLogout: () => void;
}

export function SideNav({ collapsed, onLogout }: SideNavProps) {
  return (
    <aside
      className={cn(
        "m-3 hidden h-[calc(100vh-24px)] shrink-0 transition-all duration-300 md:block",
        collapsed ? "w-14" : "w-60",
      )}
    >
      <div className="relative flex h-full flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
        {/* Halo violet très léger en haut du menu */}
        <div className="pointer-events-none absolute -left-10 -top-16 h-40 w-40 rounded-full bg-brand-200/40 blur-2xl" />

        <div className="relative flex h-14 items-center gap-2 border-b border-zinc-100 px-3.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-brand-600 text-[13px] font-bold text-white shadow-sm shadow-brand-600/30">
            L
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <h1 className="truncate text-sm font-semibold text-zinc-900">Lucia</h1>
              <p className="truncate text-xs text-zinc-500">Backoffice</p>
            </div>
          )}
        </div>

        <nav className="scrollbar-modern relative flex-1 space-y-0.5 overflow-y-auto overflow-x-hidden p-2.5">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              title={collapsed ? item.label : undefined}
              className={({ isActive }) =>
                cn(
                  "group relative flex items-center gap-2.5 rounded-lg px-2.5 py-[7px] transition-all duration-200",
                  isActive ? "bg-brand-50 text-zinc-900" : "text-zinc-500 hover:bg-zinc-50 hover:text-zinc-900",
                )
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && <span className="absolute bottom-1.5 left-0 top-1.5 w-0.5 rounded-full bg-brand-600" />}
                  <item.icon
                    width={17}
                    height={17}
                    strokeWidth={isActive ? 2.2 : 1.8}
                    className={cn(
                      "shrink-0 transition-colors",
                      isActive ? "text-brand-600" : "text-zinc-400 group-hover:text-zinc-600",
                    )}
                  />
                  {!collapsed && (
                    <>
                      <span className={cn("flex-1 truncate text-[13px]", isActive && "font-semibold")}>{item.label}</span>
                      {item.hint && <span className="hidden text-[10px] text-zinc-400 lg:inline">{item.hint}</span>}
                    </>
                  )}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-zinc-100 p-2.5">
          <button
            type="button"
            onClick={onLogout}
            title={collapsed ? "Se déconnecter" : undefined}
            className="group flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-zinc-500 transition-all hover:bg-rose-50 hover:text-rose-600"
          >
            <LogOut width={17} height={17} className="text-zinc-400 transition-colors group-hover:text-rose-500" />
            {!collapsed && <span className="text-[13px]">Se déconnecter</span>}
          </button>
        </div>
      </div>
    </aside>
  );
}
