import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'

const TOLERANCIA_Y = 3
const TOLERANCIA_COLUMNA = 25

interface ItemPosicion {
  x: number
  y: number
  texto: string
}

function normalizar(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
}

async function extraerItemsDePagina(pagina: Awaited<ReturnType<Awaited<ReturnType<typeof getDocument>['promise']>['getPage']>>): Promise<ItemPosicion[]> {
  const contenido = await pagina.getTextContent()
  return (contenido.items as { str: string; transform: number[] }[])
    .map((it) => ({ x: it.transform[4], y: it.transform[5], texto: it.str }))
    .filter((it) => it.texto.trim().length > 0)
}

/** Agrupa items sueltos de una página en filas visuales, tolerando el jitter vertical de la fuente. */
function agruparEnFilas(items: ItemPosicion[]): ItemPosicion[][] {
  const ordenados = [...items].sort((a, b) => b.y - a.y || a.x - b.x)
  const filas: ItemPosicion[][] = []
  let filaActual: ItemPosicion[] = []
  let anclaY: number | null = null
  for (const it of ordenados) {
    if (anclaY === null || Math.abs(it.y - anclaY) > TOLERANCIA_Y) {
      if (filaActual.length) filas.push(filaActual)
      filaActual = [it]
      anclaY = it.y
    } else {
      filaActual.push(it)
    }
  }
  if (filaActual.length) filas.push(filaActual)
  for (const fila of filas) fila.sort((a, b) => a.x - b.x)
  return filas
}

/** El "$" suele venir como un item de texto separado del monto; los junta para que ocupen una sola columna. */
function fusionarSignosPesos(fila: ItemPosicion[]): ItemPosicion[] {
  const resultado: ItemPosicion[] = []
  for (let i = 0; i < fila.length; i++) {
    const actual = fila[i]
    const siguiente = fila[i + 1]
    if (
      actual.texto.trim() === '$' &&
      siguiente &&
      /^[\d.,]+%?$/.test(siguiente.texto.trim()) &&
      siguiente.x - actual.x < 40
    ) {
      resultado.push({ x: actual.x, y: actual.y, texto: `${actual.texto.trim()} ${siguiente.texto.trim()}` })
      i++
    } else {
      resultado.push(actual)
    }
  }
  return resultado
}

/** Agrupa las posiciones X de inicio de celda en clusters: cada cluster es una columna de la tabla. */
function calcularAnclas(filas: ItemPosicion[][]): number[] {
  const xs = filas.flatMap((fila) => fila.map((it) => it.x))
  const unicos = [...new Set(xs.map((x) => Math.round(x * 100) / 100))].sort((a, b) => a - b)
  const clusters: number[][] = []
  for (const x of unicos) {
    const ultimo = clusters[clusters.length - 1]
    if (ultimo && x - ultimo[ultimo.length - 1] <= TOLERANCIA_COLUMNA) {
      ultimo.push(x)
    } else {
      clusters.push([x])
    }
  }
  return clusters.map((c) => c.reduce((a, b) => a + b, 0) / c.length)
}

function columnaDeX(x: number, anclas: number[]): number {
  for (let i = 0; i < anclas.length - 1; i++) {
    const medio = (anclas[i] + anclas[i + 1]) / 2
    if (x < medio) return i
  }
  return Math.max(anclas.length - 1, 0)
}

function filaATexto(fila: ItemPosicion[]): string {
  return fila
    .map((it) => it.texto.trim())
    .filter(Boolean)
    .join(' ')
}

function esFilaDeEncabezado(fila: ItemPosicion[]): boolean {
  const texto = normalizar(filaATexto(fila))
  return texto.includes('codigo') && (texto.includes('precio') || texto.includes('descripcion'))
}

export interface TablaPDF {
  headers: string[]
  filas: string[][]
}

/**
 * Reconstruye una tabla (encabezados + filas) a partir del texto posicional de un PDF de lista de
 * precios. No asume un layout fijo: detecta las columnas agrupando las posiciones X donde arranca
 * cada celda, así sirve para listas de distintos proveedores mientras tengan estructura tabular.
 */
export async function extraerTablaPDF(buffer: Buffer): Promise<TablaPDF> {
  const doc = await getDocument({
    data: new Uint8Array(buffer),
    useSystemFonts: true,
    disableFontFace: true,
  }).promise

  try {
    const filasPorPagina: ItemPosicion[][][] = []
    for (let n = 1; n <= doc.numPages; n++) {
      const pagina = await doc.getPage(n)
      const items = await extraerItemsDePagina(pagina)
      filasPorPagina.push(agruparEnFilas(items).map(fusionarSignosPesos))
    }

    const filasPrimeraPagina = filasPorPagina[0]
    const indiceEncabezado = filasPrimeraPagina.findIndex(esFilaDeEncabezado)
    if (indiceEncabezado === -1) {
      throw new Error(
        'No se detectó una fila de encabezados con "código" y "precio"/"descripción" en el PDF.'
      )
    }

    // Las filas de datos de todas las páginas (encabezado descartado).
    const filasDeDatos = [...filasPrimeraPagina.slice(indiceEncabezado + 1), ...filasPorPagina.slice(1).flat()]

    // Las anclas de columna se calculan con las filas de TODAS las páginas, no
    // solo la primera: si el layout se corre un poco entre páginas, usar el
    // conjunto completo evita que una celda de una página tardía caiga en la
    // columna vecina por el drift de esa página sola.
    const anclas = calcularAnclas([filasPrimeraPagina[indiceEncabezado], ...filasDeDatos])
    if (anclas.length === 0) return { headers: [], filas: [] }

    function filaAColumnas(fila: ItemPosicion[]): string[] {
      const columnas = new Array(anclas.length).fill('')
      for (const it of fila) {
        const i = columnaDeX(it.x, anclas)
        columnas[i] = columnas[i] ? `${columnas[i]} ${it.texto.trim()}` : it.texto.trim()
      }
      return columnas
    }

    const headers = filaAColumnas(filasPrimeraPagina[indiceEncabezado])
    const filasSalida = filasDeDatos
      .map(filaAColumnas)
      .filter((columnas) => columnas.filter(Boolean).length >= 2)

    const columnasVacias = anclas.map((_, i) => filasSalida.every((fila) => !fila[i]))
    return {
      headers: headers.filter((_, i) => !columnasVacias[i]),
      filas: filasSalida.map((fila) => fila.filter((_, i) => !columnasVacias[i])),
    }
  } finally {
    const conDestroy = doc as unknown as { destroy?: () => Promise<void> }
    if (typeof conDestroy.destroy === 'function') await conDestroy.destroy()
  }
}
