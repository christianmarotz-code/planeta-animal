import type { BoletaExtraida } from './boletaExtraida'
import type { BoletaProcesada } from './procesarBoleta'

/**
 * bloqueante: no se guarda sin que el usuario lo resuelva o lo confirme.
 * revision: el documento queda en estado "revision".
 * aviso: informativo.
 */
export type NivelAlerta = 'bloqueante' | 'revision' | 'aviso'

export interface Alerta {
  nivel: NivelAlerta
  codigo: string
  mensaje: string
}

export interface ContextoValidacion {
  proveedorDeclarado?: { nombre: string; cuit: string | null }
  compradorCuit?: string | null
  hoy?: Date
}

const TOLERANCIA_SUBTOTAL = 0.02
const TOLERANCIA_TOTAL = 0.05

const soloDigitos = (s: string | null | undefined) => (s ?? '').replace(/\D/g, '')

export function cuitValido(cuit: string | null): boolean {
  const d = soloDigitos(cuit)
  if (d.length !== 11) return false
  const pesos = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2]
  const suma = pesos.reduce((a, p, i) => a + p * Number(d[i]), 0)
  let verificador = 11 - (suma % 11)
  if (verificador === 11) verificador = 0
  return verificador === Number(d[10])
}

export function caeValido(cae: string | null): boolean {
  return cae !== null && /^\d{14}$/.test(cae.trim())
}

export function numeroComprobanteValido(numero: string | null): boolean {
  return numero !== null && /^\d{4,5}-\d{8}$/.test(numero)
}

const suma = (xs: number[]) => xs.reduce((a, b) => a + b, 0)

export function validarBoleta(
  boleta: BoletaExtraida,
  procesada: BoletaProcesada,
  ctx: ContextoValidacion = {}
): { alertas: Alerta[]; estado: 'ok' | 'revision' } {
  const alertas: Alerta[] = []
  const agregar = (nivel: NivelAlerta, codigo: string, mensaje: string) =>
    alertas.push({ nivel, codigo, mensaje })

  if (boleta.tipo === null || boleta.tipo === 'otro_no_compra') {
    agregar(
      'bloqueante',
      'no_es_compra',
      boleta.descripcion_no_compra ?? 'El documento no parece una boleta de compra.'
    )
    return { alertas, estado: 'revision' }
  }

  // Proveedor elegido vs. proveedor leído.
  const declarado = ctx.proveedorDeclarado
  const cuitDistinto =
    !!declarado?.cuit && !!boleta.proveedor_cuit && soloDigitos(declarado.cuit) !== soloDigitos(boleta.proveedor_cuit)
  if (boleta.proveedor_coincide === false || cuitDistinto) {
    agregar(
      'bloqueante',
      'proveedor_distinto',
      `Esta boleta parece ser de ${boleta.proveedor_nombre ?? 'otro proveedor'}` +
        (declarado ? `, no de ${declarado.nombre}` : '') +
        '. ¿Querés cambiar el proveedor?'
    )
  }

  if (boleta.es_fiscal) {
    if (boleta.proveedor_cuit && !cuitValido(boleta.proveedor_cuit)) {
      agregar('revision', 'cuit_invalido', 'El CUIT del proveedor no tiene un dígito verificador válido.')
    }
    if (!numeroComprobanteValido(boleta.numero_comprobante)) {
      agregar('revision', 'numero_invalido', 'El número de comprobante no tiene el formato 0000-00000000.')
    }
    if (boleta.cae && !caeValido(boleta.cae)) {
      agregar('revision', 'cae_invalido', 'El CAE debe tener 14 dígitos.')
    }
  }

  const compradorEsperado = soloDigitos(ctx.compradorCuit)
  if (compradorEsperado && boleta.comprador_cuit && soloDigitos(boleta.comprador_cuit) !== compradorEsperado) {
    agregar('aviso', 'comprador_distinto', 'El CUIT del comprador no coincide con el del negocio.')
  }

  if (!boleta.fecha) {
    agregar('revision', 'sin_fecha', 'No se pudo leer la fecha.')
  } else if (boleta.fecha > (ctx.hoy ?? new Date()).toISOString().slice(0, 10)) {
    agregar('aviso', 'fecha_futura', 'La fecha de la boleta es posterior a hoy.')
  }

  if (boleta.lineas.some((l) => !l.cantidad || l.cantidad <= 0)) {
    agregar('revision', 'linea_sin_cantidad', 'Hay líneas sin cantidad legible.')
  }

  if (boleta.total === null) {
    agregar('revision', 'sin_total', 'No se pudo leer el total.')
  } else if (!procesada.calculo.cuadra) {
    const dif = procesada.calculo.diferencia.toFixed(2).replace('.', ',')
    agregar('revision', 'no_cuadra', `La suma de las líneas no coincide con el total impreso (diferencia ${dif}).`)
  }

  const netos = suma(procesada.calculo.lineas.map((l) => l.neto))
  if (boleta.subtotal !== null && Math.abs(boleta.subtotal - netos) > TOLERANCIA_SUBTOTAL) {
    agregar('revision', 'subtotal_no_cuadra', 'El subtotal impreso no coincide con la suma de los netos de las líneas.')
  }

  if (boleta.subtotal !== null && boleta.total !== null && boleta.iva.length > 0) {
    const esperado =
      boleta.subtotal +
      suma(boleta.iva.map((i) => i.monto)) +
      suma(boleta.percepciones.map((p) => p.monto)) +
      suma(boleta.otros_impuestos.map((o) => o.monto)) +
      (boleta.ajuste_redondeo ?? 0)
    if (Math.abs(esperado - boleta.total) > TOLERANCIA_TOTAL) {
      agregar('revision', 'total_no_cuadra', 'El total impreso no coincide con subtotal + IVA + percepciones.')
    }
  }

  for (const duda of boleta.dudas) agregar('aviso', 'duda_lectura', duda)

  const estado = alertas.some((a) => a.nivel !== 'aviso') ? 'revision' : 'ok'
  return { alertas, estado }
}
