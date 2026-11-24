import { Component, OnInit, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { DatePipe } from '@angular/common';
import { LucideAngularModule, ClipboardCheck, Mail, Phone } from 'lucide-angular';
import { ToastService } from '../../shared/toast';
import { environment } from '../../../environments/environment';

export interface OnboardingTask {
  _id: string;
  sessionPublicId: string;
  packageName: string;
  plan: string;
  period: string;
  status: 'pending' | 'scheduled' | 'in_progress' | 'done';
  contact: { company: string; name: string; email: string; phone?: string };
  checklist: { label: string; done: boolean }[];
  notes?: string;
  paidAt?: string;
  createdAt?: string;
}

const STATUS: { id: OnboardingTask['status']; label: string; tone: string }[] = [
  { id: 'pending', label: 'Por agendar', tone: 'warning' },
  { id: 'scheduled', label: 'Agendada', tone: 'info' },
  { id: 'in_progress', label: 'En curso', tone: 'info' },
  { id: 'done', label: 'Terminada', tone: 'success' },
];

/** Superadmin: implementaciones pagadas por hacer (HU55). */
@Component({
  selector: 'app-admin-onboarding',
  standalone: true,
  imports: [DatePipe, LucideAngularModule],
  template: `
    <div class="page animate-fade-in">
      <div class="page-header">
        <div>
          <h1>Implementaciones</h1>
          <p class="subtitle">Puestas en marcha e implementaciones Pro pagadas, con su contacto y lo que hay que dejar listo.</p>
        </div>
      </div>

      <div class="pills" role="radiogroup" aria-label="Estado">
        <button type="button" class="pill" role="radio" [attr.aria-checked]="filter() === ''" [class.active]="filter() === ''" (click)="setFilter('')">Todas</button>
        @for (s of statuses; track s.id) {
          <button type="button" class="pill" role="radio" [attr.aria-checked]="filter() === s.id" [class.active]="filter() === s.id" (click)="setFilter(s.id)">{{ s.label }}</button>
        }
      </div>

      @if (loading()) {
        <p class="muted">Cargando…</p>
      } @else if (!tasks().length) {
        <div class="card empty">
          <lucide-icon [img]="ClipboardCheck" [size]="32" />
          <p>No hay implementaciones {{ filter() ? 'en este estado' : 'todavía' }}.</p>
        </div>
      } @else {
        <div class="list">
          @for (t of tasks(); track t._id) {
            <article class="card task" [attr.data-task]="t._id">
              <div class="task-head">
                <div>
                  <h2>{{ t.contact.company }}</h2>
                  <p class="muted small">{{ t.packageName }} · plan {{ t.plan }} ({{ periodLabel(t.period) }}) · pagada el {{ t.paidAt | date: 'd MMM y' }}</p>
                </div>
                <select class="select status" (change)="setStatus(t, $any($event.target).value)" aria-label="Estado de la implementación">
                  @for (s of statuses; track s.id) { <option [value]="s.id" [selected]="s.id === t.status">{{ s.label }}</option> }
                </select>
              </div>
              <p class="contact small">
                {{ t.contact.name }} ·
                <a [href]="'mailto:' + t.contact.email"><lucide-icon [img]="Mail" [size]="13" /> {{ t.contact.email }}</a>
                @if (t.contact.phone) { · <a [href]="'tel:' + t.contact.phone"><lucide-icon [img]="Phone" [size]="13" /> {{ t.contact.phone }}</a> }
              </p>
              <p class="muted small">{{ doneCount(t) }} de {{ t.checklist.length }} pasos</p>
              <ul class="checklist">
                @for (c of t.checklist; track $index; let i = $index) {
                  <li>
                    <label>
                      <input type="checkbox" [checked]="c.done" (change)="toggle(t, i, $any($event.target).checked)" />
                      <span [class.done]="c.done">{{ c.label }}</span>
                    </label>
                  </li>
                }
              </ul>
              <label class="notes-label" [attr.for]="'notes-' + t._id">Notas</label>
              <textarea class="textarea" rows="2" [id]="'notes-' + t._id" [value]="t.notes ?? ''"
                placeholder="Fecha de la sesión, accesos pendientes…"
                (blur)="saveNotes(t, $any($event.target).value)"></textarea>
            </article>
          }
        </div>
      }
    </div>
  `,
  styles: [`
    .page { padding: 32px 40px; width: 100%; box-sizing: border-box; }
    .page-header { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 24px; }
    .page-header h1 { margin-bottom: 4px; font-size: 26px; font-family: var(--font-heading); }
    .subtitle { color: var(--color-text-muted); font-size: 14px; margin: 0; }
    .pills { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 20px; }
    .muted { color: var(--color-text-muted); margin: 0; }
    .small { font-size: 13px; }
    .empty { padding: 40px; display: flex; flex-direction: column; align-items: center; gap: 12px; color: var(--color-text-muted); text-align: center; }
    .list { display: grid; gap: 16px; }
    .task { padding: 24px; }
    .task-head { display: flex; justify-content: space-between; gap: 12px; align-items: flex-start; flex-wrap: wrap; }
    .task-head h2 { margin: 0 0 4px; font-size: 17px; font-family: var(--font-heading); }
    .status { width: auto; min-width: 160px; }
    .contact { margin: 12px 0 4px; display: flex; flex-wrap: wrap; gap: 4px; align-items: center; }
    .contact a { color: var(--color-brand); display: inline-flex; align-items: center; gap: 4px; }
    .checklist { list-style: none; padding: 0; margin: 12px 0 0; display: grid; gap: 8px; }
    .checklist label { display: flex; gap: 10px; align-items: flex-start; font-size: 14px; cursor: pointer; }
    .notes-label { display: block; margin: 16px 0 6px; font-size: 13px; font-weight: 600; color: var(--color-text-muted); }
    .checklist .done { color: var(--color-text-muted); text-decoration: line-through; }
    @media (max-width: 640px) { .page { padding: 20px 16px; } }
  `],
})
export class AdminOnboardingComponent implements OnInit {
  private http = inject(HttpClient);
  private toast = inject(ToastService);
  private api = `${environment.apiUrl}/billing/admin/onboarding`;
  readonly ClipboardCheck = ClipboardCheck;
  readonly Mail = Mail;
  readonly Phone = Phone;
  readonly statuses = STATUS;

  tasks = signal<OnboardingTask[]>([]);
  loading = signal(true);
  filter = signal<'' | OnboardingTask['status']>('');

  ngOnInit() { this.load(); }

  setFilter(f: '' | OnboardingTask['status']) { this.filter.set(f); this.load(); }

  load() {
    this.loading.set(true);
    const params: Record<string, string> = this.filter() ? { status: this.filter() } : {};
    this.http.get<OnboardingTask[]>(this.api, { params }).subscribe({
      next: r => { this.tasks.set(r); this.loading.set(false); },
      error: err => { this.loading.set(false); this.toast.error(err.error?.message || 'No se pudieron cargar las implementaciones'); },
    });
  }

  periodLabel(p: string) { return ({ monthly: 'mensual', quarterly: 'trimestral', annual: 'anual' } as Record<string, string>)[p] ?? p; }

  doneCount(t: OnboardingTask) { return t.checklist.filter(c => c.done).length; }

  private patch(t: OnboardingTask, body: object, ok: string) {
    this.http.patch<OnboardingTask>(`${this.api}/${t._id}`, body).subscribe({
      next: r => {
        // Con un filtro activo, la tarea que cambia de estado sale de la lista.
        const f = this.filter();
        this.tasks.update(list => (f && r.status !== f ? list.filter(x => x._id !== r._id) : list.map(x => (x._id === r._id ? r : x))));
        this.toast.success(ok);
      },
      error: err => { this.toast.error(err.error?.message || 'No se pudo guardar'); this.load(); },
    });
  }

  setStatus(t: OnboardingTask, status: OnboardingTask['status']) {
    this.patch(t, { status }, 'Estado actualizado');
  }

  saveNotes(t: OnboardingTask, notes: string) {
    if (notes === (t.notes ?? '')) return;
    this.patch(t, { notes }, 'Notas guardadas');
  }

  toggle(t: OnboardingTask, index: number, done: boolean) {
    this.patch(t, { checklist: [{ index, done }] }, done ? 'Paso hecho' : 'Paso pendiente');
  }
}
