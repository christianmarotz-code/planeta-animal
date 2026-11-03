import type { ConversacionConVinculo } from '@/lib/data/whatsapp'

function formatearTelefono(digitos: string): string {
  const m = digitos.match(/^54(9)(\d{2})(\d{4})(\d{4})$/)
  return m ? `+54 ${m[1]} ${m[2]} ${m[3]}-${m[4]}` : `+${digitos}`
}

export function nombreParaMostrar(c: ConversacionConVinculo): string {
  return c.proveedor?.nombre ?? c.cliente?.nombre ?? c.nombre_whatsapp ?? formatearTelefono(c.telefono)
}

export function etiquetaVinculo(c: ConversacionConVinculo): string {
  if (c.proveedor) return 'Proveedor'
  if (c.cliente) return 'Cliente'
  return 'Sin vincular'
}
