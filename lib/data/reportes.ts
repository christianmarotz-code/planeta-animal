import type {
  FacturaCompra,
  Proveedor,
  Producto,
  ItemFactura,
  Rama,
  TipoComprobante,
  Venta,
  ItemVenta,
  Servicio,
  Gasto,
  MedioPago,
} from '@/types/database'

export function calcularGastoPorProveedor(
  facturas: FacturaCompra[],
  proveedores: Proveedor[]
): { proveedor: string; total: number }[] {
  const totalesPorId = new Map<string, number>()
  for (const f of facturas) {
    if (f.estado === 'anulada') continue
    totalesPorId.set(f.proveedor_id, (totalesPorId.get(f.proveedor_id) ?? 0) + f.total)
  }
  return Array.from(totalesPorId.entries()).map(([proveedorId, total]) => ({
    proveedor: proveedores.find((p) => p.id === proveedorId)?.nombre ?? 'Desconocido',
    total,
  }))
}

export function calcularValorStock(productos: Producto[]): number {
  return productos.reduce((acc, p) => acc + p.stock_actual * p.costo_unitario_actual, 0)
}

export const RAMAS: Rama[] = ['clinica', 'petshop']

export function calcularCapitalEnRiesgoPorRama(
  productos: Producto[]
): Record<Rama, { valor: number; cantidad: number }> {
  const resultado: Record<Rama, { valor: number; cantidad: number }> = {
    clinica: { valor: 0, cantidad: 0 },
    petshop: { valor: 0, cantidad: 0 },
  }
  for (const p of productos) {
    if (p.rama === null || p.stock_actual > p.stock_minimo) continue
    resultado[p.rama].valor += p.stock_actual * p.costo_unitario_actual
    resultado[p.rama].cantidad += 1
  }
  return resultado
}

interface ItemConContexto {
  item: ItemFactura
  factura: FacturaCompra
  rama: Rama | null
}

function enriquecerItems(
  items: ItemFactura[],
  facturas: FacturaCompra[],
  productos: Producto[]
): ItemConContexto[] {
  const facturaPorId = new Map(facturas.map((f) => [f.id, f]))
  const productoPorId = new Map(productos.map((p) => [p.id, p]))
  const resultado: ItemConContexto[] = []
  for (const item of items) {
    const factura = facturaPorId.get(item.factura_id)
    if (!factura || factura.estado === 'anulada') continue
    resultado.push({ item, factura, rama: productoPorId.get(item.producto_id)?.rama ?? null })
  }
  return resultado
}

// Gasto por proveedor calculado a nivel de línea de factura (item.subtotal,
// neto de IVA) porque una factura puede mezclar productos de ambas ramas —
// a diferencia de calcularGastoPorProveedor, que usa factura.total (con IVA)
// porque ahí no hace falta discriminar por rama.
export function calcularGastoPorProveedorPorRama(
  items: ItemFactura[],
  facturas: FacturaCompra[],
  productos: Producto[],
  proveedores: Proveedor[],
  rama: Rama
): { proveedor: string; total: number }[] {
  const totalesPorProveedor = new Map<string, number>()
  for (const { item, factura, rama: ramaItem } of enriquecerItems(items, facturas, productos)) {
    if (ramaItem !== rama) continue
    totalesPorProveedor.set(
      factura.proveedor_id,
      (totalesPorProveedor.get(factura.proveedor_id) ?? 0) + item.subtotal
    )
  }
  return Array.from(totalesPorProveedor.entries())
    .map(([proveedorId, total]) => ({
      proveedor: proveedores.find((p) => p.id === proveedorId)?.nombre ?? 'Desconocido',
      total,
    }))
    .sort((a, b) => b.total - a.total)
}

export function calcularComprobantesPorRama(
  items: ItemFactura[],
  facturas: FacturaCompra[],
  productos: Producto[],
  rama: Rama
): { tipo: TipoComprobante; total: number; cantidad: number }[] {
  const porTipo = new Map<TipoComprobante, { total: number; cantidad: number }>()
  for (const { item, factura, rama: ramaItem } of enriquecerItems(items, facturas, productos)) {
    if (ramaItem !== rama) continue
    const actual = porTipo.get(factura.tipo_comprobante) ?? { total: 0, cantidad: 0 }
    actual.total += item.subtotal
    actual.cantidad += 1
    porTipo.set(factura.tipo_comprobante, actual)
  }
  return Array.from(porTipo.entries())
    .map(([tipo, valores]) => ({ tipo, ...valores }))
    .sort((a, b) => b.total - a.total)
}

