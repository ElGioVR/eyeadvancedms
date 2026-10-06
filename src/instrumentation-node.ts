import * as Sentry from '@sentry/nextjs';
import { opcionesSentry } from './lib/sentry-privacidad';

/** Solo se carga en el runtime de Node (ver instrumentation.ts). */
export function iniciarSentryServidor() {
  Sentry.init(opcionesSentry());
}

export const capturarErrorDePeticion = Sentry.captureRequestError;
