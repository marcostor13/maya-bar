import { Component, ElementRef, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ToastService } from '../../shared/toast';
import { injectRoles } from '../../shared/roles';
import { EventsApiService } from '../../core/api/events-api.service';
import {
  LucideAngularModule,
  Zap,
  Users,
  ExternalLink,
  ArrowLeft,
  PieChart,
  UserCheck,
  FileText,
  Layers,
  ClipboardList,
  LayoutTemplate,
  Link2,
} from 'lucide-angular';
import { InvitationDesignerComponent, type DesignSpec } from './invitation-designer';
import { EventDetailStore } from './event-detail.store';
import { EventGeneralTabComponent } from './tabs/event-general-tab';
import { EventMediaTabComponent } from './tabs/event-media-tab';
import { EventFormTabComponent } from './tabs/event-form-tab';
import { EventMarketingTabComponent } from './tabs/event-marketing-tab';
import { EventRegistrationsTabComponent } from './tabs/event-registrations-tab';
import { EventImpulsadoresTabComponent } from './tabs/event-impulsadores-tab';
import { EventCheckinTabComponent } from './tabs/event-checkin-tab';
import { EventStatsTabComponent } from './tabs/event-stats-tab';

type ActiveTab = 'general' | 'media' | 'form' | 'marketing' | 'registrations' | 'checkin' | 'stats' | 'invitation' | 'impulsadores';

