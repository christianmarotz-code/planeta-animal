import type { FacturaCompra, Proveedor } from '@/types/database'
import type { NuevaFacturaInput } from '@/lib/data/facturas'
import { normalizarTexto } from '@/lib/text/normalizar'
import { TIPO_A_COMPROBANTE, type BoletaExtraida } from './boletaExtraida'
import type { BoletaProcesada } from './procesarBoleta'
import { cuitValido } from './validacionesBoleta'

const redondear = (n: number, decimales: number) => {
  const f = 10 ** decimales
  return Math.round(n * f) / f
}
const suma = (xs: number[]) => xs.reduce((a, b) => a + b, 0)

/** "10 días fecha factura" → fecha + 10 días. Null si no se puede deducir. */
export function calcularVencimiento(fecha: string | null, condicionPago: string | null): string | null {
  const dias = condicionPago?.match(/(\d+)\s*d[ií]as/i)?.[1]
  if (!fecha || !dias) return null
  const d = new Date(`${fecha}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + Number(dias))
  return d.toISOString().slice(0, 10)
}

export function armarPayloadFactura(args: {
  proveedorId: string
  boleta: BoletaExtraida
  procesada: BoletaProcesada
  estado: 'ok' | 'revision'
  /** Producto vinculado a cada línea (null si no hay). Mismo orden que boleta.lineas. */
  productoIds: (string | null)[]
  archivoAdjunto: string | null
  hashImagen: string | null
}): NuevaFacturaInput {
  const { boleta, procesada } = args
  if (!boleta.tipo || boleta.tipo === 'otro_no_compra') throw new Error('Tipo de comprobante inválido')
  if (!boleta.fecha) throw new Error('Falta la fecha')

  const { calculo } = procesada
  const percepciones = [...boleta.percepciones, ...boleta.otros_impuestos]

  return {
    proveedor_id: args.proveedorId,
    numero_comprobante: boleta.numero_comprobante ?? '',
    tipo_comprobante: TIPO_A_COMPROBANTE[boleta.tipo],
    fecha: boleta.fecha,
    subtotal: boleta.subtotal ?? redondear(suma(calculo.lineas.map((l) => l.neto)), 2),
    iva_total: redondear(suma(boleta.iva.map((i) => i.monto)), 2),
    total: boleta.total ?? calculo.sumaLineas,
    archivo_adjunto: args.archivoAdjunto,
    estado: args.estado === 'revision' ? 'revision' : 'cargada',
    es_fiscal: boleta.es_fiscal,
    condicion_pago: boleta.condicion_pago,
    vencimiento: calcularVencimiento(boleta.fecha, boleta.condicion_pago),
    cae: boleta.cae,
    cae_vto: boleta.cae_vto,
    pedido: boleta.pedido,
    remito: boleta.remito,
    orden_compra: boleta.orden_compra,
    percepciones_total: redondear(suma(percepciones.map((p) => p.monto)), 2),
    ajuste_redondeo: calculo.ajusteRedondeo,
    total_calculado: calculo.sumaLineas,
    hash_imagen: args.hashImagen,
    impuestos: [
      ...boleta.iva.map((i) => ({ tipo: 'IVA', alicuota: i.alicuota, monto: i.monto })),
      ...boleta.percepciones.map((p) => ({ tipo: p.nombre, alicuota: p.alicuota, monto: p.monto })),
      ...boleta.otros_impuestos.map((o) => ({ tipo: o.nombre, alicuota: null, monto: o.monto })),
    ],
    items: boleta.lineas.map((l, i) => {
      const c = calculo.lineas[i]
      const cantidad = l.cantidad ?? 0
      return {
        producto_id: args.productoIds[i] ?? null,
        cantidad,
        costo_unitario: l.es_regalo || cantidad <= 0 ? 0 : redondear(c.neto / cantidad, 4),
        alicuota_iva: l.alicuota_iva ?? (boleta.iva.length === 1 ? boleta.iva[0].alicuota : 21),
        codigo_proveedor: l.codigo,
        descripcion_original: l.descripcion,
        precio_lista: l.precio_lista,
        bonificaciones: l.bonificaciones.map((b) => b.porcentaje).filter((p): p is number => p !== null),
        neto_linea: c.neto,
        iva_monto: c.ivaMonto,
        percepciones: c.percepciones,
        total_linea: c.totalLinea,
        precio_final_unitario: c.precioFinalUnitario,
        es_regalo: l.es_regalo,
        leyenda_regalo: l.leyenda_regalo,
      }
    }),
  }
}

/**
 * Datos del proveedor que se pueden completar con lo leído de la boleta.
 * Solo rellena lo vacío; nunca pisa un dato existente (CUIT o razón social
 * distintos los resuelve el usuario con la alerta de proveedor distinto).
 */
export function completarProveedorDesdeBoleta(proveedor: Proveedor, boleta: BoletaExtraida): Partial<Proveedor> {
  const patch: Partial<Proveedor> = {}
  if (!proveedor.cuit && boleta.proveedor_cuit && cuitValido(boleta.proveedor_cuit)) {
    patch.cuit = boleta.proveedor_cuit
  }
  if (!proveedor.razon_social && boleta.proveedor_nombre) patch.razon_social = boleta.proveedor_nombre
  if (!proveedor.condicion_pago_habitual && boleta.condicion_pago) {
    patch.condicion_pago_habitual = boleta.condicion_pago
  }
  const leido = boleta.proveedor_nombre
  if (leido) {
    const conocidos = [proveedor.nombre, proveedor.razon_social ?? '', ...proveedor.alias].map(normalizarTexto)
    if (!conocidos.includes(normalizarTexto(leido))) patch.alias = [...proveedor.alias, leido]
  }
  return patch
}

// Las facturas viejas guardan "A-00003-00015831" y la lectura devuelve "00003-00015831":
// se comparan solo los dígitos.
const soloDigitos = (s: string) => s.replace(/\D/g, '')

/** Factura ya cargada con el mismo tipo y número (la lista es del proveedor elegido). */
export function buscarFacturaDuplicada(
  facturas: FacturaCompra[],
  tipo: string,
  numero: string | null
): FacturaCompra | null {
  const buscado = numero ? soloDigitos(numero) : ''
  if (!buscado) return null
  return (
    facturas.find(
      (f) =>
        f.estado !== 'anulada' &&
        f.tipo_comprobante === tipo &&
        soloDigitos(f.numero_comprobante) === buscado
    ) ?? null
  )
}
