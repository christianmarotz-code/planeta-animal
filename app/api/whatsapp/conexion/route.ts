import { NextResponse } from 'next/server'
import { requerirAdministrador } from '@/lib/auth/requerirAdministrador'
import { requerirSesion } from '@/lib/auth/requerirSesion'
import { consultarConexion, leerConfigGateway, obtenerQr, type EstadoConexion } from '@/lib/whatsapp/gateway'

export async function GET(request: Request) {
  const pideQr = new URL(request.url).searchParams.get('qr') === '1'
  // El estado lo ve cualquier usuario (para el aviso); el QR vincula el número, así que es solo del administrador.
  const auth = pideQr ? await requerirAdministrador() : await requerirSesion()
  if (auth.error) return auth.error

  const cfg = leerConfigGateway()
  if (!cfg) return NextResponse.json({ estado: 'desconocido' satisfies EstadoConexion, sinConfigurar: true })

  try {
    const estado = await consultarConexion(cfg)
    if (!pideQr || estado === 'abierta') return NextResponse.json({ estado })
    return NextResponse.json({ estado, qr: await obtenerQr(cfg) })
  } catch (err) {
    console.error('No se pudo consultar el gateway de WhatsApp:', err)
    return NextResponse.json({ estado: 'desconocido' satisfies EstadoConexion })
  }
}
