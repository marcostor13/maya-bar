import { Component, inject, signal } from '@angular/core';
import { LucideAngularModule, Check, Copy, Download, Link2, Plus, Trash2, X } from 'lucide-angular';
import { ToastService } from '../../../shared/toast';
import { ConfirmService } from '../../../shared/confirm';
import { downloadCsv } from '../../../shared/csv';
import { EventsApiService } from '../../../core/api/events-api.service';
import { Impulsador } from '../../../shared/models/event.model';
import { EventDetailStore } from '../event-detail.store';

@Component({
  selector: 'app-event-impulsadores-tab',
  standalone: true,
  imports: [LucideAngularModule],
  template: `
    <div class="p-6 animate-fade-in">
      <div class="imp-header">
        <div>
          <h3 class="section-h3">Links por impulsador</h3>
          <p class="text-muted-sm">Activa un impulsador para este evento y comparte su link único. Los registros hechos con ese link se atribuyen automáticamente a su nombre.</p>
        </div>
        <button class="btn btn-secondary btn-sm" (click)="downloadImpulsadoresExcel()" [disabled]="impulsadores().length === 0">
          <lucide-icon [img]="Download" [size]="15"></lucide-icon>
          Excel
        </button>
      </div>

      @if (impulsadoresLoading()) {
        <div class="regs-empty">
          <p>Cargando impulsadores...</p>
        </div>
      } @else {
        <div class="impulsador-section-header">
          <h4 class="section-sub-title">Con cuenta en la plataforma</h4>
        </div>
        @if (userImpulsadores().length === 0) {
          <div class="regs-empty mb-5">
            <p>Sin usuarios con rol Impulsador. Créalos desde Usuarios.</p>
          </div>
        } @else {
          <div class="impulsador-list mb-6">
            @for (imp of userImpulsadores(); track imp._id) {
              <div class="impulsador-row" [class.is-assigned]="imp.assigned">
                <label class="impulsador-toggle">
                  <input type="checkbox" [checked]="imp.assigned" (change)="toggleImpulsador(imp)" />
                  <span class="impulsador-name">{{ imp.name }}</span>
                </label>
                <span class="text-muted-xs">{{ imp.email }}</span>
                @if (imp.assigned && imp.referralCode) {
                  <button class="btn btn-sm btn-secondary" (click)="copyImpulsadorLink(imp)">
                    <lucide-icon [img]="impulsadorLinkCopiedId() === imp._id ? Check : Copy" [size]="14"></lucide-icon>
                    {{ impulsadorLinkCopiedId() === imp._id ? 'Copiado' : 'Copiar link' }}
                  </button>
                }
              </div>
            }
          </div>
        }

        <div class="impulsador-section-header">
          <h4 class="section-sub-title">Impulsadores externos (sin cuenta)</h4>
          <button class="btn btn-sm btn-secondary" (click)="openExternalForm()">
            <lucide-icon [img]="Plus" [size]="14"></lucide-icon>
            Nuevo impulsador externo
          </button>
        </div>
        @if (externalImpulsadores().length === 0) {
          <div class="regs-empty">
            <lucide-icon [img]="Link2" [size]="40" [strokeWidth]="1.5"></lucide-icon>
            <p>Sin impulsadores externos. Crea uno para generar su link sin necesidad de una cuenta.</p>
          </div>
        } @else {
          <div class="impulsador-list">
            @for (imp of externalImpulsadores(); track imp._id) {
              <div class="impulsador-row is-assigned">
                <span class="impulsador-name flex-1">{{ imp.name }}</span>
                @if (imp.email) { <span class="text-muted-xs">{{ imp.email }}</span> }
                <button class="btn btn-sm btn-secondary" (click)="copyImpulsadorLink(imp)">
                  <lucide-icon [img]="impulsadorLinkCopiedId() === imp._id ? Check : Copy" [size]="14"></lucide-icon>
                  {{ impulsadorLinkCopiedId() === imp._id ? 'Copiado' : 'Copiar link' }}
                </button>
                <button class="btn-icon-xs danger" (click)="deleteExternalImpulsador(imp)" title="Eliminar">
                  <lucide-icon [img]="Trash2" [size]="14"></lucide-icon>
                </button>
              </div>
            }
          </div>
        }
      }
    </div>

    <!-- ── Nuevo impulsador externo modal ── -->
    @if (showExternalForm()) {
      <div class="overlay" (click)="closeExternalForm()" role="dialog" aria-modal="true">
        <div class="external-modal" (click)="$event.stopPropagation()">
          <div class="scanner-header">
            <h3>Nuevo impulsador externo</h3>
            <button class="btn btn-ghost btn-icon" (click)="closeExternalForm()" aria-label="Cerrar">
              <lucide-icon [img]="X" [size]="20" [strokeWidth]="2.5"></lucide-icon>
            </button>
          </div>
          <p class="text-muted-sm mb-5">Crea un impulsador sin cuenta en la plataforma. Solo necesitas su nombre para generar un link de invitación único.</p>
          <div class="field mb-4">
            <label class="field-label">Nombre *</label>
            <input class="input" [value]="externalForm.name" (input)="externalForm.name = $any($event.target).value" placeholder="Ej: Juan Pérez" autofocus />
          </div>
          <div class="field mb-4">
            <label class="field-label">Teléfono (opcional)</label>
            <input class="input" [value]="externalForm.phone" (input)="externalForm.phone = $any($event.target).value" placeholder="+51 999 999 999" />
          </div>
          <div class="field mb-5">
            <label class="field-label">Email (opcional)</label>
            <input class="input" type="email" [value]="externalForm.email" (input)="externalForm.email = $any($event.target).value" placeholder="correo@ejemplo.com" />
          </div>
          <div class="flex justify-end gap-2">
            <button class="btn btn-secondary" (click)="closeExternalForm()">Cancelar</button>
            <button class="btn btn-primary" (click)="saveExternalImpulsador()" [disabled]="savingExternal()">
              {{ savingExternal() ? 'Creando...' : 'Crear impulsador' }}
            </button>
          </div>
        </div>
      </div>
    }
  `,
  styles: [`
    :host { display: block; }

    .p-6 { padding: 24px; }
    .mb-4 { margin-bottom: 16px; } .mb-5 { margin-bottom: 20px; } .mb-6 { margin-bottom: 24px; }
    .flex { display: flex; } .flex-1 { flex: 1; }
    .gap-2 { gap: 8px; }
    .justify-end { justify-content: flex-end; }
    .text-muted-sm { font-size: 14px; color: var(--color-text-muted); margin: 4px 0 0; line-height: 1.5; }
    .text-muted-xs { font-size: 12px; color: var(--color-text-muted); }

    .section-h3 { margin: 0; font-size: 17px; font-weight: 700; font-family: var(--font-heading); }
    .section-sub-title { font-size: 14px; font-weight: 700; color: var(--color-text-main); margin: 0; }

    /* ── Fields ── */
    .field { display: flex; flex-direction: column; gap: 8px; }
    .field-label { font-size: 14px; font-weight: 600; color: var(--color-text-main); }

    .regs-empty { padding:64px 40px; text-align:center; color:var(--color-text-muted); display:flex; flex-direction:column; align-items:center; gap:16px; background:var(--color-bg-app); border-radius:16px; border:1px dashed var(--color-border); }

    /* ── Btn icon xs ── */
    .btn-icon-xs { width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; border: none; background: none; border-radius: 8px; cursor: pointer; color: var(--color-text-muted); transition: all 0.15s; }
    .btn-icon-xs:hover:not(:disabled) { background: var(--color-bg-app); color: var(--color-text-main); }
    .btn-icon-xs.danger:hover:not(:disabled) { background: #fee2e2; color: var(--color-error); }
    .btn-icon-xs:disabled { opacity: 0.3; cursor: not-allowed; }

    /* ── Impulsadores ── */
    .imp-header { display:flex; align-items:flex-start; justify-content:space-between; gap:16px; margin-bottom:20px; }
    .imp-header .btn { flex-shrink:0; }
    .impulsador-section-header { display:flex; align-items:center; justify-content:space-between; margin-bottom:14px; }
    .impulsador-list { display:flex; flex-direction:column; gap:10px; }
    .impulsador-row { display:flex; align-items:center; gap:16px; padding:14px 18px; background:#fff; border:1px solid var(--color-border); border-radius:14px; transition:all 0.2s; }
    .impulsador-row.is-assigned { background:var(--color-brand-light); border-color:rgba(225,29,72,0.2); }
    .impulsador-toggle { display:flex; align-items:center; gap:10px; cursor:pointer; font-weight:600; font-size:14px; flex:1; }
    .impulsador-toggle input[type="checkbox"] { width:18px; height:18px; cursor:pointer; accent-color:var(--color-brand); }
    .impulsador-name { color:var(--color-text-main); }

    .overlay { position: fixed; inset: 0; background: rgba(15,23,42,0.45); backdrop-filter: blur(3px); display: flex; align-items: center; justify-content: center; z-index: 100; }

    /* ── Nuevo impulsador externo modal ── */
    .external-modal { width: calc(100% - 48px); max-width: 480px; padding: 28px 32px; background:#fff; border-radius: var(--radius-lg); box-shadow: var(--shadow-lg); }
    .scanner-header { display:flex; align-items:center; justify-content:space-between; margin-bottom:16px; }
    .scanner-header h3 { margin:0; font-size:18px; font-weight:700; font-family:var(--font-heading); }

    @media (max-width: 768px) {
      .p-6 { padding: 16px; }

      .imp-header { flex-direction: column; align-items: stretch; }
      .imp-header .btn { width: 100%; justify-content: center; }
      .impulsador-section-header { flex-wrap: wrap; gap: 10px; }
      .impulsador-section-header .btn { width: 100%; justify-content: center; }
      .impulsador-row { flex-wrap: wrap; }
      .impulsador-toggle { flex: 1 1 100%; }
      .impulsador-row > .btn { flex: 1; justify-content: center; }

      .overlay { padding: 0; }
      .external-modal { padding: 22px 20px; }
    }
  `],
})
export class EventImpulsadoresTabComponent {
  private store = inject(EventDetailStore);
  private api = inject(EventsApiService);
  private toast = inject(ToastService);
  private confirm = inject(ConfirmService);

