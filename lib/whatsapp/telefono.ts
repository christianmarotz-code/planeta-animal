export interface TelefonoNormalizado {
  /** Solo dígitos, con código de país: 5491112345678 */
  digitos: string
  /** Últimos 8 dígitos: sirve para vincular con teléfonos cargados a mano en cualquier formato. */
  clave: string
}

/** Normaliza el número de un JID de WhatsApp ("5491112345678:12@s.whatsapp.net"). */
export function normalizarTelefono(crudo: string): TelefonoNormalizado | null {
  const numero = crudo.split('@')[0].split(':')[0]
  const digitos = numero.replace(/\D/g, '')
  if (digitos.length < 8 || digitos.length > 15) return null
  return { digitos, clave: digitos.slice(-8) }
}

/**
 * Convierte un teléfono escrito a mano (como lo carga el equipo en proveedores) al formato que
 * usa WhatsApp para celulares argentinos: 549 + código de área + número. Devuelve null si no
 * se reconoce, para no mandar un pedido a un número equivocado.
 */
export function numeroParaEnviar(crudo: string): string | null {
  let d = crudo.replace(/\D/g, '')
  if (d.startsWith('00')) d = d.slice(2)
  if (d.startsWith('54')) {
    if (!d.startsWith('549')) d = '549' + d.slice(2)
    return d.length === 13 ? d : null
  }
  d = d.replace(/^0/, '')
  if (d.length === 12) {
    // Formato local con "15" después del código de área (de 2 a 4 dígitos).
    for (const largoArea of [2, 3, 4]) {
      if (d.slice(largoArea, largoArea + 2) === '15') {
        return '549' + d.slice(0, largoArea) + d.slice(largoArea + 2)
      }
    }
    return null
  }
  return d.length === 10 ? '549' + d : null
}
