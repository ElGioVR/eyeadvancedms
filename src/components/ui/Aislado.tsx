'use client';

import { Component, type ErrorInfo, type ReactNode } from 'react';
import { reportarError } from '@/lib/monitoreo-cliente';
import { AlertTriangle } from 'lucide-react';

interface Props {
  children: ReactNode;
  /** Qué se dejó de mostrar («la gráfica», «el calendario»…). */
  nombre?: string;
  /** Etiqueta para el monitoreo. */
  contexto?: string;
  /** Fallback propio (opcional). */
  fallback?: ReactNode;
  className?: string;
}

interface Estado {
  error: Error | null;
}

/**
 * Error Boundary para widgets: si una gráfica, el calendario o un escáner
 * fallan al renderizar, solo ese bloque muestra un aviso con «Reintentar»;
 * el resto de la pantalla sigue funcionando.
 */
export default class Aislado extends Component<Props, Estado> {
  state: Estado = { error: null };

  static getDerivedStateFromError(error: Error): Estado {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    reportarError(error, { boundary: this.props.contexto || 'widget' }, { componentStack: info.componentStack?.slice(0, 2000) ?? '' });
  }

  reintentar = () => this.setState({ error: null });

  render() {
    if (!this.state.error) return this.props.children;
    if (this.props.fallback) return this.props.fallback;
    return (
      <div
        role="alert"
        className={`flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-line bg-surface p-6 text-center ${this.props.className ?? ''}`}
      >
        <AlertTriangle className="h-5 w-5 text-amber-500" aria-hidden />
        <p className="text-sm font-semibold text-fg">No se pudo mostrar {this.props.nombre || 'este bloque'}</p>
        <button onClick={this.reintentar} className="text-sm font-bold text-primary-600 hover:underline">
          Reintentar
        </button>
      </div>
    );
  }
}
