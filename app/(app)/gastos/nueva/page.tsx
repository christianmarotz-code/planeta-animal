'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { registrarGasto } from '@/lib/data/gastos'
import type { CategoriaGasto, Rama } from '@/types/database'
import { useEsAdministrador } from '@/lib/hooks/useEsAdministrador'

const CATEGORIAS: { value: CategoriaGasto; label: string }[] = [
  { value: 'combustible', label: 'Combustible' },
  { value: 'servicios', label: 'Servicios (luz/gas/agua/internet)' },
  { value: 'indumentaria', label: 'Indumentaria' },
  { value: 'impuestos', label: 'Impuestos' },
  { value: 'otro', label: 'Otro' },
]

export default function NuevoGastoPage() {
  const esAdmin = useEsAdministrador()
  const router = useRouter()
  const [fecha, setFecha] = useState(() => new Date().toISOString().slice(0, 10))
  const [categoria, setCategoria] = useState<CategoriaGasto>('combustible')
  const [concepto, setConcepto] = useState('')
  const [proveedor, setProveedor] = useState('')
  const [monto, setMonto] = useState('')
  const [rama, setRama] = useState<Rama | ''>('')
  const [notas, setNotas] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!concepto.trim()) return setError('Ingresá un concepto.')
    if (!monto || Number(monto) <= 0) return setError('El monto debe ser mayor a 0.')

    setSaving(true)
    try {
      await registrarGasto({
        fecha,
        categoria,
        concepto: concepto.trim(),
        proveedor: proveedor.trim() || null,
        monto: Number(monto),
        rama: rama || null,
        notas: notas.trim() || null,
      })
      router.push('/gastos')
    } catch {
      setError('No se pudo guardar el gasto. Intentá de nuevo.')
    } finally {
      setSaving(false)
    }
  }

  if (esAdmin === null) return <p className="p-8 text-sm text-ink-soft">Cargando…</p>
  if (esAdmin === false) {
    return (
      <p className="p-8 text-sm text-negative">
        Acceso restringido — contactá a un administrador.
      </p>
    )
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5 p-5 sm:p-8">
      <div className="rise">
        <p className="text-[11.5px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
          Gestión
        </p>
        <h1 className="mt-1 text-[27px] text-ink">Nuevo gasto</h1>
      </div>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4 rise">
        <div className="flex flex-wrap gap-2">
          <input
            required
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            className="rounded-[var(--r-sm)] border border-line bg-surface p-2.5 text-sm text-ink outline-none transition focus:border-accent"
          />
          <select
            value={categoria}
            onChange={(e) => setCategoria(e.target.value as CategoriaGasto)}
            className="rounded-[var(--r-sm)] border border-line bg-surface p-2.5 text-sm text-ink outline-none transition focus:border-accent"
          >
            {CATEGORIAS.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
          <select
            value={rama}
            onChange={(e) => setRama(e.target.value as Rama | '')}
            className="rounded-[var(--r-sm)] border border-line bg-surface p-2.5 text-sm text-ink outline-none transition focus:border-accent"
          >
            <option value="">General (sin rama)</option>
            <option value="clinica">Clínica</option>
            <option value="petshop">Petshop</option>
          </select>
        </div>
        <input
          required
          placeholder="Concepto (ej: Nafta, Luz, Uniformes)"
          value={concepto}
          onChange={(e) => setConcepto(e.target.value)}
          className="rounded-[var(--r-sm)] border border-line bg-surface p-2.5 text-sm text-ink outline-none transition focus:border-accent"
        />
        <input
          placeholder="Proveedor (opcional)"
          value={proveedor}
          onChange={(e) => setProveedor(e.target.value)}
          className="rounded-[var(--r-sm)] border border-line bg-surface p-2.5 text-sm text-ink outline-none transition focus:border-accent"
        />
        <input
          required
          type="number"
          min={0}
          step="any"
          placeholder="Monto"
          value={monto}
          onChange={(e) => setMonto(e.target.value)}
          className="rounded-[var(--r-sm)] border border-line bg-surface p-2.5 text-sm text-ink outline-none transition focus:border-accent"
        />
        <textarea
          placeholder="Notas (opcional)"
          value={notas}
          onChange={(e) => setNotas(e.target.value)}
          rows={3}
          className="rounded-[var(--r-sm)] border border-line bg-surface p-2.5 text-sm text-ink outline-none transition focus:border-accent"
        />
        {error && <p className="text-sm text-negative">{error}</p>}
        <button type="submit" disabled={saving} className="pill-btn w-fit disabled:opacity-50">
          {saving ? 'Guardando…' : 'Guardar gasto'}
        </button>
      </form>
    </div>
  )
}
