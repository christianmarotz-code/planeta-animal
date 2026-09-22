import { NextResponse } from 'next/server'
import { requerirAdministrador } from '@/lib/auth/requerirAdministrador'
import { extraerTablaPDF } from '@/lib/pdf/extraerTablaPDF'

export const maxDuration = 60

const TAMANO_MAXIMO_BYTES = 15 * 1024 * 1024

export async function POST(request: Request) {
  const { error } = await requerirAdministrador()
  if (error) return error

  const formData = await request.formData().catch(() => null)
  const archivo = formData?.get('archivo')
  if (!(archivo instanceof File)) {
    return NextResponse.json({ ok: false, error: 'Falta el archivo PDF.' }, { status: 400 })
  }
  if (archivo.type !== 'application/pdf' && !archivo.name.toLowerCase().endsWith('.pdf')) {
    return NextResponse.json({ ok: false, error: 'El archivo no es un PDF.' }, { status: 400 })
  }
  if (archivo.size > TAMANO_MAXIMO_BYTES) {
    return NextResponse.json({ ok: false, error: 'El PDF es demasiado grande (máximo 15 MB).' }, { status: 400 })
  }

  try {
    const buffer = Buffer.from(await archivo.arrayBuffer())
    const { headers, filas } = await extraerTablaPDF(buffer)
    if (filas.length === 0) {
      return NextResponse.json({
        ok: false,
        error:
          'No se encontraron filas de datos en el PDF. Puede ser un PDF escaneado (imagen) sin texto seleccionable; probá exportarlo como CSV/Excel.',
      })
    }
    return NextResponse.json({ ok: true, headers, filas })
  } catch (err) {
    console.error('Error leyendo PDF de comparador:', err)
    const mensaje = err instanceof Error && err.message.startsWith('No se detectó') ? err.message : null
    return NextResponse.json({
      ok: false,
      error: mensaje ?? 'No se pudo leer el PDF. Probá con otro archivo.',
    })
  }
}
