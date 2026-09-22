import { buildReportHtml } from './prospect-report';
import { Prospect } from '../../shared/models/prospecting.model';

function prospect(extra: Partial<Prospect> = {}): Prospect {
  return {
    _id: 'p1', name: 'Acme', source: 'manual', fitScore: 80, status: 'new', notes: '', tags: [],
    createdAt: '', updatedAt: '',
    research: { state: 'done', pageSpeed: { mobile: { strategy: 'mobile', performance: 34, seo: 90, metrics: {}, opportunities: [] } } },
    material: {
      state: 'done',
      diagnosis: { score: 48, headline: 'Titular', areas: [{ area: 'Web', status: 'critical', score: 20, findings: ['Lenta'], recommendations: ['Optimizar'] }] },
      plan: { quickWins: ['Botón de agendar'], suggestedServices: [{ service: 'Agente IA', why: 'menos llamadas' }] },
      outreach: { email: 'CORREO INTERNO', whatsapp: 'WA INTERNO' },
    },
    ...extra,
  } as Prospect;
}

describe('buildReportHtml', () => {
  it('incluye diagnóstico, PageSpeed y plan', () => {
    const html = buildReportHtml(prospect());
    expect(html).toContain('<h1>Acme</h1>');
    expect(html).toContain('Titular');
    expect(html).toContain('<td>Rendimiento</td><td>34</td><td>—</td>');
    expect(html).toContain('class="pill critical"');
    expect(html).toContain('<li>Botón de agendar</li>');
    expect(html).toContain('<strong>Agente IA</strong>');
  });

  it('no incluye los mensajes de venta internos', () => {
    const html = buildReportHtml(prospect());
    expect(html).not.toContain('CORREO INTERNO');
    expect(html).not.toContain('WA INTERNO');
  });

  it('escapa el contenido que viene de la web o de la IA', () => {
    const html = buildReportHtml(prospect({
      name: '<img src=x onerror=alert(1)>',
      material: {
        state: 'done',
        diagnosis: { headline: '<script>robar()</script>', areas: [{ area: 'A"><b>', status: '"><svg onload=x>' as never, findings: ['<i>f</i>'] }] },
      },
    }));
    expect(html).not.toContain('<img src=x');
    expect(html).not.toContain('<script>robar');
    expect(html).not.toContain('<svg onload');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).toContain('&lt;i&gt;f&lt;/i&gt;');
    // El único script es el de imprimir.
    expect(html.match(/<script>/g)?.length).toBe(1);
  });
});
