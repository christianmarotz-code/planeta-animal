import type {
  CategoriaGasto,
  FacturaCompra,
  Gasto,
  ItemFactura,
  ItemVenta,
  MedioPago,
  Producto,
  Proveedor,
  Servicio,
  Venta,
} from '@/types/database'
import type { FilaComparador } from '@/lib/data/preciosProveedor'

export interface DatosReporte {
  facturas: FacturaCompra[]
  itemsFactura: ItemFactura[]
  ventas: Venta[]
  itemsVenta: ItemVenta[]
  gastos: Gasto[]
  productos: Producto[]
  proveedores: Proveedor[]
  servicios: Servicio[]
}

export interface Ranking {
  nombre: string
  cantidad: number
  total: number
}

export interface ReporteMensual {
  mes: string
  compras: {
    total: number
    cantidad: number
    proveedores: { proveedor: string; total: number; porcentaje: number }[]
    productos: Ranking[]
  }
  ventas: {
    total: number
    cantidad: number
    ticketPromedio: number
    porMedioPago: { medioPago: MedioPago; total: number }[]
    productos: Ranking[]
    servicios: Ranking[]
  }
  gastos: {
    total: number
    cantidad: number
    porCategoria: { categoria: CategoriaGasto; total: number }[]
    mayores: Gasto[]
  }
  /** Ventas − compras − gastos del mes. */
  balance: number
  /** Compras + gastos: lo que salió del negocio en el mes. */
  egresos: number
}

export interface ResumenHistorico {
  mes: string
  compras: number
  gastos: number
  ventas: number
  egresos: number
  balance: number
}

const enMes = (fecha: string, mes: string) => fecha.slice(0, 7) === mes

function sumar(mapa: Map<string, { cantidad: number; total: number }>, clave: string, cantidad: number, total: number) {
  const actual = mapa.get(clave) ?? { cantidad: 0, total: 0 }
  actual.cantidad += cantidad
  actual.total += total
  mapa.set(clave, actual)
}

function aRanking(mapa: Map<string, { cantidad: number; total: number }>, limite: number): Ranking[] {
  return [...mapa.entries()]
    .map(([nombre, v]) => ({ nombre, ...v }))
    .sort((a, b) => b.cantidad - a.cantidad || b.total - a.total)
    .slice(0, limite)
}

export function armarReporteMensual(mes: string, d: DatosReporte, limite = 10): ReporteMensual {
  const nombreProveedor = new Map(d.proveedores.map((p) => [p.id, p.nombre]))
  const nombreProducto = new Map(d.productos.map((p) => [p.id, p.nombre]))
  const nombreServicio = new Map(d.servicios.map((s) => [s.id, s.nombre]))

  const facturas = d.facturas.filter((f) => f.estado !== 'anulada' && enMes(f.fecha, mes))
  const facturaIds = new Set(facturas.map((f) => f.id))
  const totalCompras = facturas.reduce((acc, f) => acc + f.total, 0)

  const porProveedor = new Map<string, number>()
  for (const f of facturas) porProveedor.set(f.proveedor_id, (porProveedor.get(f.proveedor_id) ?? 0) + f.total)

  const productosComprados = new Map<string, { cantidad: number; total: number }>()
  for (const it of d.itemsFactura) {
    if (!facturaIds.has(it.factura_id) || !it.producto_id) continue
    sumar(productosComprados, nombreProducto.get(it.producto_id) ?? 'Desconocido', it.cantidad, it.subtotal)
  }

  const ventas = d.ventas.filter((v) => v.estado !== 'anulada' && enMes(v.fecha, mes))
  const ventaIds = new Set(ventas.map((v) => v.id))
  const totalVentas = ventas.reduce((acc, v) => acc + v.total, 0)
  const medios = new Map<MedioPago, number>()
  for (const v of ventas) medios.set(v.medio_pago, (medios.get(v.medio_pago) ?? 0) + v.total)

  const productosVendidos = new Map<string, { cantidad: number; total: number }>()
  const serviciosVendidos = new Map<string, { cantidad: number; total: number }>()
  for (const it of d.itemsVenta) {
    if (!ventaIds.has(it.venta_id)) continue
    if (it.tipo === 'producto') {
      sumar(productosVendidos, nombreProducto.get(it.producto_id ?? '') ?? 'Desconocido', it.cantidad, it.subtotal)
    } else {
      sumar(serviciosVendidos, nombreServicio.get(it.servicio_id ?? '') ?? 'Desconocido', it.cantidad, it.subtotal)
    }
  }

  const gastos = d.gastos.filter((g) => enMes(g.fecha, mes))
  const totalGastos = gastos.reduce((acc, g) => acc + g.monto, 0)
  const porCategoria = new Map<CategoriaGasto, number>()
  for (const g of gastos) porCategoria.set(g.categoria, (porCategoria.get(g.categoria) ?? 0) + g.monto)

  return {
    mes,
    compras: {
      total: totalCompras,
      cantidad: facturas.length,
      proveedores: [...porProveedor.entries()]
        .map(([id, total]) => ({
          proveedor: nombreProveedor.get(id) ?? 'Desconocido',
          total,
          porcentaje: totalCompras ? (total / totalCompras) * 100 : 0,
        }))
        .sort((a, b) => b.total - a.total),
      productos: aRanking(productosComprados, limite),
    },
    ventas: {
      total: totalVentas,
      cantidad: ventas.length,
      ticketPromedio: ventas.length ? totalVentas / ventas.length : 0,
      porMedioPago: [...medios.entries()].map(([medioPago, total]) => ({ medioPago, total })).sort((a, b) => b.total - a.total),
      productos: aRanking(productosVendidos, limite),
      servicios: aRanking(serviciosVendidos, limite),
    },
    gastos: {
      total: totalGastos,
      cantidad: gastos.length,
      porCategoria: [...porCategoria.entries()].map(([categoria, total]) => ({ categoria, total })).sort((a, b) => b.total - a.total),
      mayores: [...gastos].sort((a, b) => b.monto - a.monto).slice(0, 5),
    },
    balance: totalVentas - totalCompras - totalGastos,
    egresos: totalCompras + totalGastos,
  }
}

