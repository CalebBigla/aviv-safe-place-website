import { useState, type FormEvent } from "react";
import { Link, Outlet, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowDown,
  ArrowUp,
  BookOpen,
  CalendarClock,
  CalendarDays,
  FileText,
  Image,
  LayoutDashboard,
  LogOut,
  Pencil,
  Plus,
  Save,
  Settings,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import {
  deleteCms,
  getAdminContent,
  getAdminIdentity,
  reorderCms,
  saveAdminName,
  saveCms,
  updateContactStatus,
  uploadMedia,
} from "@/lib/aviv/admin.functions";
import {
  cmsSchema,
  homeFields,
  pagesWithBody,
  settingKeys,
  settingLabels,
  type HomeField,
} from "@/lib/aviv/admin-schema";
import { formatNaira, koboToNairaText, nairaToKobo } from "@/lib/aviv/format";
import { Wordmark } from "./aviv-site";

const nav = [
  { to: "/admin", label: "Overview", Icon: LayoutDashboard },
  { to: "/admin/bookings", label: "Bookings", Icon: CalendarDays },
  { to: "/admin/availability", label: "Availability", Icon: CalendarClock },
  { to: "/admin/services", label: "Services", Icon: BookOpen },
  { to: "/admin/pages", label: "Pages & FAQs", Icon: FileText },
  { to: "/admin/media", label: "Media", Icon: Image },
  { to: "/admin/settings", label: "Settings", Icon: Settings },
] as const;

export function AdminShell() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const identity = useServerFn(getAdminIdentity);
  const { data } = useQuery({ queryKey: ["aviv-admin-identity"], queryFn: () => identity() });
  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <Wordmark />
        <span className="text-xs text-muted-foreground mt-7 mb-4">ADMINISTRATION</span>
        <nav aria-label="Administration">
          {nav.map(({ to, label, Icon }) => (
            <Button key={to} variant="ghost" asChild className="justify-start">
              <Link
                to={to}
                activeOptions={{ exact: to === "/admin" }}
                activeProps={{ className: "bg-accent" }}
              >
                <Icon size={18} />
                {label}
              </Link>
            </Button>
          ))}
        </nav>
        <div className="mt-auto pt-8">
          <p className="text-sm mb-3">{data?.displayName}</p>
          <Button
            variant="outline"
            onClick={async () => {
              await qc.cancelQueries();
              qc.clear();
              await supabase.auth.signOut();
              await navigate({ to: "/admin/login", replace: true });
            }}
          >
            <LogOut />
            Sign out
          </Button>
        </div>
      </aside>
      <div className="admin-main">
        <header className="admin-topbar">
          <span>AVIV Safe Place</span>
          <Button variant="outline" asChild>
            <Link to="/">View website</Link>
          </Button>
        </header>
        <Outlet />
      </div>
    </div>
  );
}

type AdminData = Awaited<ReturnType<typeof getAdminContent>>;
type Row = Record<string, unknown>;
type Kind = "services" | "pages" | "faqs" | "public_settings" | "media_assets";

