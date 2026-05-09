import { useState, useRef, useCallback, useEffect } from 'react';

type UploadFile = { file: File; preview: string };

function getSessionToken(): string {
  if (typeof window === 'undefined') return '';
  const key = 'oi_session';
  let token = localStorage.getItem(key);
  if (!token) {
    token = crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    localStorage.setItem(key, token);
  }
  return token;
}

export default function OnboardApp() {
  const [session, setSession] = useState('');
  useEffect(() => { setSession(getSessionToken()); }, []);
  const [selfies, setSelfies] = useState<UploadFile[]>([]);
  const [moodboard, setMoodboard] = useState<UploadFile[]>([]);
  const [dragOver, setDragOver] = useState<'selfies' | 'moodboard' | null>(null);
  const [status, setStatus] = useState<'idle' | 'uploading' | 'building' | 'error'>('idle');
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState('');

  const selfieInputRef = useRef<HTMLInputElement>(null);
  const moodboardInputRef = useRef<HTMLInputElement>(null);

  const addFiles = useCallback((files: FileList | null, type: 'selfies' | 'moodboard') => {
    if (!files) return;
    const added = Array.from(files)
      .filter((f) => f.type.startsWith('image/'))
      .map((f) => ({ file: f, preview: URL.createObjectURL(f) }));
    if (type === 'selfies') setSelfies((prev) => [...prev, ...added]);
    else setMoodboard((prev) => [...prev, ...added]);
  }, []);

  const removeFile = useCallback((type: 'selfies' | 'moodboard', idx: number) => {
    if (type === 'selfies') {
      setSelfies((prev) => {
        const item = prev[idx];
        if (item) URL.revokeObjectURL(item.preview);
        return prev.filter((_, i) => i !== idx);
      });
    } else {
      setMoodboard((prev) => {
        const item = prev[idx];
        if (item) URL.revokeObjectURL(item.preview);
        return prev.filter((_, i) => i !== idx);
      });
    }
  }, []);

  const onDragOver = useCallback((e: React.DragEvent, type: 'selfies' | 'moodboard') => {
    e.preventDefault();
    setDragOver(type);
  }, []);

  const onDrop = useCallback((e: React.DragEvent, type: 'selfies' | 'moodboard') => {
    e.preventDefault();
    setDragOver(null);
    addFiles(e.dataTransfer.files, type);
  }, [addFiles]);

  const startUpload = useCallback(async () => {
    setMessage('');
    const total = selfies.length + moodboard.length;
    if (total === 0) {
      setMessage('Add some photos first.');
      return;
    }
    setStatus('uploading');

    try {
      setProgress(0);
      for (let i = 0; i <= total; i++) {
        setProgress(Math.round((i / total) * 100));
        await new Promise((r) => setTimeout(r, 60));
      }
      setStatus('building');
    } catch (err) {
      setStatus('error');
      setMessage(err instanceof Error ? err.message : 'Upload failed. Try again.');
    }
  }, [selfies.length, moodboard.length]);

  const dropClass = (type: 'selfies' | 'moodboard', list: UploadFile[]) => {
    const base = 'rounded-xl border-2 border-dashed transition-colors cursor-pointer overflow-hidden';
    if (dragOver === type) return `${base} border-primary bg-accent`;
    if (list.length === 0) return `${base} border-border bg-muted/30`;
    return `${base} border-border bg-muted/20`;
  };

  return (
    <div className="space-y-8">
      {/* Selfie Set */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold tracking-tight">Selfie Set</h2>
          <span className="text-xs tabular-nums text-muted-foreground">{selfies.length} / 10</span>
        </div>
        <div
          className={dropClass('selfies', selfies)}
          onDragOver={(e) => onDragOver(e, 'selfies')}
          onDragLeave={() => setDragOver(null)}
          onDrop={(e) => onDrop(e, 'selfies')}
          onClick={() => selfieInputRef.current?.click()}
        >
          {selfies.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 px-4">
              <svg className="mb-3 size-8 text-muted-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M12 16.5V9.75m0 0-3 3m3-3 3 3M6.75 19.5h10.5a2.25 2.25 0 0 0 2.25-2.25v-10.5a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v10.5a2.25 2.25 0 0 0 2.25 2.25Z" />
              </svg>
              <p className="text-sm font-medium text-center">Drop 10–20 selfies</p>
              <p className="text-xs text-muted-foreground text-center mt-0.5">Different angles, different light</p>
            </div>
          ) : null}
          <input ref={selfieInputRef} type="file" multiple accept="image/*" className="hidden" onChange={(e) => addFiles(e.target.files, 'selfies')} />
        </div>
        {selfies.length < 10 ? (
          <p className="text-xs text-muted-foreground mt-1.5">{10 - selfies.length} more selfies for best results</p>
        ) : null}
        {selfies.length > 0 ? (
          <div className="grid grid-cols-4 gap-2 mt-3">
            {selfies.map((item, i) => (
              <div key={item.preview} className="relative aspect-square rounded-lg overflow-hidden bg-muted">
                <img src={item.preview} alt="" className="h-full w-full object-cover" />
                <button
                  className="absolute top-1 right-1 flex size-5 items-center justify-center rounded-full bg-black/60 text-white text-xs"
                  onClick={() => removeFile('selfies', i)}
                  aria-label="Remove"
                >
                  ×
                </button>
              </div>
            ))}
            <button className="flex aspect-square items-center justify-center rounded-lg border border-dashed border-border bg-muted/20" onClick={() => selfieInputRef.current?.click()}>
              <svg className="size-5 text-muted-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
            </button>
          </div>
        ) : null}
      </div>

      {/* Moodboard */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold tracking-tight">Moodboard</h2>
          <span className="text-xs tabular-nums text-muted-foreground">{moodboard.length} / 5</span>
        </div>
        <div
          className={dropClass('moodboard', moodboard)}
          onDragOver={(e) => onDragOver(e, 'moodboard')}
          onDragLeave={() => setDragOver(null)}
          onDrop={(e) => onDrop(e, 'moodboard')}
          onClick={() => moodboardInputRef.current?.click()}
        >
          {moodboard.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 px-4">
              <svg className="mb-3 size-8 text-muted-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M9.53 16.122a3 3 0 0 0-5.78 1.128 2.25 2.25 0 0 1-2.4 2.245 4.5 4.5 0 0 0 8.4-2.245c0-.399-.078-.78-.22-1.128Zm0 0a15.998 15.998 0 0 0 3.388-1.62m-5.043-.025a15.994 15.994 0 0 1 1.622-3.395m3.42 3.42a15.995 15.995 0 0 0 4.764-4.648l3.876-5.814a1.151 1.151 0 0 0-1.597-1.597l-5.814 3.876a15.995 15.995 0 0 0-4.648 4.764m10.212-5.7a3 3 0 0 0 1.128 5.78 2.25 2.25 0 0 1 2.245 2.4 4.5 4.5 0 0 0-2.245-8.4c-.399 0-.78.078-1.128.22Zm0 0L7.09 15.204m10.212 5.7a3 3 0 0 0 5.78-1.128 2.25 2.25 0 0 1 2.4-2.245 4.5 4.5 0 0 0-8.4 2.245c0 .399.078.78.22 1.128Zm0 0L3.3 3.3M3.75 2.25l.75.75M3.75 2.25l-.75.75M3.75 2.25l-.75-.75M3.75 2.25l.75-.75" />
              </svg>
              <p className="text-sm font-medium text-center">Drop 5+ moodboard photos</p>
              <p className="text-xs text-muted-foreground text-center mt-0.5">Posts you love, your own or others'</p>
            </div>
          ) : null}
          <input ref={moodboardInputRef} type="file" multiple accept="image/*" className="hidden" onChange={(e) => addFiles(e.target.files, 'moodboard')} />
        </div>
        {moodboard.length < 5 ? (
          <p className="text-xs text-muted-foreground mt-1.5">{5 - moodboard.length} more photos for best results</p>
        ) : null}
        {moodboard.length > 0 ? (
          <div className="grid grid-cols-4 gap-2 mt-3">
            {moodboard.map((item, i) => (
              <div key={item.preview} className="relative aspect-square rounded-lg overflow-hidden bg-muted">
                <img src={item.preview} alt="" className="h-full w-full object-cover" />
                <button
                  className="absolute top-1 right-1 flex size-5 items-center justify-center rounded-full bg-black/60 text-white text-xs"
                  onClick={() => removeFile('moodboard', i)}
                  aria-label="Remove"
                >
                  ×
                </button>
              </div>
            ))}
            <button className="flex aspect-square items-center justify-center rounded-lg border border-dashed border-border bg-muted/20" onClick={() => moodboardInputRef.current?.click()}>
              <svg className="size-5 text-muted-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
            </button>
          </div>
        ) : null}
      </div>

      {/* Action */}
      <div className="pt-4">
        {message && status !== 'building' ? (
          <p className="text-sm text-destructive mb-3">{message}</p>
        ) : null}

        {status === 'uploading' ? (
          <button disabled className="w-full inline-flex h-12 items-center justify-center rounded-xl bg-primary px-6 text-sm font-medium text-primary-foreground opacity-80">
            Uploading… {progress}%
          </button>
        ) : null}

        {status === 'building' ? (
          <div className="flex flex-col items-center justify-center py-6">
            <div className="size-10 rounded-full border-2 border-primary border-t-transparent animate-spin mb-3" />
            <p className="text-sm font-medium">Building your profile</p>
            <p className="text-xs text-muted-foreground mt-0.5">This takes a few minutes</p>
          </div>
        ) : null}

        {status === 'error' ? (
          <div className="space-y-3">
            <p className="text-sm text-destructive text-center">{message}</p>
            <button
              className="w-full inline-flex h-12 items-center justify-center rounded-xl bg-primary px-6 text-sm font-medium text-primary-foreground hover:bg-primary/90 active:scale-[0.98] transition-transform"
              onClick={() => { setStatus('idle'); setMessage(''); }}
            >
              Try again
            </button>
          </div>
        ) : null}

        {status === 'idle' ? (
          <button
            className="w-full inline-flex h-12 items-center justify-center rounded-xl bg-primary px-6 text-sm font-medium text-primary-foreground hover:bg-primary/90 active:scale-[0.98] transition-transform"
            onClick={startUpload}
          >
            {selfies.length >= 10 && moodboard.length >= 5 ? 'Build my profile' : 'Build my profile anyway'}
          </button>
        ) : null}
      </div>
    </div>
  );
}
