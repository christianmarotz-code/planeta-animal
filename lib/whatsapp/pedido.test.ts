import { describe, it, expect } from 'vitest'
import { armarMensajePedido } from './pedido'

describe('armarMensajePedido', () => {
  it('arma un saludo, una línea por producto y el cierre', () => {
    expect(
      armarMensajePedido('Distribuidora Sur', [
        { nombre: 'Alimento A 15kg', cantidad: 12 },
        { nombre: 'Piedras sanitarias', cantidad: 2.5 },
      ])
    ).toBe(
      [
        'Hola Distribuidora Sur! Te paso el pedido de Planeta Animal:',
        '',
        '- 12 x Alimento A 15kg',
        '- 2,5 x Piedras sanitarias',
        '',
        'Gracias!',
      ].join('\n')
    )
  })
  it('formatea miles con punto', () => {
    expect(armarMensajePedido('X', [{ nombre: 'Y', cantidad: 1200 }])).toContain('- 1.200 x Y')
  })
})
