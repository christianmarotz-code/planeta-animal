const EXTENSIONES_HEIC = /\.hei[cf]$/i

function esArchivoHeic(file: File): boolean {
  return file.type === 'image/heic' || file.type === 'image/heif' || EXTENSIONES_HEIC.test(file.name)
}

// Las fotos de iPhone se guardan en HEIC/HEIF, un formato que la mayoría de
// los navegadores (todos salvo Safari/WebKit) no saben decodificar con
// createImageBitmap. Lo convertimos a JPEG con heic-to (WASM, funciona en
// cualquier navegador) antes de intentar redimensionar. Se probó contra una
// foto real de iPhone: heic2any falla con "ERR_LIBHEIF format not supported"
// en ese archivo, heic-to lo decodifica bien.
async function convertirHeicAJpeg(file: File): Promise<File> {
  const { heicTo } = await import('heic-to')
  const blob = await heicTo({ blob: file, type: 'image/jpeg', quality: 0.85 })
  const nombreConExtension = file.name.replace(/\.\w+$/, '') + '.jpg'
  return new File([blob], nombreConExtension, { type: 'image/jpeg' })
}

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
  const archivo = esArchivoHeic(file) ? await convertirHeicAJpeg(file) : file
  const bitmap = await createImageBitmap(archivo)
  const { ancho, alto } = calcularDimensionesRedimensionadas(bitmap.width, bitmap.height, anchoMaximo)

  if (ancho === bitmap.width && alto === bitmap.height) {
    bitmap.close()
    return archivo
  }

  const canvas = document.createElement('canvas')
  canvas.width = ancho
  canvas.height = alto
  const contexto = canvas.getContext('2d')
  if (!contexto) {
    bitmap.close()
    return archivo
  }
  contexto.drawImage(bitmap, 0, 0, ancho, alto)
  bitmap.close()

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85))
  if (!blob) return archivo

  const nombreConExtension = archivo.name.replace(/\.\w+$/, '') + '.jpg'
  return new File([blob], nombreConExtension, { type: 'image/jpeg' })
}
