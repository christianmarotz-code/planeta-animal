'use client'

import { useEffect, useState } from 'react'
import { listarProveedores } from '@/lib/data/proveedores'
import { crearCliente, listarClientes } from '@/lib/data/clientes'
import { vincularConversacion, type ConversacionConVinculo } from '@/lib/data/whatsapp'
import type { Cliente, Proveedor } from '@/types/database'

export function VincularConversacion({
  conversacion,
  onCambio,
}: {
  conversacion: ConversacionConVinculo
  onCambio: () => void
}) {
  const [proveedores, setProveedores] = useState<Proveedor[]>([])
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [eleccion, setEleccion] = useState('')
  const [error, setError] = useState<string | null>(null)
  const vinculado = conversacion.proveedor_id !== null || conversacion.cliente_id !== null

  useEffect(() => {
    if (vinculado) return
    Promise.all([listarProveedores(), listarClientes()])
      .then(([p, c]) => {
        setProveedores(p)
        setClientes(c)
      })
      .catch(() => setError('No se pudieron cargar los contactos.'))
  }, [vinculado])

  async function ejecutar(accion: () => Promise<void>) {
    setError(null)
    try {
      await accion()
      onCambio()
    } catch {
      setError('No se pudo guardar el vínculo. Intentá de nuevo.')
    }
  }

  if (vinculado) {
    return (
      <button
        type="button"
        onClick={() => ejecutar(() => vincularConversacion(conversacion.id, null))}
        className="text-xs text-ink-faint underline"
      >
        Desvincular
      </button>
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <select
        value={eleccion}
        onChange={(e) => setEleccion(e.target.value)}
        className="rounded-[var(--r-sm)] border border-line bg-surface p-1.5 text-ink"
      >
        <option value="">Vincular con…</option>
        <optgroup label="Proveedores">
          {proveedores.map((p) => (
            <option key={p.id} value={`p:${p.id}`}>
              {p.nombre}
            </option>
          ))}
        </optgroup>
        <optgroup label="Clientes">
          {clientes.map((c) => (
            <option key={c.id} value={`c:${c.id}`}>
              {c.nombre}
            </option>
          ))}
        </optgroup>
      </select>
      <button
        type="button"
        disabled={!eleccion}
        onClick={() =>
          ejecutar(() =>
            vincularConversacion(
              conversacion.id,
              eleccion.startsWith('p:') ? { proveedorId: eleccion.slice(2) } : { clienteId: eleccion.slice(2) }
            )
          )
        }
        className="pill-btn"
      >
        Vincular
      </button>
      <button
        type="button"
        onClick={() =>
          ejecutar(async () => {
            const cliente = await crearCliente({
              nombre: conversacion.nombre_whatsapp ?? `+${conversacion.telefono}`,
              telefono: conversacion.telefono,
              email: null,
            })
            await vincularConversacion(conversacion.id, { clienteId: cliente.id })
          })
        }
        className="text-ink-faint underline"
      >
        Crear cliente con este número
      </button>
      {error && <span className="text-negative">{error}</span>}
    </div>
  )
}
