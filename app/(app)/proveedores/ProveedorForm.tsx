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
  aplica_iibb: boolean
  tasa_iibb: number
  aplica_perc_iva: boolean
  tasa_perc_iva: number
  descuento_pronto_pago: number
}

const INPUT_CLASS =
  'rounded-[var(--r-sm)] border border-line bg-surface-sunk p-2.5 text-sm text-ink outline-none transition focus:border-accent'

export function ProveedorForm({
  initial,
  onSubmit,
  submitLabel,
  esAdministrador,
}: {
  initial?: Partial<Proveedor>
  onSubmit: (values: ProveedorFormValues) => Promise<void>
  submitLabel: string
  esAdministrador: boolean
}) {
  const [values, setValues] = useState<ProveedorFormValues>({
    nombre: initial?.nombre ?? '',
    cuit: initial?.cuit ?? '',
    telefono: initial?.telefono ?? '',
    email: initial?.email ?? '',
    direccion: initial?.direccion ?? '',
    notas: initial?.notas ?? '',
    aplica_iibb: initial?.aplica_iibb ?? false,
    tasa_iibb: initial?.tasa_iibb ?? 4,
    aplica_perc_iva: initial?.aplica_perc_iva ?? false,
    tasa_perc_iva: initial?.tasa_perc_iva ?? 3,
    descuento_pronto_pago: initial?.descuento_pronto_pago ?? 0,
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function set<K extends keyof ProveedorFormValues>(key: K, value: ProveedorFormValues[K]) {
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
        className={INPUT_CLASS}
      />
      <input
        required
        placeholder="CUIT"
        value={values.cuit}
        onChange={(e) => set('cuit', e.target.value)}
        className={INPUT_CLASS}
      />
      <input
        placeholder="Teléfono"
        value={values.telefono}
        onChange={(e) => set('telefono', e.target.value)}
        className={INPUT_CLASS}
      />
      <input
        placeholder="Email"
        value={values.email}
        onChange={(e) => set('email', e.target.value)}
        className={INPUT_CLASS}
      />
      <input
        placeholder="Dirección"
        value={values.direccion}
        onChange={(e) => set('direccion', e.target.value)}
        className={INPUT_CLASS}
      />
      <textarea
        placeholder="Notas"
        value={values.notas}
        onChange={(e) => set('notas', e.target.value)}
        className={INPUT_CLASS}
      />

      {esAdministrador && (
        <div className="mt-2 rounded-[var(--r-lg)] border border-line bg-surface-sunk p-3.5">
          <p className="mb-3 text-[11.5px] font-semibold uppercase tracking-[0.1em] text-ink-faint">
            Impuestos y descuentos de este proveedor
          </p>
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-sm text-ink">
                <input
                  type="checkbox"
                  checked={values.aplica_iibb}
                  onChange={(e) => set('aplica_iibb', e.target.checked)}
                  className="accent-accent"
                />
                Aplica Ingresos Brutos (II.BB.)
              </label>
              {values.aplica_iibb && (
                <input
                  type="number"
                  min={0}
                  step="any"
                  value={values.tasa_iibb}
                  onChange={(e) => set('tasa_iibb', Number(e.target.value))}
                  className={`${INPUT_CLASS} w-20`}
                  aria-label="Tasa de II.BB. (%)"
                />
              )}
            </div>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-sm text-ink">
                <input
                  type="checkbox"
                  checked={values.aplica_perc_iva}
                  onChange={(e) => set('aplica_perc_iva', e.target.checked)}
                  className="accent-accent"
                />
                Aplica Percepción de IVA
              </label>
              {values.aplica_perc_iva && (
                <input
                  type="number"
                  min={0}
                  step="any"
                  value={values.tasa_perc_iva}
                  onChange={(e) => set('tasa_perc_iva', Number(e.target.value))}
                  className={`${INPUT_CLASS} w-20`}
                  aria-label="Tasa de percepción de IVA (%)"
                />
              )}
            </div>
            <label className="text-sm text-ink-soft">
              Descuento por pronto pago (%)
              <input
                type="number"
                min={0}
                step="any"
                value={values.descuento_pronto_pago}
                onChange={(e) => set('descuento_pronto_pago', Number(e.target.value))}
                className={`${INPUT_CLASS} mt-1 w-full`}
              />
            </label>
          </div>
        </div>
      )}

      {error && <p className="text-sm text-negative">{error}</p>}
      <button type="submit" disabled={saving} className="pill-btn justify-center disabled:opacity-50">
        {saving ? 'Guardando…' : submitLabel}
      </button>
    </form>
  )
}
