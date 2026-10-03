// Cálculo determinístico del precio final por línea de una boleta.
// Todo se opera en centavos enteros; el modelo de visión nunca calcula.

export interface LineaBoletaInput {
  cantidad: number
  precioLista: number | null
  /** Porcentajes de bonificación en el orden impreso. */
  bonificaciones: number[]
  /** Importe neto impreso de la línea; si existe, es la verdad. */
  netoImpreso: number | null
  ivaAlicuota: number
  esRegalo: boolean
}

export interface IvaImpreso {
  alicuota: number
  monto: number
}

export interface PercepcionImpresa {
  nombre: string
  monto: number
}

export interface BoletaInput {
  lineas: LineaBoletaInput[]
  iva: IvaImpreso[]
  percepciones: PercepcionImpresa[]
  totalImpreso: number
}

export interface LineaBoletaCalculada {
  neto: number
  ivaMonto: number
  percepciones: { nombre: string; monto: number }[]
  totalLinea: number
  precioFinalUnitario: number
  descuentoEfectivo: number | null
}

export interface BoletaCalculada {
  lineas: LineaBoletaCalculada[]
  sumaLineas: number
  ajusteRedondeo: number
  /** totalImpreso − sumaLineas cuando excede un redondeo; 0 cuando cuadra. */
  diferencia: number
  cuadra: boolean
}

const MAX_AJUSTE_CENTAVOS = 3

const aCentavos = (n: number) => Math.round(n * 100)
const deCentavos = (c: number) => c / 100

/** Reparte `total` centavos según `pesos`, con el método del mayor resto. */
export function prorratear(total: number, pesos: number[]): number[] {
  const suma = pesos.reduce((a, b) => a + b, 0)
  if (suma === 0) return pesos.map(() => 0)
  const exactos = pesos.map((p) => (total * p) / suma)
  const pisos = exactos.map(Math.floor)
  let resto = total - pisos.reduce((a, b) => a + b, 0)
  const orden = exactos
    .map((e, i) => ({ i, frac: e - Math.floor(e) }))
    .sort((a, b) => b.frac - a.frac)
  for (const { i } of orden) {
    if (resto <= 0) break
    pisos[i] += 1
    resto -= 1
  }
  return pisos
}

/** Neto en centavos. Sin impreso: lista × cantidad con bonificaciones sumadas sobre lista. */
export function calcularNetoLinea(l: LineaBoletaInput): number {
  if (l.esRegalo) return 0
  if (l.netoImpreso !== null) return aCentavos(l.netoImpreso)
  const lista = (l.precioLista ?? 0) * l.cantidad
  const suma = l.bonificaciones.reduce((a, b) => a + b, 0)
  return aCentavos(lista * (1 - suma / 100))
}

export function calcularBoleta(input: BoletaInput): BoletaCalculada {
  const netos = input.lineas.map(calcularNetoLinea)

  const iva = input.lineas.map(() => 0)
  for (const grupo of input.iva) {
    const idx = input.lineas
      .map((l, i) => (l.ivaAlicuota === grupo.alicuota ? i : -1))
      .filter((i) => i >= 0)
    const partes = prorratear(
      aCentavos(grupo.monto),
      idx.map((i) => netos[i])
    )
    idx.forEach((i, k) => (iva[i] += partes[k]))
  }

  const percPorLinea: { nombre: string; monto: number }[][] = input.lineas.map(() => [])
  for (const p of input.percepciones) {
    const partes = prorratear(aCentavos(p.monto), netos)
    partes.forEach((c, i) => percPorLinea[i].push({ nombre: p.nombre, monto: deCentavos(c) }))
  }

  const lineas = input.lineas.map((l, i): LineaBoletaCalculada => {
    const percTotal = percPorLinea[i].reduce((a, p) => a + aCentavos(p.monto), 0)
    const total = netos[i] + iva[i] + percTotal
    const lista = aCentavos((l.precioLista ?? 0) * l.cantidad)
    return {
      neto: deCentavos(netos[i]),
      ivaMonto: deCentavos(iva[i]),
      percepciones: percPorLinea[i],
      totalLinea: deCentavos(total),
      precioFinalUnitario: l.cantidad > 0 ? Math.round((total / l.cantidad) * 100) / 10000 : 0,
      descuentoEfectivo: lista > 0 && !l.esRegalo ? 1 - netos[i] / lista : null,
    }
  })

  const suma = lineas.reduce((a, l) => a + aCentavos(l.totalLinea), 0)
  const ajuste = aCentavos(input.totalImpreso) - suma
  // Un ajuste mayor a unos centavos no es redondeo: queda como diferencia a revisar.
  const esRedondeo = Math.abs(ajuste) <= MAX_AJUSTE_CENTAVOS
  return {
    lineas,
    sumaLineas: deCentavos(suma),
    ajusteRedondeo: esRedondeo ? deCentavos(ajuste) : 0,
    diferencia: esRedondeo ? 0 : deCentavos(ajuste),
    cuadra: esRedondeo,
  }
}
