import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormBuilder, Validators, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { LucideAngularModule, Calendar, Ban, CheckCircle2, XCircle, ArrowLeft, User, Mail, Phone, Users } from 'lucide-angular';

import { environment } from '../../../environments/environment';
const API = environment.apiUrl;

interface ReservationConfig {
  enabled: boolean; turnos: string[]; maxPartySize: number; advanceBookingDays: number;
  welcomeTitle?: string; welcomeMessage?: string; policy?: string;
}
interface Slot { turno: string; available: boolean; spotsLeft: number; }

type Step = 'date' | 'time' | 'form' | 'success' | 'confirm';

const OCCASION_OPTIONS = [
  { value: '', label: 'Sin ocasión especial' },
  { value: 'birthday', label: 'Cumpleaños' },
  { value: 'anniversary', label: 'Aniversario' },
  { value: 'business', label: 'Reunión de negocios' },
  { value: 'other', label: 'Otro' },
];

@Component({
  selector: 'app-public-booking',
  standalone: true,
  imports: [ReactiveFormsModule, LucideAngularModule],
  template: `
    <div class="booking-shell">
      <div class="booking-card">
        <!-- Header -->
        <div class="booking-header">
          <div class="booking-logo">
            <img src="/logo.png" alt="MAYA" class="logo-img" />
          </div>
          <h1 class="booking-title">{{ config()?.welcomeTitle || localName() || 'Reserva en Maya' }}</h1>
          <p class="booking-subtitle">{{ config()?.welcomeMessage || 'Reserva tu mesa de forma rápida y segura.' }}</p>
          
          @if (step() !== 'success' && step() !== 'confirm') {
            <div class="steps-indicator">
              <span class="step-dot" [class.active]="step() === 'date'"></span>
              <span class="step-line"></span>
              <span class="step-dot" [class.active]="step() === 'time'"></span>
              <span class="step-line"></span>
              <span class="step-dot" [class.active]="step() === 'form'"></span>
            </div>
          }
        </div>

        <!-- Not enabled -->
        @if (!loading() && !config()?.enabled && step() !== 'confirm') {
          <div class="info-block">
            <div class="info-icon"><lucide-icon [img]="Ban" [size]="48" [strokeWidth]="1.5"></lucide-icon></div>
            <h3>Reservas no disponibles</h3>
            <p>Este local no acepta reservas online por el momento.</p>
          </div>

        <!-- Confirm page (token-based) -->
        } @else if (step() === 'confirm') {
          @if (loading()) {
            <div class="info-block"><p>Cargando...</p></div>
          } @else if (confirmError()) {
            <div class="info-block error">
              <div class="info-icon"><lucide-icon [img]="XCircle" [size]="48" [strokeWidth]="1.5"></lucide-icon></div>
              <h3>No se pudo confirmar</h3>
              <p>{{ confirmError() }}</p>
            </div>
          } @else if (confirmedRes()) {
            <div class="info-block success">
              <div class="info-icon"><lucide-icon [img]="CheckCircle2" [size]="48" [strokeWidth]="1.5"></lucide-icon></div>
              <h3>¡Reserva confirmada!</h3>
              <div class="res-detail">
                <div><lucide-icon [img]="Calendar" [size]="14" [strokeWidth]="2" style="margin-right: 6px;"></lucide-icon> {{ confirmedRes()?.date }} a las {{ confirmedRes()?.turno }}</div>
                <div>👥 {{ confirmedRes()?.partySize }} persona(s)</div>
                <div>🏠 {{ confirmedRes()?.localName }}</div>
              </div>
              <p class="muted">Nos vemos pronto.</p>
            </div>
          }

        <!-- Step: Date -->
        } @else if (step() === 'date') {
          <div class="step-body">
            <h2 class="step-title">¿Qué día quieres venir?</h2>
            <input type="date" class="input date-picker" [value]="selectedDate()"
              [min]="minDate()" [max]="maxDate()"
              (change)="onDateSelect($event)" aria-label="Seleccionar fecha" />
          </div>

        <!-- Step: Time -->
        } @else if (step() === 'time') {
          <div class="step-body">
            <button class="back-btn" (click)="step.set('date')">
              <lucide-icon [img]="ArrowLeft" [size]="14" [strokeWidth]="2"></lucide-icon>
              Cambiar fecha
            </button>
            <h2 class="step-title">Elige un horario</h2>
            <p class="step-sub">{{ selectedDate() }}</p>
            @if (loadingSlots()) {
              <div class="slots-grid">
                @for (i of [1,2,3,4]; track i) { <div class="slot-skeleton"></div> }
              </div>
            } @else if (slots().length === 0) {
              <div class="info-block">
                <p>No hay turnos disponibles para esta fecha.</p>
              </div>
            } @else {
              <div class="slots-grid">
                @for (slot of slots(); track slot.turno) {
                  <button class="slot-btn" [class.full]="!slot.available"
                    [disabled]="!slot.available"
                    (click)="onSlotSelect(slot.turno)">
                    <span class="slot-time">{{ slot.turno }}</span>
                    <span class="slot-spots">
                      {{ slot.available ? slot.spotsLeft + ' lugar(es)' : 'Completo' }}
                    </span>
                  </button>
                }
              </div>
            }
          </div>

        <!-- Step: Form -->
        } @else if (step() === 'form') {
          <div class="step-body">
            <button class="back-btn" (click)="step.set('time')">
              <lucide-icon [img]="ArrowLeft" [size]="14" [strokeWidth]="2"></lucide-icon>
              Cambiar horario
            </button>
            <h2 class="step-title">Tus datos</h2>
            <p class="step-sub">{{ selectedDate() }} · {{ selectedTurno() }}</p>

            <form [formGroup]="guestForm" (ngSubmit)="submitReservation()" class="guest-form">
              <div class="form-field">
                <label class="form-label">Nombre completo *</label>
                <input class="input" formControlName="guestName" placeholder="Tu nombre" autofocus />
                @if (guestForm.get('guestName')?.invalid && guestForm.get('guestName')?.touched) {
                  <span class="field-error">Nombre requerido</span>
                }
              </div>

              <div class="form-field">
                <label class="form-label">Email *</label>
                <input class="input" type="email" formControlName="guestEmail" placeholder="correo@ejemplo.com" />
                @if (guestForm.get('guestEmail')?.invalid && guestForm.get('guestEmail')?.touched) {
                  <span class="field-error">Email válido requerido</span>
                }
              </div>

              <div class="form-field">
                <label class="form-label">Teléfono</label>
                <input class="input" formControlName="guestPhone" placeholder="+51 999 000 000" />
              </div>

              <div class="form-field">
                <label class="form-label">Número de personas *</label>
                <select class="select" formControlName="partySize">
                  @for (n of partySizeOptions(); track n) {
                    <option [value]="n">{{ n }} persona{{ n > 1 ? 's' : '' }}</option>
                  }
                </select>
              </div>

              <div class="form-field">
                <label class="form-label">Ocasión</label>
                <select class="select" formControlName="occasion">
                  @for (o of occasionOptions; track o.value) {
                    <option [value]="o.value">{{ o.label }}</option>
                  }
                </select>
              </div>

              <div class="form-field">
                <label class="form-label">Notas especiales</label>
                <textarea class="textarea" formControlName="notes"
                  placeholder="Alergias, preferencias de mesa, sillas para bebé..."></textarea>
              </div>

              @if (formError()) {
                <div class="form-error-banner">{{ formError() }}</div>
              }

              <button type="submit" class="btn btn-primary btn-lg submit-btn" [disabled]="submitting()">
                {{ submitting() ? 'Enviando...' : 'Confirmar reserva' }}
              </button>
              
              @if (config()?.policy) {
                <p class="policy-text">{{ config()?.policy }}</p>
              }
            </form>
          </div>

        <!-- Step: Success -->
        } @else if (step() === 'success') {
          <div class="info-block success">
            <div class="info-icon"><lucide-icon [img]="CheckCircle2" [size]="48" [strokeWidth]="1.5"></lucide-icon></div>
            <h3>¡Reserva recibida!</h3>
            <div class="res-detail">
              <div><lucide-icon [img]="Calendar" [size]="14" [strokeWidth]="2" style="margin-right: 6px;"></lucide-icon> {{ selectedDate() }} a las {{ selectedTurno() }}</div>
              <div>👥 {{ guestForm.get('partySize')?.value }} persona(s)</div>
              <div>📧 Confirmación enviada a {{ guestForm.get('guestEmail')?.value }}</div>
            </div>
            <p class="muted">Te esperamos. Puedes confirmar tu asistencia con el link que recibirás.</p>
            <button class="btn btn-secondary" (click)="resetForm()">Hacer otra reserva</button>
          </div>
        }
      </div>
    </div>
  `,
  styles: [`
    :host { display: block; min-height: 100vh; background: var(--color-bg-app); }

    .booking-shell {
      min-height: 100vh; display: flex; align-items: flex-start; justify-content: center;
      padding: 40px 16px;
    }

    .booking-card {
      width: 100%; max-width: 480px; background: var(--color-white);
      border-radius: var(--radius-lg); box-shadow: var(--shadow-lg); overflow: hidden;
    }

    .booking-header {
      padding: 40px 32px 32px; text-align: center;
      background: white;
      color: var(--color-text-main);
      border-bottom: 1px solid var(--color-border);
    }
    .booking-logo { margin-bottom: 20px; }
    .logo-img { height: 48px; width: auto; }
    .booking-title { font-family: var(--font-heading); font-size: 24px; font-weight: 700;
      margin: 0 0 8px; color: var(--color-text-main); }
    .booking-subtitle { color: var(--color-text-muted); font-size: 14px; margin: 0 0 24px; }

    .steps-indicator { display: flex; align-items: center; justify-content: center; gap: 0; }
    .step-dot { width: 8px; height: 8px; border-radius: 50%;
      background: var(--color-border); transition: background var(--transition-fast); }
    .step-dot.active { background: var(--color-brand); }
    .step-line { width: 32px; height: 1px; background: var(--color-border); }

    .step-body { padding: 28px 32px; }
    .back-btn { background: none; border: none; color: var(--color-text-muted); font-size: 13px;
      cursor: pointer; padding: 0; margin-bottom: 16px; display: flex; align-items: center; gap: 4px; }
    .back-btn:hover { color: var(--color-text-main); }
    .step-title { font-family: var(--font-heading); font-size: 18px; font-weight: 600;
      margin: 0 0 6px; }
    .step-sub { color: var(--color-text-muted); font-size: 14px; margin: 0 0 20px; }

    .date-picker { width: 100%; box-sizing: border-box; }

    .slots-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; margin-top: 12px; }
    .slot-btn { display: flex; flex-direction: column; align-items: center; padding: 14px 12px;
      border: 2px solid var(--color-border); border-radius: var(--radius-md);
      background: var(--color-white); cursor: pointer; transition: all var(--transition-fast); }
    .slot-btn:hover:not(:disabled) { border-color: var(--color-brand); background: var(--color-brand-light); }
    .slot-btn.full { opacity: 0.5; cursor: not-allowed; }
    .slot-time { font-size: 18px; font-weight: 700; color: var(--color-text-main); }
    .slot-spots { font-size: 11px; color: var(--color-text-muted); margin-top: 4px; }
    .slot-skeleton { height: 72px; border-radius: var(--radius-md); background: #f0f0f0;
      animation: shimmer 1.4s infinite;
      background: linear-gradient(90deg, #f0f0f0 25%, #fff 50%, #f0f0f0 75%);
      background-size: 400% 100%; }
    @keyframes shimmer { 0%{background-position:100% 0} 100%{background-position:-100% 0} }

    .guest-form { display: flex; flex-direction: column; gap: 16px; }
    .form-field { display: flex; flex-direction: column; gap: 6px; }
    .form-label { font-size: 13px; font-weight: 600; color: var(--color-text-main); }
    .field-error { font-size: 12px; color: var(--color-error); }
    .form-error-banner { background: #FEF2F2; color: var(--color-error); padding: 10px 16px;
      border-radius: var(--radius-sm); font-size: 13px; }
    .submit-btn { width: 100%; margin-top: 8px; }
    .policy-text { font-size: 11px; color: var(--color-text-muted); text-align: center; margin-top: 16px; line-height: 1.4; }

    .info-block { padding: 40px 32px; text-align: center; }
    .info-block.success { background: #F0FDF4; }
    .info-block.error { background: #FEF2F2; }
    .info-icon { font-size: 48px; margin-bottom: 16px; }
    .info-block h3 { font-family: var(--font-heading); font-size: 20px; margin: 0 0 12px; }
    .info-block p { color: var(--color-text-muted); margin: 0 0 8px; }
    .muted { color: var(--color-text-muted); font-size: 13px; }
    .res-detail { background: var(--color-white); border-radius: var(--radius-md);
      padding: 14px 18px; text-align: left; margin: 12px 0;
      display: flex; flex-direction: column; gap: 6px; font-size: 14px; }
  `],
})
export class PublicBookingComponent implements OnInit {
  private http = inject(HttpClient);
  private fb = inject(FormBuilder);
  private route = inject(ActivatedRoute);

