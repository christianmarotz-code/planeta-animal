/** Convierte el texto de un precio ("1.200,50", "1200", "$ 1.350") en número; null si no es válido. */
export function parsearPrecio(texto: string): number | null {
  const limpio = texto.replace(/\$/g, '').replace(/\s/g, '')
  if (limpio === '') return null

  let normal: string
  if (limpio.includes(',')) {
    normal = limpio.replace(/\./g, '').replace(',', '.')
  } else if (/^\d{1,3}(\.\d{3})+$/.test(limpio)) {
    normal = limpio.replace(/\./g, '')
  } else {
    normal = limpio
  }

  if (!/^\d+(\.\d+)?$/.test(normal)) return null
  const numero = Number(normal)
  return numero > 0 ? Math.round(numero * 100) / 100 : null
}
