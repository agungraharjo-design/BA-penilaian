'use client';

import { useEffect, useRef, useState } from 'react';

// Image upload for the Seminar Proposal "Tangkapan Layar" tab.
//
// Follows the S2SignatureUpload pattern (file -> canvas -> resize -> data URL)
// but uploads to Supabase Storage via /api/upload-sp-image and shows the stored
// public URL, so nothing large is kept in the browser or the database.
export function SpImageUpload({
  groupCode,
  slot,
  label,
  value,
  onChange,
}: {
  groupCode: string;
  slot: string;
  label: string;
  value?: string | null;
  onChange: (v: string | null) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => () => { if (fileRef.current) fileRef.current.value = ''; }, []);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setBusy(true);
    try {
      const dataUrl = await resize(file, 1600);
      const base64 = dataUrl.split(',')[1];
      const res = await fetch('/api/upload-sp-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          groupCode,
          slot,
          imageBase64: base64,
          fileName: `${slot}.png`,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      onChange(json.url as string);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload gagal');
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <div className="flex flex-col items-center gap-1">
      {value ? (
        <a href={value} target="_blank" rel="noreferrer">
          <img src={value} alt={label} className="max-h-20 max-w-40 object-contain border rounded" />
        </a>
      ) : (
        <span className="text-[10px] text-gray-400 italic">(belum ada bukti)</span>
      )}
      <input type="file" accept="image/*" ref={fileRef} onChange={handleFile} className="hidden" />
      <button
        type="button"
        disabled={busy}
        onClick={() => fileRef.current?.click()}
        className="text-[10px] text-blue-700 underline disabled:opacity-50"
      >
        {busy ? 'Mengunggah…' : value ? 'Ganti Gambar' : 'Upload Gambar'}
      </button>
      {error && <span className="text-[10px] text-red-600 max-w-[10rem] text-center">{error}</span>}
      {value && (
        <button type="button" onClick={() => onChange(null)} className="text-[10px] text-red-600 underline">
          Hapus
        </button>
      )}
    </div>
  );
}

// Downscale so a full-screen capture stays a reasonable upload size.
function resize(file: File, maxW: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        const scale = Math.min(1, maxW / img.width);
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * scale);
        c.height = Math.round(img.height * scale);
        const ctx = c.getContext('2d');
        if (!ctx) { reject(new Error('Canvas tidak tersedia')); return; }
        ctx.drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL('image/png'));
      } finally {
        URL.revokeObjectURL(url);
      }
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('File gambar tidak valid')); };
    img.src = url;
  });
}
