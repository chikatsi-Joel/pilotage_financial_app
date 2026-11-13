import { useState } from "react";
import { Database, Lock, Pencil, Plus, Server, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Drawer } from "@/components/ui/drawer";
import { Input, Label, Textarea } from "@/components/ui/input";
import { ErrorState, Loading } from "@/components/ui/states";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/toast";
import { api, type Setting } from "@/lib/api";
import { useResource } from "@/lib/hooks";
import { formatDateTime } from "@/lib/utils";

const loadSettings = () => api.get<Setting[]>("/settings");

const SOURCE: Record<Setting["source"], { label: string; tone: "brand" | "neutral" | "warning" | "danger" }> = {
  database: { label: "Base de données", tone: "brand" },
  environment: { label: "Fichier .env", tone: "neutral" },
  unset: { label: "Non défini", tone: "warning" },
  unreadable: { label: "Illisible", tone: "danger" },
};

type Editing = { setting: Setting | null } | null;

export function Settings() {
  const toast = useToast();
  const { data, error, loading, reload } = useResource(loadSettings);
  const [editing, setEditing] = useState<Editing>(null);

  async function remove(s: Setting) {
    const after = s.known ? "La valeur du fichier .env reprendra effet." : "La clé sera supprimée.";
    if (!window.confirm(`Supprimer ${s.key} de la base ? ${after}`)) return;
    try {
      await api.del(`/settings/${s.key}`);
      toast("success", `${s.key} supprimée`);
      void reload();
    } catch (e) {
      toast("error", (e as Error).message);
    }
  }

  if (loading && !data) return <Loading />;
  if (error || !data) return <ErrorState message={error ?? "Configuration indisponible"} onRetry={reload} />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-2xl text-sm text-zinc-500">
          Une valeur enregistrée ici remplace celle du fichier .env, sans redémarrer le serveur (prise en compte en moins d'une
          minute). Les secrets sont chiffrés en base et ne sont jamais réaffichés.
        </p>
        <Button variant="brand" onClick={() => setEditing({ setting: null })}>
          <Plus className="h-4 w-4" />
          Nouvelle clé
        </Button>
      </div>

      <Card contentClassName="p-0">
        <ul className="divide-y divide-zinc-100">
          {data.map((s) => (
            <li key={s.key} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                  {s.secret ? <Lock className="h-4 w-4" /> : s.source === "database" ? <Database className="h-4 w-4" /> : <Server className="h-4 w-4" />}
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-zinc-900">{s.label}</span>
                    <span className="font-mono text-[11px] text-zinc-400">{s.key}</span>
                    <Badge tone={SOURCE[s.source].tone}>{SOURCE[s.source].label}</Badge>
                  </div>
                  {s.description && <p className="mt-0.5 text-xs text-zinc-500">{s.description}</p>}
                  <p className="mt-1.5 truncate font-mono text-xs text-zinc-700">{s.value || <span className="text-zinc-400">—</span>}</p>
                  {s.updated_at && (
                    <p className="mt-1 text-[11px] text-zinc-400">
                      Modifiée le {formatDateTime(s.updated_at)}
                      {s.updated_by ? ` par ${s.updated_by}` : ""}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex shrink-0 gap-2">
                <Button variant="outline" size="sm" onClick={() => setEditing({ setting: s })}>
                  <Pencil className="h-3.5 w-3.5" />
                  {s.source === "database" ? "Remplacer" : "Définir"}
                </Button>
                {s.source === "database" || s.source === "unreadable" ? (
                  <Button variant="ghost" size="sm" onClick={() => void remove(s)} aria-label={`Supprimer ${s.key}`}>
                    <Trash2 className="h-3.5 w-3.5 text-rose-500" />
                  </Button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      </Card>

      <SettingDrawer editing={editing} onClose={() => setEditing(null)} onSaved={() => void reload()} />
    </div>
  );
}

function SettingDrawer({ editing, onClose, onSaved }: { editing: Editing; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const setting = editing?.setting ?? null;
  const isNew = editing !== null && setting === null;
  const [key, setKey] = useState("");
  const [value, setValue] = useState("");
  const [secret, setSecret] = useState(false);
  const [busy, setBusy] = useState(false);
  const [openedFor, setOpenedFor] = useState<Editing>(null);

  if (editing !== openedFor) {
    setOpenedFor(editing);
    setKey(setting?.key ?? "");
    // Un secret n'est jamais prérempli ; une valeur simple l'est.
    setValue(setting && !setting.secret ? setting.value : "");
    setSecret(setting?.secret ?? false);
  }

  const validKey = /^[a-z][a-z0-9_]{1,79}$/.test(key);

  async function save() {
    setBusy(true);
    try {
      await api.put(`/settings/${key}`, { value, ...(isNew ? { secret } : {}) });
      toast("success", `${key} enregistrée`);
      onSaved();
      onClose();
    } catch (e) {
      toast("error", (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Drawer
      open={editing !== null}
      onClose={onClose}
      title={isNew ? "Nouvelle clé" : (setting?.label ?? "")}
      description={setting?.secret ? "Secret chiffré : saisissez la nouvelle valeur complète" : setting?.description}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Annuler
          </Button>
          <Button variant="brand" disabled={busy || !validKey || !value.trim()} onClick={() => void save()}>
            Enregistrer
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {isNew && (
          <div>
            <Label htmlFor="setting-key">Clé</Label>
            <Input id="setting-key" className="font-mono" value={key} onChange={(e) => setKey(e.target.value.toLowerCase())} placeholder="support_email" />
            {key && !validKey && <p className="mt-1 text-[11px] text-rose-600">Minuscules, chiffres et _ ; commence par une lettre.</p>}
          </div>
        )}
        <div>
          <Label htmlFor="setting-value">Valeur</Label>
          {setting?.multiline ? (
            <Textarea
              id="setting-value"
              className="font-mono text-xs"
              rows={12}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder='{ "type": "service_account", … }'
            />
          ) : (
            <Input
              id="setting-value"
              type={setting?.secret || (isNew && secret) ? "password" : "text"}
              autoComplete="off"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={setting?.secret ? `Actuelle : ${setting.value || "aucune"}` : undefined}
            />
          )}
        </div>
        {isNew && (
          <div className="flex items-center justify-between rounded-xl bg-brand-50/60 px-3 py-2.5">
            <div>
              <p className="text-sm font-medium text-zinc-800">Secret</p>
              <p className="text-xs text-zinc-500">Chiffré en base, jamais réaffiché</p>
            </div>
            <Switch label="Secret" checked={secret} onChange={setSecret} />
          </div>
        )}
      </div>
    </Drawer>
  );
}
