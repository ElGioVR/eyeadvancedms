import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import { ThemeProvider } from 'next-themes';
import Script from 'next/script';
import SWRProvider from '@/components/providers/SWRProvider';
import MonitoreoCliente from '@/components/providers/MonitoreoCliente';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-inter',
});

export const metadata: Metadata = {
  title: 'EyeAdvanced Medical Solutions',
  description: 'Sistema de Gestión Clínica Integral para Oftalmología',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'EyeAdvanced',
  },
  formatDetection: {
    telephone: false,
  },
  other: {
    'apple-mobile-web-app-capable': 'yes',
    'apple-mobile-web-app-status-bar-style': 'black-translucent',
    'apple-mobile-web-app-title': 'EyeAdvanced',
  },
};

export const viewport: Viewport = {
  themeColor: '#174c78',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" sizes="180x180" />
        <link rel="icon" type="image/png" sizes="192x192" href="/icons/icon-192.png" />
        <link rel="icon" type="image/png" sizes="512x512" href="/icons/icon-512.png" />
      </head>
      <body className={`${inter.variable} font-sans`}>
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false} storageKey="theme">
          <SWRProvider>{children}</SWRProvider>
          <MonitoreoCliente />
        </ThemeProvider>
        {process.env.NODE_ENV === 'production' ? (
          <Script id="sw-register" strategy="afterInteractive">
            {`
              if ('serviceWorker' in navigator) {
                window.addEventListener('load', function() {
                  navigator.serviceWorker.register('/sw.js').then(
                    function(registration) {
                      console.log('SW registered:', registration.scope);
                    },
                    function(err) {
                      console.log('SW registration failed:', err);
                    }
                  );
                });
              }
            `}
          </Script>
        ) : (
          // Desarrollo: los chunks de /_next/static no llevan hash y el SW los servía
          // desde caché (TypeError "reading 'call'" tras cambiar código). Se da de baja
          // cualquier SW previo y se purga su caché. Script inline: corre aunque el
          // runtime de Next esté roto por chunks viejos.
          <script
            id="sw-unregister-dev"
            dangerouslySetInnerHTML={{
              __html: `if ('serviceWorker' in navigator) { navigator.serviceWorker.getRegistrations().then(function (rs) { if (!rs.length) return; Promise.all(rs.map(function (r) { return r.unregister(); })).then(function () { return window.caches ? caches.keys().then(function (ks) { return Promise.all(ks.map(function (k) { return caches.delete(k); })); }) : null; }).then(function () { location.reload(); }); }); }`,
            }}
          />
        )}
      </body>
    </html>
  );
}
