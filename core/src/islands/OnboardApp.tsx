import { useState, useRef, useCallback, useEffect } from "react";
import { getAuthMe, sendMagicLink, type AuthMe } from "~/lib/api";

type UploadKind = "selfie" | "style-reference";
type UploadFile = { file: File; preview: string };
type Stage = "idle" | "auth" | "uploading" | "building" | "ready" | "error";

interface PresignedUpload {
  id: string;
  uploadType: UploadKind;
  presignedUrl: string;
  r2Key: string;
  expiresAt: string;
}

const MIN_SELFIES = 3;
const MIN_STYLE_REFERENCES = 3;

export default function OnboardApp() {
  const [auth, setAuth] = useState<AuthMe | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [selfies, setSelfies] = useState<UploadFile[]>([]);
  const [styleReferences, setStyleReferences] = useState<UploadFile[]>([]);
  const [dragOver, setDragOver] = useState<UploadKind | null>(null);
  const [stage, setStage] = useState<Stage>("idle");
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState("");

  const selfieInputRef = useRef<HTMLInputElement>(null);
  const styleInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getAuthMe()
      .then(setAuth)
      .catch(() => setAuth(null))
      .finally(() => setAuthLoading(false));
  }, []);

  const addFiles = useCallback((files: FileList | null, type: UploadKind) => {
    if (!files) return;
    const added = Array.from(files)
      .filter((f) => f.type.startsWith("image/"))
      .map((f) => ({ file: f, preview: URL.createObjectURL(f) }));
    if (type === "selfie") setSelfies((prev) => [...prev, ...added]);
    else setStyleReferences((prev) => [...prev, ...added]);
  }, []);

  const removeFile = useCallback((type: UploadKind, idx: number) => {
    const update = (prev: UploadFile[]) => {
      const item = prev[idx];
      if (item) URL.revokeObjectURL(item.preview);
      return prev.filter((_, i) => i !== idx);
    };
    if (type === "selfie") setSelfies(update);
    else setStyleReferences(update);
  }, []);

  const onDragOver = useCallback((e: React.DragEvent, type: UploadKind) => {
    e.preventDefault();
    setDragOver(type);
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent, type: UploadKind) => {
      e.preventDefault();
      setDragOver(null);
      addFiles(e.dataTransfer.files, type);
    },
    [addFiles],
  );

  const handleSendMagicLink = useCallback(async () => {
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setMessage("Enter a valid email address.");
      return;
    }
    setStage("auth");
    setMessage("");
    try {
      await sendMagicLink(email);
      setMessage("Check your email for the sign-in link, then come back here.");
    } catch (err) {
      setStage("error");
      setMessage(
        err instanceof Error ? err.message : "Could not send sign-in link.",
      );
    }
  }, [email]);

  const startUpload = useCallback(async () => {
    setMessage("");

    if (!auth) {
      setStage("auth");
      setMessage("Sign in first so the profile belongs to the right Creator.");
      return;
    }
    if (selfies.length < MIN_SELFIES) {
      setMessage(`Add at least ${MIN_SELFIES} Selfie Set photos.`);
      return;
    }
    if (styleReferences.length < MIN_STYLE_REFERENCES) {
      setMessage(`Add at least ${MIN_STYLE_REFERENCES} Style References.`);
      return;
    }

    setStage("uploading");
    setProgress(0);

    try {
      const files = [
        ...selfies.map((item) => ({ item, uploadType: "selfie" as const })),
        ...styleReferences.map((item) => ({
          item,
          uploadType: "style-reference" as const,
        })),
      ];

      const presignedRes = await fetch("/api/upload/presigned", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          files: files.map(({ item, uploadType }) => ({
            uploadType,
            filename: item.file.name,
            contentType: item.file.type || "image/jpeg",
          })),
        }),
      });
      if (!presignedRes.ok) throw new Error("Could not prepare uploads.");
      const presigned = (await presignedRes.json()) as {
        sessionToken: string;
        uploads: PresignedUpload[];
      };

      const completed: {
        uploadType: UploadKind;
        r2Key: string;
        filename: string;
        contentType: string;
        sizeBytes: number;
      }[] = [];

      for (const [index, upload] of presigned.uploads.entries()) {
        const source = files[index];
        if (!source) continue;
        const putRes = await fetch(upload.presignedUrl, {
          method: "PUT",
          headers: { "Content-Type": source.item.file.type || "image/jpeg" },
          body: source.item.file,
        });
        if (!putRes.ok)
          throw new Error(`Upload failed for ${source.item.file.name}`);
        completed.push({
          uploadType: source.uploadType,
          r2Key: upload.r2Key,
          filename: source.item.file.name,
          contentType: source.item.file.type || "image/jpeg",
          sizeBytes: source.item.file.size,
        });
        setProgress(Math.round(((index + 1) / presigned.uploads.length) * 100));
      }

      const completeRes = await fetch("/api/upload/complete", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionToken: presigned.sessionToken,
          uploads: completed,
        }),
      });
      if (!completeRes.ok) throw new Error("Could not save upload metadata.");

      const buildRes = await fetch("/api/profile/build", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionToken: presigned.sessionToken }),
      });
      if (!buildRes.ok) throw new Error("Could not start profile building.");

      setStage("building");
      window.localStorage.setItem(
        "oi_latest_session_token",
        presigned.sessionToken,
      );
      await pollProfile(presigned.sessionToken);
      setStage("ready");
      window.location.href = "/create";
    } catch (err) {
      setStage("error");
      setMessage(
        err instanceof Error ? err.message : "Upload failed. Try again.",
      );
    }
  }, [auth, selfies, styleReferences]);

  const dropClass = (type: UploadKind, list: UploadFile[]) => {
    const base =
      "rounded-xl border-2 border-dashed transition-colors cursor-pointer overflow-hidden";
    if (dragOver === type) return `${base} border-primary bg-accent`;
    if (list.length === 0) return `${base} border-border bg-muted/30`;
    return `${base} border-border bg-muted/20`;
  };

  if (authLoading) {
    return <p className="text-sm text-muted-foreground">Checking sign-in...</p>;
  }

  return (
    <div className="space-y-8">
      {!auth ? (
        <section className="rounded-lg border border-border bg-card p-5">
          <h2 className="text-sm font-semibold tracking-tight">Sign in</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Your Identity Profile needs to belong to one Creator.
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
              className="rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
              onClick={handleSendMagicLink}
            >
              Send link
            </button>
          </div>
        </section>
      ) : null}

      <UploadZone
        title="Selfie Set"
        count={selfies.length}
        targetCount={MIN_SELFIES}
        hint="Utility photos with different angles and light"
        files={selfies}
        inputRef={selfieInputRef}
        kind="selfie"
        dropClass={dropClass}
        onDragOver={onDragOver}
        onDragLeave={() => setDragOver(null)}
        onDrop={onDrop}
        addFiles={addFiles}
        removeFile={removeFile}
      />

      <UploadZone
        title="Style References"
        count={styleReferences.length}
        targetCount={MIN_STYLE_REFERENCES}
        hint="Vibe, composition, story, color, lens, mood"
        files={styleReferences}
        inputRef={styleInputRef}
        kind="style-reference"
        dropClass={dropClass}
        onDragOver={onDragOver}
        onDragLeave={() => setDragOver(null)}
        onDrop={onDrop}
        addFiles={addFiles}
        removeFile={removeFile}
      />

      <div className="pt-4">
        {message ? (
          <p className="mb-3 text-sm text-destructive">{message}</p>
        ) : null}
        {stage === "uploading" ? (
          <button
            disabled
            className="inline-flex h-12 w-full items-center justify-center rounded-xl bg-primary px-6 text-sm font-medium text-primary-foreground opacity-80"
          >
            Uploading... {progress}%
          </button>
        ) : null}
        {stage === "building" ? (
          <div className="flex flex-col items-center justify-center py-6">
            <div className="mb-3 size-10 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <p className="text-sm font-medium">Building your profile</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Creating Identity Profile and Style Profile
            </p>
          </div>
        ) : null}
        {stage !== "uploading" && stage !== "building" ? (
          <button
            className="inline-flex h-12 w-full items-center justify-center rounded-xl bg-primary px-6 text-sm font-medium text-primary-foreground transition-transform hover:bg-primary/90 active:scale-[0.98]"
            onClick={startUpload}
          >
            Build my profile
          </button>
        ) : null}
      </div>
    </div>
  );
}

