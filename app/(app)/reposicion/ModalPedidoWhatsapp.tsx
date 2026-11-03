'use client'

import { useState } from 'react'
import type { Proveedor } from '@/types/database'

export function ModalPedidoWhatsapp({
  proveedor,
  mensajeInicial,
  onCerrar,
}: {
  proveedor: Proveedor
  mensajeInicial: string
  onCerrar: () => void
}) {
  const [texto, setTexto] = useState(mensajeInicial)
  const [estado, setEstado] = useState<'editando' | 'enviando' | 'enviado'>('editando')
  const [error, setError] = useState<string | null>(null)

  async function enviar() {
    setEstado('enviando')
    setError(null)
    const res = await fetch('/api/whatsapp/enviar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        origen: 'pedido',
        telefono: proveedor.telefono,
        proveedorId: proveedor.id,
        texto,
      }),
    })
    const datos = await res.json().catch(() => ({}))
    if (res.ok) {
      setEstado('enviado')
    } else {
      setEstado('editando')
      setError(datos.error ?? 'No se pudo enviar el pedido.')
    }
  }

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true">
      <div className="card flex w-full max-w-lg flex-col gap-3 p-5">
        <p className="text-sm font-semibold text-ink">Pedido por WhatsApp a {proveedor.nombre}</p>
        {estado === 'enviado' ? (
          <>
            <p className="text-sm text-ink-soft">Pedido enviado. Queda en el chat del proveedor.</p>
            <button type="button" onClick={onCerrar} className="pill-btn self-end">
              Cerrar
            </button>
          </>
        ) : (
          <>
            <textarea
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              rows={10}
              maxLength={4096}
              className="rounded-[var(--r-sm)] border border-line bg-surface p-2 text-sm text-ink outline-none focus:border-accent"
            />
            {error && <p className="text-xs text-negative">{error}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={onCerrar} className="px-3 text-sm text-ink-faint">
                Cancelar
              </button>
              <button
                type="button"
                onClick={enviar}
                disabled={estado === 'enviando' || !texto.trim()}
                className="pill-btn"
              >
                {estado === 'enviando' ? 'Enviando…' : 'Enviar pedido'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
