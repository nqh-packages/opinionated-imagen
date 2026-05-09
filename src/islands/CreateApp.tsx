import { useState, useEffect, useCallback } from 'react';

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

// --- Auth helpers ---

type AuthState =
  | { status: 'loading' }
  | { status: 'authenticated'; email: string }
  | { status: 'unauthenticated' };

type AuthModalView =
  | { view: 'hidden' }
  | { view: 'email-input' }
  | { view: 'magic-link-sent'; email: string }
  | { view: 'error'; message: string };

async function checkAuth(): Promise<AuthState> {
  try {
    const res = await fetch('/api/auth/me', { credentials: 'include' });
    if (res.ok) {
      const data = (await res.json()) as { email: string };
      return { status: 'authenticated', email: data.email };
    }
    return { status: 'unauthenticated' };
  } catch {
    return { status: 'unauthenticated' };
  }
}

interface MagicLinkResponse {
  ok: boolean;
  message?: string;
}

async function sendMagicLink(email: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch('/api/auth/magic-link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    const data = (await res.json()) as MagicLinkResponse;
    return { ok: data.ok ?? false, error: data.message };
  } catch {
    return { ok: false, error: 'Could not send sign-in link. Check your connection and try again.' };
  }
}

export default function CreateApp() {
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [selected, setSelected] = useState<Scene | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [auth, setAuth] = useState<AuthState>({ status: 'loading' });
  const [authModal, setAuthModal] = useState<AuthModalView>({ view: 'hidden' });
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);

  // Check auth on mount
  useEffect(() => {
    checkAuth().then(setAuth);
  }, []);

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

  const handleProcessDrop = useCallback(async () => {
    // Re-check auth to be sure
    const currentAuth = await checkAuth();
    setAuth(currentAuth);

    if (currentAuth.status === 'authenticated') {
      // Future: proceed to Drop creation flow
      setAuthModal({ view: 'error', message: 'Drop creation is coming soon.' });
    } else {
      setAuthModal({ view: 'email-input' });
    }
  }, []);

  const handleSendMagicLink = useCallback(async () => {
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setAuthModal({ view: 'error', message: 'Enter a valid email address.' });
      return;
    }

    setSending(true);
    setAuthModal({ view: 'email-input' }); // show loading state by staying on this view

    const result = await sendMagicLink(email);

    if (result.ok) {
      setAuthModal({ view: 'magic-link-sent', email });
    } else {
      setAuthModal({ view: 'error', message: result.error || 'Something went wrong. Try again.' });
    }

    setSending(false);
  }, [email]);

  // Re-check auth after returning from magic link redirect
  useEffect(() => {
    if (authModal.view === 'magic-link-sent') {
      // Poll for session on visibility change (user returns from email)
      const handleVisibility = async () => {
        if (document.visibilityState === 'visible') {
          const currentAuth = await checkAuth();
          setAuth(currentAuth);
          if (currentAuth.status === 'authenticated') {
            setAuthModal({ view: 'hidden' });
          }
        }
      };
      document.addEventListener('visibilitychange', handleVisibility);
      return () => document.removeEventListener('visibilitychange', handleVisibility);
    }
  }, [authModal, auth.status]);

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

      {/* The Brief panel + Process Drop */}
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

          {/* Process Drop button */}
          <div className="flex justify-end border-t border-border pt-4">
            <button
              onClick={handleProcessDrop}
              disabled={auth.status === 'loading'}
              className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {auth.status === 'loading' ? 'Checking…' : 'Process Drop'}
            </button>
          </div>
        </div>
      )}

      {/* Auth modal overlay */}
      {authModal.view !== 'hidden' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-xl border border-border bg-card px-8 py-8 shadow-lg">
            {authModal.view === 'email-input' && (
              <div className="space-y-5">
                <div>
                  <h2 className="text-lg font-semibold tracking-tight">Sign in to continue</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Enter your email to receive a sign-in link.
                  </p>
                </div>

                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  disabled={sending}
                  className="block w-full rounded-md border border-border bg-background px-3.5 py-2.5 text-sm outline-none placeholder:text-muted-foreground/60 focus:border-primary focus:ring-1 focus:ring-primary disabled:opacity-50"
                  onKeyDown={(e) => { if (e.key === 'Enter') handleSendMagicLink(); }}
                  autoFocus
                />

                <button
                  onClick={handleSendMagicLink}
                  disabled={sending}
                  className="inline-flex w-full h-10 items-center justify-center rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  {sending ? 'Sending…' : 'Send sign-in link'}
                </button>

                <button
                  onClick={() => { setAuthModal({ view: 'hidden' }); setEmail(''); }}
                  className="block w-full text-center text-sm text-muted-foreground underline underline-offset-2 hover:text-foreground"
                >
                  Cancel
                </button>
              </div>
            )}

            {authModal.view === 'magic-link-sent' && (
              <div className="space-y-5 text-center">
                <h2 className="text-lg font-semibold tracking-tight">Check your email</h2>
                <p className="text-sm text-muted-foreground">
                  We sent a sign-in link to <span className="font-medium text-foreground">{authModal.email}</span>.
                  It expires in 15 minutes.
                </p>
                <p className="text-xs text-muted-foreground/70">
                  After clicking the link, you&apos;ll be signed in automatically.
                </p>

                <button
                  onClick={() => { setAuthModal({ view: 'hidden' }); setEmail(''); }}
                  className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                >
                  Done
                </button>
              </div>
            )}

            {authModal.view === 'error' && (
              <div className="space-y-5 text-center">
                <h2 className="text-lg font-semibold tracking-tight text-destructive">Something went wrong</h2>
                <p className="text-sm text-muted-foreground">{authModal.message}</p>

                <button
                  onClick={() => setAuthModal({ view: 'hidden' })}
                  className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                >
                  Close
                </button>

                {authModal.message !== 'Drop creation is coming soon.' && (
                  <button
                    onClick={() => setAuthModal({ view: 'email-input' })}
                    className="block w-full text-center text-sm text-muted-foreground underline underline-offset-2 hover:text-foreground"
                  >
                    Try again
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
