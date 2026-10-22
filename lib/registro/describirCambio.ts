import type { RegistroCambio } from '@/types/database'

const ETIQUETAS: Record<string, string> = {
  nombre: 'Nombre',
  razon_social: 'Razón social',
  cuit: 'CUIT',
  telefono: 'Teléfono',
  email: 'Email',
  direccion: 'Dirección',
  notas: 'Notas',
  alias: 'Alias',
  tipos_comprobante: 'Tipos de comprobante',
  condicion_pago_habitual: 'Condición de pago',
  formato_habitual: 'Formato habitual',
  aplica_iibb: 'Aplica IIBB',
  tasa_iibb: 'Tasa IIBB',
  aplica_perc_iva: 'Aplica percepción IVA',
  tasa_perc_iva: 'Tasa percepción IVA',
  descuento_pronto_pago: 'Descuento pronto pago',
  activo: 'Activo',
}

function dinero(valor: unknown): string {
  return typeof valor === 'number' ? `$${valor.toLocaleString('es-AR')}` : '—'
}

function valorLegible(valor: unknown): string {
  if (valor === null || valor === undefined || valor === '') return '—'
  if (typeof valor === 'boolean') return valor ? 'Sí' : 'No'
  if (Array.isArray(valor)) return valor.length === 0 ? '—' : valor.join(', ')
  return String(valor)
}

export function describirCambio(r: RegistroCambio): string {
  const d = r.detalle
  if (r.tabla === 'precios_proveedor') {
    const producto = typeof d.producto === 'string' && d.producto ? d.producto : 'un producto'
    if (r.operacion === 'insert') return `Cargó el precio de ${producto}: ${dinero(d.precio_nuevo)}`
    if (r.operacion === 'delete') return `Borró el precio de ${producto} (${dinero(d.precio_anterior)})`
    return `Cambió el precio de ${producto}: ${dinero(d.precio_anterior)} → ${dinero(d.precio_nuevo)}`
  }
  const nombre = typeof d.nombre === 'string' ? d.nombre : ''
  if (r.operacion === 'insert') return `Creó el proveedor ${nombre}`.trim()
  if (r.operacion === 'delete') return `Borró el proveedor ${nombre}`.trim()
  const cambios = Object.entries(d).map(([campo, valor]) => {
    const { antes, despues } = valor as { antes: unknown; despues: unknown }
    return `${ETIQUETAS[campo] ?? campo} (${valorLegible(antes)} → ${valorLegible(despues)})`
  })
  return `Editó: ${cambios.join(', ')}`
}
