'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { PawIcon } from '@/components/Logo'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [eligiendoContrasena, setEligiendoContrasena] = useState(false)
  const [confirmacion, setConfirmacion] = useState('')
  const [olvide, setOlvide] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)

  // El link del mail de invitación (o de recuperar contraseña) llega con la sesión en el #hash.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- el hash solo se puede leer en el navegador
    if (/type=(invite|recovery)/.test(window.location.hash)) setEligiendoContrasena(true)
  }, [])

  async function handleElegirContrasena(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (password.length < 8) return setError('La contraseña tiene que tener al menos 8 caracteres.')
    if (password !== confirmacion) return setError('Las contraseñas no coinciden.')
    const supabase = createClient()
    const { data } = await supabase.auth.getSession()
    if (!data.session) {
      return setError('El link venció o ya se usó. Pedí uno nuevo con "¿Olvidaste tu contraseña?" o que te inviten de nuevo.')
    }
    const { error } = await supabase.auth.updateUser({ password })
    if (error) return setError('No se pudo guardar la contraseña. Intentá de nuevo.')
    router.push('/')
    router.refresh()
  }

  async function handleOlvide(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setAviso(null)
    const supabase = createClient()
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/login`,
    })
    if (error) return setError('No se pudo enviar el mail. Esperá un minuto e intentá de nuevo.')
    // Mismo mensaje exista o no el mail, para no revelar qué cuentas están registradas.
    setAviso('Si el mail está registrado, te mandamos un link para elegir una contraseña nueva.')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError('Email o contraseña incorrectos.')
      return
    }
    router.push('/')
    router.refresh()
  }

  return (
    <main className="app-bg dashboard-shell flex min-h-[100dvh] items-center justify-center px-4">
      <div className="shell w-full max-w-sm rise">
        <div className="core">
          <div className="mb-7 flex flex-col items-center gap-4">
            <PawIcon className="h-14 w-14" />
            <div className="text-center">
              <p className="text-[11.5px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
                {eligiendoContrasena ? 'Tu cuenta' : olvide ? 'Recuperar acceso' : 'Bienvenido'}
              </p>
              <h1 className="mt-1 text-[22px] text-ink">
                {eligiendoContrasena ? 'Elegí tu contraseña' : olvide ? 'Olvidé mi contraseña' : 'Planeta Animal'}
              </h1>
            </div>
          </div>
          {eligiendoContrasena ? (
            <form onSubmit={handleElegirContrasena} className="flex flex-col gap-3">
              <input
                type="password"
                placeholder="Contraseña nueva (mínimo 8 caracteres)"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="rounded-[var(--r-sm)] border border-line bg-surface-sunk p-3 text-sm text-ink outline-none transition focus:border-accent"
                required
              />
              <input
                type="password"
                placeholder="Repetí la contraseña"
                value={confirmacion}
                onChange={(e) => setConfirmacion(e.target.value)}
                className="rounded-[var(--r-sm)] border border-line bg-surface-sunk p-3 text-sm text-ink outline-none transition focus:border-accent"
                required
              />
              {error && <p className="text-sm text-negative">{error}</p>}
              <button type="submit" className="pill-btn mt-2 justify-center">
                Guardar y entrar
              </button>
            </form>
          ) : olvide ? (
            <form onSubmit={handleOlvide} className="flex flex-col gap-3">
              <input
                type="email"
                placeholder="Tu email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="rounded-[var(--r-sm)] border border-line bg-surface-sunk p-3 text-sm text-ink outline-none transition focus:border-accent"
                required
              />
              {error && <p className="text-sm text-negative">{error}</p>}
              {aviso && <p className="text-sm text-ink-soft">{aviso}</p>}
              <button type="submit" className="pill-btn mt-2 justify-center">
                Enviar link
              </button>
              <button
                type="button"
                onClick={() => {
                  setOlvide(false)
                  setError(null)
                  setAviso(null)
                }}
                className="text-sm text-ink-faint transition hover:text-ink"
              >
                Volver a ingresar
              </button>
            </form>
          ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="rounded-[var(--r-sm)] border border-line bg-surface-sunk p-3 text-sm text-ink outline-none transition focus:border-accent"
              required
            />
            <input
              type="password"
              placeholder="Contraseña"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="rounded-[var(--r-sm)] border border-line bg-surface-sunk p-3 text-sm text-ink outline-none transition focus:border-accent"
              required
            />
            {error && <p className="text-sm text-negative">{error}</p>}
            <button type="submit" className="pill-btn mt-2 justify-center">
              Ingresar
            </button>
            <button
              type="button"
              onClick={() => {
                setOlvide(true)
                setError(null)
              }}
              className="text-sm text-ink-faint transition hover:text-ink"
            >
              ¿Olvidaste tu contraseña?
            </button>
          </form>
          )}
        </div>
      </div>
    </main>
  )
}