/** Todos los meses con movimiento, del más reciente al más antiguo. */
export function armarHistorial(d: Pick<DatosReporte, 'facturas' | 'ventas' | 'gastos'>): ResumenHistorico[] {
  const meses = new Map<string, ResumenHistorico>()
  const mesDe = (fecha: string) => {
    const mes = fecha.slice(0, 7)
    const r = meses.get(mes) ?? { mes, compras: 0, gastos: 0, ventas: 0, egresos: 0, balance: 0 }
    meses.set(mes, r)
    return r
  }
  for (const f of d.facturas) if (f.estado !== 'anulada') mesDe(f.fecha).compras += f.total
  for (const v of d.ventas) if (v.estado !== 'anulada') mesDe(v.fecha).ventas += v.total
  for (const g of d.gastos) mesDe(g.fecha).gastos += g.monto
  return [...meses.values()]
    .map((r) => ({ ...r, egresos: r.compras + r.gastos, balance: r.ventas - r.compras - r.gastos }))
    .sort((a, b) => b.mes.localeCompare(a.mes))
}

/** Mes con más egresos (compras + gastos); null si no hay meses. */
export function mesQueMasSeGasto(historial: ResumenHistorico[]): ResumenHistorico | null {
  return historial.reduce<ResumenHistorico | null>((max, r) => (!max || r.egresos > max.egresos ? r : max), null)
}

/** "2026-08" → "2026-07". */
export function mesAnterior(mes: string): string {
  const [anio, numero] = mes.split('-').map(Number)
  const d = new Date(anio, numero - 2, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/** % de cambio contra el valor previo; null si no hay base para comparar. */
export function variacionPorcentual(actual: number, previo: number | undefined): number | null {
  return previo ? ((actual - previo) / previo) * 100 : null
}

/** Quién gana más comparaciones de precio (más barato) y quién cotiza más productos (cobertura). */
export function rankingProveedoresComparador(
  filas: FilaComparador[]
): { proveedor: string; ganados: number; cotizados: number }[] {
  const r = new Map<string, { ganados: number; cotizados: number }>()
  for (const fila of filas) {
    for (const p of fila.precios) {
      const x = r.get(p.proveedor.nombre) ?? { ganados: 0, cotizados: 0 }
      x.cotizados += 1
      if (fila.mejor?.proveedor.id === p.proveedor.id && fila.precios.length > 1) x.ganados += 1
      r.set(p.proveedor.nombre, x)
    }
  }
  return [...r.entries()].map(([proveedor, v]) => ({ proveedor, ...v })).sort((a, b) => b.ganados - a.ganados || b.cotizados - a.cotizados)
}
