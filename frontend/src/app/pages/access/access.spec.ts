import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { AccessComponent } from './access';
import { AuthService } from '../../auth/auth.service';
import { ToastService } from '../../shared/toast';

function setup(query: Record<string, string>, auth: Partial<AuthService>) {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: AuthService, useValue: auth },
      { provide: ToastService, useValue: { success: vi.fn(), error: vi.fn() } },
      { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap(query) } } },
    ],
  });
  const f = TestBed.createComponent(AccessComponent);
  f.detectChanges();
  return { f, c: f.componentInstance, el: f.nativeElement as HTMLElement };
}

describe('Acceso tras pagar (HU47)', () => {
  it('crea la contraseña con el token del enlace y entra al onboarding', () => {
    const redeemAccess = vi.fn().mockReturnValue(of({ access_token: 'x' }));
    const { c } = setup({ token: 'tok', email: 'ana@x.pe' }, { redeemAccess });
    const nav = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    c.password = 'Clave-123';
    c.confirm = 'Clave-123';
    c.submit();
    expect(redeemAccess).toHaveBeenCalledWith('ana@x.pe', 'tok', 'Clave-123');
    expect(nav).toHaveBeenCalledWith('/onboarding');
  });

  it('C3: enlace usado o vencido → ofrece "Reenviar acceso"', () => {
    const redeemAccess = vi.fn().mockReturnValue(throwError(() => ({ error: { code: 'ACCESS_LINK_INVALID' } })));
    const resendAccess = vi.fn().mockReturnValue(of({ message: 'ok' }));
    const { f, c, el } = setup({ token: 'tok', email: 'ana@x.pe' }, { redeemAccess, resendAccess });
    c.password = c.confirm = 'Clave-123';
    c.submit();
    f.detectChanges();
    expect(el.textContent).toContain('Reenviar acceso');
    c.resend();
    expect(resendAccess).toHaveBeenCalledWith('ana@x.pe');
  });

  it('contraseñas distintas no llaman al servidor', () => {
    const redeemAccess = vi.fn();
    const { c } = setup({ token: 'tok', email: 'ana@x.pe' }, { redeemAccess });
    c.password = 'Clave-123';
    c.confirm = 'Clave-124';
    c.submit();
    expect(redeemAccess).not.toHaveBeenCalled();
    expect(c.error()).toContain('no coinciden');
  });
});
