'use client'

import { useState } from 'react'
import type { Servicio, Rama } from '@/types/database'

export interface ServicioFormValues {
  nombre: string
  categoria: string
  rama: Rama | ''
  precio: number
}

export function ServicioForm({
  initial,
  onSubmit,
  submitLabel,
}: {
  initial?: Partial<Servicio>
  onSubmit: (values: ServicioFormValues) => Promise<void>
  submitLabel: string
}) {
  const [values, setValues] = useState<ServicioFormValues>({
    nombre: initial?.nombre ?? '',
    categoria: initial?.categoria ?? '',
    rama: initial?.rama ?? '',
    precio: initial?.precio ?? 0,
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function set<K extends keyof ServicioFormValues>(key: K, value: ServicioFormValues[K]) {
    setValues((v) => ({ ...v, [key]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!values.nombre.trim()) return setError('Ingresá un nombre.')
    if (values.precio < 0) return setError('El precio no puede ser negativo.')
    setSaving(true)
    try {
      await onSubmit(values)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex max-w-md flex-col gap-3">
      <input
        required
        placeholder="Nombre (ej: Lavado, Consulta, Vacuna)"
        value={values.nombre}
        onChange={(e) => set('nombre', e.target.value)}
        className="rounded-[var(--r-sm)] border border-line bg-surface p-2.5 text-sm text-ink outline-none transition focus:border-accent"
      />
      <input
        placeholder="Categoría (opcional)"
        value={values.categoria}
        onChange={(e) => set('categoria', e.target.value)}
        className="rounded-[var(--r-sm)] border border-line bg-surface p-2.5 text-sm text-ink outline-none transition focus:border-accent"
      />
      <select
        value={values.rama}
        onChange={(e) => set('rama', e.target.value as Rama | '')}
        className="rounded-[var(--r-sm)] border border-line bg-surface p-2.5 text-sm text-ink outline-none transition focus:border-accent"
      >
        <option value="">Sin rama</option>
        <option value="clinica">Clínica</option>
        <option value="petshop">Petshop</option>
      </select>
      <label className="text-sm text-ink-soft">
        Precio
        <input
          required
          type="number"
          min={0}
          step="any"
          value={values.precio}
          onChange={(e) => set('precio', Number(e.target.value))}
          className="mt-1 w-full rounded-[var(--r-sm)] border border-line bg-surface p-2.5 text-sm text-ink outline-none transition focus:border-accent"
        />
      </label>
      {error && <p className="text-sm text-negative">{error}</p>}
      <button type="submit" disabled={saving} className="pill-btn w-fit disabled:opacity-50">
        {saving ? 'Guardando…' : submitLabel}
      </button>
    </form>
  )
}
