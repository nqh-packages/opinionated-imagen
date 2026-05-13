import { useState, useEffect, useCallback } from "react";
import { getAuthMe, sendMagicLink, type AuthMe } from "~/lib/api";

interface CompositionShot {
  type: string;
  ratio: number;
}

interface Scene {
  id: string;
  name: string;
  description: string;
  baseScene: string;
  tags: string[];
  compositionPlan: CompositionShot[];
  shotCount: number;
}

type VariantMode =
  | "balanced-editorial"
  | "identity-safe-editorial"
  | "style-forward-editorial";

function composeSummary(plan: CompositionShot[]): string {
  return [...plan]
    .sort((a, b) => b.ratio - a.ratio)
    .map((s) => `${s.ratio}x ${s.type}`)
    .join(", ");
}

export default function CreateApp() {
  const [auth, setAuth] = useState<AuthMe | null>(null);
  const [email, setEmail] = useState("");
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [selected, setSelected] = useState<Scene | null>(null);
  const [prompt, setPrompt] = useState("");
  const [variantMode, setVariantMode] =
    useState<VariantMode>("balanced-editorial");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    Promise.all([
      getAuthMe().catch(() => null),
      fetch("/api/scenes").then((r) => {
        if (!r.ok) throw new Error(`Failed to load Presets (${r.status})`);
        return r.json() as Promise<{ scenes: Scene[] }>;
      }),
    ])
      .then(([me, data]) => {
        setAuth(me);
        setScenes(data.scenes);
        setSelected(data.scenes[0] ?? null);
      })
      .catch((err: Error) => setMessage(err.message))
      .finally(() => setLoading(false));
  }, []);

  const handleSendMagicLink = useCallback(async () => {
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setMessage("Enter a valid email address.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      await sendMagicLink(email);
      setMessage("Check your email for the sign-in link, then come back here.");
    } catch (err) {
      setMessage(
        err instanceof Error ? err.message : "Could not send sign-in link.",
      );
    } finally {
      setBusy(false);
    }
  }, [email]);

  const handleProcess = useCallback(async () => {
    if (!auth) {
      setMessage("Sign in before creating a Contact Sheet.");
      return;
    }
    if (!selected) {
      setMessage("Pick a Preset first.");
      return;
    }
    const sessionToken = window.localStorage.getItem("oi_latest_session_token");
    if (!sessionToken) {
      setMessage("Build a profile first.");
      return;
    }

    setBusy(true);
    setMessage("");
    try {
      const res = await fetch("/api/packs", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionToken,
          presetId: selected.id,
          prompt,
          variantMode,
        }),
      });
      if (!res.ok)
        throw new Error(
          await readApiMessage(res, "Could not start Contact Sheet."),
        );
      const body = (await res.json()) as { packId: string };
      window.localStorage.setItem("oi_latest_pack_id", body.packId);
      setMessage("Processing Contact Sheet...");
      await pollPack(body.packId);
      window.location.href = "/gallery";
    } catch (err) {
      setMessage(
        err instanceof Error ? err.message : "Could not create Contact Sheet.",
      );
    } finally {
      setBusy(false);
    }
  }, [auth, prompt, selected, variantMode]);

  if (loading)
    return <p className="text-sm text-muted-foreground">Loading Presets...</p>;

  return (
    <div className="space-y-8">
      {!auth ? (
        <section className="rounded-lg border border-border bg-card p-5">
          <h2 className="text-sm font-semibold tracking-tight">Sign in</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Create needs your saved Identity Profile and Style Profile.
          </p>
          <div className="mt-4 flex gap-2">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="min-w-0 flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
            />
            <button
              className="rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50"
              disabled={busy}
              onClick={handleSendMagicLink}
            >
              Send link
            </button>
          </div>
        </section>
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {scenes.map((scene) => (
          <button
            key={scene.id}
            onClick={() => setSelected(scene)}
            className={`rounded-lg border p-5 text-left transition-colors ${
              selected?.id === scene.id
                ? "border-primary bg-primary/5"
                : "border-border bg-card hover:border-primary/50 hover:bg-accent"
            }`}
          >
            <h3 className="text-sm font-semibold tracking-tight">
              {scene.name}
            </h3>
            <p className="mt-2 text-sm text-muted-foreground">
              {scene.description}
            </p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {scene.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full bg-secondary px-2.5 py-0.5 text-tag font-medium text-secondary-foreground"
                >
                  {tag}
                </span>
              ))}
            </div>
          </button>
        ))}
      </div>

      {selected ? (
        <section className="space-y-5 rounded-lg border border-border bg-card p-6">
          <div>
            <h2 className="text-xl font-semibold tracking-tight">
              {selected.name}
            </h2>
            <p className="mt-2 leading-relaxed text-foreground/85">
              {selected.baseScene}
            </p>
          </div>

          <div className="grid gap-3 text-sm text-muted-foreground sm:grid-cols-2">
            <p>
              <span className="font-medium text-foreground">Composition:</span>{" "}
              {composeSummary(selected.compositionPlan)}
            </p>
            <p>
              <span className="font-medium text-foreground">Variations:</span>{" "}
              {selected.shotCount}
            </p>
          </div>

          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Optional Intention, outfit, location, or story detail"
            className="min-h-28 w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
          />

          <div className="grid gap-2 sm:grid-cols-3">
            <VariantButton
              value="balanced-editorial"
              current={variantMode}
              onSelect={setVariantMode}
              label="Balanced"
            />
            <VariantButton
              value="identity-safe-editorial"
              current={variantMode}
              onSelect={setVariantMode}
              label="Identity Safe"
            />
            <VariantButton
              value="style-forward-editorial"
              current={variantMode}
              onSelect={setVariantMode}
              label="Style Forward"
            />
          </div>

          {message ? (
            <p className="text-sm text-destructive">{message}</p>
          ) : null}

          <div className="flex justify-end">
            <button
              onClick={handleProcess}
              disabled={busy}
              className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {busy ? "Processing..." : "Process Contact Sheet"}
            </button>
          </div>
        </section>
      ) : null}
    </div>
  );
}

function VariantButton(props: {
  value: VariantMode;
  current: VariantMode;
  label: string;
  onSelect: (value: VariantMode) => void;
}) {
  return (
    <button
      className={`rounded-md border px-3 py-2 text-sm ${
        props.current === props.value
          ? "border-primary bg-primary/5 text-foreground"
          : "border-border text-muted-foreground"
      }`}
      onClick={() => props.onSelect(props.value)}
    >
      {props.label}
    </button>
  );
}

async function pollPack(packId: string) {
  for (let i = 0; i < 60; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    const res = await fetch(`/api/packs/${encodeURIComponent(packId)}`, {
      credentials: "include",
    });
    if (!res.ok) continue;
    const body = (await res.json()) as {
      pack: { status: string; errorMessage?: string };
    };
    if (body.pack.status === "ready") return;
    if (body.pack.status === "error")
      throw new Error(
        body.pack.errorMessage || "Contact Sheet generation failed.",
      );
  }
  throw new Error(
    "Contact Sheet is still processing. Check Gallery again soon.",
  );
}

async function readApiMessage(
  res: Response,
  fallback: string,
): Promise<string> {
  try {
    const body = (await res.json()) as { message?: string };
    return body.message || fallback;
  } catch {
    return fallback;
  }
}
