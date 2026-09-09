'use client'

import { useState } from 'react'
import type { Proveedor } from '@/types/database'

export interface ProveedorFormValues {
  nombre: string
  cuit: string
  telefono: string
  email: string
  direccion: string
  notas: string
}

export function ProveedorForm({
  initial,
  onSubmit,
  submitLabel,
}: {
  initial?: Partial<Proveedor>
  onSubmit: (values: ProveedorFormValues) => Promise<void>
  submitLabel: string
}) {
  const [values, setValues] = useState<ProveedorFormValues>({
    nombre: initial?.nombre ?? '',
    cuit: initial?.cuit ?? '',
    telefono: initial?.telefono ?? '',
    email: initial?.email ?? '',
    direccion: initial?.direccion ?? '',
    notas: initial?.notas ?? '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function set<K extends keyof ProveedorFormValues>(key: K, value: string) {
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
        required
        placeholder="CUIT"
        value={values.cuit}
        onChange={(e) => set('cuit', e.target.value)}
        className="rounded-[var(--r-sm)] border border-line bg-surface-sunk p-2.5 text-sm text-ink outline-none transition focus:border-accent"
      />
      <input
        placeholder="Teléfono"
        value={values.telefono}
        onChange={(e) => set('telefono', e.target.value)}
        className="rounded-[var(--r-sm)] border border-line bg-surface-sunk p-2.5 text-sm text-ink outline-none transition focus:border-accent"
      />
      <input
        placeholder="Email"
        value={values.email}
        onChange={(e) => set('email', e.target.value)}
        className="rounded-[var(--r-sm)] border border-line bg-surface-sunk p-2.5 text-sm text-ink outline-none transition focus:border-accent"
      />
      <input
        placeholder="Dirección"
        value={values.direccion}
        onChange={(e) => set('direccion', e.target.value)}
        className="rounded-[var(--r-sm)] border border-line bg-surface-sunk p-2.5 text-sm text-ink outline-none transition focus:border-accent"
      />
      <textarea
        placeholder="Notas"
        value={values.notas}
        onChange={(e) => set('notas', e.target.value)}
        className="rounded-[var(--r-sm)] border border-line bg-surface-sunk p-2.5 text-sm text-ink outline-none transition focus:border-accent"
      />
      {error && <p className="text-sm text-negative">{error}</p>}
      <button type="submit" disabled={saving} className="pill-btn justify-center disabled:opacity-50">
        {saving ? 'Guardando…' : submitLabel}
      </button>
    </form>
  )
}
