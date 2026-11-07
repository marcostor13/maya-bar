import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import {
  AgentCalendarSection, agentCalendarPayload, blankAgentCalendar, normalizeAgentCalendar,
} from './agent-calendar-section';
import { CalendarService } from '../../shared/calendar.service';

const mockCalendar = { connections: vi.fn() };

describe('AgentCalendarSection', () => {
  let fixture: ComponentFixture<AgentCalendarSection>;
  let component: AgentCalendarSection;
  const text = () => (fixture.nativeElement as HTMLElement).textContent ?? '';

  async function create(connections: unknown[] = [], provider = 'auto', enabled = true) {
    mockCalendar.connections.mockReturnValue(of({ available: { google: true, microsoft: true }, connections }));
    await TestBed.configureTestingModule({
      imports: [AgentCalendarSection],
      providers: [provideRouter([]), { provide: CalendarService, useValue: mockCalendar }],
    }).compileComponents();
    fixture = TestBed.createComponent(AgentCalendarSection);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('config', { ...blankAgentCalendar(), enabled });
    fixture.componentRef.setInput('provider', provider);
    fixture.detectChanges();
  }

  beforeEach(() => vi.clearAllMocks());

  it('lista los calendarios conectados y el predeterminado', async () => {
    await create([{ _id: 'c1', provider: 'google', email: 'agenda@acme.pe', isDefault: true }]);
    expect(mockCalendar.connections).toHaveBeenCalled();
    expect(text()).toContain('Predeterminado de la empresa (agenda@acme.pe)');
    expect(text()).toContain('Google · agenda@acme.pe');
    expect(text()).not.toContain('No hay calendarios conectados');
  });

  it('avisa si no hay calendarios conectados', async () => {
    await create([]);
    expect(text()).toContain('No hay calendarios conectados');
  });

  it('avisa que Gemini no puede agendar', async () => {
    await create([], 'gemini');
    expect(text()).toContain('Gemini no ejecuta herramientas');
  });

  it('desactivado solo muestra el interruptor', async () => {
    await create([], 'auto', false);
    expect(text()).not.toContain('Horario de atención');
  });

  it('activa y desactiva días y cambia horas del horario', async () => {
    await create();
    expect(component.franja(6)).toBeUndefined();
    component.toggleDay(6);
    expect(component.franja(6)).toEqual({ day: 6, start: '09:00', end: '18:00' });
    component.setTime(6, 'end', '13:00');
    expect(component.franja(6)?.end).toBe('13:00');
    component.toggleDay(1);
    expect(component.franja(1)).toBeUndefined();
    component.patch({ durationMinutes: 45 });
    expect(component.config().durationMinutes).toBe(45);
  });

  it('normaliza lo que viene del servidor y no envía connectionId vacío', () => {
    const n = normalizeAgentCalendar({ enabled: true, hours: [{ day: 2, start: '10:00', end: '12:00', _id: 'x' } as never] });
    expect(n.hours).toEqual([{ day: 2, start: '10:00', end: '12:00' }]);
    expect(n.timeZone).toBe('America/Lima');
    expect(normalizeAgentCalendar(undefined).enabled).toBe(false);
    expect('connectionId' in agentCalendarPayload(n)).toBe(false);
    expect(agentCalendarPayload({ ...n, connectionId: 'c1' }).connectionId).toBe('c1');
  });
});
