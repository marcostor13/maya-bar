import { Injectable, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { ToastService } from '../../shared/toast';
import { snapshotOf } from '../../shared/form-page';
import { EventsApiService } from '../../core/api/events-api.service';
import {
  AppEvent,
  FormField,
  Impulsador,
  ImpulsadorStat,
  MediaFile,
  Registration, TicketType } from '../../shared/models/event.model';
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
  /** Venta en línea con Mercado Pago (HU67). */
  onlinePayment = signal(false);
  ticketTypes = signal<TicketType[]>([]);

  // Invitation design (kept in memory for new events, saved with event)
  design = signal<DesignSpec | null>(null);

  registrations = signal<Registration[]>([]);
  regsLoading = signal(false);
  /**
   * Todos los registros, sin los filtros de Asistentes: de aquí salen el
   * check-in y los contadores, que no deben cambiar al filtrar (HU30).
   */
  allRegistrations = signal<Registration[]>([]);
  confirmedRegistrations = computed(() => this.allRegistrations().filter(r => r.status !== 'cancelled'));

  // Filtros de Asistentes (el check-in tiene su propia búsqueda, HU30)
  regSearch = signal('');
  regStatusFilter = signal('all');
  regSortBy = signal('createdAt');
  regSortOrder = signal<'asc' | 'desc'>('desc');

  // Impulsadores
  impulsadores = signal<Impulsador[]>([]);
  impulsadoresLoading = signal(false);
  userImpulsadores = computed(() => this.impulsadores().filter(i => i.type === 'user'));
  externalImpulsadores = computed(() => this.impulsadores().filter(i => i.type === 'external'));

  // En personas, sobre los confirmados, arriba y abajo (HU30).
  checkedInCount = computed(() =>
    this.confirmedRegistrations().filter(r => r.checkedIn).reduce((acc, r) => acc + r.partySize, 0));
  totalAttendees = computed(() => this.confirmedRegistrations().reduce((acc, r) => acc + r.partySize, 0));
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
    for (const r of this.confirmedRegistrations()) {
      const key = r.impulsadorName || 'Directo';
      const stat = map.get(key) ?? { name: key, registrations: 0, attendees: 0, checkedIn: 0 };
      stat.registrations += 1;
      stat.attendees += r.partySize;
      if (r.checkedIn) stat.checkedIn += r.partySize;
      map.set(key, stat);
    }
    return [...map.values()].sort((a, b) => b.attendees - a.attendees);
  });

  maxImpulsadorAttendees = computed(() => Math.max(1, ...this.impulsadorStats().map(s => s.attendees)));

  form = this.fb.group({
    title:       ['', Validators.required],
    description: [''],
    location:    [''],
    date:        ['', Validators.required],
    startTime:   [''],
    endTime:     [''],
    price:       [0],
    capacity:    [0],
    status:      ['draft'],
  });

  /** Valor del formulario como signal, para poder calcular `dirty`. */
  private formValue = toSignal(this.form.valueChanges, { initialValue: this.form.getRawValue() });

  /** Lo último guardado (o cargado); `dirty` compara contra esto (HU29). */
  private savedSnapshot = signal(this.currentSnapshot());

  dirty = computed(() => this.currentSnapshot() !== this.savedSnapshot());

  private currentSnapshot(): string {
    return snapshotOf({
      form: this.formValue(),
      previewUrl: this.previewUrl(),
      mediaFiles: this.mediaFiles(),
      formFields: this.formFields(),
      onlinePayment: this.onlinePayment(),
      ticketTypes: this.ticketTypes(),
    });
  }

  /** Marca el estado actual como guardado (tras cargar o guardar). */
  markSaved() { this.savedSnapshot.set(this.currentSnapshot()); }

  loadRegistrations(id?: string) {
    const eventId = id ?? this.eventId();
    if (!eventId) return;
    this.regsLoading.set(true);
    const status = this.regStatusFilter() !== 'all' ? this.regStatusFilter() : undefined;
    const search = this.regSearch().trim() || undefined;
    this.api.getRegistrations(eventId, {
      sortBy: this.regSortBy(),
      sortOrder: this.regSortOrder(),
      status,
      search,
    }).subscribe({
      next: (r) => {
        this.registrations.set(r);
        if (!status && !search) this.allRegistrations.set(r);
        this.regsLoading.set(false);
      },
      error: () => this.regsLoading.set(false),
    });
  }

  /** Aplica un registro actualizado (check-in o deshacer) a las dos listas. */
  applyRegistration(updated: Registration) {
    const swap = (list: Registration[]) => list.map(r => (r._id === updated._id ? { ...r, ...updated } : r));
    this.registrations.update(swap);
    this.allRegistrations.update(swap);
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
    const val = { ...this.form.value, onlinePayment: this.onlinePayment(), ticketTypes: this.cleanTicketTypes() };
    if (val.onlinePayment && !val.ticketTypes.length) {
      this.toast.error('Agrega al menos un tipo de entrada para vender en línea');
      return;
    }
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
        // Antes de navegar: si no, el aviso de cambios sin guardar saltaría.
        this.markSaved();
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

  private cleanTicketTypes(): TicketType[] {
    return this.ticketTypes()
      .filter(t => t.name.trim())
      .map(t => ({
        ...(t.key ? { key: t.key } : {}),
        name: t.name.trim(),
        price: Math.max(0, Number(t.price) || 0),
        capacity: Math.max(0, Math.floor(Number(t.capacity) || 0)),
        salesEndAt: t.salesEndAt ? new Date(t.salesEndAt).toISOString() : null,
      }));
  }

  publicUrl(slug: string): string { return `${window.location.origin}/e/${slug}`; }
}