type Field = { key: string; label: string; multiline?: boolean; required?: boolean; help?: string };
const serviceFields: Field[] = [
  { key: "title", label: "Name", required: true },
  {
    key: "slug",
    label: "Web address key",
    required: true,
    help: "Lowercase words separated by hyphens, e.g. individual-session.",
  },
  { key: "description", label: "Short description", multiline: true },
  {
    key: "full_description",
    label: "Full description (shown under “More about this service”)",
    multiline: true,
  },
  { key: "audience", label: "Intended audience (shown as “For …”)" },
  { key: "delivery_format", label: "Delivery format, e.g. Online video session" },
];
const pageFields = (slug: unknown): Field[] => [
  { key: "title", label: "Internal name", required: true, help: "Used in administration only." },
  ...(pagesWithBody.includes(slug as (typeof pagesWithBody)[number])
    ? [
        {
          key: "body",
          label: "Page content",
          multiline: true,
          help: "Separate paragraphs with a blank line.",
        },
      ]
    : []),
  {
    key: "seo_title",
    label: "Search and sharing title",
    help: "Leave blank to use the default page title.",
  },
  { key: "seo_description", label: "Search and sharing description", multiline: true },
];
const fields: Record<Kind, (row: Row) => Field[]> = {
  services: () => serviceFields,
  pages: (row) => pageFields(row["slug"]),
  faqs: () => [
    { key: "question", label: "Question", required: true },
    { key: "answer", label: "Answer", multiline: true, required: true },
  ],
  public_settings: () => [{ key: "value", label: "Value", multiline: true }],
  media_assets: () => [
    { key: "alt_text", label: "Alternative text (describe the image)", required: true },
  ],
};
const pageSlugs = [
  "home",
  "about",
  "services",
  "contact",
  "book",
  "privacy",
  "terms",
  "cancellation-policy",
] as const;
const deleteNotes: Record<Kind, string> = {
  services:
    "A service that has bookings can't be deleted. To hide it, turn off Published or Active instead.",
  pages: "The public page will fall back to its default text.",
  faqs: "The question will be removed from the website.",
  public_settings: "This detail will be removed from the website.",
  media_assets: "The image file will be removed permanently.",
};

function defaults(kind: Kind, count: number): Row {
  if (kind === "services")
    return {
      title: "",
      slug: "",
      description: "",
      full_description: "",
      audience: "",
      duration_minutes: 60,
      price_minor: 0,
      currency: "NGN",
      delivery_format: "",
      sort_order: count,
      active: false,
      published: false,
    };
  if (kind === "pages")
    return {
      slug: "",
      title: "",
      body: "",
      seo_title: "",
      seo_description: "",
      content: {},
      published: false,
    };
  if (kind === "faqs")
    return { question: "", answer: "", category: "General", sort_order: count, published: false };
  return {};
}

const titleOf = (kind: Kind, row: Row) =>
  kind === "public_settings"
    ? (settingLabels[row["key"] as keyof typeof settingLabels] ?? String(row["key"]))
    : String(row["title"] ?? row["question"] ?? row["alt_text"] ?? "");

