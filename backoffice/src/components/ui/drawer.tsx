import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
}

/** Panneau latéral comme dans omicron-fe : s'ouvre à droite, Échap ou clic dehors pour fermer. */
export function Drawer({ open, onClose, title, description, children, footer }: DrawerProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-zinc-900/20 backdrop-blur-[2px]" onClick={onClose} />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="animate-fade-in absolute bottom-3 right-3 top-3 flex w-[min(460px,calc(100vw-24px))] flex-col overflow-hidden rounded-2xl bg-white shadow-xl ring-1 ring-zinc-200/60"
      >
        <header className="flex items-start justify-between gap-4 border-b border-zinc-100 px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold text-zinc-900">{title}</h2>
            {description && <p className="mt-1 text-xs text-zinc-500">{description}</p>}
          </div>
          <button
            onClick={onClose}
            className="cursor-pointer rounded-lg p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
            aria-label="Fermer"
          >
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <footer className="flex justify-end gap-2 border-t border-zinc-100 px-5 py-3">{footer}</footer>}
      </aside>
    </div>
  );
}
