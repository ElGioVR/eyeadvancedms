const { withSentryConfig } = require('@sentry/nextjs/config');

/** @type {import('next').NextConfig} */
const isDev = process.env.NODE_ENV !== 'production';

// CSP: se mantiene en Report-Only hasta validar en producción que no hay
// violaciones (ver consola del navegador). Luego cambiar la clave a
// 'Content-Security-Policy' para aplicarla.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' blob: https://cdn.jsdelivr.net${isDev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.supabase.co",
  "font-src 'self' data:",
  // Supabase (REST + Realtime) y recursos de OCR de tesseract.js
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://cdn.jsdelivr.net https://tessdata.projectnaptha.com",
  "worker-src 'self' blob:",
  "media-src 'self' blob:",
  "manifest-src 'self'",
  "object-src 'none'",
  "frame-src 'none'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  ...(isDev ? [] : ['upgrade-insecure-requests']),
].join('; ');

const securityHeaders = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-DNS-Prefetch-Control', value: 'on' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  { key: 'X-Permitted-Cross-Domain-Policies', value: 'none' },
  { key: 'Content-Security-Policy-Report-Only', value: csp },
];

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false, // no anunciar "X-Powered-By: Next.js"
  compress: true,
  images: {
    formats: ['image/avif', 'image/webp'],
    minimumCacheTTL: 60 * 60 * 24 * 7,
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
      },
    ],
  },
  experimental: {
    // Tree-shaking de barrels grandes → bundles más pequeños
    optimizePackageImports: ['lucide-react', 'recharts', 'date-fns'],
    // Next 14: habilita src/instrumentation.ts (Sentry en servidor)
    instrumentationHook: true,
  },
  headers: async () => [
    {
      // Toda la API maneja datos clínicos/privados: nunca cachear en navegador/CDN
      source: '/api/:path*',
      headers: [
        { key: 'Cache-Control', value: 'private, no-store, max-age=0' },
        { key: 'Pragma', value: 'no-cache' },
      ],
    },
    {
      // Assets públicos estáticos: caché larga con revalidación en segundo plano
      source: '/:dir(images|icons)/:path*',
      headers: [
        { key: 'Cache-Control', value: 'public, max-age=604800, stale-while-revalidate=86400' },
      ],
    },
    {
      // El service worker debe revisarse en cada carga para recibir parches
      source: '/sw.js',
      headers: [
        { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
        { key: 'Service-Worker-Allowed', value: '/' },
      ],
    },
    {
      source: '/(.*)',
      headers: securityHeaders,
    },
  ],
};

// Sentry: sin NEXT_PUBLIC_SENTRY_DSN no envía nada. Los source maps solo se
// generan y suben si hay SENTRY_AUTH_TOKEN (y se borran tras subirlos para no
// publicarlos). `tunnelRoute` envía los eventos por el mismo dominio (no los
// bloquean los adblockers y no hay que abrir la CSP a sentry.io).
module.exports = withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI,
  telemetry: false,
  tunnelRoute: '/monitoring',
  widenClientFileUpload: true,
  webpack: {
    treeshake: { removeDebugLogging: true },
    // El middleware corre en cada navegación: sin instrumentar para que siga ligero.
    autoInstrumentMiddleware: false,
  },
  sourcemaps: {
    disable: !process.env.SENTRY_AUTH_TOKEN,
    deleteSourcemapsAfterUpload: true,
  },
});
