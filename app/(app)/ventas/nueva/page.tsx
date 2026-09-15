'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { listarProductos } from '@/lib/data/productos'
import { listarServicios } from '@/lib/data/servicios'
import { listarClientes, crearCliente } from '@/lib/data/clientes'
import { registrarVenta, type NuevaVentaItemInput } from '@/lib/data/ventas'
import { calcularTotalesVenta } from '@/lib/calc/venta'
import type { Producto, Servicio, Cliente, MedioPago, TipoItemVenta } from '@/types/database'

const MEDIOS_PAGO: { value: MedioPago; label: string }[] = [
  { value: 'efectivo', label: 'Efectivo' },
  { value: 'tarjeta', label: 'Tarjeta' },
  { value: 'transferencia', label: 'Transferencia / Mercado Pago' },
]

interface ItemCarrito {
  key: string
  tipo: TipoItemVenta
  productoId?: string
  servicioId?: string
  nombre: string
  cantidad: number
  precioUnitario: number
}

export default function NuevaVentaPage() {
  const router = useRouter()
  const [productos, setProductos] = useState<Producto[]>([])
  const [servicios, setServicios] = useState<Servicio[]>([])
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [busqueda, setBusqueda] = useState('')
  const [items, setItems] = useState<ItemCarrito[]>([])
  const [clienteId, setClienteId] = useState('')
  const [nuevoClienteNombre, setNuevoClienteNombre] = useState('')
  const [medioPago, setMedioPago] = useState<MedioPago>('efectivo')
  const [notas, setNotas] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    listarProductos().then(setProductos)
    listarServicios().then(setServicios)
    listarClientes().then(setClientes)
  }, [])

  const resultadosProducto = busqueda
    ? productos.filter((p) => p.nombre.toLowerCase().includes(busqueda.toLowerCase()))
    : []
  const resultadosServicio = busqueda
    ? servicios.filter((s) => s.nombre.toLowerCase().includes(busqueda.toLowerCase()))
    : []

  function agregarProducto(p: Producto) {
    setItems((prev) => [
      ...prev,
      {
        key: `producto-${p.id}-${prev.length}`,
        tipo: 'producto',
        productoId: p.id,
        nombre: p.nombre,
        cantidad: 1,
        precioUnitario: p.precio_venta,
      },
    ])
    setBusqueda('')
  }

  function agregarServicio(s: Servicio) {
    setItems((prev) => [
      ...prev,
      {
        key: `servicio-${s.id}-${prev.length}`,
        tipo: 'servicio',
        servicioId: s.id,
        nombre: s.nombre,
        cantidad: 1,
        precioUnitario: s.precio,
      },
    ])
    setBusqueda('')
  }

  function actualizarItem(key: string, cambios: Partial<ItemCarrito>) {
    setItems((prev) => prev.map((i) => (i.key === key ? { ...i, ...cambios } : i)))
  }

  function quitarItem(key: string) {
    setItems((prev) => prev.filter((i) => i.key !== key))
  }

  const totales = calcularTotalesVenta(items.map((i) => ({ cantidad: i.cantidad, precioUnitario: i.precioUnitario })))

  async function handleAgregarCliente() {
    if (!nuevoClienteNombre.trim()) return
    try {
      const cliente = await crearCliente({
        nombre: nuevoClienteNombre.trim(),
        telefono: null,
        email: null,
      })
      setClientes((prev) => [...prev, cliente].sort((a, b) => a.nombre.localeCompare(b.nombre)))
      setClienteId(cliente.id)
      setNuevoClienteNombre('')
    } catch {
      setError('No se pudo agregar el cliente. Intentá de nuevo.')
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (items.length === 0) return setError('Agregá al menos un producto o servicio.')
    if (items.some((i) => i.cantidad <= 0)) return setError('Todas las cantidades deben ser mayores a 0.')

    setSaving(true)
    try {
      const itemsInput: NuevaVentaItemInput[] = items.map((i) => ({
        tipo: i.tipo,
        producto_id: i.tipo === 'producto' ? i.productoId : null,
        servicio_id: i.tipo === 'servicio' ? i.servicioId : null,
        cantidad: i.cantidad,
        precio_unitario: i.precioUnitario,
      }))
      const { id } = await registrarVenta({
        cliente_id: clienteId || null,
        fecha: new Date().toISOString().slice(0, 10),
        medio_pago: medioPago,
        subtotal: totales.subtotal,
        iva_total: totales.ivaTotal,
        total: totales.total,
        notas: notas.trim() || null,
        items: itemsInput,
      })
      router.push(`/ventas/${id}`)
    } catch (err) {
      const mensaje = err instanceof Error ? err.message : ''
      if (mensaje.includes('Stock insuficiente')) {
        setError('No hay stock suficiente para uno de los productos. Revisá las cantidades.')
      } else {
        setError('No se pudo registrar la venta. Intentá de nuevo.')
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5 p-5 sm:p-8">
      <h1 className="rise text-[27px] text-ink">Nueva venta</h1>

      <div className="rise flex flex-col gap-2">
        <input
          placeholder="Buscar producto o servicio…"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          className="rounded-[var(--r-sm)] border border-line bg-surface p-2.5 text-sm text-ink outline-none transition focus:border-accent"
        />
        {(resultadosProducto.length > 0 || resultadosServicio.length > 0) && (
          <ul className="max-h-56 overflow-y-auto rounded-[var(--r-sm)] border border-line">
            {resultadosProducto.map((p) => (
              <li
                key={p.id}
                onClick={() => agregarProducto(p)}
                className="flex cursor-pointer justify-between p-2 text-sm text-ink hover:bg-surface"
              >
                <span>{p.nombre} <span className="text-ink-faint">(producto)</span></span>
                <span className="mono">${p.precio_venta.toLocaleString('es-AR')}</span>
              </li>
            ))}
            {resultadosServicio.map((s) => (
              <li
                key={s.id}
                onClick={() => agregarServicio(s)}
                className="flex cursor-pointer justify-between p-2 text-sm text-ink hover:bg-surface"
              >
                <span>{s.nombre} <span className="text-ink-faint">(servicio)</span></span>
                <span className="mono">${s.precio.toLocaleString('es-AR')}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <ul className="rise flex flex-col gap-2">
        {items.map((item) => (
          <li key={item.key} className="flex items-center gap-2 rounded-[var(--r-sm)] border border-line p-2.5">
            <span className="flex-1 text-sm text-ink">{item.nombre}</span>
            <input
              type="number"
              min={0.0001}
              step="any"
              value={item.cantidad}
              onChange={(e) => actualizarItem(item.key, { cantidad: Number(e.target.value) })}
              className="w-16 rounded-[var(--r-sm)] border border-line bg-surface p-1.5 text-sm text-ink"
            />
            <input
              type="number"
              min={0}
              step="any"
              value={item.precioUnitario}
              onChange={(e) => actualizarItem(item.key, { precioUnitario: Number(e.target.value) })}
              className="w-24 rounded-[var(--r-sm)] border border-line bg-surface p-1.5 text-sm text-ink"
            />
            <button
              type="button"
              onClick={() => quitarItem(item.key)}
              className="text-sm text-negative"
            >
              Quitar
            </button>
          </li>
        ))}
        {items.length === 0 && <li className="text-sm text-ink-soft">Sin ítems todavía.</li>}
      </ul>

      <form onSubmit={handleSubmit} className="rise flex flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          <select
            value={clienteId}
            onChange={(e) => setClienteId(e.target.value)}
            className="rounded-[var(--r-sm)] border border-line bg-surface p-2.5 text-sm text-ink outline-none transition focus:border-accent"
          >
            <option value="">Sin cliente</option>
            {clientes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
          <select
            value={medioPago}
            onChange={(e) => setMedioPago(e.target.value as MedioPago)}
            className="rounded-[var(--r-sm)] border border-line bg-surface p-2.5 text-sm text-ink outline-none transition focus:border-accent"
          >
            {MEDIOS_PAGO.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex gap-2">
          <input
            placeholder="Alta rápida de cliente"
            value={nuevoClienteNombre}
            onChange={(e) => setNuevoClienteNombre(e.target.value)}
            className="flex-1 rounded-[var(--r-sm)] border border-line bg-surface p-2.5 text-sm text-ink outline-none transition focus:border-accent"
          />
          <button type="button" onClick={handleAgregarCliente} className="pill-btn">
            Agregar cliente
          </button>
        </div>
        <textarea
          placeholder="Notas (opcional)"
          value={notas}
          onChange={(e) => setNotas(e.target.value)}
          rows={2}
          className="rounded-[var(--r-sm)] border border-line bg-surface p-2.5 text-sm text-ink outline-none transition focus:border-accent"
        />
        <p className="mono text-lg text-ink">Total: ${totales.total.toLocaleString('es-AR')}</p>
        {error && <p className="text-sm text-negative">{error}</p>}
        <button type="submit" disabled={saving} className="pill-btn w-fit disabled:opacity-50">
          {saving ? 'Guardando…' : 'Registrar venta'}
        </button>
      </form>
    </div>
  )
}
