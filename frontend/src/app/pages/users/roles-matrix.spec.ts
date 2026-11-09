import { TestBed, ComponentFixture } from '@angular/core/testing';
import { of } from 'rxjs';
import { RolesMatrixComponent } from './roles-matrix';
import { RolesApiService, type TenantRole } from '../../core/api/roles-api.service';
import { ToastService } from '../../shared/toast';
import { ConfirmService } from '../../shared/confirm';
import { PermissionsService } from '../../auth/permissions.service';

const ACTIONS = [
  { key: 'create', label: 'Crear' },
  { key: 'edit', label: 'Editar' },
  { key: 'delete', label: 'Eliminar' },
];
const role = (key: string, actions?: Record<string, string[]>): TenantRole => ({
  _id: key, key, label: key, modules: ['inbox', 'customers'], actions, isSystem: true,
});

describe('RolesMatrixComponent — acciones implícitas', () => {
  let fixture: ComponentFixture<RolesMatrixComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RolesMatrixComponent],
      providers: [
        {
          provide: RolesApiService,
          useValue: {
            catalog: () => of({ modules: [], actions: ACTIONS }),
            list: () => of([]),
          },
        },
        { provide: ToastService, useValue: { success: vi.fn(), error: vi.fn() } },
        { provide: ConfirmService, useValue: { confirm: vi.fn() } },
        { provide: PermissionsService, useValue: { reload: vi.fn() } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(RolesMatrixComponent);
    fixture.detectChanges();
  });

  it('sin nada guardado, eliminar conversaciones aparece apagado salvo para el administrador', () => {
    const c = fixture.componentInstance;
    expect(c.canAct(role('MARKETING'), 'inbox', 'delete')).toBe(false);
    expect(c.canAct(role('MARKETING'), 'inbox', 'edit')).toBe(true);
    expect(c.canAct(role('MARKETING'), 'customers', 'delete')).toBe(true);
    expect(c.canAct(role('TENANT_ADMIN'), 'inbox', 'delete')).toBe(true);
  });

  it('marcar "Eliminar" en Bandeja lo guarda de forma explícita', () => {
    const c = fixture.componentInstance;
    c.roles.set([role('MARKETING')]);
    c.toggleAction(c.roles()[0], 'inbox', 'delete');
    expect(c.roles()[0].actions?.['inbox']).toEqual(['create', 'edit', 'delete']);
    expect(c.canAct(c.roles()[0], 'inbox', 'delete')).toBe(true);
  });

  it('lo guardado manda sobre lo implícito', () => {
    const c = fixture.componentInstance;
    expect(c.canAct(role('MARKETING', { inbox: ['delete'] }), 'inbox', 'delete')).toBe(true);
    expect(c.canAct(role('MARKETING', { customers: [] }), 'customers', 'edit')).toBe(false);
  });
});
