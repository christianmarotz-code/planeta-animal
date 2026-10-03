import { calcularBoleta, type BoletaCalculada } from '@/lib/calc/boleta'
import type { BoletaExtraida } from './boletaExtraida'

const ALICUOTA_IVA_POR_DEFECTO = 21

/** Fila de la tabla "A pagar" de 4 columnas. */
export interface FilaTabla {
  cantidad: number
  producto: string
  precioUnitarioFinal: number
  totalPagado: number
  esRegalo: boolean
}

export interface BoletaProcesada {
  calculo: BoletaCalculada
  /** Una fila por línea de la boleta, en el mismo orden. */
  filas: FilaTabla[]
  /** Total impreso, o null si no se pudo leer. */
  totalAPagar: number | null
}

/** Convierte lo extraído en el input del cálculo y lo ejecuta. */
export function procesarBoleta(boleta: BoletaExtraida): BoletaProcesada {
  const alicuotaUnica = boleta.iva.length === 1 ? boleta.iva[0].alicuota : null

  const calculo = calcularBoleta({
    lineas: boleta.lineas.map((l) => ({
      cantidad: l.cantidad ?? 0,
      precioLista: l.precio_lista,
      bonificaciones: l.bonificaciones.map((b) => b.porcentaje).filter((p): p is number => p !== null),
      netoImpreso: l.importe,
      ivaAlicuota: l.alicuota_iva ?? alicuotaUnica ?? ALICUOTA_IVA_POR_DEFECTO,
      esRegalo: l.es_regalo,
    })),
    iva: boleta.iva,
    percepciones: [...boleta.percepciones, ...boleta.otros_impuestos].map((p) => ({
      nombre: p.nombre,
      monto: p.monto,
    })),
    totalImpreso: boleta.total ?? 0,
  })

  const filas = boleta.lineas.map((l, i): FilaTabla => ({
    cantidad: l.cantidad ?? 0,
    producto: (l.descripcion_normalizada ?? l.descripcion).replace(/\s+/g, ' ').trim(),
    precioUnitarioFinal: calculo.lineas[i].precioFinalUnitario,
    totalPagado: calculo.lineas[i].totalLinea,
    esRegalo: l.es_regalo,
  }))

  return { calculo, filas, totalAPagar: boleta.total }
}
