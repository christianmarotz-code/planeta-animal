import type { NextConfig } from "next";

// Sin Content-Security-Policy a propósito: Next inyecta scripts en línea y una CSP estricta
// exige nonces por request, lo que rompería el render estático. Estos headers no tienen ese costo.
const headersDeSeguridad = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
  { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=()' },
]

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: '/:path*', headers: headersDeSeguridad }]
  },
  serverExternalPackages: ["pdfjs-dist"],
  // pdfjs-dist carga su "fake worker" en Node con un import() dinámico cuyo
  // argumento es una ruta calculada en runtime (no un string literal), que
  // el file tracer de Vercel/Next no puede seguir estáticamente — sin esto,
  // el worker queda afuera del bundle serverless y /api/comparador/leer-pdf
  // funciona en local pero falla en producción con "Setting up fake worker
  // failed: Cannot find module ./pdf.worker.mjs".
  outputFileTracingIncludes: {
    "/api/comparador/leer-pdf": ["./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs"],
  },
};

export default nextConfig;
