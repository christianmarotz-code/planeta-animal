'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { PawIcon } from '@/components/Logo'

const MENSAJE_VENCIDO =
  'El link venció o ya se usó. Pedí uno nuevo con "¿Olvidaste tu contraseña?" o que te inviten de nuevo.'

const INPUT_CLASS =
  'rounded-[var(--r-sm)] border border-line bg-surface-sunk p-3 text-sm text-ink outline-none transition focus:border-accent'

export default function ElegirContrasenaPage() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirmacion, setConfirmacion] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- el hash solo se puede leer en el navegador
    if (window.location.hash.includes('error_code=otp_expired')) setError(MENSAJE_VENCIDO)
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (password.length < 8) return setError('La contraseña tiene que tener al menos 8 caracteres.')
    if (password !== confirmacion) return setError('Las contraseñas no coinciden.')
    const supabase = createClient()
    const { data } = await supabase.auth.getSession()
    if (!data.session) return setError(MENSAJE_VENCIDO)
    const { error } = await supabase.auth.updateUser({ password })
    if (error) return setError('No se pudo guardar la contraseña. Intentá de nuevo.')
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
                Tu cuenta
              </p>
              <h1 className="mt-1 text-[22px] text-ink">Elegí tu contraseña</h1>
            </div>
          </div>
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <input
              type="password"
              placeholder="Contraseña nueva (mínimo 8 caracteres)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={INPUT_CLASS}
              required
            />
            <input
              type="password"
              placeholder="Repetí la contraseña"
              value={confirmacion}
              onChange={(e) => setConfirmacion(e.target.value)}
              className={INPUT_CLASS}
              required
            />
            {error && <p className="text-sm text-negative">{error}</p>}
            <button type="submit" className="pill-btn mt-2 justify-center">
              Guardar y entrar
            </button>
          </form>
        </div>
      </div>
    </main>
  )
}
