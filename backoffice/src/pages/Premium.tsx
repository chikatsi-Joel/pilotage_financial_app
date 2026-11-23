import { useEffect, useState } from "react";
import { Crown, Search, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ErrorState, Loading } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { api, type PremiumSearch, type PremiumUser } from "@/lib/api";
import { formatDateTime } from "@/lib/utils";

/**
 * Freemium IA : recherche d'un compte et activation manuelle du premium (analyses illimitées),
 * en attendant le paiement intégré. Le quota et l'interrupteur se règlent dans Configuration.
 */
export function Premium() {
  const toast = useToast();
  const [q, setQ] = useState("");
  const [data, setData] = useState<PremiumSearch | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function load(query = q) {
    setError(null);
    try {
      setData(await api.get<PremiumSearch>(`/premium/users?q=${encodeURIComponent(query)}`));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  useEffect(() => {
    void load("");
    // Chargement initial uniquement ; la recherche recharge explicitement.
  }, []);

  async function setPremium(user: PremiumUser, months: number) {
    if (months === 0 && !window.confirm(`Retirer le premium de ${user.email ?? user.name} ?`)) return;
    setBusy(user.id);
    try {
      const updated = await api.put<PremiumUser>(`/premium/users/${user.id}`, { months });
      setData((d) => d && { ...d, users: d.users.map((u) => (u.id === updated.id ? updated : u)) });
      toast("success", months ? `Premium prolongé de ${months} mois` : "Premium retiré");
    } catch (e) {
      toast("error", (e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  if (error && !data) return <ErrorState message={error} onRetry={() => void load()} />;
  if (!data) return <Loading />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-white px-5 py-4 shadow-sm ring-1 ring-zinc-200/60">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
          <Sparkles className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-sm font-semibold text-zinc-900">
            Freemium IA
            <Badge tone={data.freemium_enabled ? "brand" : "neutral"}>{data.freemium_enabled ? "Actif" : "Coupé"}</Badge>
          </div>
          <p className="mt-0.5 text-xs text-zinc-500">
            {data.freemium_enabled
              ? `Comptes gratuits : ${data.free_quota} analyse${data.free_quota > 1 ? "s" : ""} IA par mois. Premium : illimité.`
              : "Analyses IA illimitées pour tous les comptes."}
          </p>
        </div>
        <Link to="/settings" className="text-xs font-medium text-brand-700 hover:underline">
          Régler dans Configuration
        </Link>
      </div>

      <Card
        title="Comptes"
        description="Premium actifs en tête, puis derniers inscrits. Un mois = 30 jours, ajoutés à la fin du premium en cours."
        contentClassName="p-0"
        right={
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void load();
            }}
          >
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="E-mail ou nom"
              className="h-9 w-56"
              maxLength={254}
            />
            <Button type="submit" variant="outline" size="icon" aria-label="Rechercher">
              <Search className="h-4 w-4" />
            </Button>
          </form>
        }
      >
        {data.users.length === 0 ? (
          <p className="py-10 text-center text-sm text-zinc-500">Aucun compte trouvé.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-100 bg-zinc-50 text-left text-xs text-zinc-500">
                  <th className="px-5 py-3 font-medium">Compte</th>
                  <th className="px-3 py-3 font-medium">Statut</th>
                  <th className="px-3 py-3 text-right font-medium">Analyses comptées ce mois</th>
                  <th className="px-5 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.users.map((u, i) => (
                  <tr key={u.id} className={i % 2 ? "border-b border-zinc-100 bg-zinc-50/40" : "border-b border-zinc-100"}>
                    <td className="px-5 py-3">
                      <div className="font-medium text-zinc-900">{u.name}</div>
                      <div className="text-xs text-zinc-500">{u.email ?? "—"}</div>
                    </td>
                    <td className="px-3 py-3">
                      {u.premium && u.premium_until ? (
                        <Badge tone="brand">
                          <Crown className="h-3 w-3" />
                          Premium jusqu'au {formatDateTime(u.premium_until)}
                        </Badge>
                      ) : (
                        <Badge>Gratuit</Badge>
                      )}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums text-zinc-700">
                      {u.ai_used_this_month}
                      {data.freemium_enabled && !u.premium ? ` / ${data.free_quota}` : ""}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex justify-end gap-2">
                        <Button size="sm" variant="outline" disabled={busy === u.id} onClick={() => void setPremium(u, 1)}>
                          +1 mois
                        </Button>
                        <Button size="sm" variant="outline" disabled={busy === u.id} onClick={() => void setPremium(u, 12)}>
                          +12 mois
                        </Button>
                        {u.premium ? (
                          <Button size="sm" variant="ghost" disabled={busy === u.id} onClick={() => void setPremium(u, 0)}>
                            Retirer
                          </Button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
