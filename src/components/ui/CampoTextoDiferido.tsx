'use client';

import { memo, useEffect, useRef, useState, type InputHTMLAttributes, type TextareaHTMLAttributes } from 'react';

type Comunes = {
  value: string;
  /** Se llama con retraso al teclear y siempre al salir del campo. */
  onValueChange: (v: string) => void;
  retrasoMs?: number;
};

type Props =
  | (Comunes & { multilinea: true } & Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange'>)
  | (Comunes & { multilinea?: false } & Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>);

/**
 * Campo de texto con estado local: escribir solo repinta este campo, no el
 * formulario completo (en «Nueva cirugía» cada tecla repintaba ~1 900 líneas
 * de JSX). El valor llega al formulario con un pequeño retraso y, sin falta,
 * al perder el foco (pulsar «Guardar» desenfoca el campo antes del clic).
 */
function CampoTextoDiferido(props: Props) {
  const { value, onValueChange, retrasoMs = 250, multilinea, onBlur, ...resto } = props as Comunes & {
    multilinea?: boolean;
    onBlur?: (e: React.FocusEvent<HTMLInputElement & HTMLTextAreaElement>) => void;
  } & Record<string, unknown>;
  const [texto, setTexto] = useState(value);
  const enviado = useRef(value);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Cambio desde fuera (borrador recuperado, precarga, limpiar): sincroniza.
  useEffect(() => {
    if (value !== enviado.current) {
      enviado.current = value;
      setTexto(value);
    }
  }, [value]);

  const enviar = (v: string) => {
    clearTimeout(timer.current);
    if (v === enviado.current) return;
    enviado.current = v;
    onValueChange(v);
  };

  useEffect(() => () => clearTimeout(timer.current), []);

  const cambiar = (v: string) => {
    setTexto(v);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => enviar(v), retrasoMs);
  };

  if (multilinea) {
    return (
      <textarea
        {...(resto as TextareaHTMLAttributes<HTMLTextAreaElement>)}
        value={texto}
        onChange={(e) => cambiar(e.target.value)}
        onBlur={(e) => {
          enviar(e.target.value);
          onBlur?.(e as React.FocusEvent<HTMLInputElement & HTMLTextAreaElement>);
        }}
      />
    );
  }
  return (
    <input
      {...(resto as InputHTMLAttributes<HTMLInputElement>)}
      value={texto}
      onChange={(e) => cambiar(e.target.value)}
      onBlur={(e) => {
        enviar(e.target.value);
        onBlur?.(e as React.FocusEvent<HTMLInputElement & HTMLTextAreaElement>);
      }}
    />
  );
}

export default memo(CampoTextoDiferido);
