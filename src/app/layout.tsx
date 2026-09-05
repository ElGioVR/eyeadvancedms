import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'EyeAdvanced Medical Solutions',
  description: 'Sistema de Gestión Clínica Integral para Oftalmología',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
