'use client'

import { useEffect, useRef, useState } from 'react'
import { Avatar } from '@/components/Avatar'
import { obtenerOCrearPerfilActual, actualizarNombrePerfil, subirAvatar } from '@/lib/data/perfiles'
import type { Perfil } from '@/types/database'

const TAMANIO_MAXIMO_BYTES = 3 * 1024 * 1024

const INPUT_CLASS =
  'rounded-[var(--r-sm)] border border-line bg-surface-sunk p-2.5 text-sm text-ink outline-none transition focus:border-accent'

export default function PerfilPage() {
  const [perfil, setPerfil] = useState<Perfil | null>(null)
  const [nombre, setNombre] = useState('')
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [archivoSeleccionado, setArchivoSeleccionado] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputArchivoRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    obtenerOCrearPerfilActual()
      .then((p) => {
        setPerfil(p)
        setNombre(p.nombre)
      })
      .catch(() => setError('No se pudo cargar tu perfil. Intentá de nuevo más tarde.'))
  }, [])

  function handleSeleccionArchivo(e: React.ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0]
    if (!archivo) return
    if (archivo.size > TAMANIO_MAXIMO_BYTES) {
      setError('La imagen no puede superar los 3MB.')
      if (inputArchivoRef.current) inputArchivoRef.current.value = ''
      return
    }
    setError(null)
    setArchivoSeleccionado(archivo)
    setPreviewUrl(URL.createObjectURL(archivo))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSaving(true)
    try {
      if (perfil && nombre !== perfil.nombre) {
        await actualizarNombrePerfil(nombre)
      }
      if (archivoSeleccionado) {
        await subirAvatar(archivoSeleccionado)
      }
      const actualizado = await obtenerOCrearPerfilActual()
      setPerfil(actualizado)
      setNombre(actualizado.nombre)
      setArchivoSeleccionado(null)
      setPreviewUrl(null)
    } catch (err) {
      setError('No se pudo guardar. Intentá de nuevo.')
    } finally {
      setSaving(false)
    }
  }

  if (!perfil && error) return <p className="p-8 text-sm text-negative">{error}</p>

  if (!perfil) return <p className="p-8 text-sm text-ink-soft">Cargando…</p>

  return (
    <div className="mx-auto flex max-w-md flex-col gap-5 p-5 sm:p-8 rise">
      <div>
        <p className="text-[11.5px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
          Cuenta
        </p>
        <h1 className="mt-1 text-[27px] text-ink">Mi perfil</h1>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex items-center gap-4">
          <Avatar nombre={nombre || perfil.nombre} avatarUrl={previewUrl ?? perfil.avatar_url} size="lg" />
          <button type="button" onClick={() => inputArchivoRef.current?.click()} className="pill-btn ghost">
            Cambiar foto
          </button>
          <input
            ref={inputArchivoRef}
            type="file"
            accept="image/*"
            onChange={handleSeleccionArchivo}
            className="hidden"
          />
        </div>

        <input
          required
          placeholder="Nombre"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          className={INPUT_CLASS}
        />

        {error && <p className="text-sm text-negative">{error}</p>}
        <button type="submit" disabled={saving} className="pill-btn justify-center disabled:opacity-50">
          {saving ? 'Guardando…' : 'Guardar'}
        </button>
      </form>
    </div>
  )
}
