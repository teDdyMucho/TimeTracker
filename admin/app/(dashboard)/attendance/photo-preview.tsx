'use client'

import { useState } from 'react'

interface Props {
  src: string
  name: string
}

export default function PhotoPreview({ src, name }: Props) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="block w-9 h-9 rounded-full overflow-hidden border-2 border-slate-200 hover:border-brand transition-colors cursor-zoom-in focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-1"
        title={`View photo — ${name}`}
      >
        <img src={src} alt={name} className="w-full h-full object-cover" />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <div
            className="relative max-w-sm w-full mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={src}
              alt={name}
              className="w-full rounded-2xl shadow-2xl object-cover"
            />
            <p className="mt-3 text-center text-white text-sm font-medium">{name}</p>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="absolute -top-3 -right-3 w-8 h-8 rounded-full bg-white text-slate-700 shadow-lg flex items-center justify-center hover:bg-slate-100 text-lg leading-none"
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </>
  )
}
