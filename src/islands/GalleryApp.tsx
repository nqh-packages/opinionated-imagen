import { useState, useEffect } from 'react';

interface Shot {
  id: string;
  url: string;
  packId: string;
  createdAt: string;
}

export default function GalleryApp() {
  const [shots, setShots] = useState<Shot[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Placeholder: would fetch from /api/gallery
    const timer = setTimeout(() => {
      setShots([
        { id: '1', url: 'https://placehold.co/400x500?text=Shot+1', packId: 'pack-1', createdAt: new Date().toISOString() },
        { id: '2', url: 'https://placehold.co/400x500?text=Shot+2', packId: 'pack-1', createdAt: new Date().toISOString() },
      ]);
      setLoading(false);
    }, 600);
    return () => clearTimeout(timer);
  }, []);

  if (loading) return <p className="text-sm text-muted-foreground">Loading your shots...</p>;
  if (shots.length === 0) return <p className="text-sm text-muted-foreground">No saved shots yet.</p>;

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {shots.map((shot) => (
        <div key={shot.id} className="group relative overflow-hidden rounded-lg border border-border">
          <img src={shot.url} alt="Saved shot" className="aspect-[4/5] w-full object-cover" />
          <div className="absolute inset-0 flex items-end bg-gradient-to-t from-black/60 to-transparent p-4 opacity-0 transition-opacity group-hover:opacity-100">
            <button className="text-xs font-medium text-white hover:underline">Remix</button>
          </div>
        </div>
      ))}
    </div>
  );
}