  readonly Check = Check; readonly Copy = Copy; readonly Download = Download;
  readonly Link2 = Link2; readonly Plus = Plus; readonly Trash2 = Trash2; readonly X = X;

  impulsadores = this.store.impulsadores;
  impulsadoresLoading = this.store.impulsadoresLoading;
  userImpulsadores = this.store.userImpulsadores;
  externalImpulsadores = this.store.externalImpulsadores;

  impulsadorLinkCopiedId = signal('');
  showExternalForm = signal(false);
  savingExternal = signal(false);
  externalForm: { name: string; phone: string; email: string } = { name: '', phone: '', email: '' };

  toggleImpulsador(imp: Impulsador) {
    const id = this.store.eventId();
    if (!id) return;
    const current = this.userImpulsadores();
    const nextAssigned = !imp.assigned;
    const sharedWith = current.filter(i => (i._id === imp._id ? nextAssigned : i.assigned)).map(i => i._id);

    this.api.shareEvent(id, sharedWith).subscribe({
      next: () => {
        this.impulsadores.update(list => list.map(i => i._id === imp._id ? { ...i, assigned: nextAssigned } : i));
        this.toast.success(nextAssigned ? `${imp.name} activado para este evento` : `${imp.name} desactivado`);
      },
      error: (err) => this.toast.error(err.error?.message || 'Error al actualizar impulsador'),
    });
  }

