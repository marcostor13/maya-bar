import { Component, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { LucideAngularModule, Check, ScanLine, Search, X } from 'lucide-angular';
import { ToastService } from '../../../shared/toast';
import { EventsApiService } from '../../../core/api/events-api.service';
import { Registration } from '../../../shared/models/event.model';
import { EventDetailStore } from '../event-detail.store';

@Component({
  selector: 'app-event-checkin-tab',
  standalone: true,
  imports: [LucideAngularModule],
  template: `
    <div class="p-6 animate-fade-in">
      <div class="checkin-toolbar">
        <div class="search-box">
          <lucide-icon [img]="Search" [size]="18"></lucide-icon>
          <input type="text" placeholder="Buscar por nombre, email o ticket..."
            [value]="regSearch()" (input)="regSearch.set($any($event.target).value)" />
        </div>
        <button class="btn btn-primary checkin-scan-btn" (click)="openScanner()">
          <lucide-icon [img]="ScanLine" [size]="16" [strokeWidth]="2.5"></lucide-icon>
          Escanear QR
        </button>
        <div class="stats-mini">
          <strong>{{ checkedInCount() }}</strong> / {{ totalAttendees() }} presentes
        </div>
      </div>
      @if (filteredRegistrations().length === 0) {
        <div class="regs-empty">
          <lucide-icon [img]="Search" [size]="48" [strokeWidth]="1.5"></lucide-icon>
          <p>No se encontraron asistentes con ese criterio.</p>
        </div>
      } @else {
        <div class="checkin-list">
          @for (r of filteredRegistrations(); track r._id) {
            <div class="checkin-card" [class.is-checked]="r.checkedIn">
              <div class="checkin-info">
                <strong>{{ r.name }}</strong>
                <div class="checkin-meta">
                  <span>{{ r.email }}</span>
                  <span class="dot">·</span>
                  <code class="ticket-code-sm">{{ r.ticketCode }}</code>
                  <span class="dot">·</span>
                  <span>{{ r.impulsadorName || 'Directo' }}</span>
                </div>
              </div>
              <div class="checkin-action">
                @if (r.checkedIn) {
                  <div class="checked-label">
                    <lucide-icon [img]="Check" [size]="16" [strokeWidth]="3"></lucide-icon>
                    Listo
                  </div>
                } @else {
                  <button class="btn btn-sm btn-primary" (click)="doCheckIn(r)" [disabled]="checkingInId() === r._id">
                    {{ checkingInId() === r._id ? '...' : 'Check-in' }}
                  </button>
                }
              </div>
            </div>
          }
        </div>
      }
    </div>

    <!-- ── QR Scanner modal ── -->
    @if (scannerOpen()) {
      <div class="overlay" role="dialog" aria-modal="true">
        <div class="scanner-modal">
          <div class="scanner-header">
            <h3>Escanear código QR</h3>
            <button class="btn btn-ghost btn-icon" (click)="closeScanner()" aria-label="Cerrar">
              <lucide-icon [img]="X" [size]="20" [strokeWidth]="2.5"></lucide-icon>
            </button>
          </div>
          <div id="qr-reader" class="qr-reader"></div>
          @if (lastScanResult()) {
            <div class="scan-result" [class.already]="lastScanResult()!.alreadyCheckedIn">
              <lucide-icon [img]="Check" [size]="20" [strokeWidth]="3"></lucide-icon>
              <div>
                <strong>{{ lastScanResult()!.name }}</strong>
                <span>{{ lastScanResult()!.impulsadorName ? 'Invitado por ' + lastScanResult()!.impulsadorName : 'Invitación directa' }}</span>
              </div>
            </div>
          }
          <p class="scanner-hint">Apunta la cámara al código QR de la invitación.</p>
        </div>
      </div>
    }
  `,
  styles: [`
    :host { display: block; }

    .p-6 { padding: 24px; }

    .regs-empty { padding:64px 40px; text-align:center; color:var(--color-text-muted); display:flex; flex-direction:column; align-items:center; gap:16px; background:var(--color-bg-app); border-radius:16px; border:1px dashed var(--color-border); }

    /* ── Check-in ── */
    .checkin-toolbar { display:flex; align-items:center; gap:16px; margin-bottom:24px; }
    .search-box { flex:1; position:relative; display:flex; align-items:center; }
    .search-box lucide-icon { position:absolute; left:16px; color:var(--color-text-muted); pointer-events:none; }
    .search-box input { width:100%; padding:12px 16px 12px 48px; border-radius:12px; border:1px solid var(--color-border); background:var(--color-bg-app); font-size:15px; outline:none; transition:all 0.2s; }
    .search-box input:focus { border-color:var(--color-brand); background:#fff; box-shadow:0 0 0 4px var(--color-brand-light); }
    .stats-mini { font-size:14px; color:var(--color-text-muted); white-space:nowrap; }
    .stats-mini strong { color:var(--color-brand); font-size:18px; }
    .checkin-list { display:flex; flex-direction:column; gap:12px; }
    .checkin-card { display:flex; align-items:center; justify-content:space-between; padding:16px 20px; background:#fff; border:1px solid var(--color-border); border-radius:16px; transition:all 0.2s; }
    .checkin-card:hover { border-color:var(--color-brand); transform:translateX(4px); }
    .checkin-card.is-checked { background:var(--color-brand-light); border-color:rgba(225,29,72,0.2); }
    .checkin-info { display:flex; flex-direction:column; gap:4px; }
    .checkin-info strong { font-size:16px; color:var(--color-text-main); }
    .checkin-meta { display:flex; align-items:center; gap:8px; font-size:13px; color:var(--color-text-muted); }
    .dot { opacity:0.5; }
    .ticket-code-sm { font-family:monospace; font-weight:700; color:var(--color-brand); background:rgba(255,255,255,0.5); padding:2px 6px; border-radius:4px; }
    .checked-label { display:flex; align-items:center; gap:6px; color:var(--color-brand); font-weight:700; font-size:14px; text-transform:uppercase; }

    .overlay { position: fixed; inset: 0; background: rgba(15,23,42,0.45); backdrop-filter: blur(3px); display: flex; align-items: center; justify-content: center; z-index: 100; }

    /* ── QR Scanner modal ── */
    .scanner-modal { width:calc(100% - 48px); max-width:420px; padding:28px 32px; background:#fff; border-radius:24px; box-shadow:var(--shadow-lg); }
    .scanner-header { display:flex; align-items:center; justify-content:space-between; margin-bottom:16px; }
    .scanner-header h3 { margin:0; font-size:18px; font-weight:700; font-family:var(--font-heading); }
    .qr-reader { width:100%; border-radius:16px; overflow:hidden; background:#000; min-height:250px; }
    .scanner-hint { text-align:center; color:var(--color-text-muted); font-size:13px; margin:16px 0 0; }
    .scan-result { display:flex; align-items:center; gap:12px; padding:14px 16px; border-radius:14px; background:#dcfce7; color:#16a34a; margin-top:16px; }
    .scan-result.already { background:#fef3c7; color:#92400e; }
    .scan-result div { display:flex; flex-direction:column; gap:2px; font-size:13px; }
    .scan-result strong { font-size:15px; }

    @media (max-width: 768px) {
      .p-6 { padding: 16px; }

      .checkin-card { flex-wrap: wrap; gap: 12px; }
      .checkin-action { width: 100%; }
      .checkin-action .btn { width: 100%; justify-content: center; }
      .checkin-meta { flex-wrap: wrap; }

      .checkin-toolbar { flex-wrap: wrap; gap: 12px; margin-bottom: 20px; }
      .search-box { flex: 1 1 100%; }
      .checkin-scan-btn { flex: 1; justify-content: center; }
      .stats-mini { flex-shrink: 0; text-align: right; }

      .overlay { padding: 0; }
      .scanner-modal { padding: 22px 20px; }
    }

    @media (max-width: 480px) {
      .checkin-card { padding: 14px; }
    }
  `],
})
export class EventCheckinTabComponent {
  private store = inject(EventDetailStore);
  private api = inject(EventsApiService);
  private toast = inject(ToastService);

  readonly Check = Check; readonly ScanLine = ScanLine; readonly Search = Search; readonly X = X;

  regSearch = this.store.regSearch;
  filteredRegistrations = this.store.filteredRegistrations;
  checkedInCount = this.store.checkedInCount;
  totalAttendees = this.store.totalAttendees;

  checkingInId = signal<string | null>(null);

  // Check-in QR scan
  scannerOpen = signal(false);
  scanning = signal(false);
  lastScanResult = signal<{ name: string; impulsadorName: string | null; alreadyCheckedIn: boolean } | null>(null);
  private html5Qrcode: import('html5-qrcode').Html5Qrcode | null = null;

  doCheckIn(reg: Registration) {
    const id = this.store.eventId();
    if (!id) return;
    this.checkingInId.set(reg._id);
    this.api.checkIn(id, reg._id).subscribe({
      next: (updated) => {
        this.store.registrations.update(prev => prev.map(r => r._id === updated._id ? updated : r));
        this.toast.success(`Check-in de ${reg.name} completado`);
        this.checkingInId.set(null);
      },
      error: () => {
        this.toast.error('No se pudo realizar el check-in');
        this.checkingInId.set(null);
      }
    });
  }

  // ── Check-in por QR ──────────────────────────────────────────────────────

  async openScanner() {
    this.lastScanResult.set(null);
    this.scannerOpen.set(true);
    this.scanning.set(true);
    const { Html5Qrcode } = await import('html5-qrcode');
    setTimeout(async () => {
      try {
        this.html5Qrcode = new Html5Qrcode('qr-reader');
        await this.html5Qrcode.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: 250 },
          (decodedText) => this.onQrDecoded(decodedText),
          () => { /* ignore per-frame decode errors */ },
        );
      } catch {
        this.toast.error('No se pudo acceder a la cámara');
        this.scanning.set(false);
      }
    });
  }

  async closeScanner() {
    if (this.html5Qrcode) {
      try { await this.html5Qrcode.stop(); this.html5Qrcode.clear(); } catch { /* already stopped */ }
      this.html5Qrcode = null;
    }
    this.scanning.set(false);
    this.scannerOpen.set(false);
  }

  private scanLocked = false;
  private async onQrDecoded(code: string) {
    if (this.scanLocked) return;
    this.scanLocked = true;
    const id = this.store.eventId();
    if (!id) { this.scanLocked = false; return; }

    try {
      const res = await firstValueFrom(this.api.checkInByCode(id, code));
      this.store.registrations.update(prev => prev.map(r => r._id === res._id ? res : r));
      this.lastScanResult.set({ name: res.name, impulsadorName: res.impulsadorName, alreadyCheckedIn: res.alreadyCheckedIn });
      this.toast.success(res.alreadyCheckedIn ? `${res.name} ya tenía check-in` : `Check-in de ${res.name} completado`);
    } catch (err: unknown) {
      const e = err as { error?: { message?: string } };
      this.toast.error(e.error?.message || 'Código no válido');
    } finally {
      setTimeout(() => { this.scanLocked = false; }, 2000);
    }
  }
}
