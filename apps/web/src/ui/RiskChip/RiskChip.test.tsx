import { render } from '@solidjs/testing-library';
import { describe, expect, it } from 'vitest';
import { setLang } from '../../i18n';
import { RiskChip } from './RiskChip';

describe('RiskChip', () => {
  it('cada nivel tiene texto y forma propios, no solo color', () => {
    setLang('es');
    const shapes = new Set<string>();
    for (const level of [0, 1, 2, 3, 'unknown'] as const) {
      const { container, unmount } = render(() => <RiskChip level={level} />);
      expect(container.textContent).toBe(
        ['Sin riesgo', 'Precaución', 'Alto', 'Severo'][level as number] ?? 'Sin datos',
      );
      shapes.add(container.querySelector('path')?.getAttribute('d') ?? '');
      unmount();
    }
    expect(shapes.size).toBe(5);
  });

  it('en modo compacto el texto sigue disponible para lectores de pantalla', () => {
    const { container } = render(() => <RiskChip level={2} compact />);
    expect(container.querySelector('.visually-hidden')?.textContent).toBe('Alto');
  });
});
