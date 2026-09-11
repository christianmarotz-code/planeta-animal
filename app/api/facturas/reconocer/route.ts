import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { requerirAdministrador } from '@/lib/auth/requerirAdministrador'
import { createAdminClient } from '@/lib/supabase/admin'
import { sanearFacturaDetectada, type FacturaDetectada } from '@/lib/facturas/reconocimientoSchema'

export const maxDuration = 60

const SEGUNDOS_VALIDEZ_URL_FIRMADA = 300

const TIPOS_MEDIA_SOPORTADOS = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'] as const
type TipoMediaSoportado = (typeof TIPOS_MEDIA_SOPORTADOS)[number]

function esTipoMediaSoportado(valor: string): valor is TipoMediaSoportado {
  return (TIPOS_MEDIA_SOPORTADOS as readonly string[]).includes(valor)
}

const HERRAMIENTA_EXTRAER_FACTURA = {
  name: 'extraer_factura',
  description: 'Extrae los datos de una factura de compra argentina (AFIP) a partir de su imagen.',
  input_schema: {
    type: 'object' as const,
    properties: {
      proveedor_nombre: { type: ['string', 'null'], description: 'Razón social del emisor de la factura.' },
      proveedor_cuit: { type: ['string', 'null'], description: 'CUIT del emisor, si figura impreso.' },
      tipo_comprobante: {
        type: ['string', 'null'],
        enum: ['Factura A', 'Factura B', 'Factura C', 'Remito', 'Nota de Credito', null],
      },
      numero_comprobante: { type: ['string', 'null'], description: 'Número de comprobante, ej. 0001-00012345.' },
      fecha: { type: ['string', 'null'], description: 'Fecha de emisión en formato YYYY-MM-DD.' },
      items: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            descripcion: { type: 'string' },
            cantidad: { type: ['number', 'null'] },
            costo_unitario: { type: ['number', 'null'], description: 'Precio unitario sin IVA.' },
            alicuota_iva: { type: ['number', 'null'], description: 'Porcentaje de IVA de la línea (ej. 21).' },
          },
          required: ['descripcion'],
        },
      },
      subtotal: { type: ['number', 'null'] },
      iva_total: { type: ['number', 'null'] },
      total: { type: ['number', 'null'] },
    },
    required: ['items'],
  },
}

export async function POST(request: Request) {
  const { error } = await requerirAdministrador()
  if (error) return error

  const body = await request.json().catch(() => null)
  const rutaArchivo = (body as { ruta_archivo?: unknown } | null)?.ruta_archivo
  if (typeof rutaArchivo !== 'string' || rutaArchivo.length === 0) {
    return NextResponse.json({ error: 'Falta ruta_archivo' }, { status: 400 })
  }

  try {
    const admin = createAdminClient()
    const { data: urlFirmada, error: errorUrl } = await admin.storage
      .from('facturas-adjuntos')
      .createSignedUrl(rutaArchivo, SEGUNDOS_VALIDEZ_URL_FIRMADA)
    if (errorUrl || !urlFirmada) {
      return NextResponse.json({ ok: false, error: 'No se pudo acceder a la imagen subida.' })
    }

    const respuestaImagen = await fetch(urlFirmada.signedUrl)
    if (!respuestaImagen.ok) {
      return NextResponse.json({ ok: false, error: 'No se pudo descargar la imagen subida.' })
    }
    const bufferImagen = Buffer.from(await respuestaImagen.arrayBuffer())
    const tipoContenido = respuestaImagen.headers.get('content-type') ?? 'image/jpeg'
    if (!esTipoMediaSoportado(tipoContenido)) {
      return NextResponse.json({
        ok: false,
        error: 'Formato de imagen no soportado. Probá con una foto en JPEG o PNG.',
      })
    }
    const tipoMedia = tipoContenido

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: 50_000 })
    const respuesta = await anthropic.messages.create({
      model: 'claude-sonnet-5',
      max_tokens: 8192,
      system:
        'Sos un asistente que lee facturas de compra argentinas (formato AFIP) a partir de una foto y ' +
        'extrae sus datos con la herramienta extraer_factura. Si un campo no se lee con claridad, devolvé ' +
        'null para ese campo en vez de adivinar. Los montos van sin el símbolo $ ni separadores de miles.',
      tools: [HERRAMIENTA_EXTRAER_FACTURA],
      tool_choice: { type: 'tool', name: 'extraer_factura' },
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: tipoMedia, data: bufferImagen.toString('base64') },
            },
            { type: 'text', text: 'Extraé los datos de esta factura.' },
          ],
        },
      ],
    })

    if (respuesta.stop_reason === 'max_tokens') {
      return NextResponse.json({
        ok: false,
        error: 'La factura es muy larga para leerla automáticamente.',
      })
    }

    const usoHerramienta = respuesta.content.find((bloque) => bloque.type === 'tool_use')
    if (!usoHerramienta || usoHerramienta.type !== 'tool_use') {
      return NextResponse.json({ ok: false, error: 'Claude no devolvió datos estructurados.' })
    }

    const factura: FacturaDetectada = sanearFacturaDetectada(usoHerramienta.input)
    return NextResponse.json({ ok: true, factura })
  } catch (err) {
    console.error('Error reconociendo factura:', err)
    return NextResponse.json({ ok: false, error: 'No se pudo leer la factura automáticamente.' })
  }
}
