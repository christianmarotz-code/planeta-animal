'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useEsAdministrador } from '@/lib/hooks/useEsAdministrador'

export function AvisoConexion() {
  const esAdmin = useEsAdministrador()
  const [estado, setEstado] = useState<string | null>(null)

  useEffect(() => {
    let activo = true
    const consultar = () =>
      fetch('/api/whatsapp/conexion')
        .then((r) => r.json())
        .then((d) => activo && setEstado(d.estado))
        .catch(() => activo && setEstado('desconocido'))
    consultar()
    const timer = setInterval(consultar, 30_000)
    return () => {
      activo = false
      clearInterval(timer)
    }
  }, [])

  if (estado === null || estado === 'abierta') return null
  return (
    <div className="card rise flex flex-wrap items-center justify-between gap-2 border border-negative p-3 text-sm text-negative">
      <span>WhatsApp está desconectado: los mensajes nuevos no van a llegar ni se van a poder enviar.</span>
      {esAdmin && (
        <Link href="/whatsapp/conexion" className="font-semibold underline">
          Vincular el número
        </Link>
      )}
    </div>
  )
}
