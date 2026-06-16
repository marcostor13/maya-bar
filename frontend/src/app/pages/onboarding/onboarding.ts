import { Component, inject, signal } from '@angular/core';
import { FormBuilder, Validators, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

const LOCAL_TYPES = [
  { value: 'restaurant', label: 'Restaurante', icon: '🍽️' },
  { value: 'bar', label: 'Bar', icon: '🍸' },
  { value: 'cafe', label: 'Café', icon: '☕' },
  { value: 'cafeteria', label: 'Cafetería', icon: '🥗' },
  { value: 'fastfood', label: 'Fast Food', icon: '🍔' },
];

@Component({
  selector: 'app-onboarding',
  standalone: true,
  imports: [ReactiveFormsModule],
  template: `
    <div class="onboarding-page">
      <div class="onboarding-card card animate-fade-in">

        <div class="wizard-progress">
          <div class="progress-bar">
            <div class="progress-fill" [style.width.%]="(step() / 3) * 100"></div>
          </div>
          <span class="progress-label">Paso {{ step() }} de 3</span>
        </div>

        @if (step() === 1) {
          <div class="step">
            <h2>¿Qué tipo de local es?</h2>
            <p>Elige el rubro principal. Podrás cambiarlo después.</p>
            <div class="type-grid">
              @for (t of types; track t.value) {
                <button
                  class="type-card"
                  [class.selected]="selectedType() === t.value"
                  (click)="selectedType.set(t.value)"
                >
                  <span class="type-icon">{{ t.icon }}</span>
                  <span class="type-label">{{ t.label }}</span>
                </button>
              }
            </div>
            <button class="btn btn-primary next-btn" (click)="step.set(2)" [disabled]="!selectedType()">
              Continuar →
            </button>
          </div>
        }

        @if (step() === 2) {
          <div class="step">
            <h2>Datos del local</h2>
            <p>La información básica para comenzar a operar.</p>
            <form [formGroup]="localForm" class="local-form">
              <div class="form-group">
                <label>Nombre del local *</label>
                <input class="input" formControlName="name" placeholder="Ej: La Mar Cebichería" />
              </div>
              <div class="form-group">
                <label>Dirección</label>
                <input class="input" formControlName="address" placeholder="Av. La Mar 770, Miraflores" />
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label>Teléfono</label>
                  <input class="input" formControlName="phone" placeholder="+51 1 421-3365" />
                </div>
                <div class="form-group">
                  <label>N° de mesas</label>
                  <input class="input" type="number" formControlName="tableCount" placeholder="20" min="1" />
                </div>
              </div>
            </form>
            <div class="step-actions">
              <button class="btn btn-secondary" (click)="step.set(1)">← Atrás</button>
              <button class="btn btn-primary" (click)="step.set(3)" [disabled]="localForm.get('name')!.invalid">
                Continuar →
              </button>
            </div>
          </div>
        }

        @if (step() === 3) {
          <div class="step">
            <h2>¡Todo listo!</h2>
            <p>Vamos a crear tu local y tendrás acceso completo a la plataforma.</p>

            <div class="summary-card">
              <div class="summary-row">
                <span class="summary-label">Tipo</span>
                <span>{{ typeLabel() }}</span>
              </div>
              <div class="summary-row">
                <span class="summary-label">Nombre</span>
                <span>{{ localForm.value.name }}</span>
              </div>
              @if (localForm.value.address) {
                <div class="summary-row">
                  <span class="summary-label">Dirección</span>
                  <span>{{ localForm.value.address }}</span>
                </div>
              }
              <div class="summary-row">
                <span class="summary-label">Mesas</span>
                <span>{{ localForm.value.tableCount || 1 }}</span>
              </div>
            </div>

            @if (error()) {
              <div class="alert-error">{{ error() }}</div>
            }

            <div class="step-actions">
              <button class="btn btn-secondary" (click)="step.set(2)">← Atrás</button>
              <button class="btn btn-primary" (click)="createLocal()" [disabled]="loading()">
                @if (loading()) { Creando... } @else { Crear mi local }
              </button>
            </div>
          </div>
        }

      </div>
    </div>
  `,
  styles: [`
    .onboarding-page {
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 32px 16px;
      background: var(--color-bg-light);
    }

    .onboarding-card {
      width: 100%;
      max-width: 520px;
      padding: 40px;
    }

    .wizard-progress {
      margin-bottom: 32px;
    }

    .progress-bar {
      height: 3px;
      background: var(--color-border);
      border-radius: 2px;
      margin-bottom: 8px;
    }

    .progress-fill {
      height: 100%;
      background: var(--color-brand);
      border-radius: 2px;
      transition: width var(--transition-smooth);
    }

    .progress-label {
      font-size: 12px;
      color: var(--color-text-muted);
    }

    .step h2 {
      font-size: 22px;
      margin-bottom: 6px;
    }

    .step > p {
      color: var(--color-text-muted);
      font-size: 14px;
      margin-bottom: 24px;
    }

    .type-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 12px;
      margin-bottom: 24px;
    }

    .type-card {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
      padding: 20px 12px;
      border: 2px solid var(--color-border);
      border-radius: var(--radius-md);
      background: var(--color-white);
      cursor: pointer;
      transition: all var(--transition-fast);
    }

    .type-card:hover {
      border-color: var(--color-brand);
      background: #FFF8F8;
    }

    .type-card.selected {
      border-color: var(--color-brand);
      background: #FFF1F1;
    }

    .type-icon { font-size: 28px; }

    .type-label {
      font-size: 13px;
      font-weight: 500;
      color: var(--color-text-main);
    }

    .next-btn {
      width: 100%;
      padding: 12px;
    }

    .next-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
      transform: none;
    }

    .local-form { margin-bottom: 24px; }

    .form-group {
      margin-bottom: 14px;
    }

    .form-group label {
      display: block;
      font-size: 13px;
      font-weight: 500;
      color: var(--color-text-muted);
      margin-bottom: 6px;
    }

    .form-row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
    }

    .step-actions {
      display: flex;
      gap: 12px;
      justify-content: flex-end;
    }

    .summary-card {
      background: var(--color-bg-light);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-md);
      padding: 20px;
      margin-bottom: 24px;
    }

    .summary-row {
      display: flex;
      justify-content: space-between;
      padding: 8px 0;
      font-size: 14px;
      border-bottom: 1px solid var(--color-border);
    }

    .summary-row:last-child { border-bottom: none; }

    .summary-label {
      color: var(--color-text-muted);
      font-weight: 500;
    }

    .alert-error {
      background: #FEF2F2;
      border: 1px solid #FECACA;
      color: var(--color-error);
      padding: 10px 14px;
      border-radius: var(--radius-sm);
      font-size: 13px;
      margin-bottom: 20px;
    }
  `],
})
export class OnboardingComponent {
  private fb = inject(FormBuilder);
  private http = inject(HttpClient);
  private router = inject(Router);

  step = signal(1);
  selectedType = signal('');
  loading = signal(false);
  error = signal('');
  types = LOCAL_TYPES;

  localForm = this.fb.group({
    name: ['', Validators.required],
    address: [''],
    phone: [''],
    tableCount: [10],
  });

  typeLabel() {
    return this.types.find(t => t.value === this.selectedType())?.label || '';
  }

  createLocal() {
    this.loading.set(true);
    this.error.set('');

    const payload = {
      ...this.localForm.value,
      type: this.selectedType(),
    };

    this.http.post(environment.apiUrl + '/locals', payload).subscribe({
      next: () => this.router.navigate(['/dashboard']),
      error: (err) => {
        this.error.set(err.error?.message || 'Error al crear el local');
        this.loading.set(false);
      },
    });
  }
}
