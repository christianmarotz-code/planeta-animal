'use client'

import type { ConversacionConVinculo } from '@/lib/data/whatsapp'
import { etiquetaVinculo, nombreParaMostrar } from '@/lib/whatsapp/presentacion'

interface Props {
  conversaciones: ConversacionConVinculo[]
  seleccionada: string | null
  onSeleccionar: (id: string) => void
}

export function ListaConversaciones({ conversaciones, seleccionada, onSeleccionar }: Props) {
  if (conversaciones.length === 0) {
    return <p className="p-5 text-sm text-ink-faint">Todavía no hay conversaciones.</p>
  }
  return (
    <ul className="divide-y divide-line">
      {conversaciones.map((c) => (
        <li key={c.id}>
          <button
            type="button"
            onClick={() => onSeleccionar(c.id)}
            className={`flex w-full flex-col gap-0.5 px-4 py-3 text-left transition-colors hover:bg-ink/5 ${
              seleccionada === c.id ? 'bg-ink/5' : ''
            }`}
          >
            <span className="flex items-center justify-between gap-2">
              <span className="truncate text-sm font-semibold text-ink">{nombreParaMostrar(c)}</span>
              {c.no_leidos > 0 && <span className="chip up">{c.no_leidos}</span>}
            </span>
            <span className="text-[11px] uppercase tracking-[0.1em] text-ink-faint">{etiquetaVinculo(c)}</span>
            <span className="truncate text-xs text-ink-soft">{c.ultimo_texto ?? ''}</span>
          </button>
        </li>
      ))}
    </ul>
  )
}
