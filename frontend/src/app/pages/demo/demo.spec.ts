import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { DemoComponent } from './demo';
import { AuthService } from '../../auth/auth.service';
import { ToastService } from '../../shared/toast';

function setup(demoLogin: ReturnType<typeof vi.fn>) {
  const toast = { success: vi.fn(), error: vi.fn() };
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: AuthService, useValue: { demoLogin } },
      { provide: ToastService, useValue: toast },
    ],
  });
  const nav = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
  const f = TestBed.createComponent(DemoComponent);
  f.detectChanges();
  return { f, nav, toast, el: f.nativeElement as HTMLElement };
}

describe('Demo sin contraseña (HU90)', () => {
  it('abre la sesión demo al entrar y va al dashboard', () => {
    const demoLogin = vi.fn().mockReturnValue(of({ access_token: 'x' }));
    const { nav, el } = setup(demoLogin);
    expect(demoLogin).toHaveBeenCalledTimes(1);
    expect(nav).toHaveBeenCalledWith('/dashboard');
    expect(el.querySelector('input[type="password"]')).toBeNull();
  });

  it('si la demo no está disponible, avisa y deja reintentar', () => {
    const demoLogin = vi.fn().mockReturnValue(
      throwError(() => ({ error: { message: 'La demo no está disponible en este momento' } })),
    );
    const { f, nav, toast, el } = setup(demoLogin);
    f.detectChanges();
    expect(nav).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith('La demo no está disponible en este momento');
    expect(el.textContent).toContain('No pudimos abrir la demo');
    demoLogin.mockReturnValue(of({ access_token: 'x' }));
    (el.querySelector('button') as HTMLButtonElement).click();
    expect(nav).toHaveBeenCalledWith('/dashboard');
  });
});
