import { describe, it, expect } from 'vitest'
import type { FacturaCompra, Gasto, ItemFactura, ItemVenta, Producto, Proveedor, Servicio, Venta } from '@/types/database'
import type { FilaComparador } from '@/lib/data/preciosProveedor'
import {
  armarHistorial,
  armarReporteMensual,
  mesAnterior,
  mesQueMasSeGasto,
  rankingProveedoresComparador,
  variacionPorcentual,
  type DatosReporte,
} from './mensual'

const datos: DatosReporte = {
  proveedores: [{ id: 'p1', nombre: 'Rama' }, { id: 'p2', nombre: 'Coflex' }] as Proveedor[],
  productos: [{ id: 'a', nombre: 'Alimento' }, { id: 'b', nombre: 'Collar' }] as Producto[],
  servicios: [{ id: 's1', nombre: 'Lavado' }] as Servicio[],
  facturas: [
    { id: 'f1', proveedor_id: 'p1', fecha: '2026-08-05', total: 300, estado: 'cargada' },
    { id: 'f2', proveedor_id: 'p2', fecha: '2026-08-10', total: 100, estado: 'cargada' },
    { id: 'f3', proveedor_id: 'p1', fecha: '2026-08-11', total: 999, estado: 'anulada' },
    { id: 'f4', proveedor_id: 'p1', fecha: '2026-07-02', total: 200, estado: 'cargada' },
  ] as FacturaCompra[],
  itemsFactura: [
    { factura_id: 'f1', producto_id: 'a', cantidad: 10, subtotal: 250 },
    { factura_id: 'f2', producto_id: 'b', cantidad: 3, subtotal: 90 },
    { factura_id: 'f3', producto_id: 'b', cantidad: 50, subtotal: 900 },
  ] as ItemFactura[],
  ventas: [
    { id: 'v1', fecha: '2026-08-07', total: 500, medio_pago: 'efectivo', estado: 'confirmada' },
    { id: 'v2', fecha: '2026-08-08', total: 100, medio_pago: 'tarjeta', estado: 'confirmada' },
    { id: 'v3', fecha: '2026-08-09', total: 700, medio_pago: 'tarjeta', estado: 'anulada' },
  ] as Venta[],
  itemsVenta: [
    { venta_id: 'v1', tipo: 'producto', producto_id: 'a', cantidad: 4, subtotal: 400 },
    { venta_id: 'v2', tipo: 'servicio', servicio_id: 's1', cantidad: 1, subtotal: 100 },
    { venta_id: 'v3', tipo: 'producto', producto_id: 'a', cantidad: 99, subtotal: 700 },
  ] as unknown as ItemVenta[],
  gastos: [
    { id: 'g1', fecha: '2026-08-03', categoria: 'combustible', monto: 80, concepto: 'Nafta' },
    { id: 'g2', fecha: '2026-08-04', categoria: 'otro', monto: 20, concepto: 'Varios' },
    { id: 'g3', fecha: '2026-07-04', categoria: 'otro', monto: 50, concepto: 'Varios' },
  ] as Gasto[],
}

describe('reporte mensual', () => {
  const r = armarReporteMensual('2026-08', datos)

  it('compras ignora anuladas y rankea proveedores y productos', () => {
    expect(r.compras.total).toBe(400)
    expect(r.compras.cantidad).toBe(2)
    expect(r.compras.proveedores[0]).toMatchObject({ proveedor: 'Rama', total: 300, porcentaje: 75 })
    expect(r.compras.productos.map((p) => p.nombre)).toEqual(['Alimento', 'Collar'])
  })

  it('ventas ignora anuladas y separa productos de servicios', () => {
    expect(r.ventas).toMatchObject({ total: 600, cantidad: 2, ticketPromedio: 300 })
    expect(r.ventas.productos).toEqual([{ nombre: 'Alimento', cantidad: 4, total: 400 }])
    expect(r.ventas.servicios[0].nombre).toBe('Lavado')
    expect(r.ventas.porMedioPago[0]).toEqual({ medioPago: 'efectivo', total: 500 })
  })

  it('gastos y balance', () => {
    expect(r.gastos.total).toBe(100)
    expect(r.gastos.porCategoria[0]).toEqual({ categoria: 'combustible', total: 80 })
    expect(r.gastos.mayores[0].concepto).toBe('Nafta')
    expect(r.egresos).toBe(500)
    expect(r.balance).toBe(100)
  })

  it('historial y mes que más se gastó', () => {
    const h = armarHistorial(datos)
    expect(h.map((x) => x.mes)).toEqual(['2026-08', '2026-07'])
    expect(mesQueMasSeGasto(h)?.mes).toBe('2026-08')
    expect(mesQueMasSeGasto([])).toBeNull()
  })

  it('variación y mes anterior', () => {
    expect(mesAnterior('2026-01')).toBe('2025-12')
    expect(variacionPorcentual(150, 100)).toBe(50)
    expect(variacionPorcentual(10, undefined)).toBeNull()
    expect(variacionPorcentual(10, 0)).toBeNull()
  })
})

describe('ranking del comparador', () => {
  const prov = (id: string, nombre: string) => ({ id, nombre }) as Proveedor
  const a = prov('1', 'A')
  const b = prov('2', 'B')
  const fila = (precios: [Proveedor, number][], mejor: Proveedor): FilaComparador =>
    ({
      precios: precios.map(([proveedor, precio]) => ({ proveedor, precio })),
      mejor: { proveedor: mejor, precio: 0 },
    }) as unknown as FilaComparador

  it('cuenta ganados solo cuando hay con quién comparar', () => {
    const r = rankingProveedoresComparador([
      fila([[a, 1], [b, 2]], a),
      fila([[a, 1], [b, 2]], a),
      fila([[b, 5]], b),
    ])
    expect(r[0]).toEqual({ proveedor: 'A', ganados: 2, cotizados: 2 })
    expect(r[1]).toEqual({ proveedor: 'B', ganados: 0, cotizados: 3 })
  })
})
