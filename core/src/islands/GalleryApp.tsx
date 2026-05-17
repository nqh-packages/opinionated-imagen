import { useEffect, useState } from "react";

interface ContactSheet {
  id: string;
  packId: string;
  presetId: string;
  status: string;
  imageUrl: string | null;
  createdAt: string;
}

export default function GalleryApp() {
  const [contactSheets, setContactSheets] = useState<ContactSheet[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetch("/api/gallery", { credentials: "include" })
      .then((res) => {
        if (res.status === 401) {
          throw new Error("Sign in to see your Contact Sheets.");
        }
        if (!res.ok) throw new Error(`Could not load Gallery (${res.status})`);
        return res.json() as Promise<{ contactSheets: ContactSheet[] }>;
      })
      .then((data) => setContactSheets(data.contactSheets))
      .catch((err: Error) => setMessage(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading)
    return (
      <p className="text-sm text-muted-foreground">Loading Contact Sheets...</p>
    );
  if (message) return <p className="text-sm text-destructive">{message}</p>;
  if (contactSheets.length === 0)
    return (
      <p className="text-sm text-muted-foreground">No Contact Sheets yet.</p>
    );

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {contactSheets.map((sheet) => (
        <article
          key={sheet.id}
          className="overflow-hidden rounded-lg border border-border bg-card"
        >
          {sheet.imageUrl ? (
            <img
              src={sheet.imageUrl}
              alt="Generated Contact Sheet"
              className="aspect-[3/2] w-full object-cover"
            />
          ) : (
            <div className="flex aspect-[3/2] items-center justify-center bg-muted text-sm text-muted-foreground">
              {sheet.status}
            </div>
          )}
          <div className="space-y-1 p-3">
            <p className="text-sm font-medium">{sheet.presetId}</p>
            <p className="text-xs text-muted-foreground">
              {new Date(sheet.createdAt).toLocaleString()}
            </p>
          </div>
        </article>
      ))}
    </div>
  );
}