@Component({
  selector: 'app-event-detail',
  standalone: true,
  imports: [
    LucideAngularModule,
    RouterLink,
    InvitationDesignerComponent,
    EventGeneralTabComponent,
    EventMediaTabComponent,
    EventFormTabComponent,
    EventMarketingTabComponent,
    EventRegistrationsTabComponent,
    EventImpulsadoresTabComponent,
    EventCheckinTabComponent,
    EventStatsTabComponent,
  ],
  providers: [EventDetailStore],
  template: `
    <div class="page animate-fade-in">

      <!-- ── Header ── -->
      <div class="page-header">
        <div class="header-left">
          <button class="btn btn-ghost btn-icon" routerLink="/events" aria-label="Volver">
            <lucide-icon [img]="ArrowLeft" [size]="20" [strokeWidth]="2.5"></lucide-icon>
          </button>
          <div>
            <h1>{{ isNew() ? 'Nuevo Evento' : (event()?.title || 'Cargando...') }}</h1>
            <p class="subtitle">{{ isNew() ? 'Crea un nuevo evento para tu local.' : 'Gestión y Marketing IA' }}</p>
          </div>
        </div>
        @if (!isNew() && event()?.slug && event()?.status === 'published') {
          <div class="header-actions">
            <a class="btn btn-secondary" [href]="publicUrl(event()!.slug!)" target="_blank">
              <lucide-icon [img]="ExternalLink" [size]="16" [strokeWidth]="2.5"></lucide-icon>
              Ver página pública
            </a>
          </div>
        }
      </div>

      @if (loading()) {
        <div class="skeleton-form card">
          <div class="skeleton-row"></div>
          <div class="skeleton-row"></div>
          <div class="skeleton-row"></div>
        </div>
      } @else {
        <div class="content-layout">
          <div class="main-column">
            <div class="card p-0 overflow-hidden">

              <!-- ── Tabs ── -->
              <div class="tabs-wrap">
                <div class="tabs" #tabsBar>
                  <button class="tab" [class.active]="activeTab() === 'general'" (click)="selectTab('general', $event)">
                    <lucide-icon [img]="FileText" [size]="14"></lucide-icon>
                    General
                  </button>
                  <button class="tab" [class.active]="activeTab() === 'media'" (click)="selectTab('media', $event)">
                    <lucide-icon [img]="Layers" [size]="14"></lucide-icon>
                    Medios
                    @if (mediaFiles().length > 0) {
                      <span class="tab-badge">{{ mediaFiles().length }}</span>
                    }
                  </button>
                  <button class="tab" [class.active]="activeTab() === 'form'" (click)="selectTab('form', $event)">
                    <lucide-icon [img]="ClipboardList" [size]="14"></lucide-icon>
                    Formulario
                    @if (formFields().length > 0) {
                      <span class="tab-badge">{{ formFields().length }}</span>
                    }
                  </button>
                  <button class="tab tab-ai" [class.active]="activeTab() === 'invitation'" (click)="selectTab('invitation', $event)">
                    <lucide-icon [img]="LayoutTemplate" [size]="14"></lucide-icon>
                    Invitación
                  </button>
                  @if (!isNew()) {
                    <button class="tab tab-ai" [class.active]="activeTab() === 'marketing'" (click)="selectTab('marketing', $event)">
                      <lucide-icon [img]="Zap" [size]="14"></lucide-icon>
                      Marketing IA
                    </button>
                    <button class="tab" [class.active]="activeTab() === 'registrations'" (click)="selectTab('registrations', $event)">
                      <lucide-icon [img]="Users" [size]="14"></lucide-icon>
                      Asistentes
                    </button>
                    <button class="tab" [class.active]="activeTab() === 'impulsadores'" (click)="selectTab('impulsadores', $event)">
                      <lucide-icon [img]="Link2" [size]="14"></lucide-icon>
                      Impulsadores
                    </button>
                    <button class="tab" [class.active]="activeTab() === 'checkin'" (click)="selectTab('checkin', $event)">
                      <lucide-icon [img]="UserCheck" [size]="14"></lucide-icon>
                      Check-in
                    </button>
                    <button class="tab" [class.active]="activeTab() === 'stats'" (click)="selectTab('stats', $event)">
                      <lucide-icon [img]="PieChart" [size]="14"></lucide-icon>
                      Estadísticas
                    </button>
                  }
                </div>
              </div>

              <!-- ── Tab content (un componente hijo por tab) ── -->
              @if (activeTab() === 'general') {
                <app-event-general-tab />
              }

              @if (activeTab() === 'media') {
                <app-event-media-tab />
              }

              @if (activeTab() === 'form') {
                <app-event-form-tab />
              }

              @if (activeTab() === 'invitation') {
                <app-invitation-designer
                  [mediaFiles]="mediaFiles()"
                  [eventId]="eventId()"
                  [initialDesign]="design()"
                  (designChange)="onDesignChange($event)">
                </app-invitation-designer>
              }

              @if (activeTab() === 'marketing' && !isNew()) {
                <app-event-marketing-tab />
              }

              @if (activeTab() === 'registrations' && !isNew()) {
                <app-event-registrations-tab />
              }

              @if (activeTab() === 'impulsadores' && !isNew()) {
                <app-event-impulsadores-tab />
              }

              @if (activeTab() === 'checkin' && !isNew()) {
                <app-event-checkin-tab />
              }

              @if (activeTab() === 'stats' && !isNew()) {
                <app-event-stats-tab />
              }

            </div>
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    .page { width: 100%; box-sizing: border-box; padding: 32px 40px; }
    /* Los modales de los tabs hijos (position:fixed) viven dentro de .page; sin esto el
       transform residual de fadeInUp (fill forwards) crearía un containing block y los
       desalinearía. El estado final de la animación coincide con el natural: es invisible. */
    .page.animate-fade-in { animation-fill-mode: none; }
    .page-header { display:flex; align-items:flex-start; justify-content:space-between; margin-bottom:32px; gap:16px; flex-wrap:wrap; }
    .header-left { display: flex; align-items: center; gap: 16px; }
    .page-header h1 { font-size:26px; font-weight:800; margin:0 0 4px; font-family:var(--font-heading); letter-spacing:-0.5px; }
    .subtitle { color:var(--color-text-muted); margin:0; font-size:15px; }

    .content-layout { display: flex; flex-direction: column; gap: 24px; }
    .main-column { flex: 1; }

    /* ── Tabs ── */
    .tabs-wrap { position: relative; }
    .tabs-wrap::before, .tabs-wrap::after { content: ''; position: absolute; top: 0; bottom: 1px; width: 28px; pointer-events: none; z-index: 3; opacity: 0; transition: opacity 0.2s; }
    .tabs-wrap::before { left: 0; background: linear-gradient(to right, #fafafa, transparent); }
    .tabs-wrap::after { right: 0; background: linear-gradient(to left, #fafafa, transparent); }
    .tabs { display: flex; border-bottom: 1px solid var(--color-border); background: #fafafa; padding: 0 16px; overflow-x: auto; scrollbar-width: none; -webkit-overflow-scrolling: touch; scroll-behavior: smooth; }
    .tabs::-webkit-scrollbar { display: none; }
    .tab { padding: 16px 20px; font-size: 14px; font-weight: 600; color: var(--color-text-muted); background: none; border: none; border-bottom: 2px solid transparent; cursor: pointer; transition: all 0.2s; display: flex; align-items: center; gap: 6px; margin-bottom: -1px; white-space: nowrap; flex-shrink: 0; }
    .tab:hover { color: var(--color-text-main); }
    .tab.active { color: var(--color-brand); border-bottom-color: var(--color-brand); background: #fff; }
    .tab-ai { color: var(--color-brand); opacity: 0.8; }
    .tab-ai.active { opacity: 1; }
    .tab-badge { background: var(--color-brand); color: #fff; font-size: 11px; font-weight: 700; padding: 1px 6px; border-radius: 99px; min-width: 18px; text-align: center; }

    /* ── Utils ── */
    .p-0 { padding: 0; }
    .overflow-hidden { overflow: hidden; }

    /* ── Skeleton ── */
    .skeleton-form { display:flex; flex-direction:column; gap:24px; padding:32px; }
    .skeleton-row { height:48px; background:var(--color-bg-app); border-radius:var(--radius-lg); animation:pulse 1.5s ease-in-out infinite; }
    .skeleton-row:nth-child(2) { height:120px; }
    @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.4} }

    @media (max-width: 768px) {
      .page { padding: 20px 16px; }
      .page-header { margin-bottom: 20px; }
      .page-header h1 { font-size: 21px; }
      .subtitle { font-size: 13px; }
      .header-actions { width: 100%; }
      .header-actions .btn { width: 100%; justify-content: center; }

      .tabs-wrap::before, .tabs-wrap::after { opacity: 1; }
      .tabs { padding: 0 8px; }
      .tab { padding: 13px 12px; font-size: 13px; gap: 5px; }
    }

    @media (max-width: 480px) {
      .page { padding: 16px 12px; }
      .page-header h1 { font-size: 19px; }
      .header-left { gap: 10px; }
    }
  `],
})
export class EventDetailComponent implements OnInit {
  private store = inject(EventDetailStore);
  private api = inject(EventsApiService);
  private toast = inject(ToastService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private host = inject(ElementRef<HTMLElement>);

  readonly Zap = Zap; readonly Users = Users; readonly ExternalLink = ExternalLink;
  readonly ArrowLeft = ArrowLeft; readonly PieChart = PieChart; readonly UserCheck = UserCheck;
  readonly FileText = FileText; readonly Layers = Layers; readonly ClipboardList = ClipboardList;
  readonly LayoutTemplate = LayoutTemplate; readonly Link2 = Link2;

  activeTab = signal<ActiveTab>('general');

  isNew = this.store.isNew;
  eventId = this.store.eventId;
  event = this.store.event;
  loading = this.store.loading;
  mediaFiles = this.store.mediaFiles;
  formFields = this.store.formFields;
  design = this.store.design;

  private roles = injectRoles();
  canManage = this.roles.canManage;

  ngOnInit() {
    this.route.paramMap.subscribe(params => {
      const id = params.get('id');
      if (id === 'new') {
        this.store.isNew.set(true);
        this.store.localId.set(this.route.snapshot.queryParamMap.get('localId'));
        this.store.loading.set(false);
        this.scrollActiveTabIntoView();
        if (!this.store.localId()) {
          this.toast.error('Local no especificado para el evento');
          this.router.navigate(['/events']);
        }
      } else if (id) {
        this.store.eventId.set(id);
        this.loadEvent(id);
      }
    });
    const tab = this.route.snapshot.queryParamMap.get('tab') as ActiveTab | null;
    if (tab) this.activeTab.set(tab);
    if (tab === 'impulsadores') this.store.loadImpulsadores();
  }

  selectTab(tab: ActiveTab, evt?: Event) {
    this.activeTab.set(tab);
    if (tab === 'impulsadores') this.store.loadImpulsadores();
    (evt?.currentTarget as HTMLElement | undefined)
      ?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }

  /** En móvil la barra de tabs scrollea: asegura que el tab activo (p.ej. deep-link ?tab=) quede visible. */
  private scrollActiveTabIntoView() {
    setTimeout(() => {
      this.host.nativeElement.querySelector('.tab.active')
        ?.scrollIntoView({ inline: 'center', block: 'nearest' });
    });
  }

  loadEvent(id: string) {
    this.store.loading.set(true);
    this.api.getEvent(id).subscribe({
      next: (ev) => {
        this.store.event.set(ev);
        this.store.previewUrl.set(ev.imageUrl ?? '');
        this.store.mediaFiles.set(ev.mediaFiles ?? []);
        this.store.formFields.set(ev.formFields ?? []);
        this.store.design.set(ev.invitationDesign ?? null);
        this.store.form.patchValue({
          title: ev.title, description: ev.description ?? '',
          date: ev.date ? ev.date.slice(0, 10) : '',
          startTime: ev.startTime ?? '', endTime: ev.endTime ?? '',
          price: ev.price, capacity: ev.capacity, status: ev.status,
        });
        this.store.loading.set(false);
        this.scrollActiveTabIntoView();
        this.store.loadRegistrations(id);
      },
      error: () => {
        this.toast.error('No se pudo cargar el evento');
        this.router.navigate(['/events']);
      }
    });
  }

  onDesignChange(d: DesignSpec) { this.store.design.set(d); }

  publicUrl(slug: string): string { return this.store.publicUrl(slug); }
}
