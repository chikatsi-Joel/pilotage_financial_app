import { useCallback, useState } from "react";
import { Megaphone, RotateCcw, Send, Smartphone } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Drawer } from "@/components/ui/drawer";
import { Input, Label, Textarea } from "@/components/ui/input";
import { ErrorState, Loading } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { api, type NotificationItem, type NotificationStats } from "@/lib/api";
import { useResource } from "@/lib/hooks";
import { formatDateTime, formatNumber } from "@/lib/utils";

const PAGE_SIZE = 20;
const CONFIRMATION = "ENVOYER";
const loadStats = () => api.get<NotificationStats>("/notifications/stats");

type Mode = "user" | "all" | null;

export function Notifications() {
  const toast = useToast();
  const stats = useResource(loadStats);
  const [offset, setOffset] = useState(0);
  const loadHistory = useCallback(
    () => api.get<{ total: number; items: NotificationItem[] }>(`/notifications/history?limit=${PAGE_SIZE}&offset=${offset}`),
    [offset],
  );
  const history = useResource(loadHistory);
  const [mode, setMode] = useState<Mode>(null);

  const changePage = (next: number) => {
    setOffset(next);
    // useResource ne suit pas `offset` : rechargement explicite avec la nouvelle page.
    void api
      .get<{ total: number; items: NotificationItem[] }>(`/notifications/history?limit=${PAGE_SIZE}&offset=${next}`)
      .then(history.setData)
      .catch((e: Error) => toast("error", e.message));
  };

  async function forget(item: NotificationItem) {
    if (!window.confirm(`Effacer « ${item.label} » de l'historique de ${item.user_email ?? item.user_name} ? Elle pourra repartir au prochain passage (≤ 15 min).`)) return;
    try {
      await api.del(`/notifications/history/${item.id}`);
      toast("success", "Alerte effacée : elle repartira au prochain passage");
      changePage(offset);
      void stats.reload();
    } catch (e) {
      toast("error", (e as Error).message);
    }
  }

  const total = history.data?.total ?? 0;
  const maxKind = Math.max(1, ...(stats.data?.by_kind.map((k) => k.count) ?? [1]));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {stats.data && (
            <Badge tone={stats.data.push_enabled ? "success" : "danger"}>
              {stats.data.push_enabled ? "Push actif sur le serveur" : "Push désactivé (PUSH_ENABLED)"}
            </Badge>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setMode("user")}>
            <Send className="h-4 w-4" />
            Envoyer à un utilisateur
          </Button>
          <Button variant="brand" onClick={() => setMode("all")}>
            <Megaphone className="h-4 w-4" />
            Envoyer à tous
          </Button>
        </div>
      </div>

      {stats.error ? (
        <ErrorState message={stats.error} onRetry={stats.reload} />
      ) : !stats.data ? (
        <Loading />
      ) : (
        <section className="grid gap-4 lg:grid-cols-3">
          <Card title="Par type" description={`Envois des ${stats.data.days} derniers jours`} className="lg:col-span-2">
            {stats.data.by_kind.length === 0 ? (
              <p className="py-6 text-center text-sm text-zinc-500">Aucune notification sur la période.</p>
            ) : (
              <ul className="space-y-3">
                {stats.data.by_kind.map((k) => (
                  <li key={k.kind}>
                    <div className="mb-1 flex justify-between text-sm">
                      <span className="text-zinc-700">{k.label}</span>
                      <span className="font-medium text-zinc-900">{formatNumber(k.count)}</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-brand-50">
                      <div className="h-full rounded-full bg-brand-500" style={{ width: `${(k.count / maxKind) * 100}%` }} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card title="Appareils" description={`${formatNumber(stats.data.users_with_push)} utilisateurs joignables`}>
            {stats.data.devices.length === 0 ? (
              <p className="py-6 text-center text-sm text-zinc-500">Aucun appareil enregistré.</p>
            ) : (
              <ul className="space-y-2">
                {stats.data.devices.map((d) => (
                  <li key={d.platform} className="flex items-center justify-between rounded-xl bg-brand-50/50 px-3 py-2.5">
                    <span className="flex items-center gap-2 text-sm capitalize text-zinc-700">
                      <Smartphone className="h-4 w-4 text-brand-600" />
                      {d.platform}
                    </span>
                    <span className="text-sm font-semibold text-zinc-900">{formatNumber(d.count)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </section>
      )}

      <Card title="Historique" description="Chaque alerte n'est envoyée qu'une fois ; l'effacer permet de la renvoyer" contentClassName="p-0">
        {history.error ? (
          <div className="p-5">
            <ErrorState message={history.error} onRetry={history.reload} />
          </div>
        ) : !history.data ? (
          <Loading />
        ) : history.data.items.length === 0 ? (
          <p className="py-10 text-center text-sm text-zinc-500">Aucune notification envoyée.</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-100 text-left text-xs text-zinc-500">
                    <th className="px-5 py-3 font-medium">Type</th>
                    <th className="px-5 py-3 font-medium">Destinataire</th>
                    <th className="px-5 py-3 font-medium">Envoyée le</th>
                    <th className="px-5 py-3 font-medium">Clé</th>
                    <th className="px-5 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {history.data.items.map((item) => (
                    <tr key={item.id} className="border-b border-zinc-50 last:border-0 hover:bg-brand-50/30">
                      <td className="px-5 py-3">
                        <Badge tone={item.kind === "admin" ? "brand" : "neutral"}>{item.label}</Badge>
                      </td>
                      <td className="px-5 py-3">
                        <div className="font-medium text-zinc-800">{item.user_name}</div>
                        <div className="text-xs text-zinc-500">{item.user_email ?? "—"}</div>
                      </td>
                      <td className="whitespace-nowrap px-5 py-3 text-zinc-600">{formatDateTime(item.created_at)}</td>
                      <td className="max-w-56 truncate px-5 py-3 font-mono text-xs text-zinc-400" title={item.key}>
                        {item.key}
                      </td>
                      <td className="px-5 py-3 text-right">
                        {item.kind !== "admin" && (
                          <Button variant="ghost" size="sm" onClick={() => void forget(item)} title="Renvoyer au prochain passage">
                            <RotateCcw className="h-3.5 w-3.5" />
                            Relancer
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between border-t border-zinc-100 px-5 py-3 text-xs text-zinc-500">
              <span>
                {offset + 1}–{Math.min(offset + PAGE_SIZE, total)} sur {formatNumber(total)}
              </span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={offset === 0} onClick={() => changePage(Math.max(0, offset - PAGE_SIZE))}>
                  Précédent
                </Button>
                <Button variant="outline" size="sm" disabled={offset + PAGE_SIZE >= total} onClick={() => changePage(offset + PAGE_SIZE)}>
                  Suivant
                </Button>
              </div>
            </div>
          </>
        )}
      </Card>

      <SendDrawer
        mode={mode}
        reachable={stats.data?.users_with_push ?? 0}
        onClose={() => setMode(null)}
        onSent={() => {
          void stats.reload();
          changePage(0);
        }}
      />
    </div>
  );
}

function SendDrawer({
  mode,
  reachable,
  onClose,
  onSent,
}: {
  mode: Mode;
  reachable: number;
  onClose: () => void;
  onSent: () => void;
}) {
  const toast = useToast();
  const [email, setEmail] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);

  const all = mode === "all";
  const ready = title.trim() && body.trim() && (all ? confirmation === CONFIRMATION : email.trim());

  async function send() {
    setBusy(true);
    try {
      if (all) {
        const result = await api.post<{ users: number; devices: number }>("/notifications/broadcast", { title, body, confirmation });
        toast("success", `Diffusion lancée vers ${formatNumber(result.devices)} appareil(s) ; l'historique se remplit au fil de l'envoi`);
      } else {
        const result = await api.post<{ users: number; accepted: number }>("/notifications/send", { email, title, body });
        toast(
          result.accepted ? "success" : "error",
          result.accepted
            ? `Envoyée : ${result.accepted} appareil(s) atteint(s)`
            : "Aucun appareil atteint (pas d'appareil enregistré ou refus d'Expo)",
        );
      }
      setTitle("");
      setBody("");
      setConfirmation("");
      onSent();
      onClose();
    } catch (e) {
      toast("error", (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Drawer
      open={mode !== null}
      onClose={onClose}
      title={all ? "Envoyer à tous" : "Envoyer à un utilisateur"}
      description={all ? `${formatNumber(reachable)} utilisateurs ont un appareil enregistré` : "Tous les appareils du compte recevront la notification"}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Annuler
          </Button>
          <Button variant="brand" disabled={!ready || busy} onClick={() => void send()}>
            <Send className="h-4 w-4" />
            Envoyer
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {!all && (
          <div>
            <Label htmlFor="push-email">E-mail du compte</Label>
            <Input id="push-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="awa@exemple.com" />
          </div>
        )}
        <div>
          <Label htmlFor="push-title">Titre</Label>
          <Input id="push-title" maxLength={80} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="💜 Nouveauté dans Lucia" />
        </div>
        <div>
          <Label htmlFor="push-body">Message</Label>
          <Textarea id="push-body" maxLength={240} value={body} onChange={(e) => setBody(e.target.value)} />
          <p className="mt-1 text-right text-[11px] text-zinc-400">{body.length}/240</p>
        </div>

        {/* Aperçu façon notification Android */}
        <div className="rounded-2xl bg-brand-50/60 p-3 ring-1 ring-brand-100">
          <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-brand-700">Aperçu</p>
          <div className="rounded-xl bg-white p-3 shadow-sm">
            <div className="mb-1 flex items-center gap-1.5 text-[11px] text-zinc-500">
              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-brand-600 text-[8px] font-bold text-white">L</span>
              Lucia · maintenant
            </div>
            <p className="text-sm font-semibold text-zinc-900">{title || "Titre"}</p>
            <p className="whitespace-pre-line text-sm text-zinc-600">{body || "Message"}</p>
          </div>
        </div>

        {all && (
          <div>
            <Label htmlFor="push-confirm">
              Tapez <span className="font-semibold text-rose-600">{CONFIRMATION}</span> pour confirmer
            </Label>
            <Input id="push-confirm" value={confirmation} onChange={(e) => setConfirmation(e.target.value)} />
          </div>
        )}
      </div>
    </Drawer>
  );
}