function Editor({
  kind,
  row,
  media,
  existingSlugs,
  onClose,
  onSaved,
}: {
  kind: Kind;
  row: Row;
  media: AdminData["media"];
  existingSlugs: string[];
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const [value, setValue] = useState<Row>(row);
  const [price, setPrice] = useState(koboToNairaText(row["price_minor"] as number | undefined));
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const save = useServerFn(saveCms);
  const remove = useServerFn(deleteCms);
  const isNew =
    kind === "public_settings" ? !("value" in row) || row["value"] === undefined : !row["id"];
  const content = (
    value["content"] && typeof value["content"] === "object" ? value["content"] : {}
  ) as Record<string, string>;
  const set = (key: string, next: unknown) => setValue({ ...value, [key]: next });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setNotice("");
    let candidate = value;
    if (kind === "services") {
      const kobo = nairaToKobo(price);
      if (kobo === null) return setNotice("Enter the price in naira, e.g. 25000 or 25000.50.");
      candidate = { ...value, price_minor: kobo };
    }
    const parsed = cmsSchema.safeParse({ kind, ...candidate });
    if (!parsed.success) return setNotice(parsed.error.issues.map((i) => i.message).join("\n"));
    setBusy(true);
    try {
      await save({ data: parsed.data });
      onSaved("Changes saved.");
      onClose();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  };

  const destroy = async () => {
    setBusy(true);
    setNotice("");
    try {
      await remove({
        data:
          kind === "public_settings"
            ? { kind, key: String(row["key"]) }
            : { kind, id: String(row["id"]) },
      });
      onSaved("Deleted.");
      onClose();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Could not delete.");
      setConfirmDelete(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {isNew ? "New" : "Edit"}{" "}
            {kind === "public_settings"
              ? titleOf(kind, row).toLowerCase()
              : kind.replaceAll("_", " ").replace(/s$/, "")}
          </DialogTitle>
        </DialogHeader>
        <form className="space-y-5" onSubmit={submit}>
          {kind === "pages" && isNew && (
            <label className="block text-sm space-y-2">
              <span>Page</span>
              <select
                className="admin-select"
                required
                value={String(value["slug"] ?? "")}
                onChange={(e) => set("slug", e.target.value)}
              >
                <option value="">Choose a page</option>
                {pageSlugs
                  .filter((s) => !existingSlugs.includes(s))
                  .map((s) => (
                    <option key={s} value={s}>
                      {s.replaceAll("-", " ")}
                    </option>
                  ))}
              </select>
            </label>
          )}
          {fields[kind](value).map((f) => (
            <label key={f.key} htmlFor={`cms-${f.key}`} className="block text-sm space-y-2">
              <span>{f.label}</span>
              {f.multiline ? (
                <Textarea
                  id={`cms-${f.key}`}
                  rows={f.key === "body" ? 12 : 3}
                  required={f.required}
                  value={String(value[f.key] ?? "")}
                  onChange={(e) => set(f.key, e.target.value)}
                />
              ) : (
                <Input
                  id={`cms-${f.key}`}
                  required={f.required}
                  value={String(value[f.key] ?? "")}
                  onChange={(e) => set(f.key, e.target.value)}
                />
              )}
              {f.help && <span className="block text-xs text-muted-foreground">{f.help}</span>}
            </label>
          ))}
          {kind === "services" && (
            <div className="grid sm:grid-cols-2 gap-4">
              <label className="block text-sm space-y-2">
                <span>Session length</span>
                <select
                  className="admin-select"
                  value={String(value["duration_minutes"])}
                  onChange={(e) => set("duration_minutes", Number(e.target.value))}
                >
                  <option value="30">30 minutes</option>
                  <option value="60">60 minutes</option>
                </select>
              </label>
              <label htmlFor="cms-price" className="block text-sm space-y-2">
                <span>Price (₦)</span>
                <Input
                  id="cms-price"
                  inputMode="decimal"
                  required
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                />
                <span className="block text-xs text-muted-foreground">
                  {nairaToKobo(price) === null
                    ? "Enter an amount in naira."
                    : `Shown as ${formatNaira(nairaToKobo(price))}`}
                </span>
              </label>
            </div>
          )}
          {kind === "pages" && value["slug"] === "home" && (
            <fieldset className="space-y-4 border-t pt-5">
              <legend>Home page sections</legend>
              {(Object.keys(homeFields) as HomeField[]).map((key) => (
                <label key={key} className="block text-sm space-y-2">
                  <span>{homeFields[key]}</span>
                  <Textarea
                    value={content[key] ?? ""}
                    onChange={(e) => set("content", { ...content, [key]: e.target.value })}
                  />
                </label>
              ))}
              <label className="block text-sm space-y-2">
                <span>Cover image (also used for social sharing)</span>
                <select
                  className="admin-select"
                  value={content["hero_media_id"] ?? ""}
                  onChange={(e) => set("content", { ...content, hero_media_id: e.target.value })}
                >
                  <option value="">Original cover</option>
                  {media
                    .filter((m) => m.published)
                    .map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.alt_text}
                      </option>
                    ))}
                </select>
              </label>
            </fieldset>
          )}
          <div className="flex items-center gap-3">
            <Switch
              id="published"
              checked={Boolean(value["published"])}
              onCheckedChange={(published) => set("published", published)}
            />
            <label htmlFor="published">Published</label>
          </div>
          {kind === "services" && (
            <div className="flex items-center gap-3">
              <Switch
                id="active"
                checked={Boolean(value["active"])}
                onCheckedChange={(active) => set("active", active)}
              />
              <label htmlFor="active">Active (can be booked)</label>
            </div>
          )}
          {notice && (
            <p role="alert" className="text-destructive text-sm whitespace-pre-wrap">
              {notice}
            </p>
          )}
          <div className="flex flex-wrap gap-3 justify-between border-t pt-4">
            <div>
              {!isNew &&
                (confirmDelete ? (
                  <div className="space-y-2">
                    <p className="text-sm max-w-xs">{deleteNotes[kind]}</p>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="destructive"
                        disabled={busy}
                        onClick={() => void destroy()}
                      >
                        Delete permanently
                      </Button>
                      <Button type="button" variant="ghost" onClick={() => setConfirmDelete(false)}>
                        Keep
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button type="button" variant="ghost" onClick={() => setConfirmDelete(true)}>
                    <Trash2 />
                    Delete
                  </Button>
                ))}
            </div>
            <div className="flex gap-3">
              <Button variant="outline" type="button" onClick={onClose}>
                <X />
                Cancel
              </Button>
              <Button disabled={busy} type="submit">
                <Save />
                {busy ? "Saving…" : "Save changes"}
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const titles = {
  overview: "A place for everything.",
  services: "Services",
  pages: "Pages & FAQs",
  media: "Media library",
  settings: "Site settings",
};

export function AdminView({ section }: { section: keyof typeof titles }) {
  const read = useServerFn(getAdminContent);
  const qc = useQueryClient();
  const upload = useServerFn(uploadMedia);
  const contactUpdate = useServerFn(updateContactStatus);
  const nameSave = useServerFn(saveAdminName);
  const cmsReorder = useServerFn(reorderCms);
  const { data, error, isPending } = useQuery({
    queryKey: ["aviv-admin-content"],
    queryFn: () => read(),
  });
  const [editing, setEditing] = useState<{ kind: Kind; row: Row } | null>(null);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [alt, setAlt] = useState("");
  const [name, setName] = useState("");
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["aviv-admin-content"] });
    void qc.invalidateQueries({ queryKey: ["aviv-public-content"] });
  };
  if (isPending)
    return (
      <div className="admin-content space-y-6" role="status" aria-label="Loading administration">
        <Skeleton className="h-12 w-64" />
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  if (error || !data)
    return (
      <div className="admin-content">
        <h1>Access unavailable</h1>
        <p role="alert">{error?.message ?? "Could not load administration."}</p>
      </div>
    );
  const edit = (kind: Kind, row?: Row) =>
    setEditing({
      kind,
      row: row ?? defaults(kind, kind === "faqs" ? data.faqs.length : data.services.length),
    });
  const reorder = async (kind: "services" | "faqs", row: Row, direction: -1 | 1) => {
    try {
      await cmsReorder({ data: { kind, id: String(row["id"]), direction } });
      refresh();
      setNotice("Display order updated.");
    } catch {
      setNotice("Could not reorder content.");
    }
  };
  const list = (kind: Kind, rows: Row[], label: string, addLabel?: string) => (
    <section className="mt-10">
      <div className="flex items-center justify-between gap-4 mb-5">
        <h2 className="text-2xl">{label}</h2>
        {addLabel && (
          <Button variant="outline" onClick={() => edit(kind)}>
            <Plus />
            {addLabel}
          </Button>
        )}
      </div>
      {rows.length ? (
        <div className="admin-list">
          {rows
            .filter((row) => titleOf(kind, row).toLowerCase().includes(search.toLowerCase()))
            .map((row, i) => (
              <div key={String(row["id"] ?? row["key"] ?? i)} className="admin-row">
                <div className="min-w-0">
                  <p className="font-medium break-words">
                    {kind === "pages"
                      ? String(row["slug"]).replaceAll("-", " ")
                      : titleOf(kind, row)}
                  </p>
                  <p className="text-xs text-muted-foreground mt-2">
                    {row["published"] ? "Published" : "Unpublished"}
                    {kind === "services" &&
                      ` · ${row["active"] ? "Active" : "Inactive"} · ${formatNaira(row["price_minor"] as number)} · ${row["duration_minutes"] ?? "—"} minutes`}
                    {kind === "public_settings" && row["value"]
                      ? ` · ${String(row["value"]).slice(0, 60)}`
                      : ""}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1">
                  {(kind === "services" || kind === "faqs") && (
                    <>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Move ${titleOf(kind, row)} earlier`}
                        onClick={() => void reorder(kind, row, -1)}
                      >
                        <ArrowUp />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Move ${titleOf(kind, row)} later`}
                        onClick={() => void reorder(kind, row, 1)}
                      >
                        <ArrowDown />
                      </Button>
                    </>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Edit ${titleOf(kind, row)}`}
                    onClick={() => edit(kind, row)}
                  >
                    <Pencil />
                  </Button>
                </div>
              </div>
            ))}
        </div>
      ) : (
        <p className="empty-state">No {label.toLowerCase()} yet.</p>
      )}
    </section>
  );
  const missingPages = pageSlugs.filter((s) => !data.pages.some((p) => p.slug === s));
  return (
    <div className="admin-content">
      <div className="eyebrow">Your safe place, thoughtfully managed</div>
      <h1 className="text-4xl mt-3 mb-7">{titles[section]}</h1>
      {notice && (
        <p role="status" className="mb-5 text-sm">
          {notice}
        </p>
      )}
      {section === "overview" && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-6 border-y py-7">
            {(
              [
                ["New paid requests", data.metrics.new_requests],
                ["Awaiting confirmation", data.metrics.awaiting_confirmation],
                ["Upcoming confirmed sessions", data.metrics.upcoming],
                ["Completed sessions", data.metrics.completed],
                ["Late payments needing review", data.metrics.payment_attention],
                ["Refunds requiring attention", data.metrics.refund_attention],
              ] as const
            ).map(([label, count]) => (
              <div key={label}>
                <p className="text-muted-foreground text-sm">{label}</p>
                <p className="text-3xl mt-3">{count}</p>
              </div>
            ))}
          </div>
          <section className="mt-10">
            <h2 className="text-2xl mb-5">Recent activity</h2>
            {data.audit.length ? (
              data.audit.map((a) => (
                <div className="admin-row" key={a.id}>
                  <span>
                    {a.action.replaceAll("_", " ")} · {a.resource_type.replaceAll("_", " ")}
                  </span>
                  <time className="text-xs text-muted-foreground">
                    {new Date(a.created_at).toLocaleString("en-NG", { timeZone: "Africa/Lagos" })}
                  </time>
                </div>
              ))
            ) : (
              <p className="empty-state">No activity yet.</p>
            )}
          </section>
          <section className="mt-10">
            <h2 className="text-2xl mb-5">Enquiries</h2>
            {data.contacts.length ? (
              data.contacts.map((c) => (
                <details className="border-b py-4" key={c.id}>
                  <summary>
                    {c.subject} · {c.name} · {c.status}
                  </summary>
                  <p className="mt-4">{c.email}</p>
                  <p className="whitespace-pre-wrap my-4">{c.message}</p>
                  {c.status !== "closed" && (
                    <Button
                      variant="outline"
                      onClick={async () => {
                        try {
                          await contactUpdate({ data: { id: c.id, status: "closed" } });
                          refresh();
                        } catch {
                          setNotice("Could not update enquiry.");
                        }
                      }}
                    >
                      Close enquiry
                    </Button>
                  )}
                </details>
              ))
            ) : (
              <p className="empty-state">No enquiries received.</p>
            )}
          </section>
        </>
      )}
      {section === "services" && (
        <>
          <Input
            aria-label="Search services"
            placeholder="Search services"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {list("services", data.services, "Services", "Add service")}
        </>
      )}
      {section === "pages" && (
        <>
          <Input
            aria-label="Search pages and FAQs"
            placeholder="Search pages and FAQs"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {list("pages", data.pages, "Pages", missingPages.length ? "Add page" : undefined)}
          {list("faqs", data.faqs, "FAQs", "Add FAQ")}
        </>
      )}
      {section === "settings" && (
        <>
          <section className="max-w-md space-y-4 border-b pb-6">
            <h2 className="text-xl">Administrator name</h2>
            <Input
              aria-label="Administrator display name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <Button
              onClick={async () => {
                try {
                  await nameSave({ data: { name } });
                  void qc.invalidateQueries({ queryKey: ["aviv-admin-identity"] });
                  setNotice("Name saved.");
                } catch {
                  setNotice("Could not save name.");
                }
              }}
            >
              <Save />
              Save name
            </Button>
          </section>
          {list("public_settings", data.settings, "Contact & footer")}
          <div className="mt-6 flex flex-wrap gap-3">
            {settingKeys
              .filter((key) => !data.settings.some((s) => s.key === key))
              .map((key) => (
                <Button
                  variant="outline"
                  key={key}
                  onClick={() => edit("public_settings", { key, published: false })}
                >
                  <Plus />
                  {settingLabels[key]}
                </Button>
              ))}
          </div>
        </>
      )}
      {section === "media" && (
        <>
          <form
            className="border-y py-6 flex flex-wrap gap-4 items-end"
            onSubmit={async (e) => {
              e.preventDefault();
              const form = e.currentTarget;
              const file = (form.elements.namedItem("file") as HTMLInputElement | null)?.files?.[0];
              if (!file) return;
              setBusy(true);
              setNotice("");
              try {
                const encoded = await new Promise<string>((resolve, reject) => {
                  const reader = new FileReader();
                  reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
                  reader.onerror = reject;
                  reader.readAsDataURL(file);
                });
                await upload({
                  data: {
                    file: encoded,
                    mime: file.type as "image/jpeg" | "image/png" | "image/webp",
                    alt,
                  },
                });
                refresh();
                form.reset();
                setAlt("");
                setNotice("Image uploaded, unpublished.");
              } catch (err) {
                setNotice(err instanceof Error ? err.message : "Could not upload.");
              } finally {
                setBusy(false);
              }
            }}
          >
            <label className="text-sm space-y-2">
              <span className="block">Image (JPEG, PNG or WebP · max 5 MB)</span>
              <Input type="file" name="file" accept="image/jpeg,image/png,image/webp" required />
            </label>
            <label className="text-sm space-y-2">
              <span className="block">Alternative text</span>
              <Input value={alt} onChange={(e) => setAlt(e.target.value)} required />
            </label>
            <Button disabled={busy}>
              <Plus />
              {busy ? "Uploading…" : "Upload image"}
            </Button>
          </form>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 mt-8">
            {data.media.map((m) => (
              <article className="border rounded-md overflow-hidden" key={m.id}>
                <img
                  src={m.url}
                  alt={m.alt_text}
                  className="aspect-[4/3] w-full object-cover"
                  loading="lazy"
                />
                <div className="p-4">
                  <p>{m.alt_text}</p>
                  <p className="text-xs text-muted-foreground my-3">
                    {m.published ? "Published" : "Unpublished"} · {Math.round(m.file_size / 1024)}{" "}
                    KB
                  </p>
                  <Button variant="outline" onClick={() => edit("media_assets", m)}>
                    <Pencil />
                    Edit image
                  </Button>
                </div>
              </article>
            ))}
          </div>
          {!data.media.length && <p className="empty-state mt-7">No uploaded images yet.</p>}
        </>
      )}
      {editing && (
        <Editor
          key={`${editing.kind}-${String(editing.row["id"] ?? editing.row["key"] ?? "new")}`}
          {...editing}
          media={data.media}
          existingSlugs={data.pages.map((p) => p.slug)}
          onClose={() => setEditing(null)}
          onSaved={(message) => {
            refresh();
            setNotice(message);
          }}
        />
      )}
    </div>
  );
}
