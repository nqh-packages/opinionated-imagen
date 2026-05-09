import { useState, useEffect, useCallback } from 'react';

interface Preset {
  id: string;
  name: string;
  description: string;
}

export default function CreateApp() {
  const [presets, setPresets] = useState<Preset[]>([]);
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);
  const [customPrompt, setCustomPrompt] = useState('');
  const [mode, setMode] = useState<'preset' | 'custom'>('preset');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch('/api/presets')
      .then((r) => r.json())
      .then((data) => {
        const typed = data as { presets: Preset[] };
        if (!cancelled) setPresets(typed.presets);
      })
      .catch(() => {
        if (!cancelled) setPresets([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  const isDisabled = loading || (mode === 'preset' && !selectedPreset) || (mode === 'custom' && !customPrompt.trim());

  return (
    <div className="space-y-6">
      <div className="flex rounded-md border border-border p-1">
        <button
          className={`flex-1 rounded-sm py-2 text-sm font-medium ${mode === 'preset' ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'}`}
          onClick={() => setMode('preset')}
        >
          Preset
        </button>
        <button
          className={`flex-1 rounded-sm py-2 text-sm font-medium ${mode === 'custom' ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'}`}
          onClick={() => setMode('custom')}
        >
          Custom
        </button>
      </div>

      {mode === 'preset' && (
        <div className="grid gap-4 sm:grid-cols-2">
          {presets.map((preset) => (
            <div
              key={preset.id}
              className={`rounded-lg p-5 cursor-pointer ${
                selectedPreset === preset.id
                  ? 'border-2 border-primary bg-card'
                  : 'border border-border bg-card hover:bg-accent'
              }`}
              onClick={() => setSelectedPreset(preset.id)}
            >
              <h3 className="font-medium">{preset.name}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{preset.description}</p>
            </div>
          ))}
        </div>
      )}

      {mode === 'custom' && (
        <div className="space-y-4">
          <label className="block text-sm font-medium">Describe what you want</label>
          <textarea
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            rows={4}
            placeholder="Me at a basketball court, golden hour, wearing the Nikes I uploaded..."
            value={customPrompt}
            onChange={(e) => setCustomPrompt(e.target.value)}
          />
        </div>
      )}

      <button
        className="inline-flex h-11 w-full items-center justify-center rounded-md bg-primary px-8 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        disabled={isDisabled}
      >
        Confirm intention
      </button>
    </div>
  );
}
