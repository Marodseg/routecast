import { createMemo, For } from 'solid-js';
import s from './Odometer.module.css';

/**
 * Cifra con efecto de contador: cada carácter que cambia «rueda» desde arriba (DESIGN §5.2). Solo `transform`/`opacity`;
 * con movimiento reducido el cambio es instantáneo (regla global de base.css). El lector de pantalla lee el valor entero.
 */
export function Odometer(props: { value: string; class?: string }) {
  const chars = createMemo(() => [...props.value]);
  return (
    <span class={`${s.odo} ${props.class ?? ''}`}>
      <span class="visually-hidden">{props.value}</span>
      <span aria-hidden="true" class={s.digits}>
        <For each={chars()}>
          {(ch) => (
            // La clave es el carácter: si cambia, Solid crea un nodo nuevo y se reproduce la animación de entrada.
            <span class={s.ch}>{ch}</span>
          )}
        </For>
      </span>
    </span>
  );
}
