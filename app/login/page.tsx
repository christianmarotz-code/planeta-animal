'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { PawIcon } from '@/components/Logo'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)

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
    <main className="flex min-h-[100dvh] items-center justify-center bg-page px-4">
      <div className="shell w-full max-w-sm rise">
        <div className="core">
          <div className="mb-7 flex flex-col items-center gap-4">
            <PawIcon className="h-14 w-14" />
            <div className="text-center">
              <p className="text-[11.5px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
                Bienvenido
              </p>
              <h1 className="mt-1 text-[22px] text-ink">Planeta Animal</h1>
            </div>
          </div>
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
          </form>
        </div>
      </div>
    </main>
  )
}
