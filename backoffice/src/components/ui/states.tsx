import { AlertCircle, Loader2 } from "lucide-react";
import { Button } from "./button";

export function Loading({ label = "Chargement…" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-sm text-zinc-500">
      <Loader2 className="h-4 w-4 animate-spin text-brand-600" />
      {label}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl bg-white px-6 py-12 text-center shadow-sm ring-1 ring-zinc-200/60">
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-50 text-rose-600">
        <AlertCircle className="h-5 w-5" />
      </div>
      <p className="max-w-md text-sm text-zinc-600">{message}</p>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          Réessayer
        </Button>
      )}
    </div>
  );
}
