export interface ItemPedido {
  nombre: string
  cantidad: number
}

/** Texto inicial del pedido a un proveedor. Después se edita a mano antes de enviarlo. */
export function armarMensajePedido(proveedor: string, items: ItemPedido[]): string {
  const lineas = items.map(
    (item) => `- ${item.cantidad.toLocaleString('es-AR', { maximumFractionDigits: 2 })} x ${item.nombre}`
  )
  return [`Hola ${proveedor}! Te paso el pedido de Planeta Animal:`, '', ...lineas, '', 'Gracias!'].join('\n')
}
