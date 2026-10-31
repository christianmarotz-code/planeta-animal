import type { Metadata } from "next";
import { headers } from "next/headers";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Sistema Planeta Animal",
  description: "Panel de gestión de Planeta Animal",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // El proxy genera un nonce por request para la CSP; el script en línea de abajo lo necesita.
  const nonce = (await headers()).get("x-nonce") ?? undefined
  return (
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script
          nonce={nonce}
          dangerouslySetInnerHTML={{
            __html: `try{if(localStorage.getItem('tema')==='claro')document.documentElement.dataset.theme='light'}catch(e){}try{var h=location.hash;if(/type=(invite|recovery)|error_code=otp_expired/.test(h)&&location.pathname!=='/elegir-contrasena')location.replace('/elegir-contrasena'+h)}catch(e){}`,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
