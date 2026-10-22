import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const supabase = await createClient()
  await supabase.auth.signOut()
  // 303 y no el 307 por defecto: el 307 repetiría el POST contra /login, que solo acepta GET (405).
  return NextResponse.redirect(new URL('/login', request.url), 303)
}
