export function calcularDimensionesRedimensionadas(
  anchoOriginal: number,
  altoOriginal: number,
  anchoMaximo: number
): { ancho: number; alto: number } {
  if (anchoOriginal <= anchoMaximo) return { ancho: anchoOriginal, alto: altoOriginal }
  const escala = anchoMaximo / anchoOriginal
  return { ancho: anchoMaximo, alto: Math.round(altoOriginal * escala) }
}

// No se testea unitariamente: depende de Image/canvas del DOM real del
// browser (jsdom no implementa decodificación de imágenes). Se verifica
// a mano en el navegador (ver plan, Task 10).
export async function redimensionarImagen(file: File, anchoMaximo = 1600): Promise<File> {
  const bitmap = await createImageBitmap(file)
  const { ancho, alto } = calcularDimensionesRedimensionadas(bitmap.width, bitmap.height, anchoMaximo)

  if (ancho === bitmap.width && alto === bitmap.height) {
    bitmap.close()
    return file
  }

  const canvas = document.createElement('canvas')
  canvas.width = ancho
  canvas.height = alto
  const contexto = canvas.getContext('2d')
  if (!contexto) {
    bitmap.close()
    return file
  }
  contexto.drawImage(bitmap, 0, 0, ancho, alto)
  bitmap.close()

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85))
  if (!blob) return file

  const nombreConExtension = file.name.replace(/\.\w+$/, '') + '.jpg'
  return new File([blob], nombreConExtension, { type: 'image/jpeg' })
}
