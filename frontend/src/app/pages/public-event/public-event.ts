import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { FormBuilder, Validators, ReactiveFormsModule } from '@angular/forms';
import { LucideAngularModule, Calendar, Clock, Tag, Users, Ticket, CheckCircle } from 'lucide-angular';

import { environment } from '../../../environments/environment';
const API = environment.apiUrl;

type FormFieldType = 'text' | 'textarea' | 'select' | 'checkbox' | 'number' | 'email' | 'phone';

interface EventFormField {
  id: string;
  label: string;
  type: FormFieldType;
  required: boolean;
  options: string[];
}

interface PublicEvent {
  _id: string;
  title: string;
  description?: string;
  date: string;
  startTime?: string;
  endTime?: string;
  capacity: number;
  price: number;
  imageUrl?: string;
  status: string;
  slug?: string;
  formFields?: EventFormField[];
}

interface RegistrationResult {
  _id: string;
  name: string;
  email: string;
  ticketCode: string;
  partySize: number;
}

@Component({
  selector: 'app-public-event',
  standalone: true,
  imports: [ReactiveFormsModule, LucideAngularModule],
  template: `
    <div class="pe-shell">

      @if (loading()) {
        <div class="pe-loading">
          <div class="spinner"></div>
          <p>Cargando evento...</p>
        </div>

      } @else if (notFound()) {
        <div class="pe-notfound">
          <lucide-icon [img]="Calendar" [size]="56" [strokeWidth]="1.5"></lucide-icon>
          <h2>Evento no encontrado</h2>
          <p>El evento que buscas no existe o ya no está disponible.</p>
        </div>

      } @else if (ev()) {

        <!-- ── Hero ── -->
        @if (ev()!.imageUrl) {
          <div class="pe-hero" [style.background-image]="'url(' + ev()!.imageUrl + ')'"></div>
        } @else {
          <div class="pe-hero-gradient"></div>
        }

        <div class="pe-content">

          <!-- ── Event info card ── -->
          <div class="pe-info card">
            <h1 class="pe-title">{{ ev()!.title }}</h1>

            <div class="pe-meta">
              <div class="pe-meta-item">
                <lucide-icon [img]="Calendar" [size]="16" [strokeWidth]="2"></lucide-icon>
                <span>{{ formatDate(ev()!.date) }}</span>
              </div>
              @if (ev()!.startTime) {
                <div class="pe-meta-item">
                  <lucide-icon [img]="Clock" [size]="16" [strokeWidth]="2"></lucide-icon>
                  <span>{{ ev()!.startTime }}{{ ev()!.endTime ? ' – ' + ev()!.endTime : '' }}</span>
                </div>
              }
              <div class="pe-meta-item">
                <lucide-icon [img]="Tag" [size]="16" [strokeWidth]="2"></lucide-icon>
                <span>{{ ev()!.price === 0 ? 'Entrada gratuita' : 'S/ ' + ev()!.price }}</span>
              </div>
              @if (ev()!.capacity > 0) {
                <div class="pe-meta-item" [class.full]="spotsLeft() === 0">
                  <lucide-icon [img]="Users" [size]="16" [strokeWidth]="2"></lucide-icon>
                  <span>{{ spotsLeft() === 0 ? 'Sin cupos' : spotsLeft() + ' cupos disponibles' }}</span>
                </div>
              }
            </div>

            @if (ev()!.description) {
              <div class="pe-description">
                @for (p of paragraphs(); track $index) {
                  <p>{{ p }}</p>
                }
              </div>
            }
          </div>

          <!-- ── Registration card ── -->
          @if (!registered()) {
            @if (spotsLeft() === 0 && ev()!.capacity > 0) {
              <div class="card pe-full">
                <lucide-icon [img]="Users" [size]="32" [strokeWidth]="1.5"></lucide-icon>
                <h3>Evento lleno</h3>
                <p>Ya no hay cupos disponibles para este evento.</p>
              </div>
            } @else {
              <div class="card pe-form-card">
                <h2 class="pe-form-title">
                  {{ ev()!.price === 0 ? 'Reservar lugar gratuito' : 'Comprar entrada — S/ ' + ev()!.price }}
                </h2>

                <form [formGroup]="form" (ngSubmit)="submitRegistration()" class="pe-form">

                  <!-- Fixed fields -->
                  <div class="field">
                    <label class="field-label">Nombre completo *</label>
                    <input class="input" formControlName="name" placeholder="Tu nombre" autofocus />
                    @if (form.get('name')?.invalid && form.get('name')?.touched) {
                      <span class="field-hint-error">El nombre es requerido</span>
                    }
                  </div>

                  <div class="field">
                    <label class="field-label">Email *</label>
                    <input class="input" type="email" formControlName="email" placeholder="tu@email.com" />
                    @if (form.get('email')?.invalid && form.get('email')?.touched) {
                      <span class="field-hint-error">Email válido requerido</span>
                    }
                  </div>

                  <div class="field">
                    <label class="field-label">Teléfono</label>
                    <input class="input" type="tel" formControlName="phone" placeholder="+51 999 999 999" />
                  </div>

                  <div class="field">
                    <label class="field-label">Número de personas *</label>
                    <select class="input" formControlName="partySize">
                      @for (n of partySizeOptions(); track n) {
                        <option [value]="n">{{ n }} {{ n === 1 ? 'persona' : 'personas' }}</option>
                      }
                    </select>
                  </div>

                  <!-- Custom fields from form builder -->
                  @for (field of customFields(); track field.id) {
                    <div class="field">
                      <label class="field-label">
                        {{ field.label }}{{ field.required ? ' *' : '' }}
                      </label>

                      @if (field.type === 'textarea') {
                        <textarea class="input" rows="3"
                          [value]="getCustomValue(field.id)"
                          (input)="setCustomValue(field.id, $any($event.target).value)"
                          [placeholder]="'Escribe tu respuesta...'">
                        </textarea>

                      } @else if (field.type === 'select') {
                        <select class="input"
                          [value]="getCustomValue(field.id)"
                          (change)="setCustomValue(field.id, $any($event.target).value)">
                          <option value="">Seleccionar...</option>
                          @for (opt of field.options; track opt) {
                            <option [value]="opt">{{ opt }}</option>
                          }
                        </select>

                      } @else if (field.type === 'checkbox') {
                        <label class="checkbox-field">
                          <input type="checkbox"
                            [checked]="getCustomValue(field.id) === 'Sí'"
                            (change)="setCustomValue(field.id, $any($event.target).checked ? 'Sí' : 'No')" />
                          <span>Sí</span>
                        </label>

                      } @else if (field.type === 'number') {
                        <input class="input" type="number"
                          [value]="getCustomValue(field.id)"
                          (input)="setCustomValue(field.id, $any($event.target).value)" />

                      } @else if (field.type === 'email') {
                        <input class="input" type="email"
                          [value]="getCustomValue(field.id)"
                          (input)="setCustomValue(field.id, $any($event.target).value)"
                          placeholder="correo@ejemplo.com" />

                      } @else if (field.type === 'phone') {
                        <input class="input" type="tel"
                          [value]="getCustomValue(field.id)"
                          (input)="setCustomValue(field.id, $any($event.target).value)"
                          placeholder="+51 999 999 999" />

                      } @else {
                        <input class="input" type="text"
                          [value]="getCustomValue(field.id)"
                          (input)="setCustomValue(field.id, $any($event.target).value)"
                          placeholder="Escribe tu respuesta" />
                      }
                    </div>
                  }

                  @if (formError()) {
                    <div class="form-error">{{ formError() }}</div>
                  }

                  <button type="submit" class="btn btn-primary btn-lg w-full" [disabled]="submitting()">
                    {{ submitting() ? 'Procesando...' : (ev()!.price === 0 ? 'Confirmar asistencia' : 'Reservar entrada') }}
                  </button>
                </form>
              </div>
            }

          <!-- ── Success state ── -->
          } @else {
            <div class="card pe-success">
              <lucide-icon [img]="CheckCircle" [size]="56" [strokeWidth]="1.5"></lucide-icon>
              <h2>¡Registro confirmado!</h2>
              <p>Nos vemos el <strong>{{ formatDate(ev()!.date) }}</strong>{{ ev()!.startTime ? ' a las ' + ev()!.startTime : '' }}.</p>
              <div class="ticket-box">
                <span class="ticket-label">Tu código de ticket</span>
                <code class="ticket-code">{{ registration()!.ticketCode }}</code>
                <span class="ticket-hint">Presenta este código en el evento</span>
              </div>
              <p class="ticket-email">Confirmación enviada a <strong>{{ registration()!.email }}</strong></p>
            </div>
          }

        </div>
      }
    </div>
  `,
  styles: [`
    .pe-shell { min-height: 100vh; background: var(--color-bg-app); }

    .pe-hero { height: 280px; background-size: cover; background-position: center; }
    .pe-hero-gradient { height: 180px; background: linear-gradient(135deg, var(--color-brand) 0%, #7c3aed 100%); }

    .pe-content { max-width: 600px; margin: 0 auto; padding: 0 24px 60px; transform: translateY(-40px); display: flex; flex-direction: column; gap: 20px; }

    .pe-info { padding: 28px 32px; }
    .pe-title { font-size: 26px; font-weight: 800; margin: 0 0 20px; font-family: var(--font-heading); line-height: 1.25; }

    .pe-meta { display: flex; flex-wrap: wrap; gap: 12px; margin-bottom: 20px; }
    .pe-meta-item { display: flex; align-items: center; gap: 6px; font-size: 14px; font-weight: 500; color: var(--color-text-muted); background: var(--color-bg-app); padding: 6px 12px; border-radius: var(--radius-pill); }
    .pe-meta-item.full { color: var(--color-error); background: #FEF2F2; }

    .pe-description p { color: var(--color-text-main); font-size: 15px; line-height: 1.7; margin: 0 0 12px; }
    .pe-description p:last-child { margin-bottom: 0; }

    .pe-form-card { padding: 28px 32px; }
    .pe-form-title { margin: 0 0 24px; font-size: 18px; font-weight: 700; font-family: var(--font-heading); }
    .pe-form { display: flex; flex-direction: column; gap: 18px; }

    .field { display: flex; flex-direction: column; gap: 6px; }
    .field-label { font-size: 13px; font-weight: 600; }
    .field-hint-error { font-size: 12px; color: var(--color-error); }
    .form-error { color: var(--color-error); font-size: 14px; text-align: center; padding: 8px 12px; background: #FEF2F2; border-radius: 10px; }
    .w-full { width: 100%; }

    .checkbox-field { display: flex; align-items: center; gap: 10px; cursor: pointer; padding: 12px 16px; border: 1px solid var(--color-border); border-radius: var(--radius-pill); font-size: 14px; font-weight: 500; transition: all 0.2s; }
    .checkbox-field:hover { border-color: var(--color-brand); background: var(--color-brand-light); }
    .checkbox-field input[type="checkbox"] { width: 18px; height: 18px; cursor: pointer; accent-color: var(--color-brand); }

    .pe-full, .pe-notfound { text-align: center; padding: 48px 24px; display: flex; flex-direction: column; align-items: center; gap: 12px; color: var(--color-text-muted); }
    .pe-full h3, .pe-notfound h2 { margin: 0; color: var(--color-text-main); }
    .pe-full p, .pe-notfound p { margin: 0; }

    .pe-loading { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 16px; padding: 120px 24px; color: var(--color-text-muted); }
    .spinner { width: 40px; height: 40px; border-radius: 50%; border: 3px solid var(--color-border); border-top-color: var(--color-brand); animation: spin .8s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }

    .pe-success { text-align: center; padding: 40px 32px; display: flex; flex-direction: column; align-items: center; gap: 16px; }
    .pe-success lucide-icon { color: var(--color-success, #22c55e); }
    .pe-success h2 { margin: 0; font-size: 22px; font-family: var(--font-heading); }
    .pe-success p { margin: 0; color: var(--color-text-muted); }

    .ticket-box { background: var(--color-bg-app); border: 2px dashed var(--color-border); border-radius: var(--radius-lg); padding: 20px 28px; display: flex; flex-direction: column; align-items: center; gap: 8px; width: 100%; }
    .ticket-label { font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: .08em; color: var(--color-text-muted); }
    .ticket-code { font-family: monospace; font-size: 28px; font-weight: 800; color: var(--color-brand); letter-spacing: .15em; }
    .ticket-hint { font-size: 12px; color: var(--color-text-muted); }
    .ticket-email { font-size: 13px; color: var(--color-text-muted); }
  `],
})
export class PublicEventComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private http = inject(HttpClient);
  private fb = inject(FormBuilder);

  readonly Calendar = Calendar;
  readonly Clock = Clock;
  readonly Tag = Tag;
  readonly Users = Users;
  readonly Ticket = Ticket;
  readonly CheckCircle = CheckCircle;

  loading = signal(true);
  notFound = signal(false);
  ev = signal<PublicEvent | null>(null);
  registrationsCount = signal(0);
  registered = signal(false);
  registration = signal<RegistrationResult | null>(null);
  submitting = signal(false);
  formError = signal('');
  private refCode: string | null = null;

  private customFieldValues: Record<string, string> = {};

  customFields = computed(() => this.ev()?.formFields ?? []);

  spotsLeft = computed(() => {
    const e = this.ev();
    if (!e || e.capacity === 0) return Infinity;
    return Math.max(0, e.capacity - this.registrationsCount());
  });

  paragraphs = computed(() =>
    (this.ev()?.description ?? '').split('\n').filter((p) => p.trim()),
  );

  partySizeOptions = computed(() => {
    const max = this.spotsLeft() === Infinity ? 10 : Math.min(10, this.spotsLeft());
    return Array.from({ length: max }, (_, i) => i + 1);
  });

  form = this.fb.group({
    name: ['', Validators.required],
    email: ['', [Validators.required, Validators.email]],
    phone: [''],
    partySize: [1, Validators.required],
  });

  ngOnInit() {
    this.refCode = this.route.snapshot.queryParamMap.get('ref');
    const slug = this.route.snapshot.paramMap.get('slug') ?? '';
    this.http
      .get<{ event: PublicEvent; registrationsCount: number }>(`${API}/public/events/${slug}`)
      .subscribe({
        next: (res) => {
          this.ev.set(res.event);
          this.registrationsCount.set(res.registrationsCount);
          this.loading.set(false);
        },
        error: () => {
          this.notFound.set(true);
          this.loading.set(false);
        },
      });
  }

  getCustomValue(id: string): string {
    return this.customFieldValues[id] ?? '';
  }

  setCustomValue(id: string, value: string) {
    this.customFieldValues[id] = value;
  }

  submitRegistration() {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }

    // Validate required custom fields
    const missingRequired = (this.ev()?.formFields ?? []).filter(
      f => f.required && !this.customFieldValues[f.id]?.trim()
    );
    if (missingRequired.length) {
      this.formError.set(`Por favor completa: ${missingRequired.map(f => f.label).join(', ')}`);
      return;
    }

    this.submitting.set(true);
    this.formError.set('');
    const eventId = this.ev()?._id ?? '';
    const body = {
      ...this.form.value,
      customFields: { ...this.customFieldValues },
      ...(this.refCode ? { ref: this.refCode } : {}),
    };
    this.http
      .post<RegistrationResult>(`${API}/public/events/${eventId}/register`, body)
      .subscribe({
        next: (res) => {
          this.registration.set(res);
          this.registered.set(true);
          this.submitting.set(false);
        },
        error: (err) => {
          this.formError.set(err.error?.message || 'Error al registrarse');
          this.submitting.set(false);
        },
      });
  }

  formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString('es-PE', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    });
  }
}
