'use client'

import { useState } from 'react'
import type { Producto } from '@/types/database'

export interface ProductoFormValues {
  nombre: string
  categoria: string
  unidad_compra: string
  unidad_stock: string
  factor_conversion: number
  stock_minimo: number
  alicuota_iva: number
}

export function ProductoForm({
  initial,
  onSubmit,
  submitLabel,
}: {
  initial?: Partial<Producto>
  onSubmit: (values: ProductoFormValues) => Promise<void>
  submitLabel: string
}) {
  const [values, setValues] = useState<ProductoFormValues>({
    nombre: initial?.nombre ?? '',
    categoria: initial?.categoria ?? '',
    unidad_compra: initial?.unidad_compra ?? '',
    unidad_stock: initial?.unidad_stock ?? '',
    factor_conversion: initial?.factor_conversion ?? 1,
    stock_minimo: initial?.stock_minimo ?? 0,
    alicuota_iva: initial?.alicuota_iva ?? 21,
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function set<K extends keyof ProductoFormValues>(key: K, value: ProductoFormValues[K]) {
    setValues((v) => ({ ...v, [key]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSaving(true)
    try {
      await onSubmit(values)
    } catch (err) {
      setError('No se pudo guardar. Intentá de nuevo.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex max-w-md flex-col gap-3">
      <input
        required
        placeholder="Nombre"
        value={values.nombre}
        onChange={(e) => set('nombre', e.target.value)}
        className="rounded-[var(--r-sm)] border border-line bg-surface-sunk p-2.5 text-sm text-ink outline-none transition focus:border-accent"
      />
      <input
        placeholder="Categoría"
        value={values.categoria}
        onChange={(e) => set('categoria', e.target.value)}
        className="rounded-[var(--r-sm)] border border-line bg-surface-sunk p-2.5 text-sm text-ink outline-none transition focus:border-accent"
      />
      <div className="flex gap-2">
        <input
          required
          placeholder="Unidad de compra (ej. caja)"
          value={values.unidad_compra}
          onChange={(e) => set('unidad_compra', e.target.value)}
          className="w-1/2 rounded-[var(--r-sm)] border border-line bg-surface-sunk p-2.5 text-sm text-ink outline-none transition focus:border-accent"
        />
        <input
          required
          placeholder="Unidad de stock (ej. comprimido)"
          value={values.unidad_stock}
          onChange={(e) => set('unidad_stock', e.target.value)}
          className="w-1/2 rounded-[var(--r-sm)] border border-line bg-surface-sunk p-2.5 text-sm text-ink outline-none transition focus:border-accent"
        />
      </div>
      <label className="text-sm font-medium text-ink-soft">
        Factor de conversión (1 unidad de compra = X unidades de stock)
        <input
          required
          type="number"
          min={0.0001}
          step="any"
          value={values.factor_conversion}
          onChange={(e) => set('factor_conversion', Number(e.target.value))}
          className="mt-1 w-full rounded-[var(--r-sm)] border border-line bg-surface-sunk p-2.5 text-sm text-ink outline-none transition focus:border-accent"
        />
      </label>
      <label className="text-sm font-medium text-ink-soft">
        Stock mínimo (en unidad de stock)
        <input
          type="number"
          min={0}
          step="any"
          value={values.stock_minimo}
          onChange={(e) => set('stock_minimo', Number(e.target.value))}
          className="mt-1 w-full rounded-[var(--r-sm)] border border-line bg-surface-sunk p-2.5 text-sm text-ink outline-none transition focus:border-accent"
        />
      </label>
      <label className="text-sm font-medium text-ink-soft">
        Alícuota IVA (%)
        <input
          required
          type="number"
          min={0}
          step="any"
          value={values.alicuota_iva}
          onChange={(e) => set('alicuota_iva', Number(e.target.value))}
          className="mt-1 w-full rounded-[var(--r-sm)] border border-line bg-surface-sunk p-2.5 text-sm text-ink outline-none transition focus:border-accent"
        />
      </label>
      {error && <p className="text-sm text-negative">{error}</p>}
      <button type="submit" disabled={saving} className="pill-btn justify-center disabled:opacity-50">
        {saving ? 'Guardando…' : submitLabel}
      </button>
    </form>
  )
}
