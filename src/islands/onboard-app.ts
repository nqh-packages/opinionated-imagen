import { reactive, html } from '@arrow-js/core';

export function mountOnboard(el: HTMLElement) {
  const state = reactive({
    step: 1,
    selfies: [] as File[],
    styleRefs: [] as File[],
    uploading: false,
    message: '',
  });

  const uploadSelfies = html`
    <div class="space-y-4">
      <div
        class="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-border p-10 hover:bg-accent transition-colors cursor-pointer"
        @click="${() => document.getElementById('selfie-input')?.click()}"
      >
        <p class="text-sm font-medium">Drop 10–20 selfies here</p>
        <p class="text-xs text-muted-foreground mt-1">Different angles, different light</p>
        <input
          id="selfie-input"
          type="file"
          multiple
          accept="image/*"
          class="hidden"
          @change="${(e: Event) => {
            const files = (e.target as HTMLInputElement).files;
            if (files) state.selfies = Array.from(files);
          }}"
        />
      </div>
      ${() =>
        state.selfies.length > 0
          ? html`<p class="text-sm text-muted-foreground">${state.selfies.length} photos selected</p>`
          : ''}
    </div>
  `;

  const uploadStyleRefs = html`
    <div class="space-y-4">
      <div
        class="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-border p-10 hover:bg-accent transition-colors cursor-pointer"
        @click="${() => document.getElementById('style-input')?.click()}"
      >
        <p class="text-sm font-medium">Drop 8–15 style references</p>
        <p class="text-xs text-muted-foreground mt-1">Posts you love, your own or others'</p>
        <input
          id="style-input"
          type="file"
          multiple
          accept="image/*"
          class="hidden"
          @change="${(e: Event) => {
            const files = (e.target as HTMLInputElement).files;
            if (files) state.styleRefs = Array.from(files);
          }}"
        />
      </div>
      ${() =>
        state.styleRefs.length > 0
          ? html`<p class="text-sm text-muted-foreground">${state.styleRefs.length} photos selected</p>`
          : ''}
    </div>
  `;

  const app = html`
    <div class="space-y-6">
      <div class="flex gap-2 text-sm">
        <span class="${() => (state.step >= 1 ? 'text-primary font-medium' : 'text-muted-foreground')}">1. Selfies</span>
        <span class="text-muted-foreground">→</span>
        <span class="${() => (state.step >= 2 ? 'text-primary font-medium' : 'text-muted-foreground')}">2. Style</span>
        <span class="text-muted-foreground">→</span>
        <span class="${() => (state.step >= 3 ? 'text-primary font-medium' : 'text-muted-foreground')}">3. Wait</span>
      </div>

      ${() => {
        if (state.step === 1) return uploadSelfies;
        if (state.step === 2) return uploadStyleRefs;
        return html`<p class="text-sm">Building your profiles... We'll email you when ready.</p>`;
      }}

      ${() =>
        state.message
          ? html`<p class="text-sm text-destructive">${state.message}</p>`
          : ''}

      <div class="flex justify-between">
        ${() =>
          state.step > 1
            ? html`<button
                class="inline-flex h-10 items-center rounded-md border border-border px-4 text-sm hover:bg-accent"
                @click="${() => state.step--}"
              >Back</button>`
            : html`<span></span>`}
        <button
          class="inline-flex h-10 items-center rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          @click="${() => {
            if (state.step === 1 && state.selfies.length === 0) {
              state.message = 'Upload at least one selfie.';
              return;
            }
            if (state.step === 2 && state.styleRefs.length === 0) {
              state.message = 'Upload at least one style reference.';
              return;
            }
            state.message = '';
            if (state.step < 3) state.step++;
          }}"
        >
          ${() => (state.step === 2 ? 'Submit' : 'Next')}
        </button>
      </div>
    </div>
  `;

  app(el);
}
