import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// CSP en modo Report-Only: reporta en la consola del navegador lo que bloquearía, sin bloquear nada.
// Para activarla, cambiar NOMBRE_HEADER_CSP a 'Content-Security-Policy' una vez que la consola quede limpia.
const NOMBRE_HEADER_CSP = 'Content-Security-Policy-Report-Only'

function construirCsp(nonce: string): string {
  const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
  const supabaseWs = supabase.replace(/^https:/, 'wss:')
  const dev = process.env.NODE_ENV !== 'production' ? " 'unsafe-eval'" : ''
  return [
    `default-src 'self'`,
    // wasm-unsafe-eval: heic-to decodifica fotos HEIC con WebAssembly.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' 'wasm-unsafe-eval'${dev}`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data: blob: ${supabase}`,
    `font-src 'self' data:`,
    `connect-src 'self' blob: data: ${supabase} ${supabaseWs}`,
    `frame-src 'self' blob: ${supabase}`,
    `worker-src 'self' blob:`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `frame-ancestors 'none'`,
  ].join('; ')
}

export async function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64')
  const csp = construirCsp(nonce)
  // Next lee el nonce del header de CSP del request para ponérselo a sus propios scripts;
  // x-nonce es para el script en línea de app/layout.tsx.
  const headersConNonce = new Headers(request.headers)
  headersConNonce.set('x-nonce', nonce)
  headersConNonce.set(NOMBRE_HEADER_CSP, csp)

  let response = NextResponse.next({ request: { headers: headersConNonce } })
  response.headers.set(NOMBRE_HEADER_CSP, csp)

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          // Las cookies renovadas tienen que llegar también a lo que sigue (páginas y route handlers).
          headersConNonce.set('cookie', request.headers.get('cookie') ?? '')
          response = NextResponse.next({ request: { headers: headersConNonce } })
          response.headers.set(NOMBRE_HEADER_CSP, csp)
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const isAuthRoute = request.nextUrl.pathname === '/login'
  // Pantalla de los links de invitación y recuperación: la sesión viene en el #hash,
  // así que tiene que ser accesible con o sin otra sesión abierta.
  const isLinkDeMailRoute = request.nextUrl.pathname === '/elegir-contrasena'

  if (isLinkDeMailRoute) return response
  if (!user && !isAuthRoute) {
    return NextResponse.redirect(new URL('/login', request.url))
  }
  if (user && isAuthRoute) {
    return NextResponse.redirect(new URL('/', request.url))
  }

  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon\\.ico|icon\\.png|apple-icon\\.png|branding/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
