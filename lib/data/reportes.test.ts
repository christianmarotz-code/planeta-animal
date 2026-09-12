import { describe, it, expect } from 'vitest'
import {
  calcularGastoPorProveedor,
  calcularValorStock,
  calcularGastoPorSemana,
  inicioSemana,
  calcularGastoPorMes,
  calcularGastoPorDiaSemana,
  calcularCapitalEnRiesgoPorRama,
  calcularGastoPorProveedorPorRama,
  calcularComprobantesPorRama,
  anosConFacturas,
  calcularGastoPorTrimestre,
  calcularSemanaGanadoraPorMes,
  calcularProductosMasComprados,
} from './reportes'
import type { FacturaCompra, Proveedor, Producto, ItemFactura, Rama } from '@/types/database'

function proveedor(id: string, nombre: string): Proveedor {
  return {
    id,
    nombre,
    cuit: null,
    telefono: null,
    email: null,
    direccion: null,
    notas: null,
    aplica_iibb: false,
    tasa_iibb: 4,
    aplica_perc_iva: false,
    tasa_perc_iva: 3,
    descuento_pronto_pago: 0,
    created_at: '',
  }
}

function factura(
  proveedorId: string,
  total: number,
  estado: 'cargada' | 'anulada' = 'cargada',
  fecha = '2026-09-01'
): FacturaCompra {
  return {
    id: crypto.randomUUID(),
    proveedor_id: proveedorId,
    numero_comprobante: '0001',
    tipo_comprobante: 'Factura A',
    fecha,
    subtotal: total,
    iva_total: 0,
    total,
    estado,
    archivo_adjunto: null,
    notas: null,
    created_at: '',
    created_by: null,
  }
}

describe('calcularGastoPorProveedor', () => {
  it('sums invoice totals grouped by supplier, excluding annulled invoices', () => {
    const proveedores = [proveedor('p1', 'Proveedor Uno'), proveedor('p2', 'Proveedor Dos')]
    const facturas = [
      factura('p1', 1000),
      factura('p1', 500),
      factura('p2', 2000),
      factura('p1', 9999, 'anulada'),
    ]
    const result = calcularGastoPorProveedor(facturas, proveedores)
    expect(result).toEqual(
      expect.arrayContaining([
        { proveedor: 'Proveedor Uno', total: 1500 },
        { proveedor: 'Proveedor Dos', total: 2000 },
      ])
    )
  })
})

function producto(
  stock: number,
  costo: number,
  opciones?: { rama?: Rama | null; stockMinimo?: number; id?: string }
): Producto {
  return {
    id: opciones?.id ?? crypto.randomUUID(),
    nombre: 'x',
    categoria: null,
    rama: opciones?.rama ?? null,
    unidad_compra: 'u',
    unidad_stock: 'u',
    factor_conversion: 1,
    stock_actual: stock,
    stock_minimo: opciones?.stockMinimo ?? 0,
    costo_unitario_actual: costo,
    precio_venta: 0,
    alicuota_iva: 21,
    activo: true,
    codigo: null,
    codigo_barras: null,
    created_at: '',
  }
}

function itemFactura(
  facturaId: string,
  productoId: string,
  subtotal: number,
  opciones?: { id?: string; cantidad?: number }
): ItemFactura {
  return {
    id: opciones?.id ?? crypto.randomUUID(),
    factura_id: facturaId,
    producto_id: productoId,
    cantidad: opciones?.cantidad ?? 1,
    costo_unitario: subtotal,
    alicuota_iva: 21,
    subtotal,
  }
}

describe('calcularValorStock', () => {

  it('sums stock quantity times current unit cost across products', () => {
    const productos = [producto(10, 100), producto(5, 50)]
    expect(calcularValorStock(productos)).toBe(1000 + 250)
  })

  it('returns 0 for no products', () => {
    expect(calcularValorStock([])).toBe(0)
  })
})

describe('inicioSemana', () => {
  it('returns the Monday of the week for a mid-week date', () => {
    expect(inicioSemana(new Date('2026-09-09T12:00:00'))).toBe('2026-09-07')
  })

  it('returns the previous Monday for a Sunday', () => {
    expect(inicioSemana(new Date('2026-09-06T12:00:00'))).toBe('2026-08-31')
  })

  it('returns the same date for a Monday', () => {
    expect(inicioSemana(new Date('2026-09-07T12:00:00'))).toBe('2026-09-07')
  })
})

