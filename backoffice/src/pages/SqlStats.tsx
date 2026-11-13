import { useEffect, useState } from "react";
import { Database, Gauge, RefreshCw, RotateCcw, Timer, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Drawer } from "@/components/ui/drawer";
import { KpiCard } from "@/components/ui/kpi-card";
import { ErrorState, Loading } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { api, type SqlQueryStat, type SqlStats as SqlStatsData } from "@/lib/api";
import { cn, formatDateTime, formatNumber } from "@/lib/utils";

type Sort = "total" | "mean" | "calls" | "max" | "rows";

const SORTS: { key: Sort; label: string }[] = [
  { key: "total", label: "Temps total" },
  { key: "mean", label: "Temps moyen" },
  { key: "max", label: "Pire temps" },
  { key: "calls", label: "Appels" },
  { key: "rows", label: "Lignes" },
];

const ms = (v: number) =>
  v >= 1000 ? `${(v / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 2 })} s` : `${v.toLocaleString("fr-FR", { maximumFractionDigits: 2 })} ms`;
const pct = (v: number | null) => (v === null ? "—" : `${(v * 100).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %`);

/** Une ligne de SQL lisible dans le tableau : espaces écrasés. */
const oneLine = (q: string) => q.replace(/\s+/g, " ").trim();

function speedTone(meanMs: number): "success" | "warning" | "danger" {
  if (meanMs < 10) return "success";
  if (meanMs < 100) return "warning";
  return "danger";
}

