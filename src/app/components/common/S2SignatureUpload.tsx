'use client';

import { useEffect, useRef, useState } from 'react';

export function S2SignatureUpload({
  value,
  onChange,
  label,
}: {
  value?: string | null;
  onChange: (v: string | null) => void;
  label?: string;
}) {
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const img = new Image();
    img.onload = () => {
      const MAX_W = 400;
      const c = document.createElement('canvas');
      const scale = Math.min(1, MAX_W / img.width);
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      const ctx = c.getContext('2d')!;
      ctx.drawImage(img, 0, 0, c.width, c.height);
      onChange(c.toDataURL('image/png'));
    };
    img.src = URL.createObjectURL(file);
  };

  return (
    <div className="flex flex-col items-center gap-1">
      {value ? (
        <img src={value} alt={label || 'Tanda Tangan'} className="max-h-14 max-w-28 object-contain" />
      ) : (
        <span className="text-[10px] text-gray-400 italic">(upload)</span>
      )}
      <input type="file" accept="image/*" ref={fileRef} onChange={handleFile} className="hidden" />
      <button type="button" onClick={() => fileRef.current?.click()} className="text-[10px] text-blue-700 underline">
        {value ? 'Ganti' : 'Upload'}
      </button>
      {value && (
        <button type="button" onClick={() => onChange(null)} className="text-[10px] text-red-600 underline">
          Hapus
        </button>
      )}
    </div>
  );
}
