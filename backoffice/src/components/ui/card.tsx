import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface CardProps {
  title?: string;
  description?: ReactNode;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
}

export function Card({ title, description, right, children, className, contentClassName }: CardProps) {
  return (
    <div className={cn("overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-zinc-200/60", className)}>
      {(title || description || right) && (
        <div className="flex items-start justify-between gap-4 border-b border-zinc-100 px-5 py-4">
          <div>
            {title && <div className="text-sm font-semibold leading-none tracking-tight text-zinc-900">{title}</div>}
            {description && <div className="mt-1.5 text-xs text-zinc-500">{description}</div>}
          </div>
          {right}
        </div>
      )}
      <div className={cn("p-5", contentClassName)}>{children}</div>
    </div>
  );
}
