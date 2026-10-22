'use client'

import { mensajeDeError } from '@/lib/errores'
import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { obtenerFacturaConItems, anularFactura, editarFacturaCompra, cambiarProntoPagoFactura, urlFotoFactura } from '@/lib/data/facturas'
import { obtenerProveedor, listarProveedores } from '@/lib/data/proveedores'
import { listarProductos, obtenerProducto, crearProducto } from '@/lib/data/productos'
import { calcularTotalesFactura } from '@/lib/calc/factura'
import { formatearFechaCorta } from '@/lib/facturas/meses'
import Link from 'next/link'
import type { FacturaCompra, ItemFactura, Proveedor, Producto, TipoComprobante } from '@/types/database'
import { useEsAdministrador } from '@/lib/hooks/useEsAdministrador'
import { SelectorProntoPago } from '@/components/SelectorProntoPago'
import { TablaItemsFactura } from './TablaItemsFactura'
import { TotalesFactura } from './TotalesFactura'
import { FormularioCorreccion } from './FormularioCorreccion'
import { validarBorradorFactura, type ItemDraft } from '@/lib/facturas/itemDraft'

export default function DetalleFacturaPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const esAdmin = useEsAdministrador()
  const [factura, setFactura] = useState<FacturaCompra | null>(null)
  const [items, setItems] = useState<ItemFactura[]>([])
  const [proveedor, setProveedor] = useState<Proveedor | null>(null)
  const [proveedores, setProveedores] = useState<Proveedor[]>([])
  const [productos, setProductos] = useState<Producto[]>([])
  const [anulando, setAnulando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [cambiandoProntoPago, setCambiandoProntoPago] = useState(false)

  const [editando, setEditando] = useState(false)
  const [guardandoEdicion, setGuardandoEdicion] = useState(false)
  const [errorEdicion, setErrorEdicion] = useState<string | null>(null)
  const [proveedorIdEdit, setProveedorIdEdit] = useState('')
  const [numeroComprobanteEdit, setNumeroComprobanteEdit] = useState('')
  const [tipoComprobanteEdit, setTipoComprobanteEdit] = useState<TipoComprobante>('Factura A')
  const [fechaEdit, setFechaEdit] = useState('')
  // El editor manual no conoce bonificaciones ni percepciones: corregir una factura leída con
  // detalle borraría ese detalle. Esas facturas se corrigen anulando y volviendo a cargar.
  const tieneDetalleInteligente = items.some((it) => it.total_linea !== null)
  const [itemsEdit, setItemsEdit] = useState<ItemDraft[]>([])
  const [creandoProductoIndices, setCreandoProductoIndices] = useState<Set<number>>(new Set())

  const productosPorId = useMemo(() => new Map(productos.map((p) => [p.id, p])), [productos])

  useEffect(() => {
    obtenerFacturaConItems(id).then(({ factura, items }) => {
      setFactura(factura)
      setItems(items)
      obtenerProveedor(factura.proveedor_id).then(setProveedor)
    })
    listarProveedores().then(setProveedores)
    listarProductos().then(setProductos)
  }, [id])

  if (!factura) return <p className="p-8 text-sm text-ink-soft">Cargando…</p>

  async function handleAnular() {
    if (!confirm('¿Anular esta factura? Se revertirá el stock que sumó.')) return
    setError(null)
    setAnulando(true)
    try {
      await anularFactura(id)
      router.refresh()
      const { factura: actualizada } = await obtenerFacturaConItems(id)
      setFactura(actualizada)
    } catch (err) {
      setError(mensajeDeError(err, 'No se pudo anular la factura. Intentá de nuevo.'))
    } finally {
      setAnulando(false)
    }
  }

  async function handleVerFoto() {
    if (!factura?.archivo_adjunto) return
    try {
      window.open(await urlFotoFactura(factura.archivo_adjunto), '_blank', 'noopener')
    } catch (err) {
      setError(mensajeDeError(err, 'No se pudo abrir la foto adjunta.'))
    }
  }

  async function handleElegirProntoPago(descuento: number) {
    setError(null)
    setCambiandoProntoPago(true)
    try {
      await cambiarProntoPagoFactura(id, descuento)
      setFactura((prev) => (prev ? { ...prev, pronto_pago_elegido: descuento } : prev))
    } catch (err) {
      setError(mensajeDeError(err, 'No se pudo cambiar el pronto pago. Intentá de nuevo.'))
    } finally {
      setCambiandoProntoPago(false)
    }
  }

  async function iniciarEdicion() {
    if (!factura) return
    setErrorEdicion(null)
    setProveedorIdEdit(factura.proveedor_id)
    setNumeroComprobanteEdit(factura.numero_comprobante)
    setTipoComprobanteEdit(factura.tipo_comprobante)
    setFechaEdit(factura.fecha)

    // listarProductos() solo trae productos activos: si esta factura tiene un
    // ítem de un producto que después se desactivó, no aparece ahí. Sin esto
    // el campo se ve vacío y, al no poder re-matchearlo desde el datalist,
    // termina marcado como "sin producto asignado" y bloqueando el guardado.
    const idsFaltantes = [...new Set(items.map((item) => item.producto_id))].filter(
      (id): id is string => id !== null && !productos.some((p) => p.id === id)
    )
    const faltantes = idsFaltantes.length > 0 ? await Promise.all(idsFaltantes.map((id) => obtenerProducto(id))) : []
    if (faltantes.length > 0) setProductos((prev) => [...prev, ...faltantes])
    const todosLosProductos = [...productos, ...faltantes]

    setItemsEdit(
      items.map((item) => ({
        producto_id: item.producto_id ?? '',
        productoTexto:
          todosLosProductos.find((p) => p.id === item.producto_id)?.nombre ??
          item.descripcion_original ??
          '',
        cantidad: String(item.cantidad),
        costo_unitario: String(item.costo_unitario),
        alicuota_iva: String(item.alicuota_iva),
      }))
    )
    setEditando(true)
  }

  function actualizarItemEdit(index: number, patch: Partial<ItemDraft>) {
    setItemsEdit((prev) => prev.map((it, i) => (i === index ? { ...it, ...patch } : it)))
  }

  function agregarItemEdit() {
    setItemsEdit((prev) => [
      ...prev,
      { producto_id: '', productoTexto: '', cantidad: '', costo_unitario: '', alicuota_iva: '21' },
    ])
  }

  function quitarItemEdit(index: number) {
    setItemsEdit((prev) => prev.filter((_, i) => i !== index))
  }

  async function crearProductoRapido(index: number, nombre: string) {
    setCreandoProductoIndices((prev) => new Set(prev).add(index))
    try {
      const nuevo = await crearProducto({
        nombre,
        categoria: '',
        rama: null,
        unidad_compra: 'unidad',
        unidad_stock: 'unidad',
        factor_conversion: 1,
        stock_minimo: 0,
        alicuota_iva: 21,
        activo: true,
      })
      setProductos((prev) => [...prev, nuevo])
      actualizarItemEdit(index, { producto_id: nuevo.id, productoTexto: nuevo.nombre, alicuota_iva: String(nuevo.alicuota_iva) })
    } finally {
      setCreandoProductoIndices((prev) => {
        const next = new Set(prev)
        next.delete(index)
        return next
      })
    }
  }

  const itemsEditConDatos = itemsEdit.filter((it) => it.cantidad && it.costo_unitario)
  const totalesEdit = calcularTotalesFactura(
    itemsEditConDatos.map((it) => ({
      cantidad: Number(it.cantidad),
      costoUnitario: Number(it.costo_unitario),
      alicuotaIva: Number(it.alicuota_iva),
    }))
  )

  async function handleGuardarEdicion() {
    setErrorEdicion(null)
    const errorValidacion = validarBorradorFactura({
      proveedorId: proveedorIdEdit,
      numeroComprobante: numeroComprobanteEdit,
      fecha: fechaEdit,
      itemsConDatos: itemsEditConDatos,
    })
    if (errorValidacion) return setErrorEdicion(errorValidacion)

    setGuardandoEdicion(true)
    try {
      await editarFacturaCompra(id, {
        proveedor_id: proveedorIdEdit,
        numero_comprobante: numeroComprobanteEdit,
        tipo_comprobante: tipoComprobanteEdit,
        fecha: fechaEdit,
        subtotal: totalesEdit.subtotal,
        iva_total: totalesEdit.ivaTotal,
        total: totalesEdit.total + (factura?.percepciones_total ?? 0),
        items: itemsEditConDatos.map((it) => ({
          producto_id: it.producto_id,
          cantidad: Number(it.cantidad),
          costo_unitario: Number(it.costo_unitario),
          alicuota_iva: Number(it.alicuota_iva),
        })),
      })
      const { factura: actualizada, items: itemsActualizados } = await obtenerFacturaConItems(id)
      setFactura(actualizada)
      setItems(itemsActualizados)
      obtenerProveedor(actualizada.proveedor_id).then(setProveedor)
      setEditando(false)
      router.refresh()
    } catch (err) {
      setErrorEdicion(mensajeDeError(err, 'No se pudieron guardar los cambios. Intentá de nuevo.'))
    } finally {
      setGuardandoEdicion(false)
    }
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5 p-5 sm:p-8">
      <div className="rise">
        <h1 className="flex items-center gap-2 text-[27px] text-ink">
          {factura.tipo_comprobante} {factura.numero_comprobante}
          {factura.estado === 'anulada' && <span className="chip down">ANULADA</span>}
          {factura.estado === 'revision' && <span className="chip down">REQUIERE REVISIÓN</span>}
        </h1>
        <p className="mt-1 text-sm text-ink-soft">
          {proveedor?.nombre} — <span className="mono">{factura.fecha}</span>
        </p>
      </div>

      {!editando && (
        <>
          <section className="card rise grid gap-x-6 gap-y-3 p-5 text-sm sm:grid-cols-2 lg:grid-cols-3">
            {[
              ['Proveedor', proveedor ? <Link key="p" href={`/proveedores/${proveedor.id}`} className="font-semibold text-ink hover:underline">{proveedor.nombre}</Link> : null],
              ['Comprobante', `${factura.tipo_comprobante} ${factura.numero_comprobante}`],
              ['Fecha', formatearFechaCorta(factura.fecha)],
              ['Carga', tieneDetalleInteligente ? 'Lectura inteligente' : 'Manual'],
              ['Condición de pago', factura.condicion_pago],
              ['Vencimiento', factura.vencimiento ? formatearFechaCorta(factura.vencimiento) : null],
              ['CAE', factura.cae],
              ['Vto. CAE', factura.cae_vto ? formatearFechaCorta(factura.cae_vto) : null],
              ['Pedido', factura.pedido],
              ['Remito', factura.remito],
              ['Orden de compra', factura.orden_compra],
              ['Cargada el', formatearFechaCorta(factura.created_at.slice(0, 10))],
            ]
              .filter(([, valor]) => valor)
              .map(([etiqueta, valor]) => (
                <div key={etiqueta as string} className="flex flex-col">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-faint">{etiqueta}</span>
                  <span className="mono text-ink">{valor}</span>
                </div>
              ))}
            {factura.notas && (
              <div className="flex flex-col sm:col-span-2 lg:col-span-3">
                <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-faint">Notas</span>
                <span className="text-ink">{factura.notas}</span>
              </div>
            )}
            {factura.archivo_adjunto && (
              <button type="button" onClick={handleVerFoto} className="pill-btn ghost w-fit">
                Ver foto de la factura
              </button>
            )}
          </section>
          <TablaItemsFactura
            factura={factura}
            items={items}
            proveedor={proveedor}
            productosPorId={productosPorId}
            esAdmin={esAdmin === true}
            tieneDetalleInteligente={tieneDetalleInteligente}
          />

          {esAdmin && <TotalesFactura factura={factura} />}

          {esAdmin && factura.pronto_pago.length > 0 && (
            <section className="card flex flex-col gap-3 p-4 rise">
              <h2 className="text-sm font-semibold text-ink">Pronto pago</h2>
              <SelectorProntoPago
                tramos={factura.pronto_pago}
                elegido={factura.pronto_pago_elegido}
                total={factura.total}
                fechaFactura={factura.fecha}
                onElegir={handleElegirProntoPago}
                deshabilitado={cambiandoProntoPago || factura.estado === 'anulada'}
              />
            </section>
          )}

          {factura.estado !== 'anulada' && (
            <div className="flex flex-wrap gap-2 rise">
              {esAdmin && !tieneDetalleInteligente && (
                <button onClick={iniciarEdicion} className="pill-btn ghost">
                  ✏️ Corregir factura
                </button>
              )}
              <button
                onClick={handleAnular}
                disabled={anulando}
                className="pill-btn ghost !text-negative disabled:opacity-50"
              >
                {anulando ? 'Anulando…' : 'Anular factura'}
              </button>
              {error && <p className="w-full text-sm text-negative">{error}</p>}
            </div>
          )}
        </>
      )}

      {editando && (
        <FormularioCorreccion
          proveedores={proveedores}
          productos={productos}
          proveedorId={proveedorIdEdit}
          onProveedorId={setProveedorIdEdit}
          tipoComprobante={tipoComprobanteEdit}
          onTipoComprobante={setTipoComprobanteEdit}
          numeroComprobante={numeroComprobanteEdit}
          onNumeroComprobante={setNumeroComprobanteEdit}
          fecha={fechaEdit}
          onFecha={setFechaEdit}
          items={itemsEdit}
          creandoProductoIndices={creandoProductoIndices}
          totales={totalesEdit}
          error={errorEdicion}
          guardando={guardandoEdicion}
          onActualizarItem={actualizarItemEdit}
          onAgregarItem={agregarItemEdit}
          onQuitarItem={quitarItemEdit}
          onCrearProductoRapido={crearProductoRapido}
          onGuardar={handleGuardarEdicion}
          onCancelar={() => setEditando(false)}
        />
      )}
    </div>
  )
}
