'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { listarProveedores } from '@/lib/data/proveedores'
import {
  parsearCSV,
  detectarColumnas,
  importarListaPrecios,
  type ColumnasDetectadas,
  type ResultadoImportacion,
} from '@/lib/data/preciosProveedor'
import type { Proveedor } from '@/types/database'

const SELECT_CLASS =
  'rounded-[var(--r-sm)] border border-line bg-surface-sunk p-2.5 text-sm text-ink outline-none transition focus:border-accent'

function ColumnaSelect({
  label,
  headers,
  valor,
  onChange,
}: {
  label: string
  headers: string[]
  valor: number | null
  onChange: (v: number | null) => void
}) {
  return (
    <label className="flex flex-col gap-1 text-sm text-ink-soft">
      {label}
      <select
        value={valor ?? ''}
        onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
        className={SELECT_CLASS}
      >
        <option value="">— No usar —</option>
        {headers.map((h, i) => (
          <option key={i} value={i}>
            {h || `Columna ${i + 1}`}
          </option>
        ))}
      </select>
    </label>
  )
}

export default function ImportarPreciosPage() {
  const [proveedores, setProveedores] = useState<Proveedor[]>([])
  const [proveedorId, setProveedorId] = useState('')
  const [filas, setFilas] = useState<string[][]>([])
  const [headers, setHeaders] = useState<string[]>([])
  const [columnas, setColumnas] = useState<ColumnasDetectadas>({ codigo: null, nombre: null, precio: null })
  const [importando, setImportando] = useState(false)
  const [resultado, setResultado] = useState<ResultadoImportacion | null>(null)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    listarProveedores().then(setProveedores)
  }, [])

  async function handleArchivo(e: React.ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0]
    if (!archivo) return
    setError(null)
    setResultado(null)
    const texto = await archivo.text()
    const filasParseadas = parsearCSV(texto)
    if (filasParseadas.length < 2) {
      setError('El archivo no tiene filas de datos.')
      return
    }
    const [cabecera, ...resto] = filasParseadas
    setHeaders(cabecera)
    setFilas(resto)
    setColumnas(detectarColumnas(cabecera))
  }

  async function handleImportar() {
    if (!proveedorId) {
      setError('Elegí un proveedor.')
      return
    }
    if (columnas.nombre === null && columnas.codigo === null) {
      setError('Indicá al menos la columna de nombre o de código.')
      return
    }
    if (columnas.precio === null) {
      setError('Indicá la columna de precio.')
      return
    }
    setError(null)
    setImportando(true)
    try {
      const filasParaImportar = filas.map((fila) => ({
        codigo: columnas.codigo !== null ? (fila[columnas.codigo] ?? '') : '',
        nombre: columnas.nombre !== null ? (fila[columnas.nombre] ?? '') : '',
        precio: Number(String(fila[columnas.precio!] ?? '0').replace(/\./g, '').replace(',', '.')) || 0,
      }))
      const res = await importarListaPrecios(proveedorId, filasParaImportar)
      setResultado(res)
      setFilas([])
      setHeaders([])
      if (inputRef.current) inputRef.current.value = ''
    } catch {
      setError('No se pudo importar. Revisá el archivo e intentá de nuevo.')
    } finally {
      setImportando(false)
    }
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5 p-5 sm:p-8">
      <div className="rise">
        <p className="text-[11.5px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
          Comparador de precios
        </p>
        <h1 className="mt-1 text-[27px] text-ink">Importar lista de precios</h1>
        <p className="mt-1 text-sm text-ink-faint">
          Subí el Excel/CSV que descargaste del portal del mayorista (o la planilla que armaste con sus precios).
          El sistema cruza cada fila con tu catálogo por código o por nombre.
        </p>
        <Link href="/comparador" className="mt-2 inline-block text-sm text-accent hover:underline">
          ← Ver comparador
        </Link>
      </div>

      <div className="card flex flex-col gap-4 p-5 rise">
        <label className="flex flex-col gap-1 text-sm text-ink-soft">
          Proveedor
          <select value={proveedorId} onChange={(e) => setProveedorId(e.target.value)} className={SELECT_CLASS}>
            <option value="">Seleccionar proveedor</option>
            {proveedores.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm text-ink-soft">
          Archivo (CSV)
          <input
            ref={inputRef}
            type="file"
            accept=".csv,text/csv"
            onChange={handleArchivo}
            className="rounded-[var(--r-sm)] border border-line bg-surface-sunk p-2.5 text-sm text-ink outline-none transition focus:border-accent"
          />
        </label>
        <p className="text-xs text-ink-faint">
          Si el archivo viene en Excel (.xlsx), abrilo y guardalo como &quot;CSV&quot; antes de subirlo.
        </p>

        {headers.length > 0 && (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <ColumnaSelect
                headers={headers}
                label="Columna de código"
                valor={columnas.codigo}
                onChange={(v) => setColumnas((c) => ({ ...c, codigo: v }))}
              />
              <ColumnaSelect
                headers={headers}
                label="Columna de nombre"
                valor={columnas.nombre}
                onChange={(v) => setColumnas((c) => ({ ...c, nombre: v }))}
              />
              <ColumnaSelect
                headers={headers}
                label="Columna de precio"
                valor={columnas.precio}
                onChange={(v) => setColumnas((c) => ({ ...c, precio: v }))}
              />
            </div>
            <p className="text-sm text-ink-faint">{filas.length} filas detectadas.</p>
            <div className="overflow-x-auto rounded-[var(--r-sm)] border border-line">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-line bg-surface-sunk text-left">
                    {headers.map((h, i) => (
                      <th key={i} className="px-3 py-2 font-semibold text-ink-faint">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filas.slice(0, 5).map((fila, i) => (
                    <tr key={i} className="border-b border-line last:border-0">
                      {fila.map((valor, j) => (
                        <td key={j} className="px-3 py-2 text-ink-soft">
                          {valor}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {error && <p className="text-sm text-negative">{error}</p>}
        {resultado && (
          <div className="rounded-[var(--r-sm)] border border-line bg-surface-sunk p-3 text-sm text-ink-soft">
            <p>
              Importadas <strong className="text-ink">{resultado.emparejadosPorCodigo + resultado.emparejadosPorNombre}</strong> de{' '}
              {resultado.total} filas ({resultado.emparejadosPorCodigo} por código, {resultado.emparejadosPorNombre} por
              nombre).
            </p>
            {resultado.sinMatch.length > 0 && (
              <details className="mt-2">
                <summary className="cursor-pointer text-ink">
                  {resultado.sinMatch.length} sin coincidencia en tu catálogo
                </summary>
                <ul className="mt-1 list-inside list-disc">
                  {resultado.sinMatch.slice(0, 50).map((n, i) => (
                    <li key={i}>{n}</li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}

        <button
          type="button"
          disabled={importando || headers.length === 0}
          onClick={handleImportar}
          className="pill-btn justify-center disabled:opacity-50"
        >
          {importando ? 'Importando…' : 'Importar precios'}
        </button>
      </div>
    </div>
  )
}
