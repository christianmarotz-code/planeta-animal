import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Logo } from '@/components/Logo'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  return (
    <div className="min-h-screen">
      <nav className="flex flex-wrap items-center gap-5 bg-brand-dark px-4 py-3 text-sm text-white">
        <Link href="/">
          <Logo />
        </Link>
        <Link href="/" className="transition hover:text-brand-orange">
          Inicio
        </Link>
        <Link href="/proveedores" className="transition hover:text-brand-orange">
          Proveedores
        </Link>
        <Link href="/productos" className="transition hover:text-brand-orange">
          Productos
        </Link>
        <Link href="/compras" className="transition hover:text-brand-orange">
          Compras
        </Link>
        <Link href="/stock" className="transition hover:text-brand-orange">
          Stock
        </Link>
        <Link href="/reportes" className="transition hover:text-brand-orange">
          Reportes
        </Link>
        <form action="/api/auth/signout" method="post" className="ml-auto">
          <button type="submit" className="text-sm text-gray-300 transition hover:text-brand-orange">
            Cerrar sesión
          </button>
        </form>
      </nav>
      <main className="p-4">{children}</main>
    </div>
  )
}
