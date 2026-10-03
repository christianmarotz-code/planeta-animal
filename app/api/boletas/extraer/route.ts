import { NextResponse } from 'next/server'
import { createHash } from 'node:crypto'
import Anthropic from '@anthropic-ai/sdk'
import { requerirAdministrador } from '@/lib/auth/requerirAdministrador'
import { createAdminClient } from '@/lib/supabase/admin'
import { HERRAMIENTA_EXTRAER_BOLETA, sanearBoletaExtraida } from '@/lib/facturas/boletaExtraida'
import { procesarBoleta } from '@/lib/facturas/procesarBoleta'
import { validarBoleta } from '@/lib/facturas/validacionesBoleta'
import {
  PROMPT_EXTRACTOR,
  mensajeProveedorDeclarado,
  type ProveedorDeclarado,
} from '@/lib/facturas/promptExtractor'

export const maxDuration = 60

const SEGUNDOS_VALIDEZ_URL_FIRMADA = 300
const MAX_PAGINAS = 6
const MODELO = 'claude-sonnet-5-5'

const TIPOS_IMAGEN = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'] as const
type TipoImagen = (typeof TIPOS_IMAGEN)[number]

const esTipoImagen = (v: string): v is TipoImagen => (TIPOS_IMAGEN as readonly string[]).includes(v)

function tipoPorExtension(ruta: string): string | null {
  const ext = ruta.split('.').pop()?.toLowerCase()
  if (ext === 'pdf') return 'application/pdf'
  if (ext === 'png') return 'image/png'
  if (ext === 'webp') return 'image/webp'
  if (ext === 'gif') return 'image/gif'
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg'
  return null
}

const falla = (error: string) => NextResponse.json({ ok: false, error })

function comoProveedorDeclarado(v: unknown): ProveedorDeclarado | null {
  if (typeof v !== 'object' || v === null) return null
  const p = v as Record<string, unknown>
  if (typeof p.nombre !== 'string' || p.nombre.trim() === '') return null
  return {
    nombre: p.nombre.trim(),
    cuit: typeof p.cuit === 'string' && p.cuit.trim() ? p.cuit.trim() : null,
    formato_habitual:
      typeof p.formato_habitual === 'string' && p.formato_habitual.trim() ? p.formato_habitual.trim() : null,
  }
}

export async function POST(request: Request) {
  const { error } = await requerirAdministrador()
  if (error) return error

  const body = (await request.json().catch(() => null)) as {
    rutas_archivo?: unknown
    proveedor_declarado?: unknown
  } | null
  const rutas = Array.isArray(body?.rutas_archivo)
    ? body.rutas_archivo.filter((r): r is string => typeof r === 'string' && r.length > 0)
    : []
  const proveedor = comoProveedorDeclarado(body?.proveedor_declarado)
  if (rutas.length === 0 || rutas.length > MAX_PAGINAS) {
    return NextResponse.json({ error: `Enviá entre 1 y ${MAX_PAGINAS} archivos en rutas_archivo` }, { status: 400 })
  }
  if (!proveedor) {
    return NextResponse.json({ error: 'Falta proveedor_declarado.nombre' }, { status: 400 })
  }

  try {
    const admin = createAdminClient()
    const bloquesArchivo: Anthropic.Messages.ContentBlockParam[] = []
    const hash = createHash('sha256')

    for (const ruta of rutas) {
      const { data: url, error: errorUrl } = await admin.storage
        .from('facturas-adjuntos')
        .createSignedUrl(ruta, SEGUNDOS_VALIDEZ_URL_FIRMADA)
      if (errorUrl || !url) return falla('No se pudo acceder al archivo subido.')

      const respuesta = await fetch(url.signedUrl)
      if (!respuesta.ok) return falla('No se pudo descargar el archivo subido.')
      const buffer = Buffer.from(await respuesta.arrayBuffer())
      hash.update(buffer)

      const tipo = tipoPorExtension(ruta) ?? respuesta.headers.get('content-type') ?? ''
      const datos = buffer.toString('base64')
      if (tipo === 'application/pdf') {
        bloquesArchivo.push({
          type: 'document',
          source: { type: 'base64', media_type: 'application/pdf', data: datos },
        })
      } else if (esTipoImagen(tipo)) {
        bloquesArchivo.push({ type: 'image', source: { type: 'base64', media_type: tipo, data: datos } })
      } else {
        return falla('Formato no soportado. Subí una foto JPEG/PNG o un PDF.')
      }
    }

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: 55_000 })
    const respuesta = await anthropic.messages.create({
      model: MODELO,
      max_tokens: 12_000,
      system: PROMPT_EXTRACTOR,
      tools: [HERRAMIENTA_EXTRAER_BOLETA],
      tool_choice: { type: 'auto' },
      messages: [
        {
          role: 'user',
          content: [
            ...bloquesArchivo,
            {
              type: 'text',
              text: `${mensajeProveedorDeclarado(proveedor)}\n\nDevolvé los datos llamando a la herramienta ${HERRAMIENTA_EXTRAER_BOLETA.name}.`,
            },
          ],
        },
      ],
    })

    console.log(
      `[boletas/extraer] tokens entrada=${respuesta.usage.input_tokens} salida=${respuesta.usage.output_tokens}`
    )

    if (respuesta.stop_reason === 'max_tokens') return falla('La boleta es muy larga para leerla automáticamente.')
    const uso = respuesta.content.find((b) => b.type === 'tool_use')
    if (!uso || uso.type !== 'tool_use') return falla('Claude no devolvió datos estructurados.')

    const boleta = sanearBoletaExtraida(uso.input)
    const procesada = procesarBoleta(boleta)
    const { alertas, estado } = validarBoleta(boleta, procesada, {
      proveedorDeclarado: { nombre: proveedor.nombre, cuit: proveedor.cuit },
      compradorCuit: process.env.COMPRADOR_CUIT ?? null,
    })

    // Duplicado por imagen. La columna llega con la migración 0020: si todavía
    // no existe, la consulta falla y simplemente no se avisa.
    const hashImagen = hash.digest('hex')
    const { data: duplicada } = await admin
      .from('facturas_compra')
      .select('id')
      .eq('hash_imagen', hashImagen)
      .neq('estado', 'anulada')
      .limit(1)
      .maybeSingle()
    const facturaDuplicadaId = (duplicada as { id: string } | null)?.id ?? null
    if (facturaDuplicadaId) {
      alertas.push({
        nivel: 'bloqueante',
        codigo: 'duplicado_imagen',
        mensaje: 'Este archivo ya fue cargado antes.',
      })
    }

    return NextResponse.json({
      ok: true,
      boleta,
      calculo: procesada.calculo,
      filas: procesada.filas,
      alertas,
      estado,
      hash_imagen: hashImagen,
      factura_duplicada_id: facturaDuplicadaId,
    })
  } catch (err) {
    console.error('Error extrayendo boleta:', err)
    return falla('No se pudo leer la boleta automáticamente.')
  }
}
