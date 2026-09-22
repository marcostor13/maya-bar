import { Prospect } from '../../shared/models/prospecting.model';

const esc = (v: unknown) =>
  String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);

const list = (items?: string[]) =>
  items?.length ? `<ul>${items.map(i => `<li>${esc(i)}</li>`).join('')}</ul>` : '';

const STATUS_LABEL: Record<string, string> = { good: 'Bien', warning: 'Mejorable', critical: 'Crítico' };

/**
 * Informe del diagnóstico listo para imprimir o guardar como PDF. Es un
 * documento aparte, pensado para entregárselo al prospecto: no incluye los
 * mensajes de venta ni notas internas.
 */
export function buildReportHtml(p: Prospect): string {
  const d = p.material.diagnosis ?? {};
  const plan = p.material.plan ?? {};
  const ps = p.research.pageSpeed;
  const date = new Date(p.material.generatedAt ?? Date.now()).toLocaleDateString('es-PE', { day: 'numeric', month: 'long', year: 'numeric' });
  const scoreRow = (label: string, m?: number, dk?: number) =>
    `<tr><td>${label}</td><td>${m ?? '—'}</td><td>${dk ?? '—'}</td></tr>`;

  return `<!doctype html><html lang="es"><head><meta charset="utf-8">
<title>Diagnóstico digital — ${esc(p.name)}</title>
<style>
  @page { margin: 18mm; }
  body { font-family: Inter, -apple-system, Segoe UI, Roboto, sans-serif; color: #111827; line-height: 1.55; font-size: 13px; margin: 0; }
  h1, h2, h3 { font-family: Poppins, Inter, sans-serif; margin: 0; }
  .cover { padding: 28px 0 20px; border-bottom: 3px solid #E11D48; margin-bottom: 24px; }
  .eyebrow { font-size: 11px; text-transform: uppercase; letter-spacing: .12em; color: #E11D48; font-weight: 700; }
  .cover h1 { font-size: 28px; margin: 8px 0 4px; }
  .muted { color: #6B7280; }
  .score { display: inline-block; font: 700 34px Poppins, sans-serif; color: #E11D48; }
  h2 { font-size: 18px; margin: 28px 0 10px; }
  .headline { font-size: 16px; font-weight: 600; margin: 8px 0; }
  .area { border: 1px solid #E5E7EB; border-radius: 12px; padding: 14px 16px; margin-bottom: 12px; page-break-inside: avoid; }
  .area-head { display: flex; justify-content: space-between; align-items: center; }
  .pill { font-size: 11px; font-weight: 700; padding: 3px 10px; border-radius: 999px; }
  .good { background: #ECFDF5; color: #047857; } .warning { background: #FFFBEB; color: #B45309; } .critical { background: #FEF2F2; color: #B91C1C; }
  .cols { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  h3 { font-size: 12px; text-transform: uppercase; letter-spacing: .06em; color: #6B7280; margin: 10px 0 4px; }
  ul { margin: 4px 0; padding-left: 18px; } li { margin: 3px 0; }
  table { border-collapse: collapse; width: 100%; margin-top: 6px; }
  td, th { border-bottom: 1px solid #E5E7EB; padding: 6px 8px; text-align: left; }
  .init { margin-bottom: 10px; page-break-inside: avoid; }
  .tags { font-size: 11px; color: #6B7280; }
</style></head><body>
<div class="cover">
  <div class="eyebrow">Diagnóstico de presencia digital</div>
  <h1>${esc(p.name)}</h1>
  <div class="muted">${esc([p.industry, p.address].filter(Boolean).join(' · '))}</div>
  <div class="muted">${esc(date)}</div>
</div>

<div><span class="score">${esc(d.score ?? '—')}</span><span class="muted"> / 100</span></div>
${d.headline ? `<p class="headline">${esc(d.headline)}</p>` : ''}
${d.summary ? `<p>${esc(d.summary)}</p>` : ''}

${ps && (ps.mobile || ps.desktop) ? `<h2>Rendimiento web (Google PageSpeed)</h2>
<table><tr><th></th><th>Móvil</th><th>Escritorio</th></tr>
${scoreRow('Rendimiento', ps.mobile?.performance, ps.desktop?.performance)}
${scoreRow('SEO', ps.mobile?.seo, ps.desktop?.seo)}
${scoreRow('Accesibilidad', ps.mobile?.accessibility, ps.desktop?.accessibility)}
${scoreRow('Buenas prácticas', ps.mobile?.bestPractices, ps.desktop?.bestPractices)}
</table>` : ''}

${d.areas?.length ? `<h2>Análisis por área</h2>${d.areas.map(a => `
<div class="area">
  <div class="area-head"><strong>${esc(a.area)}</strong>
    <span class="pill ${esc(a.status ?? 'warning')}">${esc(STATUS_LABEL[a.status ?? ''] ?? '')} ${a.score !== undefined ? `· ${esc(a.score)}/100` : ''}</span></div>
  <div class="cols">
    <div><h3>Hallazgos</h3>${list(a.findings)}</div>
    <div><h3>Recomendaciones</h3>${list(a.recommendations)}</div>
  </div>
</div>`).join('')}` : ''}

${plan.vision || plan.quickWins?.length || plan.initiatives?.length ? `<h2>Plan de mejora</h2>
${plan.vision ? `<p>${esc(plan.vision)}</p>` : ''}
${plan.quickWins?.length ? `<h3>Mejoras rápidas</h3>${list(plan.quickWins)}` : ''}
${plan.initiatives?.length ? `<h3>Iniciativas</h3>${plan.initiatives.map(i => `
<div class="init"><strong>${esc(i.title)}</strong>
<div class="tags">Impacto ${esc(i.impact ?? '—')} · Esfuerzo ${esc(i.effort ?? '—')} · ${esc(i.timeline ?? '')}</div>
<div>${esc(i.description ?? '')}</div></div>`).join('')}` : ''}
${plan.kpis?.length ? `<h3>Cómo medir el avance</h3>${list(plan.kpis)}` : ''}
${plan.extraIdeas?.length ? `<h3>Ideas adicionales</h3>${list(plan.extraIdeas)}` : ''}
${plan.suggestedServices?.length ? `<h3>Cómo podemos ayudar</h3><ul>${plan.suggestedServices.map(s => `<li><strong>${esc(s.service)}</strong>: ${esc(s.why ?? '')} ${s.outcome ? `— ${esc(s.outcome)}` : ''}</li>`).join('')}</ul>` : ''}
` : ''}
<script>window.onload = () => setTimeout(() => window.print(), 300);</script>
</body></html>`;
}