  step = signal<Step>('date');
  loading = signal(true);
  loadingSlots = signal(false);
  submitting = signal(false);

  localId = signal('');
  localName = signal('');
  config = signal<ReservationConfig | null>(null);
  slots = signal<Slot[]>([]);
  selectedDate = signal('');
  selectedTurno = signal('');
  formError = signal('');

  confirmToken = signal('');
  confirmedRes = signal<any>(null);
  confirmError = signal('');
  
  readonly Calendar = Calendar;
  readonly Ban = Ban;
  readonly CheckCircle2 = CheckCircle2;
  readonly XCircle = XCircle;
  readonly ArrowLeft = ArrowLeft;
  readonly User = User;
  readonly Mail = Mail;
  readonly Phone = Phone;
  readonly Users = Users;
  
  readonly occasionOptions = OCCASION_OPTIONS;

  guestForm = this.fb.group({
    guestName: ['', Validators.required],
    guestEmail: ['', [Validators.required, Validators.email]],
    guestPhone: [''],
    partySize: [2, Validators.required],
    occasion: [''],
    notes: [''],
  });

  partySizeOptions = computed(() => {
    const max = this.config()?.maxPartySize ?? 10;
    return Array.from({ length: max }, (_, i) => i + 1);
  });

  minDate = computed(() => new Date().toISOString().slice(0, 10));
  maxDate = computed(() => {
    const days = this.config()?.advanceBookingDays ?? 30;
    const d = new Date();
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  });

