import { Component, ElementRef, OnInit, afterNextRender, inject, input, output, signal, Injector } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { LucideAngularModule, Phone, X, Send } from 'lucide-angular';
import { ToastService } from '../toast';
import { environment } from '../../../environments/environment';
import { CallsService, CallTarget } from './calls.service';
import { CallOptions, PermissionView, displayContact } from './calls.models';

const API = `${environment.apiUrl}/calls`;

/** Teléfono tal como se guarda en la ficha ("+51 987 654 321") → dígitos. */
export function toContact(value: string): string {
  const v = value.trim();
  return /^[A-Z]{2}\./.test(v) ? v : v.replace(/\D/g, '');
}

/**
 * "Llamar": muestra si el cliente dio permiso de llamada, deja pedirlo y, con
 * permiso vigente, inicia la llamada.
 */
@Component({
  selector: 'app-call-dialog',
  standalone: true,
  imports: [FormsModule, DatePipe, LucideAngularModule],
  template: `
    <div class="cd-overlay" (click)="close()">
      <div class="cd-modal" role="dialog" aria-modal="true" aria-labelledby="cd-title"
           (click)="$event.stopPropagation()" (keydown.escape)="close()">
        <div class="cd-head">
          <h2 id="cd-title"><lucide-icon [img]="Phone" [size]="18" [strokeWidth]="2.4" /> Llamar a {{ name() }}</h2>
          <button type="button" class="btn btn-ghost btn-icon btn-sm" aria-label="Cerrar" (click)="close()">
            <lucide-icon [img]="X" [size]="16" />
          </button>
        </div>

        @if (loadingAccounts()) {
          <p class="cd-muted">Cargando…</p>
        } @else if (!accounts().length) {
          <p class="cd-muted">No hay ninguna cuenta de WhatsApp Cloud API conectada para llamar.</p>
        } @else {
          @if (accounts().length > 1) {
            <label class="cd-field">
              <span>Cuenta de WhatsApp</span>
              <select class="select" name="account" [ngModel]="accountId()" (ngModelChange)="pickAccount($event)">
                @for (a of accounts(); track a._id) { <option [value]="a._id">{{ a.label }}</option> }
              </select>
            </label>
          }

          <div class="cd-status" [class]="'cd-status st-' + (permission()?.status ?? 'loading')" aria-live="polite">
            @if (loadingPermission()) {
              Consultando el permiso de llamada…
            } @else if (permissionError()) {
              {{ permissionError() }}
            } @else {
              @switch (permission()?.status) {
                @case ('granted') { Permiso concedido hasta el {{ permission()!.expiresAt | date: 'dd/MM/yyyy HH:mm' }}. }
                @case ('permanent') { El cliente dio permiso permanente para llamarlo. }
                @case ('pending') { Pediste permiso; esperando la respuesta del cliente. }
                @case ('rejected') { El cliente rechazó la solicitud de llamada. }
                @case ('expired') { El permiso venció{{ permission()!.expiresAt ? ' el ' + (permission()!.expiresAt | date: 'dd/MM/yyyy') : '' }}. Pide uno nuevo. }
                @default { Este cliente todavía no te dio permiso para llamarlo por WhatsApp. }
              }
            }
          </div>

          @if (permission() && !permission()!.canCall && !permission()!.canRequest && !loadingPermission()) {
            <p class="cd-hint">WhatsApp permite pedir permiso 1 vez al día y 2 por semana a cada cliente.</p>
          }

          <div class="cd-actions">
            <button type="button" class="btn btn-secondary" (click)="close()">Cancelar</button>
            @if (permission() && !permission()!.canCall) {
              <button type="button" class="btn btn-secondary" [disabled]="!permission()!.canRequest || requesting()"
                      (click)="request()">
                <lucide-icon [img]="Send" [size]="15" /> {{ requesting() ? 'Enviando…' : 'Pedir permiso' }}
              </button>
            }
            <button #callBtn type="button" class="btn btn-primary" [disabled]="!permission()?.canCall || calls.busy()"
                    (click)="startCall()">
              <lucide-icon [img]="Phone" [size]="15" /> {{ calls.busy() ? 'Llamando…' : 'Llamar' }}
            </button>
          </div>
        }
      </div>
    </div>
  `,
  styles: [`
    .cd-overlay { position: fixed; inset: 0; background: rgba(15,23,42,0.45); backdrop-filter: blur(3px);
      display: flex; align-items: center; justify-content: center; z-index: 130; }
    .cd-modal { background: var(--color-white); border-radius: var(--radius-lg); width: calc(100% - 48px);
      max-width: 480px; padding: 28px 32px; box-shadow: var(--shadow-lg); }
    .cd-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; margin-bottom: 16px; }
    .cd-head h2 { display: flex; align-items: center; gap: 8px; margin: 0; font-family: var(--font-heading);
      font-size: 18px; font-weight: 700; color: var(--color-text-main); }
    .cd-field { display: flex; flex-direction: column; gap: 6px; margin-bottom: 14px; }
    .cd-field > span { font-size: 13px; font-weight: 600; color: var(--color-text-main); }
    .cd-status { padding: 12px 14px; border-radius: var(--radius-md); background: var(--color-bg-light);
      font-size: 14px; color: var(--color-text-main); line-height: 1.5; }
    .cd-status.st-granted, .cd-status.st-permanent { background: var(--color-success-light, var(--color-bg-light)); }
    .cd-status.st-rejected { color: var(--color-error); }
    .cd-hint, .cd-muted { font-size: 13px; color: var(--color-text-muted); margin: 10px 0 0; }
    .cd-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 20px; flex-wrap: wrap; }
    .cd-actions .btn { display: inline-flex; align-items: center; gap: 6px; }
    @media (max-width: 480px) { .cd-modal { padding: 22px 20px; } .cd-actions .btn { flex: 1; justify-content: center; } }
  `],
})
export class CallDialogComponent implements OnInit {
  readonly target = input.required<CallTarget>();
  readonly closed = output<void>();