describe('calcularGastoPorSemana', () => {
  it('sums non-annulled invoice totals into weekly buckets anchored to a reference date', () => {
    const hoy = new Date('2026-09-09T12:00:00') // Wednesday, week of 2026-09-07
    const facturas = [
      factura('p1', 1000, 'cargada', '2026-09-08'), // same week
      factura('p1', 500, 'cargada', '2026-09-01'), // previous week
      factura('p1', 9999, 'anulada', '2026-09-08'), // excluded
    ]
    const result = calcularGastoPorSemana(facturas, 2, hoy)
    expect(result).toEqual([
      { semana: '2026-08-31', total: 500 },
      { semana: '2026-09-07', total: 1000 },
    ])
  })

  it('returns zero-total weeks when there are no invoices', () => {
    const hoy = new Date('2026-09-09T12:00:00')
    const result = calcularGastoPorSemana([], 3, hoy)
    expect(result).toEqual([
      { semana: '2026-08-24', total: 0 },
      { semana: '2026-08-31', total: 0 },
      { semana: '2026-09-07', total: 0 },
    ])
  })

  it('ignores invoices outside the requested week range', () => {
    const hoy = new Date('2026-09-09T12:00:00')
    const facturas = [factura('p1', 1000, 'cargada', '2026-01-01')]
    const result = calcularGastoPorSemana(facturas, 1, hoy)
    expect(result).toEqual([{ semana: '2026-09-07', total: 0 }])
  })
})

describe('calcularGastoPorMes', () => {
  it('sums non-annulled invoice totals into monthly buckets anchored to a reference date', () => {
    const hoy = new Date('2026-09-09T12:00:00') // Septiembre
    const facturas = [
      factura('p1', 1000, 'cargada', '2026-09-05'), // este mes
      factura('p1', 500, 'cargada', '2026-08-15'), // mes anterior
      factura('p1', 9999, 'anulada', '2026-09-05'), // excluida
    ]
    const result = calcularGastoPorMes(facturas, 2, hoy)
    expect(result).toEqual([
      { mes: '2026-08', total: 500 },
      { mes: '2026-09', total: 1000 },
    ])
  })

  it('returns zero-total months when there are no invoices', () => {
    const hoy = new Date('2026-09-09T12:00:00')
    const result = calcularGastoPorMes([], 3, hoy)
    expect(result).toEqual([
      { mes: '2026-07', total: 0 },
      { mes: '2026-08', total: 0 },
      { mes: '2026-09', total: 0 },
    ])
  })

  it('ignores invoices outside the requested month range', () => {
    const hoy = new Date('2026-09-09T12:00:00')
    const facturas = [factura('p1', 1000, 'cargada', '2025-01-01')]
    const result = calcularGastoPorMes(facturas, 1, hoy)
    expect(result).toEqual([{ mes: '2026-09', total: 0 }])
  })

  it('rolls back into the previous year when the reference date is in January', () => {
    const hoy = new Date('2026-01-15T12:00:00')
    const facturas = [factura('p1', 700, 'cargada', '2025-12-20')]
    const result = calcularGastoPorMes(facturas, 2, hoy)
    expect(result).toEqual([
      { mes: '2025-12', total: 700 },
      { mes: '2026-01', total: 0 },
    ])
  })
})