async function pollProfile(sessionToken: string) {
  for (let i = 0; i < 60; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    const res = await fetch(
      `/api/profile/status?sessionToken=${encodeURIComponent(sessionToken)}`,
      {
        credentials: "include",
      },
    );
    if (!res.ok) continue;
    const body = (await res.json()) as { status: string };
    if (body.status === "ready") return;
    if (body.status === "error" || body.status === "profile_failed") {
      throw new Error("Profile building failed.");
    }
  }
  throw new Error("Profile building is still running. Check again soon.");
}

interface UploadZoneProps {
  title: string;
  count: number;
  targetCount: number;
  hint: string;
  files: UploadFile[];
  inputRef: React.RefObject<HTMLInputElement | null>;
  kind: UploadKind;
  dropClass: (type: UploadKind, list: UploadFile[]) => string;
  onDragOver: (e: React.DragEvent, type: UploadKind) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent, type: UploadKind) => void;
  addFiles: (files: FileList | null, type: UploadKind) => void;
  removeFile: (type: UploadKind, idx: number) => void;
}

function UploadZone(props: UploadZoneProps) {
  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold tracking-tight">{props.title}</h2>
        <span className="text-xs tabular-nums text-muted-foreground">
          {props.count} / {props.targetCount}
        </span>
      </div>
      <div
        className={props.dropClass(props.kind, props.files)}
        onDragOver={(e) => props.onDragOver(e, props.kind)}
        onDragLeave={props.onDragLeave}
        onDrop={(e) => props.onDrop(e, props.kind)}
        onClick={() => props.inputRef.current?.click()}
      >
        {props.files.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-4 py-10">
            <p className="text-center text-sm font-medium">
              Drop {props.targetCount}+ photos
            </p>
            <p className="mt-0.5 text-center text-xs text-muted-foreground">
              {props.hint}
            </p>
          </div>
        ) : null}
        <input
          ref={props.inputRef}
          type="file"
          multiple
          accept="image/*"
          className="hidden"
          onChange={(e) => props.addFiles(e.target.files, props.kind)}
        />
      </div>
      {props.files.length < props.targetCount ? (
        <p className="mt-1.5 text-xs text-muted-foreground">
          {props.targetCount - props.files.length} more required
        </p>
      ) : null}
      {props.files.length > 0 ? (
        <div className="mt-3 grid grid-cols-4 gap-2">
          {props.files.map((item, i) => (
            <div
              key={item.preview}
              className="relative aspect-square overflow-hidden rounded-lg bg-muted"
            >
              <img
                src={item.preview}
                alt=""
                className="h-full w-full object-cover"
              />
              <button
                className="absolute right-1 top-1 flex size-5 items-center justify-center rounded-full bg-black/60 text-xs text-white"
                onClick={(event) => {
                  event.stopPropagation();
                  props.removeFile(props.kind, i);
                }}
                aria-label="Remove"
              >
                x
              </button>
            </div>
          ))}
          <button
            className="flex aspect-square items-center justify-center rounded-lg border border-dashed border-border bg-muted/20 text-xl text-muted-foreground"
            onClick={() => props.inputRef.current?.click()}
            aria-label={`Add ${props.title}`}
          >
            +
          </button>
        </div>
      ) : null}
    </section>
  );
}