export function inicioSemana(fecha: Date): string {
  const d = new Date(fecha)
  const dia = d.getDay()
  const diff = d.getDate() - dia + (dia === 0 ? -6 : 1)
  d.setDate(diff)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// facturas.fecha llega como 'YYYY-MM-DD'; parsearla con `new Date(string)` la
// interpreta como medianoche UTC, corriéndola un día hacia atrás en timezones
// negativos (ej. Argentina, UTC-3) y desplazando la factura al bucket semanal
// equivocado. Parsearla como fecha local evita ese corrimiento.
function parseFechaLocal(fecha: string): Date {
  const [anio, mes, dia] = fecha.split('-').map(Number)
  return new Date(anio, mes - 1, dia)
}

export function calcularGastoPorSemana(
  facturas: FacturaCompra[],
  semanas: number,
  hoy: Date = new Date()
): { semana: string; total: number }[] {
  const etiquetas: string[] = []
  const totales = new Map<string, number>()
  for (let i = semanas - 1; i >= 0; i--) {
    const d = new Date(hoy)
    d.setDate(d.getDate() - i * 7)
    const clave = inicioSemana(d)
    etiquetas.push(clave)
    totales.set(clave, 0)
  }
  for (const f of facturas) {
    if (f.estado === 'anulada') continue
    const clave = inicioSemana(parseFechaLocal(f.fecha))
    if (totales.has(clave)) {
      totales.set(clave, (totales.get(clave) ?? 0) + f.total)
    }
  }
  return etiquetas.map((clave) => ({ semana: clave, total: totales.get(clave) ?? 0 }))
}

function claveMes(fecha: Date): string {
  return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}`
}

export function calcularGastoPorMes(
  facturas: FacturaCompra[],
  meses: number,
  hoy: Date = new Date()
): { mes: string; total: number }[] {
  const etiquetas: string[] = []
  const totales = new Map<string, number>()
  for (let i = meses - 1; i >= 0; i--) {
    const d = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1)
    const clave = claveMes(d)
    etiquetas.push(clave)
    totales.set(clave, 0)
  }
  for (const f of facturas) {
    if (f.estado === 'anulada') continue
    const clave = claveMes(parseFechaLocal(f.fecha))
    if (totales.has(clave)) {
      totales.set(clave, (totales.get(clave) ?? 0) + f.total)
    }
  }
  return etiquetas.map((clave) => ({ mes: clave, total: totales.get(clave) ?? 0 }))
}

const DIAS_SEMANA = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']
const ORDEN_LUNES_A_DOMINGO = [1, 2, 3, 4, 5, 6, 0] // índices de Date.getDay() (0 = domingo)

export function calcularGastoPorDiaSemana(
  facturas: FacturaCompra[],
  meses: number,
  hoy: Date = new Date()
): { dia: string; total: number }[] {
  const desde = new Date(hoy.getFullYear(), hoy.getMonth() - (meses - 1), 1)
  const totalesPorIndiceJs = [0, 0, 0, 0, 0, 0, 0]
  for (const f of facturas) {
    if (f.estado === 'anulada') continue
    const fecha = parseFechaLocal(f.fecha)
    if (fecha < desde || fecha > hoy) continue
    totalesPorIndiceJs[fecha.getDay()] += f.total
  }
  return ORDEN_LUNES_A_DOMINGO.map((indiceJs, i) => ({
    dia: DIAS_SEMANA[i],
    total: totalesPorIndiceJs[indiceJs],
  }))
}

export function anosConFacturas(facturas: FacturaCompra[]): number[] {
  const anios = new Set(facturas.map((f) => parseFechaLocal(f.fecha).getFullYear()))
  return Array.from(anios).sort((a, b) => b - a)
}

type Trimestre = 'Q1' | 'Q2' | 'Q3' | 'Q4'
const TRIMESTRES: Trimestre[] = ['Q1', 'Q2', 'Q3', 'Q4']

function trimestreDeMes(mesIndiceCero: number): Trimestre {
  return TRIMESTRES[Math.floor(mesIndiceCero / 3)]
}

export function calcularGastoPorTrimestre(
  facturas: FacturaCompra[],
  anio: number
): { trimestre: Trimestre; total: number }[] {
  const totales = new Map<Trimestre, number>(TRIMESTRES.map((t) => [t, 0]))
  for (const f of facturas) {
    if (f.estado === 'anulada') continue
    const fecha = parseFechaLocal(f.fecha)
    if (fecha.getFullYear() !== anio) continue
    const trimestre = trimestreDeMes(fecha.getMonth())
    totales.set(trimestre, (totales.get(trimestre) ?? 0) + f.total)
  }
  return TRIMESTRES.map((trimestre) => ({ trimestre, total: totales.get(trimestre) ?? 0 }))
}

function semanaDelMes(diaDelMes: number): number {
  return Math.min(5, Math.ceil(diaDelMes / 7))
}

export function calcularSemanaGanadoraPorMes(
  facturas: FacturaCompra[],
  anio: number
): { mes: string; semana: number; total: number }[] {
  const semanasPorMes = new Map<string, number[]>()
  for (let mes = 0; mes < 12; mes++) {
    semanasPorMes.set(`${anio}-${String(mes + 1).padStart(2, '0')}`, [0, 0, 0, 0, 0])
  }
  const mesesConFacturas = new Set<string>()
  for (const f of facturas) {
    if (f.estado === 'anulada') continue
    const fecha = parseFechaLocal(f.fecha)
    if (fecha.getFullYear() !== anio) continue
    const clave = `${anio}-${String(fecha.getMonth() + 1).padStart(2, '0')}`
    const semanas = semanasPorMes.get(clave)
    if (!semanas) continue
    semanas[semanaDelMes(fecha.getDate()) - 1] += f.total
    mesesConFacturas.add(clave)
  }
  return Array.from(semanasPorMes.entries()).map(([mes, semanas]) => {
    if (!mesesConFacturas.has(mes)) return { mes, semana: 0, total: 0 }
    const total = Math.max(...semanas)
    return { mes, semana: semanas.indexOf(total) + 1, total }
  })
}

export function calcularProductosMasComprados(
  items: ItemFactura[],
  facturas: FacturaCompra[],
  productos: Producto[],
  anio: number
): { producto: string; cantidad: number }[] {
  const productoPorId = new Map(productos.map((p) => [p.id, p]))
  const cantidadPorProducto = new Map<string, number>()
  for (const { item, factura } of enriquecerItems(items, facturas, productos)) {
    if (parseFechaLocal(factura.fecha).getFullYear() !== anio) continue
    cantidadPorProducto.set(
      item.producto_id,
      (cantidadPorProducto.get(item.producto_id) ?? 0) + item.cantidad
    )
  }
  return Array.from(cantidadPorProducto.entries())
    .map(([productoId, cantidad]) => ({
      producto: productoPorId.get(productoId)?.nombre ?? 'Desconocido',
      cantidad,
    }))
    .sort((a, b) => b.cantidad - a.cantidad)
}

export function calcularIngresoPorSemana(
  ventas: Venta[],
  semanas: number,
  hoy: Date = new Date()
): { semana: string; total: number }[] {
  const etiquetas: string[] = []
  const totales = new Map<string, number>()
  for (let i = semanas - 1; i >= 0; i--) {
    const d = new Date(hoy)
    d.setDate(d.getDate() - i * 7)
    const clave = inicioSemana(d)
    etiquetas.push(clave)
    totales.set(clave, 0)
  }
  for (const v of ventas) {
    if (v.estado === 'anulada') continue
    const clave = inicioSemana(parseFechaLocal(v.fecha))
    if (totales.has(clave)) totales.set(clave, (totales.get(clave) ?? 0) + v.total)
  }
  return etiquetas.map((clave) => ({ semana: clave, total: totales.get(clave) ?? 0 }))
}

export function calcularIngresoPorMes(
  ventas: Venta[],
  meses: number,
  hoy: Date = new Date()
): { mes: string; total: number }[] {
  const etiquetas: string[] = []
  const totales = new Map<string, number>()
  for (let i = meses - 1; i >= 0; i--) {
    const d = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1)
    const clave = claveMes(d)
    etiquetas.push(clave)
    totales.set(clave, 0)
  }
  for (const v of ventas) {
    if (v.estado === 'anulada') continue
    const clave = claveMes(parseFechaLocal(v.fecha))
    if (totales.has(clave)) totales.set(clave, (totales.get(clave) ?? 0) + v.total)
  }
  return etiquetas.map((clave) => ({ mes: clave, total: totales.get(clave) ?? 0 }))
}

export function calcularVentasPorMedioPago(
  ventas: Venta[]
): { medioPago: MedioPago; total: number }[] {
  const totales = new Map<MedioPago, number>()
  for (const v of ventas) {
    if (v.estado === 'anulada') continue
    totales.set(v.medio_pago, (totales.get(v.medio_pago) ?? 0) + v.total)
  }
  return Array.from(totales.entries()).map(([medioPago, total]) => ({ medioPago, total }))
}

export function calcularRentabilidadPorRama(
  ventas: Venta[],
  itemsVenta: ItemVenta[],
  productos: Producto[],
  servicios: Servicio[],
  gastos: Gasto[]
): Record<Rama, { ingreso: number; costoMercaderia: number; gasto: number; neto: number }> {
  const resultado: Record<Rama, { ingreso: number; costoMercaderia: number; gasto: number; neto: number }> = {
    clinica: { ingreso: 0, costoMercaderia: 0, gasto: 0, neto: 0 },
    petshop: { ingreso: 0, costoMercaderia: 0, gasto: 0, neto: 0 },
  }
  const ventasValidasIds = new Set(
    ventas.filter((v) => v.estado !== 'anulada').map((v) => v.id)
  )
  const productoRama = new Map(productos.map((p) => [p.id, p.rama]))
  const servicioRama = new Map(servicios.map((s) => [s.id, s.rama]))

  for (const item of itemsVenta) {
    if (!ventasValidasIds.has(item.venta_id)) continue
    const rama =
      item.tipo === 'producto'
        ? productoRama.get(item.producto_id ?? '')
        : servicioRama.get(item.servicio_id ?? '')
    if (rama !== 'clinica' && rama !== 'petshop') continue
    resultado[rama].ingreso += item.subtotal
    if (item.tipo === 'producto') {
      resultado[rama].costoMercaderia += item.cantidad * (item.costo_unitario_snapshot ?? 0)
    }
  }

  for (const g of gastos) {
    if (g.rama !== 'clinica' && g.rama !== 'petshop') continue
    resultado[g.rama].gasto += g.monto
  }

  for (const rama of RAMAS) {
    resultado[rama].neto = resultado[rama].ingreso - resultado[rama].costoMercaderia - resultado[rama].gasto
  }

  return resultado
}

export function calcularFrecuenciaServicioPorSemana(
  ventas: Venta[],
  itemsVenta: ItemVenta[],
  servicioId: string,
  semanas: number,
  hoy: Date = new Date()
): { semana: string; vecesVendido: number; cantidadTotal: number }[] {
  const etiquetas: string[] = []
  const conteos = new Map<string, { vecesVendido: number; cantidadTotal: number }>()
  for (let i = semanas - 1; i >= 0; i--) {
    const d = new Date(hoy)
    d.setDate(d.getDate() - i * 7)
    const clave = inicioSemana(d)
    etiquetas.push(clave)
    conteos.set(clave, { vecesVendido: 0, cantidadTotal: 0 })
  }
  const ventaPorId = new Map(ventas.map((v) => [v.id, v]))
  for (const item of itemsVenta) {
    if (item.tipo !== 'servicio' || item.servicio_id !== servicioId) continue
    const venta = ventaPorId.get(item.venta_id)
    if (!venta || venta.estado === 'anulada') continue
    const clave = inicioSemana(parseFechaLocal(venta.fecha))
    const actual = conteos.get(clave)
    if (actual) {
      actual.vecesVendido += 1
      actual.cantidadTotal += item.cantidad
    }
  }
  return etiquetas.map((clave) => ({
    semana: clave,
    ...(conteos.get(clave) ?? { vecesVendido: 0, cantidadTotal: 0 }),
  }))
}

export function calcularFrecuenciaServicioPorMes(
  ventas: Venta[],
  itemsVenta: ItemVenta[],
  servicioId: string,
  meses: number,
  hoy: Date = new Date()
): { mes: string; vecesVendido: number; cantidadTotal: number }[] {
  const etiquetas: string[] = []
  const conteos = new Map<string, { vecesVendido: number; cantidadTotal: number }>()
  for (let i = meses - 1; i >= 0; i--) {
    const d = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1)
    const clave = claveMes(d)
    etiquetas.push(clave)
    conteos.set(clave, { vecesVendido: 0, cantidadTotal: 0 })
  }
  const ventaPorId = new Map(ventas.map((v) => [v.id, v]))
  for (const item of itemsVenta) {
    if (item.tipo !== 'servicio' || item.servicio_id !== servicioId) continue
    const venta = ventaPorId.get(item.venta_id)
    if (!venta || venta.estado === 'anulada') continue
    const clave = claveMes(parseFechaLocal(venta.fecha))
    const actual = conteos.get(clave)
    if (actual) {
      actual.vecesVendido += 1
      actual.cantidadTotal += item.cantidad
    }
  }
  return etiquetas.map((clave) => ({
    mes: clave,
    ...(conteos.get(clave) ?? { vecesVendido: 0, cantidadTotal: 0 }),
  }))
}
