import { Injectable, computed, inject, signal } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { ToastService } from '../../shared/toast';
import { EventsApiService } from '../../core/api/events-api.service';
import {
  AppEvent,
  FormField,
  Impulsador,
  ImpulsadorStat,
  MediaFile,
  Registration,
} from '../../shared/models/event.model';
import type { DesignSpec } from './invitation-designer';

/**
 * Estado compartido del detalle de evento (signals) + operaciones cross-tab.
 * Se provee a nivel de EventDetailComponent (providers: [EventDetailStore]),
 * de modo que el padre y todos los tabs hijos comparten la misma instancia.
 */
@Injectable()
export class EventDetailStore {
  private api = inject(EventsApiService);
  private fb = inject(FormBuilder);
  private toast = inject(ToastService);
  private router = inject(Router);

  isNew = signal(false);
  eventId = signal<string | null>(null);
  localId = signal<string | null>(null);
  event = signal<AppEvent | null>(null);

  loading = signal(true);
  saving = signal(false);

  previewUrl = signal('');

  // Media files
  mediaFiles = signal<MediaFile[]>([]);

  // Form fields (custom questions)
  formFields = signal<FormField[]>([]);

  // Invitation design (kept in memory for new events, saved with event)
  design = signal<DesignSpec | null>(null);

  registrations = signal<Registration[]>([]);
  regsLoading = signal(false);

  // Registrations filters (regSearch se comparte entre Asistentes y Check-in)
  regSearch = signal('');
  regStatusFilter = signal('all');
  regSortBy = signal('createdAt');
  regSortOrder = signal<'asc' | 'desc'>('desc');

  // Impulsadores
  impulsadores = signal<Impulsador[]>([]);
  impulsadoresLoading = signal(false);
  userImpulsadores = computed(() => this.impulsadores().filter(i => i.type === 'user'));
  externalImpulsadores = computed(() => this.impulsadores().filter(i => i.type === 'external'));

  filteredRegistrations = computed(() => {
    const search = this.regSearch().toLowerCase();
    const regs = this.registrations();
    if (!search) return regs;
    return regs.filter(r =>
      r.name.toLowerCase().includes(search) ||
      r.email.toLowerCase().includes(search) ||
      r.ticketCode.toLowerCase().includes(search)
    );
  });

  checkedInCount = computed(() => this.registrations().filter(r => r.checkedIn).length);
  totalAttendees = computed(() => this.registrations().reduce((acc, r) => acc + r.partySize, 0));
  attendanceRate = computed(() => {
    if (this.totalAttendees() === 0) return 0;
    return Math.round((this.checkedInCount() / this.totalAttendees()) * 100);
  });
  estimatedRevenue = computed(() => {
    const p = this.event()?.price || 0;
    return this.totalAttendees() * p;
  });

  impulsadorStats = computed<ImpulsadorStat[]>(() => {
    const map = new Map<string, ImpulsadorStat>();
    for (const r of this.registrations()) {
      const key = r.impulsadorName || 'Directo';
      const stat = map.get(key) ?? { name: key, registrations: 0, attendees: 0, checkedIn: 0 };
      stat.registrations += 1;
      stat.attendees += r.partySize;
      if (r.checkedIn) stat.checkedIn += 1;
      map.set(key, stat);
    }
    return [...map.values()].sort((a, b) => b.attendees - a.attendees);
  });

  maxImpulsadorAttendees = computed(() => Math.max(1, ...this.impulsadorStats().map(s => s.attendees)));

  form = this.fb.group({
    title:       ['', Validators.required],
    description: [''],
    date:        ['', Validators.required],
    startTime:   [''],
    endTime:     [''],
    price:       [0],
    capacity:    [0],
    status:      ['draft'],
  });

  loadRegistrations(id?: string) {
    const eventId = id ?? this.eventId();
    if (!eventId) return;
    this.regsLoading.set(true);
    this.api.getRegistrations(eventId, {
      sortBy: this.regSortBy(),
      sortOrder: this.regSortOrder(),
      status: this.regStatusFilter() !== 'all' ? this.regStatusFilter() : undefined,
      search: this.regSearch().trim() || undefined,
    }).subscribe({
      next: (r) => { this.registrations.set(r); this.regsLoading.set(false); },
      error: () => this.regsLoading.set(false),
    });
  }

  loadImpulsadores() {
    const id = this.eventId();
    if (!id) return;
    this.impulsadoresLoading.set(true);
    this.api.getImpulsadores(id).subscribe({
      next: (list) => { this.impulsadores.set(list); this.impulsadoresLoading.set(false); },
      error: () => { this.impulsadoresLoading.set(false); this.toast.error('No se pudo cargar impulsadores'); },
    });
  }

  saveEvent() {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.saving.set(true);
    const val = this.form.value;
    const body = this.isNew()
      ? { ...val, localId: this.localId(), imageUrl: this.previewUrl() || undefined, mediaFiles: this.mediaFiles(), formFields: this.formFields(), ...(this.design() ? { invitationDesign: this.design() } : {}) }
      : { ...val, imageUrl: this.previewUrl() || undefined, mediaFiles: this.mediaFiles(), formFields: this.formFields() };

    const req = this.isNew()
      ? this.api.createEvent(body)
      : this.api.updateEvent(this.eventId()!, body);

    req.subscribe({
      next: (savedEv) => {
        this.toast.success(this.isNew() ? 'Evento creado' : 'Evento actualizado');
        this.saving.set(false);
        if (this.isNew()) {
          this.router.navigate(['/events', savedEv._id], { queryParams: { tab: 'invitation' } });
        } else {
          this.event.set(savedEv);
        }
      },
      error: (err) => {
        this.toast.error(err.error?.message || 'Error al guardar');
        this.saving.set(false);
      },
    });
  }

  publicUrl(slug: string): string { return `${window.location.origin}/e/${slug}`; }
}
