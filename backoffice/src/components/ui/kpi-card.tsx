import type { ReactNode } from "react";
import { TrendingDown, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";

interface KpiCardProps {
  label: string;
  value: string;
  delta?: string | null;
  hint?: string;
  icon?: ReactNode;
  className?: string;
}

export function KpiCard({ label, value, delta, hint, icon, className }: KpiCardProps) {
  const down = delta?.startsWith("-");
  return (
    <div className={cn("rounded-2xl bg-white p-5 shadow-sm ring-1 ring-zinc-200/60", className)}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-sm font-medium text-zinc-500">{label}</div>
          <div className="mt-2 text-2xl font-semibold tracking-tight text-zinc-900">{value}</div>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
            {delta && (
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-md px-2 py-0.5 font-medium",
                  down ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700",
                )}
              >
                {down ? <TrendingDown className="h-3.5 w-3.5" /> : <TrendingUp className="h-3.5 w-3.5" />}
                {delta}
              </span>
            )}
            {hint && <span className="text-zinc-400">{hint}</span>}
          </div>
        </div>
        {icon && (
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
            {icon}
          </div>
        )}
      </div>
    </div>
  );
}