describe('calcularGastoPorDiaSemana', () => {
  it('sums non-annulled invoice totals by day of week within the last N months', () => {
    const hoy = new Date('2026-09-09T12:00:00') // Miércoles
    const facturas = [
      factura('p1', 1000, 'cargada', '2026-09-07'), // Lunes
      factura('p1', 300, 'cargada', '2026-09-08'), // Martes
      factura('p1', 200, 'cargada', '2026-09-08'), // Martes también
      factura('p1', 9999, 'anulada', '2026-09-07'), // excluida
    ]
    const result = calcularGastoPorDiaSemana(facturas, 1, hoy)
    expect(result).toEqual([
      { dia: 'Lunes', total: 1000 },
      { dia: 'Martes', total: 500 },
      { dia: 'Miércoles', total: 0 },
      { dia: 'Jueves', total: 0 },
      { dia: 'Viernes', total: 0 },
      { dia: 'Sábado', total: 0 },
      { dia: 'Domingo', total: 0 },
    ])
  })

  it('returns all 7 days at zero when there are no invoices', () => {
    const hoy = new Date('2026-09-09T12:00:00')
    const result = calcularGastoPorDiaSemana([], 1, hoy)
    expect(result).toEqual([
      { dia: 'Lunes', total: 0 },
      { dia: 'Martes', total: 0 },
      { dia: 'Miércoles', total: 0 },
      { dia: 'Jueves', total: 0 },
      { dia: 'Viernes', total: 0 },
      { dia: 'Sábado', total: 0 },
      { dia: 'Domingo', total: 0 },
    ])
  })

  it('ignores invoices older than the requested month window', () => {
    const hoy = new Date('2026-09-09T12:00:00')
    const facturas = [factura('p1', 1000, 'cargada', '2026-01-05')] // Lunes, pero fuera de la ventana de 1 mes
    const result = calcularGastoPorDiaSemana(facturas, 1, hoy)
    expect(result).toEqual([
      { dia: 'Lunes', total: 0 },
      { dia: 'Martes', total: 0 },
      { dia: 'Miércoles', total: 0 },
      { dia: 'Jueves', total: 0 },
      { dia: 'Viernes', total: 0 },
      { dia: 'Sábado', total: 0 },
      { dia: 'Domingo', total: 0 },
    ])
  })

  it('counts invoices in the Sunday bucket correctly', () => {
    const hoy = new Date('2026-09-09T12:00:00')
    const facturas = [factura('p1', 800, 'cargada', '2026-09-06')] // Domingo
    const result = calcularGastoPorDiaSemana(facturas, 1, hoy)
    expect(result).toEqual([
      { dia: 'Lunes', total: 0 },
      { dia: 'Martes', total: 0 },
      { dia: 'Miércoles', total: 0 },
      { dia: 'Jueves', total: 0 },
      { dia: 'Viernes', total: 0 },
      { dia: 'Sábado', total: 0 },
      { dia: 'Domingo', total: 800 },
    ])
  })

  it('includes invoices exactly on the window start and end boundaries', () => {
    const hoy = new Date('2026-09-09T12:00:00')
    const facturas = [
      factura('p1', 100, 'cargada', '2026-09-01'), // desde, inclusive (1er día del mes actual con meses=1)
      factura('p1', 200, 'cargada', '2026-09-09'), // hoy, inclusive
    ]
    const result = calcularGastoPorDiaSemana(facturas, 1, hoy)
    const total = result.reduce((acc, d) => acc + d.total, 0)
    expect(total).toBe(300)
  })
})

describe('calcularCapitalEnRiesgoPorRama', () => {
  it('sums stock value only for products below or at their minimum, grouped by rama', () => {
    const productos = [
      producto(2, 100, { rama: 'clinica', stockMinimo: 5 }), // bajo mínimo
      producto(10, 50, { rama: 'clinica', stockMinimo: 5 }), // por encima, no cuenta
      producto(1, 200, { rama: 'petshop', stockMinimo: 3 }), // bajo mínimo
    ]
    const result = calcularCapitalEnRiesgoPorRama(productos)
    expect(result.clinica).toEqual({ valor: 200, cantidad: 1 })
    expect(result.petshop).toEqual({ valor: 200, cantidad: 1 })
  })

  it('ignores products without a rama assigned', () => {
    const productos = [producto(1, 100, { rama: null, stockMinimo: 5 })]
    const result = calcularCapitalEnRiesgoPorRama(productos)
    expect(result.clinica).toEqual({ valor: 0, cantidad: 0 })
    expect(result.petshop).toEqual({ valor: 0, cantidad: 0 })
  })
})

