import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
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
