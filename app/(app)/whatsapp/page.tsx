'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { listarConversaciones, suscribirseAConversaciones, type ConversacionConVinculo } from '@/lib/data/whatsapp'
import { useEsAdministrador } from '@/lib/hooks/useEsAdministrador'
import { SkeletonPage, SkeletonTable } from '@/components/Skeleton'
import { AvisoConexion } from './AvisoConexion'
import { ChatPanel } from './ChatPanel'
import { ListaConversaciones } from './ListaConversaciones'

export default function WhatsappPage() {
  const esAdmin = useEsAdministrador()
  const [conversaciones, setConversaciones] = useState<ConversacionConVinculo[] | null>(null)
  const [seleccionada, setSeleccionada] = useState<string | null>(null)

  const cargar = useCallback(() => {
    listarConversaciones()
      .then(setConversaciones)
      .catch(() => setConversaciones([]))
  }, [])

  useEffect(() => {
    cargar()
    return suscribirseAConversaciones(cargar)
  }, [cargar])

  if (conversaciones === null) {
    return (
      <SkeletonPage>
        <SkeletonTable filas={6} columnas={2} />
      </SkeletonPage>
    )
  }

  const actual = conversaciones.find((c) => c.id === seleccionada) ?? null

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4 p-5 sm:p-8">
      <div className="rise flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-[11.5px] font-semibold uppercase tracking-[0.14em] text-ink-faint">Operación</p>
          <h1 className="mt-1 text-[27px] text-ink">WhatsApp</h1>
        </div>
        {esAdmin && (
          <div className="flex gap-3 text-xs font-semibold text-accent">
            <Link href="/whatsapp/conexion" className="hover:underline">
              Conexión
            </Link>
            <Link href="/whatsapp/automaticos" className="hover:underline">
              Respuestas automáticas
            </Link>
          </div>
        )}
      </div>

      <AvisoConexion />

      <div className="card rise grid min-h-[60vh] overflow-hidden md:grid-cols-[320px_1fr]">
        <div className={`overflow-y-auto border-line md:border-r ${actual ? 'hidden md:block' : ''}`}>
          <ListaConversaciones conversaciones={conversaciones} seleccionada={seleccionada} onSeleccionar={setSeleccionada} />
        </div>
        <div className={actual ? '' : 'hidden md:block'}>
          {actual ? (
            <>
              <button
                type="button"
                onClick={() => setSeleccionada(null)}
                className="px-4 pt-3 text-xs text-ink-faint underline md:hidden"
              >
                ← Volver a la lista
              </button>
              <ChatPanel key={actual.id} conversacion={actual} onCambio={cargar} />
            </>
          ) : (
            <p className="p-8 text-sm text-ink-faint">Elegí una conversación para empezar.</p>
          )}
        </div>
      </div>
    </div>
  )
}
