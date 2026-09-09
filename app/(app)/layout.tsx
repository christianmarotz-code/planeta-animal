import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Logo } from '@/components/Logo'

const LINKS = [
  { href: '/', label: 'Inicio' },
  { href: '/proveedores', label: 'Proveedores' },
  { href: '/productos', label: 'Productos' },
  { href: '/compras', label: 'Compras' },
  { href: '/stock', label: 'Stock' },
  { href: '/reportes', label: 'Reportes' },
]

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  return (
    <div className="min-h-screen bg-page">
      <div className="sticky top-0 z-20 px-4 pt-4 sm:px-6">
        <nav className="mx-auto flex max-w-6xl flex-wrap items-center gap-1 rounded-full bg-accent-ink px-3 py-2 text-white shadow-[var(--shadow-frame)]">
          <Link href="/" className="mr-2 flex items-center pl-1">
            <Logo />
          </Link>
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-full px-3.5 py-1.5 text-[13.5px] font-medium text-white/75 transition-colors duration-300 hover:bg-white/10 hover:text-white"
            >
              {link.label}
            </Link>
          ))}
          <form action="/api/auth/signout" method="post" className="ml-auto">
            <button
              type="submit"
              className="rounded-full px-3.5 py-1.5 text-[13.5px] font-medium text-white/50 transition-colors duration-300 hover:bg-white/10 hover:text-white"
            >
              Cerrar sesión
            </button>
          </form>
        </nav>
      </div>
      <main>{children}</main>
    </div>
  )
}
