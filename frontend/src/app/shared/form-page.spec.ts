import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { provideLocationMocks, SpyLocation } from '@angular/common/testing';
import { Location } from '@angular/common';
import { FormPageComponent } from './form-page';
import { ConfirmService } from './confirm';

@Component({
  standalone: true,
  imports: [FormPageComponent],
  template: `
    @if (open()) {
      <app-form-page title="Nuevo lead" subtitle="Datos del contacto" backLabel="Leads" [dirty]="dirty()" urlKey="nuevo" (closed)="open.set(false)">
        <button formActions class="btn btn-primary" (click)="saved = true">Guardar</button>
        <input name="nombre" />
      </app-form-page>
    } @else {
      <p class="list">Listado</p>
    }
  `,
})
class HostPage {
  open = signal(true);
  dirty = signal(false);
  saved = false;
}

describe('FormPageComponent', () => {
  let harness: RouterTestingHarness;
  let host: HostPage;
  const confirm = { confirm: vi.fn(), state: () => null };
  const el = () => harness.routeNativeElement as HTMLElement;
  const settle = async () => {
    for (let i = 0; i < 6; i++) await Promise.resolve();
    // El router atiende el popstate (location.back) en un setTimeout.
    await new Promise((r) => setTimeout(r));
    await harness.fixture.whenStable();
    harness.detectChanges();
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'leads', component: HostPage }]),
        // Historial simulado: cerrar hace location.back() y hay que verlo.
        provideLocationMocks(),
        { provide: ConfirmService, useValue: confirm },
      ],
    });
    harness = await RouterTestingHarness.create();
    // Como en la app: el router escucha atrás/adelante del historial.
    TestBed.inject(Router).setUpLocationChangeListener();
    host = await harness.navigateByUrl('/leads', HostPage);
    await settle();
  });

  it('ocupa la pantalla con título, miga, acciones y contenido', () => {
    const page = el().querySelector('[role="dialog"]')!;
    expect(page.querySelector('h1')!.textContent).toBe('Nuevo lead');
    expect(page.querySelector('.crumb')!.textContent).toBe('Leads');
    expect(page.querySelector('.sub')!.textContent).toBe('Datos del contacto');
    expect(page.querySelector('.bar-actions button')!.textContent).toBe('Guardar');
    expect(page.querySelector('.form-page-body input[name="nombre"]')).not.toBeNull();
    expect(page.getAttribute('aria-labelledby')).toBe(page.querySelector('h1')!.id);
  });

  it('pone ?form= en la URL y lo quita al volver', async () => {
    expect(TestBed.inject(Router).url).toBe('/leads?form=nuevo');
    el().querySelector<HTMLButtonElement>('.back')!.click();
    await settle();
    await settle(); // el cierre deshace la entrada con location.back()
    expect(host.open()).toBe(false);
    expect(TestBed.inject(Router).url).toBe('/leads');
    // Sin entrada "vacía": la URL de antes es la del listado sin ?form=.
    const location = TestBed.inject(Location) as SpyLocation;
    expect(location.path()).toBe('/leads');
    expect(el().querySelector('.list')).not.toBeNull();
  });

  it('el atrás del navegador (quitar ?form=) cierra el formulario', async () => {
    await TestBed.inject(Router).navigateByUrl('/leads');
    await settle();
    expect(host.open()).toBe(false);
  });

  it('atrás del navegador con cambios sin guardar pregunta; seguir editando repone ?form=', async () => {
    host.dirty.set(true);
    harness.detectChanges();
    confirm.confirm.mockResolvedValue(false);
    await TestBed.inject(Router).navigateByUrl('/leads');
    await settle();
    await settle();
    expect(confirm.confirm).toHaveBeenCalledWith(expect.objectContaining({ title: 'Descartar cambios' }));
    expect(host.open()).toBe(true);
    expect(TestBed.inject(Router).url).toBe('/leads?form=nuevo');

    confirm.confirm.mockResolvedValue(true);
    await TestBed.inject(Router).navigateByUrl('/leads');
    await settle();
    await settle();
    expect(host.open()).toBe(false);
  });

  it('con cambios sin guardar pregunta y, si se sigue editando, no cierra', async () => {
    host.dirty.set(true);
    harness.detectChanges();
    confirm.confirm.mockResolvedValue(false);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await settle();
    expect(confirm.confirm).toHaveBeenCalledWith(expect.objectContaining({ title: 'Descartar cambios' }));
    expect(host.open()).toBe(true);

    confirm.confirm.mockResolvedValue(true);
    el().querySelector<HTMLButtonElement>('.back')!.click();
    await settle();
    expect(host.open()).toBe(false);
  });

  it('sin cambios cierra sin preguntar', async () => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await settle();
    expect(confirm.confirm).not.toHaveBeenCalled();
    expect(host.open()).toBe(false);
  });

  it('con un modal abierto encima, ESC no cierra el formulario', async () => {
    const modal = document.createElement('div');
    modal.className = 'overlay';
    document.body.appendChild(modal);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await settle();
    modal.remove();
    expect(host.open()).toBe(true);
  });
});
