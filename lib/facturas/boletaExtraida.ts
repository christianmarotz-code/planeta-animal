import type { TipoComprobante } from '@/types/database'

export type TipoDocumento =
  | 'factura_A'
  | 'factura_B'
  | 'factura_C'
  | 'ticket_factura'
  | 'presupuesto_X'
  | 'pedido_X'
  | 'remito_R'
  | 'comprobante_interno'
  | 'otro_no_compra'

export const TIPO_A_COMPROBANTE: Record<Exclude<TipoDocumento, 'otro_no_compra'>, TipoComprobante> = {
  factura_A: 'Factura A',
  factura_B: 'Factura B',
  factura_C: 'Factura C',
  ticket_factura: 'Ticket Factura',
  presupuesto_X: 'Presupuesto X',
  pedido_X: 'Pedido X',
  remito_R: 'Remito',
  comprobante_interno: 'Comprobante Interno',
}

const TIPOS_FISCALES: TipoDocumento[] = ['factura_A', 'factura_B', 'factura_C', 'ticket_factura']

export interface BonificacionExtraida {
  porcentaje: number | null
  monto: number | null
}

export interface LineaExtraida {
  codigo: string | null
  descripcion: string
  descripcion_normalizada: string | null
  cantidad: number | null
  unidad: string | null
  kilos: number | null
  precio_lista: number | null
  alicuota_iva: number | null
  bonificaciones: BonificacionExtraida[]
  importe: number | null
  es_regalo: boolean
  leyenda_regalo: string | null
}

export interface BoletaExtraida {
  tipo: TipoDocumento | null
  /** Derivado del tipo en código; no se confía en lo que diga el modelo. */
  es_fiscal: boolean
  proveedor_nombre: string | null
  proveedor_cuit: string | null
  comprador_razon_social: string | null
  comprador_cuit: string | null
  numero_comprobante: string | null
  fecha: string | null
  condicion_pago: string | null
  cae: string | null
  cae_vto: string | null
  pedido: string | null
  remito: string | null
  orden_compra: string | null
  hoja_actual: number | null
  hojas_totales: number | null
  lineas: LineaExtraida[]
  lineas_informativas: string[]
  leyendas_descuento: { texto: string; monto: number | null }[]
  subtotal: number | null
  percepciones: { nombre: string; alicuota: number | null; monto: number }[]
  iva: { alicuota: number; monto: number }[]
  otros_impuestos: { nombre: string; monto: number }[]
  ajuste_redondeo: number | null
  total: number | null
  anotaciones_manuscritas: string[]
  dudas: string[]
  proveedor_coincide: boolean | null
  descripcion_no_compra: string | null
}

const num = { type: ['number', 'null'] }
const str = { type: ['string', 'null'] }
const listaStr = { type: 'array', items: { type: 'string' } }

export const HERRAMIENTA_EXTRAER_BOLETA = {
  name: 'extraer_boleta',
  description: 'Devuelve los datos leídos de un comprobante de compra argentino, sin calcular nada.',
  input_schema: {
    type: 'object' as const,
    properties: {
      tipo: {
        type: ['string', 'null'],
        enum: [...Object.keys(TIPO_A_COMPROBANTE), 'otro_no_compra', null],
      },
      es_fiscal: { type: 'boolean' },
      proveedor_nombre: str,
      proveedor_cuit: str,
      comprador_razon_social: str,
      comprador_cuit: str,
      numero_comprobante: { ...str, description: 'Formato 0000-00000000.' },
      fecha: { ...str, description: 'AAAA-MM-DD.' },
      condicion_pago: str,
      cae: str,
      cae_vto: { ...str, description: 'AAAA-MM-DD.' },
      pedido: str,
      remito: str,
      orden_compra: str,
      hoja_actual: num,
      hojas_totales: num,
      lineas: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            codigo: str,
            descripcion: { type: 'string', description: 'Exacta, tal como figura.' },
            descripcion_normalizada: {
              ...str,
              description: 'Nombre limpio y prolijo, sin códigos internos ni abreviaturas raras.',
            },
            cantidad: num,
            unidad: str,
            kilos: num,
            precio_lista: num,
            alicuota_iva: { ...num, description: 'Alícuota de la línea si figura impresa.' },
            bonificaciones: {
              type: 'array',
              description: 'En el orden en que aparecen.',
              items: { type: 'object', properties: { porcentaje: num, monto: num } },
            },
            importe: { ...num, description: 'Importe neto impreso de la línea; null si no está impreso.' },
            es_regalo: { type: 'boolean' },
            leyenda_regalo: str,
          },
          required: ['descripcion', 'es_regalo'],
        },
      },
      lineas_informativas: listaStr,
      leyendas_descuento: {
        type: 'array',
        items: { type: 'object', properties: { texto: { type: 'string' }, monto: num }, required: ['texto'] },
      },
      subtotal: num,
      percepciones: {
        type: 'array',
        items: {
          type: 'object',
          properties: { nombre: { type: 'string' }, alicuota: num, monto: { type: 'number' } },
          required: ['nombre', 'monto'],
        },
      },
      iva: {
        type: 'array',
        items: {
          type: 'object',
          properties: { alicuota: { type: 'number' }, monto: { type: 'number' } },
          required: ['alicuota', 'monto'],
        },
      },
      otros_impuestos: {
        type: 'array',
        items: {
          type: 'object',
          properties: { nombre: { type: 'string' }, monto: { type: 'number' } },
          required: ['nombre', 'monto'],
        },
      },
      ajuste_redondeo: num,
      total: num,
      anotaciones_manuscritas: listaStr,
      dudas: listaStr,
      proveedor_coincide: { type: ['boolean', 'null'] },
      descripcion_no_compra: str,
    },
    required: ['tipo', 'lineas'],
  },
}

