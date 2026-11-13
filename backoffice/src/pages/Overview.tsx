import { Activity, Bell, Receipt, Smartphone, UserPlus, Users } from "lucide-react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card } from "@/components/ui/card";
import { KpiCard } from "@/components/ui/kpi-card";
import { ErrorState, Loading } from "@/components/ui/states";
import { api, type Overview as OverviewData } from "@/lib/api";
import { useResource } from "@/lib/hooks";
import { formatDay, formatDelta, formatNumber } from "@/lib/utils";

const BRAND = "#584CB9";
const BRAND_SOFT = "#C9C0F5";
const loadOverview = () => api.get<OverviewData>("/overview");

const tooltipStyle = {
  borderRadius: 12,
  border: "1px solid #e4e4e7",
  boxShadow: "0 4px 12px rgba(0,0,0,.06)",
  fontSize: 12,
};

export function Overview() {
  const { data, error, loading, reload } = useResource(loadOverview);
  if (loading && !data) return <Loading />;
  if (error || !data) return <ErrorState message={error ?? "Données indisponibles"} onRetry={reload} />;

  const series = data.series.map((p) => ({ ...p, label: formatDay(p.day) }));
  const pushShare = data.users_total ? Math.round((data.users_with_push / data.users_total) * 100) : 0;

  return (
    <div className="space-y-4">
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Actifs (30 jours)"
          value={formatNumber(data.active_30d)}
          delta={formatDelta(data.active_30d_delta)}
          hint="mesure depuis le 13 nov. 2026"
          icon={<Activity className="h-5 w-5" />}
        />
        <KpiCard
          label="Actifs (7 jours)"
          value={formatNumber(data.active_7d)}
          hint={`${formatNumber(data.active_today)} aujourd'hui`}
          icon={<Users className="h-5 w-5" />}
        />
        <KpiCard
          label="Utilisateurs"
          value={formatNumber(data.users_total)}
          delta={formatDelta(data.users_new_delta)}
          hint={`+${formatNumber(data.users_new_30d)} en 30 j`}
          icon={<UserPlus className="h-5 w-5" />}
        />
        <KpiCard
          label="Notifications (30 jours)"
          value={formatNumber(data.notifications_30d)}
          delta={formatDelta(data.notifications_delta)}
          hint="envoyées"
          icon={<Bell className="h-5 w-5" />}
        />
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <Card
          title="Utilisateurs actifs par jour"
          description="Au moins une ouverture de l'app dans la journée"
          className="lg:col-span-2"
        >
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={series} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                <defs>
                  <linearGradient id="activeFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={BRAND} stopOpacity={0.22} />
                    <stop offset="100%" stopColor={BRAND} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#f4f4f5" vertical={false} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#a1a1aa" }} minTickGap={24} />
                <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#a1a1aa" }} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [formatNumber(v), "Actifs"]} />
                <Area type="monotone" dataKey="active" stroke={BRAND} strokeWidth={2} fill="url(#activeFill)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <div className="grid gap-4">
          <KpiCard
            label="Appareils push"
            value={formatNumber(data.push_devices)}
            hint={`${pushShare} % des utilisateurs joignables`}
            icon={<Smartphone className="h-5 w-5" />}
          />
          <KpiCard
            label="Dépenses saisies (30 jours)"
            value={formatNumber(data.expenses_30d)}
            icon={<Receipt className="h-5 w-5" />}
          />
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card title="Inscriptions" description="Nouveaux comptes par jour">
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={series} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                <CartesianGrid stroke="#f4f4f5" vertical={false} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#a1a1aa" }} minTickGap={24} />
                <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#a1a1aa" }} />
                <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "#f6f4ff" }} formatter={(v: number) => [formatNumber(v), "Inscriptions"]} />
                <Bar dataKey="signups" fill={BRAND} radius={[6, 6, 0, 0]} maxBarSize={18} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card title="Notifications envoyées" description="Toutes catégories, par jour">
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={series} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                <CartesianGrid stroke="#f4f4f5" vertical={false} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#a1a1aa" }} minTickGap={24} />
                <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#a1a1aa" }} />
                <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "#f6f4ff" }} formatter={(v: number) => [formatNumber(v), "Notifications"]} />
                <Bar dataKey="notifications" fill={BRAND_SOFT} radius={[6, 6, 0, 0]} maxBarSize={18} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </section>
    </div>
  );
}
