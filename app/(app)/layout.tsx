import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  return (
    <div className="min-h-screen">
      <nav className="flex flex-wrap gap-4 border-b p-4">
        <Link href="/proveedores">Proveedores</Link>
        <Link href="/productos">Productos</Link>
        <Link href="/compras">Compras</Link>
        <Link href="/stock">Stock</Link>
        <Link href="/reportes">Reportes</Link>
        <form action="/api/auth/signout" method="post" className="ml-auto">
          <button type="submit" className="text-sm text-slate-500">
            Cerrar sesión
          </button>
        </form>
      </nav>
      <main className="p-4">{children}</main>
    </div>
  )
}
