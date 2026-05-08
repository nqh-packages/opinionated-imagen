import { reactive, html } from '@arrow-js/core';

interface Shot {
  id: string;
  url: string;
  packId: string;
  createdAt: string;
}

export function mountGallery(el: HTMLElement) {
  const state = reactive({
    shots: [] as Shot[],
    loading: true,
  });

  // Placeholder: would fetch from /api/gallery
  setTimeout(() => {
    state.shots = [
      {
        id: '1',
        url: 'https://placehold.co/400x500?text=Shot+1',
        packId: 'pack-1',
        createdAt: new Date().toISOString(),
      },
      {
        id: '2',
        url: 'https://placehold.co/400x500?text=Shot+2',
        packId: 'pack-1',
        createdAt: new Date().toISOString(),
      },
    ];
    state.loading = false;
  }, 600);

  const app = html`
    <div>
      ${() =>
        state.loading
          ? html`<p class="text-sm text-muted-foreground">Loading your shots...</p>`
          : state.shots.length === 0
            ? html`<p class="text-sm text-muted-foreground">No saved shots yet.</p>`
            : html`
                <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  ${state.shots.map(
                    (shot) => html`
                      <div class="group relative overflow-hidden rounded-lg border border-border">
                        <img src="${shot.url}" alt="Saved shot" class="aspect-[4/5] w-full object-cover" />
                        <div class="absolute inset-0 flex items-end bg-gradient-to-t from-black/60 to-transparent p-4 opacity-0 transition-opacity group-hover:opacity-100">
                          <button class="text-xs font-medium text-white hover:underline">Remix</button>
                        </div>
                      </div>
                    `
                  )}
                </div>
              `}
    </div>
  `;

  app(el);
}