  readonly calls = inject(CallsService);
  private http = inject(HttpClient);
  private toast = inject(ToastService);
  private host: ElementRef<HTMLElement> = inject(ElementRef);
  private injector = inject(Injector);

  readonly Phone = Phone;
  readonly X = X;
  readonly Send = Send;

  accounts = signal<CallOptions['accounts']>([]);
  accountId = signal('');
  loadingAccounts = signal(true);
  permission = signal<PermissionView | null>(null);
  loadingPermission = signal(false);
  permissionError = signal('');
  requesting = signal(false);

  name(): string {
    const t = this.target();
    return displayContact({ contact: toContact(t.contact), contactName: t.contactName });
  }

  async ngOnInit() {
    try {
      const { accounts } = await this.calls.loadOptions();
      this.accounts.set(accounts);
      const preferred = this.target().accountId;
      const pick =
        accounts.find((a) => a._id === preferred) ?? accounts.find((a) => a.isDefault) ?? accounts[0];
      if (pick) {
        this.accountId.set(pick._id);
        await this.loadPermission();
      }
    } catch {
      this.toast.error('No se pudieron cargar las cuentas de WhatsApp');
    } finally {
      this.loadingAccounts.set(false);
      afterNextRender(() => this.host.nativeElement.querySelector('button')?.focus(), { injector: this.injector });
    }
  }

  async pickAccount(id: string) {
    this.accountId.set(id);
    await this.loadPermission();
  }

  async loadPermission() {
    this.loadingPermission.set(true);
    this.permissionError.set('');
    this.permission.set(null);
    try {
      const res = await firstValueFrom(
        this.http.get<PermissionView>(`${API}/permission`, {
          params: { accountId: this.accountId(), contact: toContact(this.target().contact) },
        }),
      );
      this.permission.set(res);
    } catch (err) {
      const msg = this.message(err, 'No se pudo consultar el permiso de llamada');
      this.permissionError.set(msg);
      this.toast.error(msg);
    } finally {
      this.loadingPermission.set(false);
    }
  }

  async request() {
    this.requesting.set(true);
    try {
      const res = await firstValueFrom(
        this.http.post<PermissionView>(`${API}/permission/request`, {
          accountId: this.accountId(),
          contact: toContact(this.target().contact),
        }),
      );
      this.permission.set(res);
      this.toast.success('Solicitud de permiso enviada por WhatsApp');
    } catch (err) {
      this.toast.error(this.message(err, 'No se pudo enviar la solicitud'));
    } finally {
      this.requesting.set(false);
    }
  }

  async startCall() {
    const ok = await this.calls.call(this.accountId(), toContact(this.target().contact));
    if (ok) this.close();
  }

  close() {
    this.closed.emit();
  }

  private message(err: unknown, fallback: string): string {
    const msg = err instanceof HttpErrorResponse ? (err.error as { message?: unknown })?.message : undefined;
    return typeof msg === 'string' ? msg : fallback;
  }
}
