'use client'

import { mensajeDeError } from '@/lib/errores'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { listarProveedores, crearProveedor, actualizarProveedor } from '@/lib/data/proveedores'
import { listarProductos } from '@/lib/data/productos'
import { listarFacturas, registrarFacturaCompra, subirFotoFactura } from '@/lib/data/facturas'
import { extraerBoleta } from '@/lib/data/boletas'
import { emparejarProveedor, emparejarProducto } from '@/lib/data/facturaMatching'
import { redimensionarImagen } from '@/lib/image/redimensionarImagen'
import { TIPO_A_COMPROBANTE, type BoletaExtraida, type LineaExtraida, type TipoDocumento } from '@/lib/facturas/boletaExtraida'
import { procesarBoleta } from '@/lib/facturas/procesarBoleta'
import { validarBoleta, type Alerta } from '@/lib/facturas/validacionesBoleta'
import {
  armarPayloadFactura,
  buscarFacturaDuplicada,
  completarProveedorDesdeBoleta,
} from '@/lib/facturas/guardarBoleta'
import type { FacturaCompra, Producto, Proveedor } from '@/types/database'
import { DetalleCompleto, TablaLineas } from './TablasBoleta'
import { INPUT, aNumero, fmt } from './formato'

// Estas alertas no se pueden "continuar igual": hay que corregir el origen.
const ALERTAS_DUROS = new Set(['no_es_compra', 'duplicado_imagen', 'duplicado_numero'])

