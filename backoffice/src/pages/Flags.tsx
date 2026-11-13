import { useState } from "react";
import { Link } from "react-router-dom";
import { Flag, KeyRound, Pencil, Plus, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Drawer } from "@/components/ui/drawer";
import { Input, Label, Textarea } from "@/components/ui/input";
import { ErrorState, Loading } from "@/components/ui/states";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/toast";
import { api, ApiError, type FlagParam, type Flags as FlagsData } from "@/lib/api";
import { useResource } from "@/lib/hooks";
import { formatDateTime } from "@/lib/utils";

const loadFlags = () => api.get<FlagsData>("/flags");
type ValueType = FlagParam["value_type"];
type Editing = { param: FlagParam | null } | null; // param null = nouveau paramètre

export function Flags() {
  const toast = useToast();
  const { data, error, loading, reload, setData } = useResource(loadFlags);
  const [editing, setEditing] = useState<Editing>(null);
  const [saving, setSaving] = useState<string | null>(null);

  async function publish(key: string, body: { value: string; value_type?: ValueType; description?: string }) {
    setSaving(key);
    try {
      const fresh = await api.put<FlagsData>(`/flags/${encodeURIComponent(key)}`, body);
      setData(fresh);
      toast("success", `${key} publié (version ${fresh.version ?? "?"}) : les apps le reçoivent en quelques secondes`);
      return true;
    } catch (e) {
      toast("error", (e as Error).message);
      if (e instanceof ApiError && e.status === 409) void reload();
      return false;
    } finally {
      setSaving(null);
    }
  }

  if (loading && !data) return <Loading label="Lecture de Remote Config…" />;
  if (error && !data) {
    const notConfigured = error.toLowerCase().includes("compte de service");
    return notConfigured ? <NotConfigured /> : <ErrorState message={error} onRetry={reload} />;
  }
  if (!data) return null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
          <Badge tone="brand">{data.project}</Badge>
          <span>Version {data.version ?? "—"}</span>
          {data.updated_at && (
            <span>
              · publiée le {formatDateTime(data.updated_at)}
              {data.updated_by ? ` par ${data.updated_by}` : ""}
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => void reload()} disabled={loading}>
            <RefreshCw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
            Actualiser
          </Button>
          <Button variant="brand" onClick={() => setEditing({ param: null })}>
            <Plus className="h-4 w-4" />
            Nouveau flag
          </Button>
        </div>
      </div>

      <Card title="Paramètres" description="Valeur par défaut publiée ; les conditions et déploiements progressifs restent gérés dans la console Firebase" contentClassName="p-0">
        <ul className="divide-y divide-zinc-100">
          {data.parameters.map((p) => (
            <li key={p.key} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-[13px] font-semibold text-zinc-900">{p.key}</span>
                  <Badge>{p.value_type}</Badge>
                  {p.group && <Badge tone="neutral">{p.group}</Badge>}
                </div>
                {p.description && <p className="mt-1 text-xs text-zinc-500">{p.description}</p>}
                {p.value_type !== "BOOLEAN" && (
                  <p className="mt-2 line-clamp-2 break-all rounded-lg bg-zinc-50 px-2.5 py-1.5 font-mono text-xs text-zinc-700">
                    {p.in_app_default ? <em className="text-zinc-400">valeur intégrée à l'app</em> : p.value || <em className="text-zinc-400">vide</em>}
                  </p>
                )}
                {p.conditional.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {p.conditional.map((c) => (
                      <Badge key={c.condition} tone="warning">
                        {c.rollout ? "Déploiement" : "Condition"} « {c.condition} » : {(c.value ?? "").slice(0, 40)}
                        {(c.value ?? "").length > 40 ? "…" : ""}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {p.value_type === "BOOLEAN" ? (
                  <>
                    <span className="text-xs font-medium text-zinc-500">{p.value === "true" ? "Activé" : "Désactivé"}</span>
                    <Switch
                      label={p.key}
                      checked={p.value === "true"}
                      disabled={saving === p.key}
                      onChange={(next) => {
                        if (window.confirm(`${next ? "Activer" : "Désactiver"} ${p.key} pour tous les utilisateurs ?`)) {
                          void publish(p.key, { value: String(next) });
                        }
                      }}
                    />
                  </>
                ) : (
                  <Button variant="outline" size="sm" onClick={() => setEditing({ param: p })}>
                    <Pencil className="h-3.5 w-3.5" />
                    Modifier
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      </Card>

      {data.conditions.length > 0 && (
        <Card title="Conditions" description="Définies dans la console Firebase">
          <ul className="space-y-2">
            {data.conditions.map((c) => (
              <li key={c.name} className="flex flex-wrap items-center gap-2 text-sm">
                <Flag className="h-4 w-4 text-brand-600" />
                <span className="font-medium text-zinc-800">{c.name}</span>
                <code className="rounded-md bg-zinc-50 px-2 py-0.5 text-xs text-zinc-600">{c.expression}</code>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <FlagDrawer
        editing={editing}
        busy={saving !== null}
        onClose={() => setEditing(null)}
        onSave={async (key, body) => {
          if (await publish(key, body)) setEditing(null);
        }}
      />
    </div>
  );
}

function FlagDrawer({
  editing,
  busy,
  onClose,
  onSave,
}: {
  editing: Editing;
  busy: boolean;
  onClose: () => void;
  onSave: (key: string, body: { value: string; value_type?: ValueType; description?: string }) => Promise<void>;
}) {
  const param = editing?.param ?? null;
  const isNew = editing !== null && param === null;
  const [key, setKey] = useState("");
  const [valueType, setValueType] = useState<ValueType>("STRING");
  const [value, setValue] = useState("");
  const [description, setDescription] = useState("");
  const [openedFor, setOpenedFor] = useState<Editing>(null);

  // Réinitialise le formulaire à chaque ouverture.
  if (editing !== openedFor) {
    setOpenedFor(editing);
    setKey(param?.key ?? "");
    setValueType(param?.value_type ?? "STRING");
    setValue(param?.value ?? "");
    setDescription(param?.description ?? "");
  }

  const type = param?.value_type ?? valueType;
  const multiline = type === "JSON" || type === "STRING";

  return (
    <Drawer
      open={editing !== null}
      onClose={onClose}
      title={isNew ? "Nouveau flag" : (param?.key ?? "")}
      description="La valeur est publiée immédiatement dans Firebase Remote Config"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Annuler
          </Button>
          <Button
            variant="brand"
            disabled={busy || (isNew && !/^[A-Za-z_][A-Za-z0-9_]*$/.test(key))}
            onClick={() =>
              void onSave(isNew ? key : param!.key, {
                value,
                ...(isNew ? { value_type: valueType } : {}),
                description,
              })
            }
          >
            Publier
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {isNew && (
          <>
            <div>
              <Label htmlFor="flag-key">Clé</Label>
              <Input id="flag-key" className="font-mono" value={key} onChange={(e) => setKey(e.target.value)} placeholder="nouvelle_fonction_enabled" />
            </div>
            <div>
              <Label htmlFor="flag-type">Type</Label>
              <select
                id="flag-type"
                value={valueType}
                onChange={(e) => {
                  const t = e.target.value as ValueType;
                  setValueType(t);
                  if (t === "BOOLEAN") setValue("false");
                }}
                className="h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20"
              >
                {(["BOOLEAN", "STRING", "NUMBER", "JSON"] as const).map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </div>
          </>
        )}
        <div>
          <Label htmlFor="flag-value">Valeur par défaut</Label>
          {type === "BOOLEAN" ? (
            <div className="flex items-center gap-3">
              <Switch label="Valeur" checked={value === "true"} onChange={(v) => setValue(String(v))} />
              <span className="text-sm text-zinc-600">{value === "true" ? "true" : "false"}</span>
            </div>
          ) : multiline ? (
            <Textarea id="flag-value" className="font-mono text-xs" rows={type === "JSON" ? 10 : 4} value={value} onChange={(e) => setValue(e.target.value)} />
          ) : (
            <Input id="flag-value" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} />
          )}
        </div>
        <div>
          <Label htmlFor="flag-desc">Description</Label>
          <Input id="flag-desc" maxLength={256} value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        {param?.conditional.length ? (
          <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Ce paramètre a aussi des valeurs conditionnelles ; elles restent inchangées et priment pour les appareils concernés.
          </p>
        ) : null}
      </div>
    </Drawer>
  );
}

function NotConfigured() {
  return (
    <div className="flex flex-col items-center gap-4 rounded-2xl bg-white px-6 py-14 text-center shadow-sm ring-1 ring-zinc-200/60">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
        <KeyRound className="h-6 w-6" />
      </div>
      <div>
        <h2 className="text-base font-semibold text-zinc-900">Compte de service Firebase requis</h2>
        <p className="mx-auto mt-1 max-w-md text-sm text-zinc-500">
          Pour lire et publier Remote Config, générez une clé dans la console Firebase (Paramètres du projet › Comptes de
          service › Générer une nouvelle clé privée), puis collez le JSON dans Configuration.
        </p>
      </div>
      <Link to="/settings">
        <Button variant="brand">Ouvrir la configuration</Button>
      </Link>
    </div>
  );
}
