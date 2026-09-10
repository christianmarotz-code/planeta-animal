'use client'

import { useEffect, useState } from 'react'
import {
  listarUsuarios,
  invitarUsuario,
  actualizarRolUsuario,
  type UsuarioConEmail,
} from '@/lib/data/usuarios'
import { obtenerOCrearPerfilActual } from '@/lib/data/perfiles'
import type { Perfil, RolPerfil } from '@/types/database'

const INPUT_CLASS =
  'rounded-[var(--r-sm)] border border-line bg-surface-sunk p-2.5 text-sm text-ink outline-none transition focus:border-accent'

export default function UsuariosPage() {
  const [perfilActual, setPerfilActual] = useState<Perfil | null>(null)
  const [usuarios, setUsuarios] = useState<UsuarioConEmail[]>([])
  const [loading, setLoading] = useState(true)
  const [email, setEmail] = useState('')
  const [nombre, setNombre] = useState('')
  const [rol, setRol] = useState<RolPerfil>('empleado')
  const [invitando, setInvitando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function cargarUsuarios() {
    listarUsuarios()
      .then(setUsuarios)
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    obtenerOCrearPerfilActual().then(setPerfilActual)
  }, [])

  useEffect(() => {
    if (perfilActual?.rol === 'administrador') cargarUsuarios()
  }, [perfilActual])

  async function handleInvitar(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setInvitando(true)
    try {
      await invitarUsuario({ email, nombre, rol })
      setEmail('')
      setNombre('')
      setRol('empleado')
      cargarUsuarios()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo invitar. Intentá de nuevo.')
    } finally {
      setInvitando(false)
    }
  }

  async function handleCambiarRol(id: string, nuevoRol: RolPerfil) {
    setError(null)
    try {
      await actualizarRolUsuario(id, nuevoRol)
      cargarUsuarios()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cambiar el rol.')
    }
  }

  if (!perfilActual) return <p className="p-8 text-sm text-ink-soft">Cargando…</p>

  if (perfilActual.rol !== 'administrador') {
    return (
      <p className="p-8 text-sm text-negative">
        Acceso restringido — contactá a un administrador.
      </p>
    )
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5 p-5 sm:p-8 rise">
      <div>
        <p className="text-[11.5px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
          Gestión
        </p>
        <h1 className="mt-1 text-[27px] text-ink">Usuarios</h1>
      </div>

      <div className="shell rise">
        <div className="core">
          <p className="mb-3 text-[11.5px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
            Invitar a alguien nuevo
          </p>
          <form onSubmit={handleInvitar} className="flex flex-wrap items-end gap-3">
            <input
              required
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={`${INPUT_CLASS} w-56`}
            />
            <input
              required
              placeholder="Nombre"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              className={`${INPUT_CLASS} w-44`}
            />
            <select value={rol} onChange={(e) => setRol(e.target.value as RolPerfil)} className={INPUT_CLASS}>
              <option value="empleado">Empleado</option>
              <option value="administrador">Administrador</option>
            </select>
            <button type="submit" disabled={invitando} className="pill-btn disabled:opacity-50">
              {invitando ? 'Invitando…' : 'Invitar'}
            </button>
          </form>
          {error && <p className="mt-3 text-sm text-negative">{error}</p>}
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-ink-soft">Cargando…</p>
      ) : (
        <div className="card rise divide-y divide-line">
          {usuarios.map((u) => (
            <div key={u.id} className="flex items-center justify-between px-5 py-3.5 text-sm">
              <span className="text-ink">
                {u.nombre} <span className="text-ink-faint">— {u.email}</span>
              </span>
              {u.id === perfilActual.id ? (
                <span className="chip up">
                  {u.rol === 'administrador' ? 'Administrador' : 'Empleado'}
                </span>
              ) : (
                <select
                  value={u.rol}
                  onChange={(e) => handleCambiarRol(u.id, e.target.value as RolPerfil)}
                  className={INPUT_CLASS}
                >
                  <option value="empleado">Empleado</option>
                  <option value="administrador">Administrador</option>
                </select>
              )}
            </div>
          ))}
          {usuarios.length === 0 && <p className="px-5 py-6 text-sm text-ink-faint">Sin usuarios.</p>}
        </div>
      )}
    </div>
  )
}
