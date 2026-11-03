'use client'

import { useEffect, useState } from 'react'
import { useEsAdministrador } from '@/lib/hooks/useEsAdministrador'

export default function ConexionWhatsappPage() {
  const esAdmin = useEsAdministrador()
  const [estado, setEstado] = useState<string | null>(null)
  const [qr, setQr] = useState<string | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    if (esAdmin !== true) return
    let activo = true
    const consultar = () =>
      fetch('/api/whatsapp/conexion?qr=1')
        .then((r) => r.json())
        .then((d) => {
          if (!activo) return
          setEstado(d.estado)
          setQr(d.qr ?? null)
          setError(false)
        })
        .catch(() => activo && setError(true))
    consultar()
    // El QR de WhatsApp vence cada pocos segundos: se vuelve a pedir hasta que quede vinculado.
    const timer = setInterval(consultar, 5000)
    return () => {
      activo = false
      clearInterval(timer)
    }
  }, [esAdmin])

  if (esAdmin === null) return null
  if (esAdmin === false) {
    return <p className="p-8 text-sm text-negative">Acceso restringido — contactá a un administrador.</p>
  }

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4 p-5 sm:p-8">
      <div className="rise">
        <p className="text-[11.5px] font-semibold uppercase tracking-[0.14em] text-ink-faint">WhatsApp</p>
        <h1 className="mt-1 text-[27px] text-ink">Conexión</h1>
      </div>

      <div className="card rise flex flex-col items-center gap-4 p-6 text-center">
        {error && <p className="text-sm text-negative">No se pudo consultar el estado. Reintentando…</p>}
        {estado === 'abierta' && (
          <p className="text-sm text-ink">El número está vinculado y funcionando.</p>
        )}
        {estado !== 'abierta' && qr && (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qr} alt="Código QR para vincular WhatsApp" className="h-64 w-64" />
            <p className="text-sm text-ink-soft">
              En el celular del negocio: WhatsApp → Dispositivos vinculados → Vincular un dispositivo, y escaneá este código.
            </p>
          </>
        )}
        {estado !== 'abierta' && !qr && !error && (
          <p className="text-sm text-ink-faint">Esperando el código del gateway…</p>
        )}
      </div>
    </div>
  )
}