  ngOnInit() {
    const token = this.route.snapshot.paramMap.get('token');
    if (token) {
      this.step.set('confirm');
      this.confirmToken.set(token);
      this.doConfirm(token);
      return;
    }

    const id = this.route.snapshot.paramMap.get('localId') ?? '';
    this.localId.set(id);
    this.selectedDate.set(this.minDate());

    this.http.get<{ localName: string; config: ReservationConfig }>(
      `${API}/public/reservations/config`, { params: { localId: id } },
    ).subscribe({
      next: (res) => {
        this.localName.set(res.localName);
        this.config.set(res.config);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  private doConfirm(token: string) {
    this.http.patch(`${API}/public/reservations/${token}/confirm`, {}).subscribe({
      next: (res: any) => {
        this.confirmedRes.set(res);
        this.loading.set(false);
      },
      error: (err) => {
        this.confirmError.set(err.error?.message || 'Link inválido o expirado');
        this.loading.set(false);
      },
    });
  }

  onDateSelect(event: Event) {
    const date = (event.target as HTMLInputElement).value;
    this.selectedDate.set(date);
    this.step.set('time');
    this.loadSlots(date);
  }

  loadSlots(date: string) {
    this.loadingSlots.set(true);
    this.slots.set([]);
    this.http.get<Slot[]>(`${API}/public/reservations/availability`, {
      params: { localId: this.localId(), date },
    }).subscribe({
      next: (data) => { this.slots.set(data); this.loadingSlots.set(false); },
      error: () => this.loadingSlots.set(false),
    });
  }

  onSlotSelect(turno: string) {
    this.selectedTurno.set(turno);
    this.step.set('form');
  }

  submitReservation() {
    this.guestForm.markAllAsTouched();
    if (this.guestForm.invalid) return;
    this.formError.set('');
    this.submitting.set(true);

    const v = this.guestForm.value;
    this.http.post(`${API}/public/reservations`, {
      localId: this.localId(),
      date: this.selectedDate(),
      turno: this.selectedTurno(),
      partySize: v.partySize,
      guestName: v.guestName,
      guestEmail: v.guestEmail,
      guestPhone: v.guestPhone,
      occasion: v.occasion || undefined,
      notes: v.notes || undefined,
    }).subscribe({
      next: () => { this.submitting.set(false); this.step.set('success'); },
      error: (err) => {
        this.submitting.set(false);
        this.formError.set(err.error?.message || 'Error al crear reserva');
      },
    });
  }

  resetForm() {
    this.guestForm.reset({ partySize: 2 });
    this.selectedTurno.set('');
    this.step.set('date');
  }
}