describe('calcularGastoPorProveedorPorRama', () => {
  it('sums item subtotals by proveedor, scoped to a single rama and excluding annulled invoices', () => {
    const proveedores = [proveedor('p1', 'Proveedor Uno'), proveedor('p2', 'Proveedor Dos')]
    const productos = [
      producto(0, 0, { rama: 'clinica', id: 'prod-clinica' }),
      producto(0, 0, { rama: 'petshop', id: 'prod-petshop' }),
    ]
    const facturaClinica = factura('p1', 1000)
    const facturaPetshop = factura('p2', 500)
    const facturaAnulada = factura('p1', 9999, 'anulada')
    const facturas = [facturaClinica, facturaPetshop, facturaAnulada]
    const items = [
      itemFactura(facturaClinica.id, 'prod-clinica', 300),
      itemFactura(facturaPetshop.id, 'prod-petshop', 500),
      itemFactura(facturaAnulada.id, 'prod-clinica', 9999),
    ]
    const result = calcularGastoPorProveedorPorRama(items, facturas, productos, proveedores, 'clinica')
    expect(result).toEqual([{ proveedor: 'Proveedor Uno', total: 300 }])
  })
})

describe('calcularComprobantesPorRama', () => {
  it('groups item subtotals and counts by tipo_comprobante, scoped to a rama', () => {
    const productos = [producto(0, 0, { rama: 'petshop', id: 'prod-1' })]
    const facturaA = { ...factura('p1', 100), tipo_comprobante: 'Factura A' as const }
    const facturaB = { ...factura('p1', 200), tipo_comprobante: 'Factura B' as const }
    const facturas = [facturaA, facturaB]
    const items = [
      itemFactura(facturaA.id, 'prod-1', 60),
      itemFactura(facturaA.id, 'prod-1', 40),
      itemFactura(facturaB.id, 'prod-1', 200),
    ]
    const result = calcularComprobantesPorRama(items, facturas, productos, 'petshop')
    expect(result).toEqual([
      { tipo: 'Factura B', total: 200, cantidad: 1 },
      { tipo: 'Factura A', total: 100, cantidad: 2 },
    ])
  })
})

describe('anosConFacturas', () => {
  it('returns distinct years present in the invoices, descending', () => {
    const facturas = [
      factura('p1', 100, 'cargada', '2025-03-01'),
      factura('p1', 200, 'cargada', '2026-01-15'),
      factura('p1', 300, 'cargada', '2025-11-20'),
    ]
    expect(anosConFacturas(facturas)).toEqual([2026, 2025])
  })

  it('returns an empty array when there are no invoices', () => {
    expect(anosConFacturas([])).toEqual([])
  })
})

describe('calcularGastoPorTrimestre', () => {
  it('sums non-annulled invoice totals into the 4 calendar quarters of the given year', () => {
    const facturas = [
      factura('p1', 100, 'cargada', '2026-01-10'), // Q1
      factura('p1', 200, 'cargada', '2026-03-31'), // Q1 (límite)
      factura('p1', 300, 'cargada', '2026-04-01'), // Q2 (límite)
      factura('p1', 400, 'cargada', '2026-07-15'), // Q3
      factura('p1', 500, 'cargada', '2026-12-25'), // Q4
      factura('p1', 9999, 'anulada', '2026-01-10'), // excluida
    ]
    expect(calcularGastoPorTrimestre(facturas, 2026)).toEqual([
      { trimestre: 'Q1', total: 300 },
      { trimestre: 'Q2', total: 300 },
      { trimestre: 'Q3', total: 400 },
      { trimestre: 'Q4', total: 500 },
    ])
  })

  it('excludes invoices from other years', () => {
    const facturas = [factura('p1', 1000, 'cargada', '2025-02-01')]
    expect(calcularGastoPorTrimestre(facturas, 2026)).toEqual([
      { trimestre: 'Q1', total: 0 },
      { trimestre: 'Q2', total: 0 },
      { trimestre: 'Q3', total: 0 },
      { trimestre: 'Q4', total: 0 },
    ])
  })

  it('returns all quarters at zero when there are no invoices', () => {
    expect(calcularGastoPorTrimestre([], 2026)).toEqual([
      { trimestre: 'Q1', total: 0 },
      { trimestre: 'Q2', total: 0 },
      { trimestre: 'Q3', total: 0 },
      { trimestre: 'Q4', total: 0 },
    ])
  })
})