  copyImpulsadorLink(imp: Impulsador) {
    const slug = this.store.event()?.slug;
    if (!slug || !imp.referralCode) return;
    const url = `${this.store.publicUrl(slug)}?ref=${imp.referralCode}`;
    void navigator.clipboard.writeText(url).then(() => {
      this.impulsadorLinkCopiedId.set(imp._id);
      this.toast.success('Link copiado al portapapeles');
      setTimeout(() => this.impulsadorLinkCopiedId.set(''), 2000);
    });
  }

  openExternalForm() {
    this.externalForm = { name: '', phone: '', email: '' };
    this.showExternalForm.set(true);
  }

  closeExternalForm() {
    this.showExternalForm.set(false);
  }

  saveExternalImpulsador() {
    if (!this.externalForm.name.trim()) { this.toast.error('El nombre es requerido'); return; }
    this.savingExternal.set(true);
    const body = {
      name: this.externalForm.name.trim(),
      phone: this.externalForm.phone.trim() || undefined,
      email: this.externalForm.email.trim() || undefined,
    };
    this.api.createExternalImpulsador(body).subscribe({
      next: (created) => {
        this.impulsadores.update(list => [...list, {
          _id: created._id, name: created.name, email: created.email ?? '',
          referralCode: created.code, assigned: true, type: 'external',
        }]);
        this.savingExternal.set(false);
        this.showExternalForm.set(false);
        this.toast.success('Impulsador externo creado');
      },
      error: (err) => {
        this.savingExternal.set(false);
        this.toast.error(err.error?.message || 'Error al crear impulsador');
      },
    });
  }

  async deleteExternalImpulsador(imp: Impulsador) {
    const ok = await this.confirm.confirm({
      title: 'Eliminar impulsador',
      message: `¿Eliminar a "${imp.name}"? Su link dejará de funcionar para nuevos registros.`,
      confirmText: 'Eliminar',
      danger: true,
    });
    if (!ok) return;
    this.api.deleteExternalImpulsador(imp._id).subscribe({
      next: () => {
        this.impulsadores.update(list => list.filter(i => i._id !== imp._id));
        this.toast.success('Impulsador eliminado');
      },
      error: (err) => this.toast.error(err.error?.message || 'Error al eliminar'),
    });
  }

  downloadImpulsadoresExcel() {
    const list = this.impulsadores();
    const slug = this.store.event()?.slug;
    const headers = ['Nombre', 'Email', 'Tipo', 'Estado', 'Link'];

    const rows = list.map(i => [
      i.name,
      i.email ?? '',
      i.type === 'user' ? 'Usuario plataforma' : 'Externo',
      i.assigned ? 'Asignado' : 'No asignado',
      slug && i.referralCode ? `${this.store.publicUrl(slug)}?ref=${i.referralCode}` : '',
    ]);

    downloadCsv(headers, rows, `impulsadores_${this.store.event()?.title ?? 'evento'}_${new Date().toISOString().slice(0, 10)}.csv`);
    this.toast.success('Archivo descargado');
  }
}
