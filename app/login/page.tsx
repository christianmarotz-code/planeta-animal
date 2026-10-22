'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { PawIcon } from '@/components/Logo'

const INPUT_CLASS =
  'rounded-[var(--r-sm)] border border-line bg-surface-sunk p-3 text-sm text-ink outline-none transition focus:border-accent'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [olvide, setOlvide] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)

  async function handleOlvide(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setAviso(null)
    const supabase = createClient()
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/elegir-contrasena`,
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
                {olvide ? 'Recuperar acceso' : 'Bienvenido'}
              </p>
              <h1 className="mt-1 text-[22px] text-ink">
                {olvide ? 'Olvidé mi contraseña' : 'Planeta Animal'}
              </h1>
            </div>
          </div>
          {olvide ? (
            <form onSubmit={handleOlvide} className="flex flex-col gap-3">
              <input
                type="email"
                placeholder="Tu email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={INPUT_CLASS}
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
                className={INPUT_CLASS}
                required
              />
              <input
                type="password"
                placeholder="Contraseña"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={INPUT_CLASS}
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
