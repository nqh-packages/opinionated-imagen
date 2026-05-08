import { reactive, html } from '@arrow-js/core';

interface Preset {
  id: string;
  name: string;
  description: string;
}

export function mountCreate(el: HTMLElement) {
  const state = reactive({
    presets: [] as Preset[],
    selectedPreset: null as string | null,
    customPrompt: '',
    mode: 'preset' as 'preset' | 'custom',
    loading: false,
    intention: null as any,
  });

  async function loadPresets() {
    state.loading = true;
    try {
      const res = await fetch('/api/presets');
      const data = (await res.json()) as { presets: Preset[] };
      state.presets = data.presets;
    } catch (e) {
      state.presets = [];
    }
    state.loading = false;
  }

  loadPresets();

  const presetList = html`
    <div class="grid gap-4 sm:grid-cols-2">
      ${() =>
        state.presets.map(
          (preset) => html`
            <div
              class="${() =>
                state.selectedPreset === preset.id
                  ? 'rounded-lg border-2 border-primary bg-card p-5 cursor-pointer'
                  : 'rounded-lg border border-border bg-card p-5 cursor-pointer hover:bg-accent'}"
              @click="${() => (state.selectedPreset = preset.id)}"
            >
              <h3 class="font-medium">${preset.name}</h3>
              <p class="mt-1 text-sm text-muted-foreground">${preset.description}</p>
            </div>
          `
        )}
    </div>
  `;

  const customForm = html`
    <div class="space-y-4">
      <label class="block text-sm font-medium">Describe what you want</label>
      <textarea
        class="w-full rounded-md border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        rows="4"
        placeholder="Me at a basketball court, golden hour, wearing the Nikes I uploaded..."
        @input="${(e: Event) => (state.customPrompt = (e.target as HTMLTextAreaElement).value)}"
      ></textarea>
    </div>
  `;

  const app = html`
    <div class="space-y-6">
      <div class="flex rounded-md border border-border p-1">
        <button
          class="${() =>
            state.mode === 'preset'
              ? 'flex-1 rounded-sm bg-primary py-2 text-sm font-medium text-primary-foreground'
              : 'flex-1 rounded-sm py-2 text-sm font-medium hover:bg-accent'}"
          @click="${() => (state.mode = 'preset')}"
        >Preset</button>
        <button
          class="${() =>
            state.mode === 'custom'
              ? 'flex-1 rounded-sm bg-primary py-2 text-sm font-medium text-primary-foreground'
              : 'flex-1 rounded-sm py-2 text-sm font-medium hover:bg-accent'}"
          @click="${() => (state.mode = 'custom')}"
        >Custom</button>
      </div>

      ${() => (state.mode === 'preset' ? presetList : customForm)}

      <button
        class="inline-flex h-11 w-full items-center justify-center rounded-md bg-primary px-8 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        disabled="${() =>
          state.loading ||
          (state.mode === 'preset' && !state.selectedPreset) ||
          (state.mode === 'custom' && !state.customPrompt.trim())}"
      >
        Confirm intention
      </button>
    </div>
  `;

  app(el);
}