export function SqlStats() {
  const toast = useToast();
  const [sort, setSort] = useState<Sort>("total");
  const [data, setData] = useState<SqlStatsData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<SqlQueryStat | null>(null);

  async function load(next: Sort = sort) {
    setLoading(true);
    setError(null);
    try {
      setData(await api.get<SqlStatsData>(`/sql-stats?sort=${next}&limit=50`));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load("total");
    // Chargement initial uniquement ; les tris rechargent explicitement.
  }, []);

  async function reset() {
    if (!window.confirm("Remettre à zéro les statistiques SQL de la base Lucia ?")) return;
    try {
      await api.post("/sql-stats/reset");
      toast("success", "Statistiques remises à zéro");
      void load();
    } catch (e) {
      toast("error", (e as Error).message);
    }
  }

  if (error && !data) return <ErrorState message={error} onRetry={() => void load()} />;
  if (!data) return <Loading label="Lecture de pg_stat_statements…" />;
  if (!data.available) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl bg-white px-6 py-14 text-center shadow-sm ring-1 ring-zinc-200/60">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
          <Database className="h-6 w-6" />
        </div>
        <h2 className="text-base font-semibold text-zinc-900">Statistiques SQL indisponibles</h2>
        <p className="max-w-md text-sm text-zinc-500">{data.reason}</p>
      </div>
    );
  }

  const meanAll = data.calls ? data.total_ms / data.calls : 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-zinc-500">
          Mesures cumulées par PostgreSQL{data.since ? ` (dernière remise à zéro complète du serveur : ${formatDateTime(data.since)})` : ""} · valeurs
          remplacées par $1, $2… (aucune donnée utilisateur)
        </p>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
            Actualiser
          </Button>
          <Button variant="outline" onClick={() => void reset()}>
            <RotateCcw className="h-4 w-4" />
            Remettre à zéro
          </Button>
        </div>
      </div>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Requêtes distinctes" value={formatNumber(data.statements)} icon={<Database className="h-5 w-5" />} />
        <KpiCard label="Exécutions" value={formatNumber(data.calls)} icon={<Zap className="h-5 w-5" />} />
        <KpiCard label="Temps moyen" value={ms(meanAll)} hint={`${ms(data.total_ms)} au total`} icon={<Timer className="h-5 w-5" />} />
        <KpiCard
          label="Lectures servies par le cache"
          value={pct(data.cache_hit_ratio)}
          hint="idéalement > 99 %"
          icon={<Gauge className="h-5 w-5" />}
        />
      </section>

      <Card
        title="Requêtes"
        description="Les 50 premières selon le critère choisi ; cliquez une ligne pour voir la requête complète"
        contentClassName="p-0"
        right={
          <div className="flex flex-wrap gap-1 rounded-xl bg-zinc-100/80 p-1">
            {SORTS.map((s) => (
              <button
                key={s.key}
                onClick={() => {
                  setSort(s.key);
                  void load(s.key);
                }}
                className={cn(
                  "cursor-pointer rounded-lg px-2.5 py-1 text-xs font-medium transition-colors",
                  sort === s.key ? "bg-white text-brand-700 shadow-sm" : "text-zinc-500 hover:text-zinc-800",
                )}
              >
                {s.label}
              </button>
            ))}
          </div>
        }
      >
        {data.queries.length === 0 ? (
          <p className="py-10 text-center text-sm text-zinc-500">Aucune requête enregistrée depuis la remise à zéro.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-100 text-left text-xs text-zinc-500">
                  <th className="px-5 py-3 font-medium">Requête</th>
                  <th className="px-3 py-3 text-right font-medium">Appels</th>
                  <th className="px-3 py-3 text-right font-medium">Moyen</th>
                  <th className="px-3 py-3 text-right font-medium">Pire</th>
                  <th className="px-3 py-3 text-right font-medium">Total</th>
                  <th className="px-3 py-3 font-medium">Part du temps</th>
                  <th className="px-5 py-3 text-right font-medium">Lignes</th>
                </tr>
              </thead>
              <tbody>
                {data.queries.map((q) => (
                  <tr
                    key={q.id}
                    onClick={() => setSelected(q)}
                    className="cursor-pointer border-b border-zinc-50 last:border-0 hover:bg-brand-50/40"
                  >
                    <td className="max-w-[28rem] px-5 py-3">
                      <code className="line-clamp-2 break-all font-mono text-xs text-zinc-700">{oneLine(q.query)}</code>
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums text-zinc-700">{formatNumber(q.calls)}</td>
                    <td className="px-3 py-3 text-right">
                      <Badge tone={speedTone(q.mean_ms)} className="tabular-nums">
                        {ms(q.mean_ms)}
                      </Badge>
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums text-zinc-600">{ms(q.max_ms)}</td>
                    <td className="px-3 py-3 text-right tabular-nums font-medium text-zinc-900">{ms(q.total_ms)}</td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-20 overflow-hidden rounded-full bg-brand-50">
                          <div className="h-full rounded-full bg-brand-500" style={{ width: `${Math.max(2, q.share * 100)}%` }} />
                        </div>
                        <span className="text-xs tabular-nums text-zinc-500">{pct(q.share)}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums text-zinc-600">{formatNumber(q.rows)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Drawer open={selected !== null} onClose={() => setSelected(null)} title="Détail de la requête">
        {selected && (
          <div className="space-y-4">
            <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-all rounded-xl bg-zinc-50 p-3 font-mono text-xs text-zinc-800 ring-1 ring-zinc-100">
              {selected.query}
            </pre>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              {[
                ["Appels", formatNumber(selected.calls)],
                ["Temps moyen", ms(selected.mean_ms)],
                ["Écart type", ms(selected.stddev_ms)],
                ["Pire temps", ms(selected.max_ms)],
                ["Temps total", ms(selected.total_ms)],
                ["Part du temps total", pct(selected.share)],
                ["Lignes renvoyées", formatNumber(selected.rows)],
                ["Lectures en cache", pct(selected.cache_hit_ratio)],
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl bg-brand-50/40 px-3 py-2">
                  <dt className="text-[11px] text-zinc-500">{label}</dt>
                  <dd className="font-semibold tabular-nums text-zinc-900">{value}</dd>
                </div>
              ))}
            </dl>
            <p className="text-xs text-zinc-400">Identifiant pg_stat_statements : {selected.id}</p>
          </div>
        )}
      </Drawer>
    </div>
  );
}
