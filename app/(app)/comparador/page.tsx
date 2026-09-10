'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { listarComparador, type FilaComparador } from '@/lib/data/preciosProveedor'

export default function ComparadorPage() {
  const [filas, setFilas] = useState<FilaComparador[]>([])
  const [busqueda, setBusqueda] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    listarComparador()
      .then(setFilas)
      .finally(() => setLoading(false))
  }, [])

  const filtradas = useMemo(() => {
    const term = busqueda.trim().toLowerCase()
    if (!term) return filas
    return filas.filter((f) => f.producto.nombre.toLowerCase().includes(term))
  }, [filas, busqueda])

  const proveedoresEnTabla = useMemo(() => {
    const nombres = new Map<string, string>()
    for (const fila of filas) {
      for (const p of fila.precios) nombres.set(p.proveedor.id, p.proveedor.nombre)
    }
    return Array.from(nombres.entries()).sort((a, b) => a[1].localeCompare(b[1]))
  }, [filas])

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5 p-5 sm:p-8">
      <div className="flex items-center justify-between rise">
        <div>
          <p className="text-[11.5px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
            Gestión
          </p>
          <h1 className="mt-1 text-[27px] text-ink">Comparador de precios</h1>
          <p className="mt-0.5 text-sm text-ink-faint">
            Solo se muestran productos con precio cargado de al menos un mayorista.
          </p>
        </div>
        <Link href="/comparador/importar" className="pill-btn">
          + Importar lista
        </Link>
      </div>

      <input
        type="text"
        placeholder="Buscar producto…"
        value={busqueda}
        onChange={(e) => setBusqueda(e.target.value)}
        className="w-full max-w-xs rounded-[var(--r-sm)] border border-line bg-surface-sunk p-2.5 text-sm text-ink outline-none transition focus:border-accent rise"
      />

      {loading ? (
        <p className="text-sm text-ink-soft">Cargando…</p>
      ) : filas.length === 0 ? (
        <div className="card rise p-6 text-sm text-ink-faint">
          Todavía no importaste ninguna lista de precios.{' '}
          <Link href="/comparador/importar" className="text-accent hover:underline">
            Importar la primera
          </Link>
          .
        </div>
      ) : (
        <div className="card rise overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left">
                <th className="px-5 py-3 text-[11.5px] font-semibold uppercase tracking-[0.1em] text-ink-faint">
                  Producto
                </th>
                <th className="px-5 py-3 text-[11.5px] font-semibold uppercase tracking-[0.1em] text-ink-faint">
                  Mejor precio
                </th>
                {proveedoresEnTabla.map(([id, nombre]) => (
                  <th
                    key={id}
                    className="px-5 py-3 text-[11.5px] font-semibold uppercase tracking-[0.1em] text-ink-faint"
                  >
                    {nombre}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtradas.map((fila) => (
                <tr key={fila.producto.id} className="border-b border-line transition last:border-0 hover:bg-surface-sunk">
                  <td className="px-5 py-3 font-medium text-ink">{fila.producto.nombre}</td>
                  <td className="px-5 py-3">
                    {fila.mejor && (
                      <span className="chip up">
                        {fila.mejor.proveedor.nombre} · ${fila.mejor.precio.toLocaleString('es-AR')}
                      </span>
                    )}
                  </td>
                  {proveedoresEnTabla.map(([id]) => {
                    const precio = fila.precios.find((p) => p.proveedor.id === id)
                    const esMejor = fila.mejor && precio && precio.proveedor.id === fila.mejor.proveedor.id
                    return (
                      <td key={id} className={`mono px-5 py-3 ${esMejor ? 'font-semibold text-positive' : 'text-ink-soft'}`}>
                        {precio ? `$${precio.precio.toLocaleString('es-AR')}` : '—'}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