export function CargaInteligente() {
  const router = useRouter()
  const [proveedores, setProveedores] = useState<Proveedor[]>([])
  const [productos, setProductos] = useState<Producto[]>([])
  const [proveedorId, setProveedorId] = useState('')
  const [nuevoNombre, setNuevoNombre] = useState('')
  const [facturasProveedor, setFacturasProveedor] = useState<FacturaCompra[]>([])

  const [cola, setCola] = useState<{ file: File; url: string }[]>([])
  const [leyendo, setLeyendo] = useState(false)
  const [errorLectura, setErrorLectura] = useState<string | null>(null)
  const [previews, setPreviews] = useState<{ url: string; esPdf: boolean }[]>([])
  const [rutas, setRutas] = useState<string[]>([])
  const [hashImagen, setHashImagen] = useState<string | null>(null)
  const [duplicadoImagen, setDuplicadoImagen] = useState(false)
  const [boleta, setBoleta] = useState<BoletaExtraida | null>(null)
  const [productoIds, setProductoIds] = useState<(string | null)[]>([])
  const [confirmadas, setConfirmadas] = useState<Set<string>>(new Set())
  const [guardando, setGuardando] = useState(false)
  const [errorGuardado, setErrorGuardado] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([listarProveedores(), listarProductos()]).then(([pv, pr]) => {
      setProveedores(pv)
      setProductos(pr)
    })
  }, [])

  useEffect(() => {
    return () => previews.forEach((p) => URL.revokeObjectURL(p.url))
  }, [previews])

  useEffect(() => {
    return () => cola.forEach((c) => URL.revokeObjectURL(c.url))
  }, [cola])

  const proveedor = proveedores.find((p) => p.id === proveedorId) ?? null

  function elegirProveedor(id: string) {
    setProveedorId(id)
    setConfirmadas(new Set())
    setFacturasProveedor([])
    // Si el proveedor cambia después de leer, el "coincide" del modelo ya no aplica.
    setBoleta((b) => (b ? { ...b, proveedor_coincide: null } : b))
    if (id) listarFacturas({ proveedorId: id }).then(setFacturasProveedor)
  }

  async function crearProveedorNuevo(nombre: string, cuit: string | null) {
    const nuevo = await crearProveedor({
      nombre,
      cuit,
      telefono: null,
      email: null,
      direccion: null,
      notas: null,
      aplica_iibb: false,
      tasa_iibb: 4,
      aplica_perc_iva: false,
      tasa_perc_iva: 3,
      descuento_pronto_pago: 0,
    })
    setProveedores((prev) => [...prev, nuevo].sort((a, b) => a.nombre.localeCompare(b.nombre)))
    elegirProveedor(nuevo.id)
    setNuevoNombre('')
  }

  function handleArchivos(e: React.ChangeEvent<HTMLInputElement>) {
    const archivos = Array.from(e.target.files ?? [])
    e.target.value = ''
    leerArchivos(archivos)
  }

  // La cámara entrega una foto por vez: se juntan las hojas y se leen todas juntas.
  function handleFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const fotos = Array.from(e.target.files ?? [])
    e.target.value = ''
    setCola((prev) => [...prev, ...fotos.map((file) => ({ file, url: URL.createObjectURL(file) }))])
  }

  function leerCola() {
    const archivos = cola.map((c) => c.file)
    setCola([])
    leerArchivos(archivos)
  }

  async function leerArchivos(archivos: File[]) {
    if (archivos.length === 0 || !proveedor) return

    setErrorLectura(null)
    setBoleta(null)
    setConfirmadas(new Set())
    setDuplicadoImagen(false)
    setPreviews(archivos.map((f) => ({ url: URL.createObjectURL(f), esPdf: f.type === 'application/pdf' })))
    setLeyendo(true)

    let subidas: string[]
    try {
      subidas = []
      for (const f of archivos) {
        const listo = f.type === 'application/pdf' ? f : await redimensionarImagen(f)
        subidas.push(await subirFotoFactura(listo))
      }
      setRutas(subidas)
    } catch (err) {
      setErrorLectura(mensajeDeError(err, 'No se pudo subir el archivo. Probá de nuevo.'))
      setLeyendo(false)
      return
    }

    try {
      const r = await extraerBoleta(subidas, {
        nombre: proveedor.nombre,
        cuit: proveedor.cuit,
        formato_habitual: proveedor.formato_habitual,
      })
      if (!r.ok) {
        setErrorLectura(r.error)
        return
      }
      setBoleta(r.boleta)
      setHashImagen(r.hash_imagen)
      setDuplicadoImagen(r.factura_duplicada_id !== null)
      setProductoIds(
        r.boleta.lineas.map((l) => emparejarProducto(l.descripcion_normalizada ?? l.descripcion, productos)?.id ?? null)
      )
    } catch (err) {
      setErrorLectura(mensajeDeError(err, 'No se pudo leer la boleta automáticamente.'))
    } finally {
      setLeyendo(false)
    }
  }

  const procesada = useMemo(() => (boleta ? procesarBoleta(boleta) : null), [boleta])

  const alertas: Alerta[] = useMemo(() => {
    if (!boleta || !procesada || !proveedor) return []
    const { alertas: base } = validarBoleta(boleta, procesada, {
      proveedorDeclarado: { nombre: proveedor.nombre, cuit: proveedor.cuit },
    })
    const extra: Alerta[] = []
    if (duplicadoImagen) {
      extra.push({ nivel: 'bloqueante', codigo: 'duplicado_imagen', mensaje: 'Este archivo ya fue cargado antes.' })
    }
    const tipo = boleta.tipo && boleta.tipo !== 'otro_no_compra' ? TIPO_A_COMPROBANTE[boleta.tipo] : null
    const dup = tipo ? buscarFacturaDuplicada(facturasProveedor, tipo, boleta.numero_comprobante) : null
    if (dup) {
      extra.push({
        nivel: 'bloqueante',
        codigo: 'duplicado_numero',
        mensaje: `Ya existe una ${tipo} ${boleta.numero_comprobante} de este proveedor.`,
      })
    }
    return [...base, ...extra]
  }, [boleta, procesada, proveedor, duplicadoImagen, facturasProveedor])

  const bloqueantesPendientes = alertas.filter((a) => a.nivel === 'bloqueante' && !confirmadas.has(a.codigo))
  const hayRevision = alertas.some((a) => a.nivel !== 'aviso')
  const sinVincular = productoIds.filter((id) => id === null).length

  function patchBoleta(patch: Partial<BoletaExtraida>) {
    setBoleta((b) => (b ? { ...b, ...patch } : b))
  }

  function patchLinea(i: number, patch: Partial<LineaExtraida>) {
    setBoleta((b) => (b ? { ...b, lineas: b.lineas.map((l, k) => (k === i ? { ...l, ...patch } : l)) } : b))
  }

  function cambiarNombreProducto(i: number, texto: string) {
    patchLinea(i, { descripcion_normalizada: texto })
    const match = productos.find((p) => p.nombre === texto.trim())
    setProductoIds((prev) => prev.map((id, k) => (k === i ? (match?.id ?? null) : id)))
  }

  function cambiarProveedorPorLeido() {
    if (!boleta) return
    const match = emparejarProveedor(
      { nombre: boleta.proveedor_nombre, cuit: boleta.proveedor_cuit },
      proveedores
    )
    if (match) elegirProveedor(match.id)
    else if (boleta.proveedor_nombre) crearProveedorNuevo(boleta.proveedor_nombre, boleta.proveedor_cuit)
  }

  async function guardar() {
    if (!boleta || !procesada || !proveedor) return
    setErrorGuardado(null)
    if (!boleta.fecha) return setErrorGuardado('Falta la fecha de la boleta.')
    if (!boleta.tipo || boleta.tipo === 'otro_no_compra') return setErrorGuardado('Elegí el tipo de comprobante.')
    if (boleta.es_fiscal && !boleta.numero_comprobante) return setErrorGuardado('Falta el número de comprobante.')

    setGuardando(true)
    try {
      const payload = armarPayloadFactura({
        proveedorId: proveedor.id,
        boleta,
        procesada,
        estado: hayRevision ? 'revision' : 'ok',
        productoIds,
        archivoAdjunto: rutas[0] ?? null,
        hashImagen,
      })
      const { id } = await registrarFacturaCompra(payload)
      const patch = completarProveedorDesdeBoleta(proveedor, boleta)
      if (Object.keys(patch).length > 0) await actualizarProveedor(proveedor.id, patch).catch(() => undefined)
      router.push(`/compras/${id}`)
    } catch (err) {
      setErrorGuardado(mensajeDeError(err, 'No se pudo guardar la boleta. Intentá de nuevo.'))
    } finally {
      setGuardando(false)
    }
  }

  const semaforoOk = !!boleta && !hayRevision

  return (
    <div className="flex flex-col gap-5">
      <div className="card rise flex flex-col gap-3 p-5">
        <p className="text-sm font-semibold text-ink">1. ¿De qué proveedor es la boleta?</p>
        <div className="flex flex-wrap items-center gap-2">
          <select value={proveedorId} onChange={(e) => elegirProveedor(e.target.value)} className={INPUT}>
            <option value="">Elegí un proveedor…</option>
            {[...proveedores]
              .sort((a, b) => b.cantidad_boletas - a.cantidad_boletas || a.nombre.localeCompare(b.nombre))
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
          </select>
          <input
            placeholder="+ Proveedor nuevo (nombre)"
            value={nuevoNombre}
            onChange={(e) => setNuevoNombre(e.target.value)}
            className={INPUT}
          />
          <button
            type="button"
            disabled={nuevoNombre.trim().length < 2}
            onClick={() => crearProveedorNuevo(nuevoNombre.trim(), null)}
            className="pill-btn ghost disabled:opacity-50"
          >
            Crear
          </button>
        </div>
        <p className="text-sm font-semibold text-ink">2. Subí la foto o el PDF</p>
        <div className="flex flex-wrap gap-2">
          <label className={`pill-btn w-fit ${proveedor && !leyendo ? 'cursor-pointer' : 'pointer-events-none opacity-50'}`}>
            📷 {cola.length > 0 ? 'Otra hoja' : 'Sacar foto'}
            <input
              type="file"
              accept="image/*"
              capture="environment"
              disabled={!proveedor || leyendo}
              onChange={handleFoto}
              className="hidden"
            />
          </label>
          <label className={`pill-btn ghost w-fit ${proveedor ? 'cursor-pointer' : 'pointer-events-none opacity-50'}`}>
            🖼️ Elegir archivos (galería o PDF)
            <input
              type="file"
              accept="image/*,application/pdf"
              multiple
              disabled={!proveedor}
              onChange={handleArchivos}
              className="hidden"
            />
          </label>
        </div>
        {cola.length > 0 && (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap gap-2">
              {cola.map((c, i) => (
                <div key={c.url} className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={c.url} alt={`Hoja ${i + 1}`} className="h-24 w-20 rounded-[var(--r-sm)] border border-line object-cover" />
                  <button
                    type="button"
                    aria-label={`Quitar hoja ${i + 1}`}
                    onClick={() => setCola((prev) => prev.filter((_, k) => k !== i))}
                    className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-ink text-xs text-surface"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
            <button type="button" onClick={leerCola} disabled={leyendo} className="pill-btn w-fit disabled:opacity-50">
              Leer boleta ({cola.length} {cola.length === 1 ? 'hoja' : 'hojas'})
            </button>
          </div>
        )}
        {leyendo && <p className="text-sm text-ink-faint">Leyendo boleta…</p>}
        {errorLectura && <p className="text-sm text-negative">{errorLectura}</p>}
      </div>

      {boleta && procesada && (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <div className="flex flex-col gap-3">
            {previews.map((p, i) =>
              p.esPdf ? (
                <iframe key={i} src={p.url} title={`Hoja ${i + 1}`} className="h-[70vh] w-full rounded-[var(--r-sm)] border border-line" />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={i} src={p.url} alt={`Hoja ${i + 1}`} className="w-full rounded-[var(--r-sm)] border border-line" />
              )
            )}
          </div>

          <div className="flex flex-col gap-4">
            <div
              className={`rounded-[var(--r-sm)] p-3 text-sm font-semibold ${
                semaforoOk ? 'bg-positive-soft text-positive' : 'bg-negative-soft text-negative'
              }`}
            >
              {semaforoOk
                ? '● Cuadra: la suma de los productos es el total a pagar.'
                : `● Requiere revisión${
                    procesada.calculo.cuadra ? '' : ` — diferencia ${fmt(procesada.calculo.diferencia)}`
                  }`}
            </div>

            {alertas.map((a) => (
              <div key={a.codigo + a.mensaje} className="card flex flex-wrap items-center gap-3 p-3 text-sm">
                <span className={a.nivel === 'aviso' ? 'text-ink-soft' : 'text-negative'}>{a.mensaje}</span>
                {a.codigo === 'proveedor_distinto' && (
                  <button type="button" onClick={cambiarProveedorPorLeido} className="pill-btn ghost">
                    Cambiar proveedor
                  </button>
                )}
                {a.nivel === 'bloqueante' && !ALERTAS_DUROS.has(a.codigo) && !confirmadas.has(a.codigo) && (
                  <button
                    type="button"
                    onClick={() => setConfirmadas((prev) => new Set(prev).add(a.codigo))}
                    className="pill-btn ghost"
                  >
                    Continuar igual
                  </button>
                )}
              </div>
            ))}

            <div className="flex flex-wrap gap-2">
              <select
                value={boleta.tipo ?? ''}
                onChange={(e) => {
                  const tipo = e.target.value as TipoDocumento
                  patchBoleta({ tipo, es_fiscal: ['factura_A', 'factura_B', 'factura_C', 'ticket_factura'].includes(tipo) })
                }}
                className={INPUT}
              >
                {Object.entries(TIPO_A_COMPROBANTE).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
              <input
                placeholder="0000-00000000"
                value={boleta.numero_comprobante ?? ''}
                onChange={(e) => patchBoleta({ numero_comprobante: e.target.value || null })}
                className={INPUT}
              />
              <input
                type="date"
                value={boleta.fecha ?? ''}
                onChange={(e) => patchBoleta({ fecha: e.target.value || null })}
                className={INPUT}
              />
              <input
                placeholder="Condición de pago"
                value={boleta.condicion_pago ?? ''}
                onChange={(e) => patchBoleta({ condicion_pago: e.target.value || null })}
                className={INPUT}
              />
              <label className="flex items-center gap-2 text-sm text-ink-soft">
                Total impreso
                <input
                  type="number"
                  step="0.01"
                  value={boleta.total ?? ''}
                  onChange={(e) => patchBoleta({ total: aNumero(e.target.value) })}
                  className={`${INPUT} w-36`}
                />
              </label>
            </div>

            <TablaLineas
              boleta={boleta}
              procesada={procesada}
              productos={productos}
              productoIds={productoIds}
              patchLinea={patchLinea}
              cambiarNombreProducto={cambiarNombreProducto}
            />

            <DetalleCompleto boleta={boleta} procesada={procesada} patchLinea={patchLinea} />

            {sinVincular > 0 && (
              <p className="text-sm text-ink-soft">
                {sinVincular} línea(s) sin producto vinculado: se guardan igual, pero no generan entrada de stock
                ni actualizan costos hasta vincularlas.
              </p>
            )}
            {errorGuardado && <p className="text-sm text-negative">{errorGuardado}</p>}
            <button
              type="button"
              onClick={guardar}
              disabled={guardando || bloqueantesPendientes.length > 0}
              className="pill-btn w-fit disabled:opacity-50"
            >
              {guardando ? 'Guardando…' : hayRevision ? 'Guardar para revisión' : 'Confirmar y guardar'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