describe('calcularSemanaGanadoraPorMes', () => {
  it('picks the week with the highest spend within a month that has data in several weeks', () => {
    const facturas = [
      factura('p1', 100, 'cargada', '2026-03-02'), // semana 1
      factura('p1', 900, 'cargada', '2026-03-10'), // semana 2 (gana)
      factura('p1', 300, 'cargada', '2026-03-11'), // semana 2 (suma con la anterior)
      factura('p1', 500, 'cargada', '2026-03-20'), // semana 3
    ]
    const resultado = calcularSemanaGanadoraPorMes(facturas, 2026)
    const marzo = resultado.find((r) => r.mes === '2026-03')
    expect(marzo).toEqual({ mes: '2026-03', semana: 2, total: 1200 })
  })

  it('returns semana 0 for a month with no invoices', () => {
    const resultado = calcularSemanaGanadoraPorMes([], 2026)
    expect(resultado).toHaveLength(12)
    expect(resultado.every((r) => r.semana === 0 && r.total === 0)).toBe(true)
    expect(resultado.map((r) => r.mes)).toEqual([
      '2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06',
      '2026-07', '2026-08', '2026-09', '2026-10', '2026-11', '2026-12',
    ])
  })

  it('places days 29-31 in week 5', () => {
    const facturas = [factura('p1', 700, 'cargada', '2026-08-30')]
    const resultado = calcularSemanaGanadoraPorMes(facturas, 2026)
    const agosto = resultado.find((r) => r.mes === '2026-08')
    expect(agosto).toEqual({ mes: '2026-08', semana: 5, total: 700 })
  })

  it('excludes annulled invoices and invoices from other years', () => {
    const facturas = [
      factura('p1', 9999, 'anulada', '2026-05-05'),
      factura('p1', 300, 'cargada', '2025-05-05'),
    ]
    const resultado = calcularSemanaGanadoraPorMes(facturas, 2026)
    const mayo = resultado.find((r) => r.mes === '2026-05')
    expect(mayo).toEqual({ mes: '2026-05', semana: 0, total: 0 })
  })
})

describe('calcularProductosMasComprados', () => {
  it('sums item quantities per product for the given year, sorted descending', () => {
    const productoA = producto(0, 0, { id: 'prod-a' })
    const productoB = producto(0, 0, { id: 'prod-b' })
    const productos = [
      { ...productoA, nombre: 'Producto A' },
      { ...productoB, nombre: 'Producto B' },
    ]
    const facturaA = factura('p1', 100, 'cargada', '2026-02-01')
    const items = [
      itemFactura(facturaA.id, 'prod-a', 50, { cantidad: 3 }),
      itemFactura(facturaA.id, 'prod-a', 50, { cantidad: 2 }),
      itemFactura(facturaA.id, 'prod-b', 100, { cantidad: 1 }),
    ]
    const resultado = calcularProductosMasComprados(items, [facturaA], productos, 2026)
    expect(resultado).toEqual([
      { producto: 'Producto A', cantidad: 5 },
      { producto: 'Producto B', cantidad: 1 },
    ])
  })

  it('excludes annulled invoices and invoices from other years', () => {
    const productos = [producto(0, 0, { id: 'prod-a' })]
    const facturaAnulada = factura('p1', 100, 'anulada', '2026-02-01')
    const facturaOtroAnio = factura('p1', 100, 'cargada', '2025-02-01')
    const items = [
      itemFactura(facturaAnulada.id, 'prod-a', 50, { cantidad: 10 }),
      itemFactura(facturaOtroAnio.id, 'prod-a', 50, { cantidad: 10 }),
    ]
    const resultado = calcularProductosMasComprados(
      items,
      [facturaAnulada, facturaOtroAnio],
      productos,
      2026
    )
    expect(resultado).toEqual([])
  })

  it('omits products with no purchases that year instead of listing them at 0', () => {
    const productos = [producto(0, 0, { id: 'prod-a' }), producto(0, 0, { id: 'prod-sin-compras' })]
    const facturaA = factura('p1', 100, 'cargada', '2026-02-01')
    const items = [itemFactura(facturaA.id, 'prod-a', 100, { cantidad: 4 })]
    const resultado = calcularProductosMasComprados(items, [facturaA], productos, 2026)
    expect(resultado).toEqual([{ producto: 'x', cantidad: 4 }])
  })
})
