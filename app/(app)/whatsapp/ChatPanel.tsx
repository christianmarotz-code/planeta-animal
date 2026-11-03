'use client'

import { useEffect, useRef, useState } from 'react'
import {
  listarMensajes,
  marcarLeida,
  suscribirseAMensajes,
  type ConversacionConVinculo,
} from '@/lib/data/whatsapp'
import { etiquetaVinculo, nombreParaMostrar } from '@/lib/whatsapp/presentacion'
import type { Mensaje } from '@/types/database'
import { VincularConversacion } from './VincularConversacion'

const hora = new Intl.DateTimeFormat('es-AR', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })

async function llamarEnviar(cuerpo: object): Promise<{ ok: boolean; error?: string; mensajeId?: string }> {
  const res = await fetch('/api/whatsapp/enviar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cuerpo),
  })
  const datos = await res.json().catch(() => ({}))
  return { ok: res.ok, error: datos.error, mensajeId: datos.mensajeId }
}

export function ChatPanel({
  conversacion,
  onCambio,
}: {
  conversacion: ConversacionConVinculo
  onCambio: () => void
}) {
  const id = conversacion.id
  const [mensajes, setMensajes] = useState<Mensaje[]>([])
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fin = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let activo = true
    const cargar = () =>
      listarMensajes(id)
        .then((m) => activo && setMensajes(m))
        .catch(() => {})
    const alCambiar = () => {
      cargar()
      marcarLeida(id).then(onCambio).catch(() => {})
    }
    alCambiar()
    const cancelar = suscribirseAMensajes(id, alCambiar)
    return () => {
      activo = false
      cancelar()
    }
  }, [id, onCambio])

  useEffect(() => {
    fin.current?.scrollIntoView({ block: 'end' })
  }, [mensajes])

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    const limpio = texto.trim()
    if (!limpio || enviando) return
    setEnviando(true)
    setError(null)
    const r = await llamarEnviar({ conversacionId: id, texto: limpio })
    setEnviando(false)
    if (r.ok || r.mensajeId) setTexto('')
    if (!r.ok) setError(r.error ?? 'No se pudo enviar el mensaje.')
  }

  async function reintentar(mensajeId: string) {
    setError(null)
    const r = await llamarEnviar({ mensajeId })
    if (!r.ok) setError(r.error ?? 'No se pudo reenviar el mensaje.')
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-col gap-1 border-b border-line px-4 py-3">
        <p className="text-sm font-semibold text-ink">
          {nombreParaMostrar(conversacion)}{' '}
          <span className="text-[11px] font-normal uppercase tracking-[0.1em] text-ink-faint">
            {etiquetaVinculo(conversacion)}
          </span>
        </p>
        <VincularConversacion conversacion={conversacion} onCambio={onCambio} />
      </div>

      <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-4">
        {mensajes.map((m) => {
          const propio = m.direccion === 'saliente'
          return (
            <div key={m.id} className={`flex ${propio ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[80%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm ${
                  propio ? 'bg-accent text-accent-ink' : 'border border-line bg-surface text-ink'
                }`}
              >
                {m.texto}
                <p className="mt-1 text-[10.5px] opacity-70">
                  {hora.format(new Date(m.creado_en))}
                  {m.origen === 'automatico' && ' · automático'}
                  {m.origen === 'pedido' && ' · pedido'}
                  {m.estado === 'pendiente' && ' · enviando…'}
                </p>
                {m.estado === 'error' && (
                  <button type="button" onClick={() => reintentar(m.id)} className="mt-1 text-xs font-semibold underline">
                    No se envió · Reintentar
                  </button>
                )}
              </div>
            </div>
          )
        })}
        <div ref={fin} />
      </div>

      <form onSubmit={enviar} className="flex flex-col gap-2 border-t border-line p-3">
        {error && <p className="text-xs text-negative">{error}</p>}
        <div className="flex gap-2">
          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            rows={2}
            maxLength={4096}
            placeholder="Escribí un mensaje"
            className="flex-1 resize-none rounded-[var(--r-sm)] border border-line bg-surface p-2 text-sm text-ink outline-none focus:border-accent"
          />
          <button type="submit" disabled={enviando || !texto.trim()} className="pill-btn self-end">
            {enviando ? 'Enviando…' : 'Enviar'}
          </button>
        </div>
      </form>
    </div>
  )
}
