/** Vista inicial de Seguimiento (HU36): lista en el móvil, la última elegida si la hay. */

const KEY = 'maya.leads.view';
export type LeadsView = 'board' | 'list';

export function initialLeadsView(
  mobile = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    && window.matchMedia('(max-width: 768px)').matches,
): LeadsView {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === 'board' || saved === 'list') return saved;
  } catch { /* sin almacenamiento */ }
  return mobile ? 'list' : 'board';
}

export function saveLeadsView(v: LeadsView): void {
  try { localStorage.setItem(KEY, v); } catch { /* sin almacenamiento */ }
}
