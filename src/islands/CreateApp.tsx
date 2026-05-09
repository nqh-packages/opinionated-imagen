import { useState, useEffect } from 'react';

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

function composeSummary(plan: CompositionShot[]): string {
  const sorted = [...plan].sort((a, b) => b.ratio - a.ratio);
  return sorted.map((s) => `${s.ratio}× ${s.type}`).join(', ');
}

export default function CreateApp() {
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [selected, setSelected] = useState<Scene | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch('/api/scenes')
      .then((r) => {
        if (!r.ok) throw new Error(`Failed to load scenes (${r.status})`);
        return r.json();
      })
      .then((data) => {
        const typed = data as { scenes: Scene[] };
        if (!cancelled) setScenes(typed.scenes);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const handleSelect = (scene: Scene) => {
    setSelected((prev) => (prev?.id === scene.id ? null : scene));
  };

  // --- Loading state ---
  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-muted-foreground">Loading Scenes…</p>
      </div>
    );
  }

  // --- Error state ---
  if (error) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-6 py-10 text-center">
        <p className="text-destructive">Couldn&apos;t load Scenes</p>
        <p className="mt-1 text-sm text-muted-foreground">{error}</p>
        <button
          className="mt-4 inline-flex h-9 items-center justify-center rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          onClick={() => window.location.reload()}
        >
          Try again
        </button>
      </div>
    );
  }

  // --- Empty state ---
  if (scenes.length === 0) {
    return (
      <div className="py-20 text-center">
        <p className="text-muted-foreground">No Scenes available yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Scene grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {scenes.map((scene) => (
          <button
            key={scene.id}
            onClick={() => handleSelect(scene)}
            className={`group cursor-pointer rounded-lg border p-5 text-left transition-colors ${
              selected?.id === scene.id
                ? 'border-primary bg-primary/5'
                : 'border-border bg-card hover:border-primary/50 hover:bg-accent'
            }`}
          >
            <h3 className="text-sm font-semibold tracking-tight">{scene.name}</h3>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {scene.tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-block rounded-full bg-secondary px-2.5 py-0.5 text-tag font-medium text-secondary-foreground"
                >
                  {tag}
                </span>
              ))}
            </div>
          </button>
        ))}
      </div>

      {/* The Brief panel */}
      {selected && (
        <div className="mx-auto max-w-prose space-y-4 rounded-xl border border-border bg-card px-8 py-8">
          <h2 className="text-xl font-semibold tracking-tight">{selected.name}</h2>
          <p className="leading-relaxed text-foreground/85">{selected.baseScene}</p>

          <div className="space-y-1 border-t border-border pt-4 text-sm text-muted-foreground">
            <p>
              <span className="font-medium text-foreground">Composition:</span>{' '}
              {composeSummary(selected.compositionPlan)}
            </p>
            <p>
              <span className="font-medium text-foreground">Shots:</span>{' '}
              {selected.shotCount} total
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