// ── Saneado: descarta campo por campo lo inválido en vez de romper todo ────

const REGEX_FECHA_ISO = /^\d{4}-\d{2}-\d{2}$/

const comoObjeto = (v: unknown): Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {}

function comoStr(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t.length > 0 ? t : null
}

function comoNum(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

function comoFecha(v: unknown): string | null {
  return typeof v === 'string' && REGEX_FECHA_ISO.test(v) ? v : null
}

function comoLista<T>(v: unknown, mapear: (x: Record<string, unknown>) => T | null): T[] {
  if (!Array.isArray(v)) return []
  return v.map((x) => mapear(comoObjeto(x))).filter((x): x is T => x !== null)
}

function comoListaStr(v: unknown): string[] {
  return Array.isArray(v) ? v.map(comoStr).filter((s): s is string => s !== null) : []
}

function comoTipo(v: unknown): TipoDocumento | null {
  return typeof v === 'string' && (v === 'otro_no_compra' || v in TIPO_A_COMPROBANTE)
    ? (v as TipoDocumento)
    : null
}

export function sanearBoletaExtraida(raw: unknown): BoletaExtraida {
  const d = comoObjeto(raw)
  const tipo = comoTipo(d.tipo)
  return {
    tipo,
    es_fiscal: tipo !== null && TIPOS_FISCALES.includes(tipo),
    proveedor_nombre: comoStr(d.proveedor_nombre),
    proveedor_cuit: comoStr(d.proveedor_cuit),
    comprador_razon_social: comoStr(d.comprador_razon_social),
    comprador_cuit: comoStr(d.comprador_cuit),
    numero_comprobante: comoStr(d.numero_comprobante),
    fecha: comoFecha(d.fecha),
    condicion_pago: comoStr(d.condicion_pago),
    cae: comoStr(d.cae),
    cae_vto: comoFecha(d.cae_vto),
    pedido: comoStr(d.pedido),
    remito: comoStr(d.remito),
    orden_compra: comoStr(d.orden_compra),
    hoja_actual: comoNum(d.hoja_actual),
    hojas_totales: comoNum(d.hojas_totales),
    lineas: comoLista(d.lineas, (l) => {
      const descripcion = comoStr(l.descripcion)
      if (!descripcion) return null
      return {
        codigo: comoStr(l.codigo),
        descripcion,
        descripcion_normalizada: comoStr(l.descripcion_normalizada),
        cantidad: comoNum(l.cantidad),
        unidad: comoStr(l.unidad),
        kilos: comoNum(l.kilos),
        precio_lista: comoNum(l.precio_lista),
        alicuota_iva: comoNum(l.alicuota_iva),
        bonificaciones: comoLista(l.bonificaciones, (b) => {
          const porcentaje = comoNum(b.porcentaje)
          const monto = comoNum(b.monto)
          return porcentaje === null && monto === null ? null : { porcentaje, monto }
        }),
        importe: comoNum(l.importe),
        es_regalo: l.es_regalo === true,
        leyenda_regalo: comoStr(l.leyenda_regalo),
      }
    }),
    lineas_informativas: comoListaStr(d.lineas_informativas),
    leyendas_descuento: comoLista(d.leyendas_descuento, (x) => {
      const texto = comoStr(x.texto)
      return texto ? { texto, monto: comoNum(x.monto) } : null
    }),
    subtotal: comoNum(d.subtotal),
    percepciones: comoLista(d.percepciones, (x) => {
      const nombre = comoStr(x.nombre)
      const monto = comoNum(x.monto)
      return nombre && monto !== null ? { nombre, alicuota: comoNum(x.alicuota), monto } : null
    }),
    iva: comoLista(d.iva, (x) => {
      const alicuota = comoNum(x.alicuota)
      const monto = comoNum(x.monto)
      return alicuota !== null && monto !== null ? { alicuota, monto } : null
    }),
    otros_impuestos: comoLista(d.otros_impuestos, (x) => {
      const nombre = comoStr(x.nombre)
      const monto = comoNum(x.monto)
      return nombre && monto !== null ? { nombre, monto } : null
    }),
    ajuste_redondeo: comoNum(d.ajuste_redondeo),
    total: comoNum(d.total),
    anotaciones_manuscritas: comoListaStr(d.anotaciones_manuscritas),
    dudas: comoListaStr(d.dudas),
    proveedor_coincide: typeof d.proveedor_coincide === 'boolean' ? d.proveedor_coincide : null,
    descripcion_no_compra: comoStr(d.descripcion_no_compra),
  }
}
