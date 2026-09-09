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
    router.push('/proveedores')
    router.refresh()
  }

  return (
    <main className="mx-auto mt-24 max-w-sm p-4">
      <div className="mb-6 flex flex-col items-center gap-3">
        <PawIcon className="h-16 w-16" />
        <h1 className="text-xl font-semibold text-brand-dark">Planeta Animal</h1>
      </div>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="rounded border p-2 focus:border-brand-orange focus:outline-none"
          required
        />
        <input
          type="password"
          placeholder="Contraseña"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="rounded border p-2 focus:border-brand-orange focus:outline-none"
          required
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          className="rounded bg-brand-orange p-2 font-semibold text-brand-dark transition hover:brightness-95"
        >
          Ingresar
        </button>
      </form>
    </main>
  )
}
