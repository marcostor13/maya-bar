import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { signal } from '@angular/core';
import { DashboardComponent } from './dashboard';
import { AuthService } from '../../auth/auth.service';
import { PermissionsService } from '../../auth/permissions.service';
import type { DashboardAnalytics } from '../../shared/models/analytics.model';

const kpi = (value: number, previous = 0) => ({ value, previous, delta: previous ? 50 : null, series: [0, value] });

function sample(): DashboardAnalytics {
  return {
    range: { key: '30d', from: '', to: '', bucket: 'day', buckets: ['2026-09-22', '2026-09-23'], timezone: 'America/Lima' },
    channel: null,
    kpis: {
      wonValue: kpi(3000, 2000), wonDeals: kpi(3), newContacts: kpi(8, 4), newConversations: kpi(4),
      inbound: kpi(15, 10), aiShare: kpi(75, 50), newLeads: kpi(6), conversionRate: kpi(75),
    },
    pipeline: { open: 5, openValue: 3000, weightedValue: 1400 },
    activity: { inbound: [10, 5], ai: [0, 6], human: [0, 2] },
    heatmap: Array.from({ length: 7 }, () => Array(24).fill(0)),
    response: { medianMinutes: 2, p90Minutes: 5, withinFiveMinutes: 90, aiMedianMinutes: 1, humanMedianMinutes: 30, answered: 10, unanswered: 1 },
    channels: [{ key: 'whatsapp', label: 'WhatsApp', count: 12 }],
    sources: [], funnel: [{ key: 'new', label: 'Nuevo', count: 4, value: 1000, color: '', probability: 10 }],
    outcomes: { won: 3, lost: 1, lostSeries: [0, 1], lostReasons: [] },
    agents: [{ id: 'a', name: 'Asistente', replies: 6, conversations: 2, handoffs: 1 }],
    marketing: {
      campaigns: { sent: 1, recipients: 50, byType: [] }, recovery: { sent: 0, failed: 0 },
      forms: { submissions: 0, top: [] }, events: { registrations: 0, attendees: 0, checkedIn: 0 }, suppression: { added: 0 },
    },
    prospecting: { found: 0, researched: 0, withMaterial: 0, contacted: 0, converted: 0 },
    tags: [], alerts: { overdueTasks: 2, unread: 0, escalated: 0 },
  };
}

describe('DashboardComponent', () => {
  let fixture: ComponentFixture<DashboardComponent>;
  let http: HttpTestingController;
  const text = () => (fixture.nativeElement as HTMLElement).textContent ?? '';

  beforeEach(async () => {
    try { localStorage.removeItem('dashboard.filters'); } catch { /* */ }
    await TestBed.configureTestingModule({
      imports: [DashboardComponent],
      providers: [
        provideHttpClient(), provideHttpClientTesting(), provideRouter([]),
        { provide: AuthService, useValue: { currentUser: signal({ name: 'Ana Pérez', email: 'a@b.c' }) } },
        { provide: PermissionsService, useValue: { can: () => true } },
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(DashboardComponent);
    fixture.detectChanges();
  });

  afterEach(() => http.verify());

  it('pide la analítica del periodo y pinta los KPIs', () => {
    const req = http.expectOne((r) => r.url.endsWith('/dashboard/analytics'));
    expect(req.request.params.get('range')).toBe('30d');
    expect(req.request.params.get('tz')).toBeTruthy();
    expect(req.request.params.has('channel')).toBe(false);
    req.flush(sample());
    fixture.detectChanges();
    expect(text()).toContain('Ana');
    expect(text()).toContain('2 seguimientos vencidos');
    expect(text()).toContain('Contactos nuevos');
    expect(text()).toContain('Asistente');
    expect(text()).toContain('Embudo de oportunidades');
  });

  it('cambiar filtros vuelve a pedir, guarda la preferencia y descarta respuestas viejas', () => {
    const first = http.expectOne((r) => r.url.endsWith('/dashboard/analytics'));
    const c = fixture.componentInstance;
    c.setRange('7d');
    c.setChannel('email');
    const reqs = http.match((r) => r.url.endsWith('/dashboard/analytics'));
    expect(reqs).toHaveLength(2);
    const last = reqs[1];
    expect(last.request.params.get('range')).toBe('7d');
    expect(last.request.params.get('channel')).toBe('email');
    last.flush({ ...sample(), channel: 'email' });
    first.flush(sample());
    reqs[0].flush(sample());
    expect(c.data()?.channel).toBe('email');
    expect(JSON.parse(localStorage.getItem('dashboard.filters') ?? '{}')).toEqual({ range: '7d', channel: 'email' });
  });

  it('muestra el error con reintento', () => {
    http.expectOne((r) => r.url.endsWith('/dashboard/analytics')).flush({ message: 'Caído' }, { status: 500, statusText: 'x' });
    fixture.detectChanges();
    expect(text()).toContain('Caído');
    fixture.componentInstance.load();
    http.expectOne((r) => r.url.endsWith('/dashboard/analytics')).flush(sample());
  });
});
