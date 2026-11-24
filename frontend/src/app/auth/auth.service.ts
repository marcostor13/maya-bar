import { Injectable, inject, signal, computed } from '@angular/core';
import { Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { Observable, Subject, catchError, finalize, map, shareReplay, tap, throwError } from 'rxjs';
import { ToastService } from '../shared/toast';
import { environment } from '../../environments/environment';

export interface AuthUser {
  id: string;
  email: string;
  name?: string;
  role: string;
  tenantId?: string;
  /** Usuario de agencia dentro de una sub-cuenta: su empresa propia (HU72). */
  homeTenantId?: string;
  mustChangePassword?: boolean;
  referralCode?: string | null;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  /**
   * La sesión caducó sin `logout()`: ya no hay token para dar de baja el
   * dispositivo en el backend, así que el shell suelta la suscripción push en
   * local (el proveedor la rechazará y el backend la borrará en el próximo envío).
   */
  readonly sessionExpired = new Subject<void>();
  /**
   * Lo registra `PermissionsService` al construirse. Se hace con un gancho y no
   * inyectando el servicio para no crear una dependencia circular: los permisos
   * necesitan al usuario para su matriz de respaldo.
   */
  permissionsReset?: () => void;

  private apiUrl = environment.apiUrl;
  private router = inject(Router);
  private toast = inject(ToastService);

  /** Renovación en curso, compartida por todas las peticiones que caduquen. */
  private refreshing: Observable<string> | null = null;

  private _user = signal<AuthUser | null>(null);
  isAuthenticated = computed(() => !!this._user());
  currentUser = this._user.asReadonly();

  constructor(private http: HttpClient) {
    this.restoreSession();
  }

  /**
   * Con doble factor (HU62) el login no trae sesión sino un reto:
   * `{ twoFactorRequired, method, challengeToken }` o `{ twoFactorSetupRequired, challengeToken }`.
   */
  login(credentials: { email: string; password: string }): Observable<any> {
    const deviceToken = this.deviceToken() ?? undefined;
    return this.http.post(`${this.apiUrl}/auth/login`, { ...credentials, ...(deviceToken ? { deviceToken } : {}) }).pipe(
      tap((res: any) => { if (res?.access_token) this.saveSession(res); }),
    );
  }

  verifyTwoFactor(challengeToken: string, code: string, rememberDevice: boolean): Observable<any> {
    return this.http.post(`${this.apiUrl}/auth/2fa/verify`, { challengeToken, code, rememberDevice }).pipe(
      tap((res: any) => {
        if (res?.deviceToken) this.store('2fa_device', res.deviceToken);
        this.saveSession(res);
      }),
    );
  }

  resendTwoFactor(challengeToken: string): Observable<{ sent: boolean; emailHint: string }> {
    return this.http.post<{ sent: boolean; emailHint: string }>(`${this.apiUrl}/auth/2fa/resend`, { challengeToken });
  }

  enrollStart(challengeToken: string, method: 'totp' | 'email'): Observable<{ method: string; secret?: string; otpauthUrl?: string; emailHint?: string }> {
    return this.http.post<{ method: string; secret?: string; otpauthUrl?: string; emailHint?: string }>(`${this.apiUrl}/auth/2fa/enroll/start`, { challengeToken, method });
  }

  enrollConfirm(challengeToken: string, code: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/auth/2fa/enroll/confirm`, { challengeToken, code }).pipe(
      tap((res: any) => this.saveSession(res)),
    );
  }

  private deviceToken(): string | null {
    try { return typeof localStorage === 'undefined' ? null : localStorage.getItem('2fa_device'); } catch { return null; }
  }

  private store(key: string, value: string) {
    try { localStorage.setItem(key, value); } catch { /* almacenamiento bloqueado */ }
  }

  register(data: {
    name: string;
    ruc?: string;
    email: string;
    phone?: string;
    ownerName: string;
    ownerPassword: string;
    captchaToken?: string;
  }): Observable<any> {
    // Con verificación de correo activa el alta no trae sesión: llega
    // `{ verificationRequired, email }` y la sesión sale de verifyEmail().
    return this.http.post(`${this.apiUrl}/auth/register`, data).pipe(
      tap((res: any) => { if (res?.access_token) this.saveSession(res); }),
    );
  }

  verifyEmail(email: string, code: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/auth/verify-email`, { email, code }).pipe(
      tap((res: any) => this.saveSession(res)),
    );
  }

  /** Enlace de acceso tras pagar (HU47): crea la contraseña y abre sesión. */
  redeemAccess(email: string, token: string, password: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/auth/access`, { email, token, password }).pipe(
      tap((res: any) => this.saveSession(res)),
    );
  }

  resendAccess(email: string): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.apiUrl}/auth/access/resend`, { email });
  }

  resendVerification(email: string): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.apiUrl}/auth/resend-verification`, { email });
  }

  logout() {
    // Invalida el refresh token en el servidor: sin esto seguiría sirviendo
    // para renovar aunque el dispositivo haya cerrado sesión.
    const refreshToken = this.getRefreshToken();
    if (refreshToken) {
      this.http
        .post(`${this.apiUrl}/auth/logout`, { refreshToken })
        .subscribe({ error: () => undefined });
    }
    this.clearSession();
  }

  private clearSession() {
    localStorage.removeItem('token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('user');
    this._user.set(null);
    // Si no se limpian, el siguiente usuario heredaría el menú del anterior.
    this.permissionsReset?.();
  }

  forgotPassword(email: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/auth/forgot-password`, { email });
  }

  resetPassword(email: string, code: string, newPassword: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/auth/reset-password`, { email, code, newPassword });
  }

  getToken(): string | null {
    if (typeof localStorage === 'undefined') return null;
    return localStorage.getItem('token');
  }

  getRefreshToken(): string | null {
    if (typeof localStorage === 'undefined') return null;
    return localStorage.getItem('refresh_token');
  }

  /**
   * Canjea el refresh token por una sesión nueva.
   *
   * La llamada se comparte: si diez peticiones caducan a la vez, todas esperan
   * al mismo refresco. Lanzar uno por petición sería peor que no tener
   * refresco — el backend rota el token en cada uso, así que el segundo
   * invalidaría al primero y acabarían todas en el login.
   */
  refreshSession(): Observable<string> {
    if (this.refreshing) return this.refreshing;

    const refreshToken = this.getRefreshToken();
    if (!refreshToken) {
      this.expireSession();
      return throwError(() => new Error('Sin sesión'));
    }

    this.refreshing = this.http
      .post<{ access_token: string; refresh_token: string; user: AuthUser }>(
        `${this.apiUrl}/auth/refresh`,
        { refreshToken },
      )
      .pipe(
        map((res) => {
          this.saveSession(res);
          return res.access_token;
        }),
        catchError((err: unknown) => {
          // El refresh token ya no vale: caducado, revocado o cuenta cerrada.
          this.expireSession();
          return throwError(() => err);
        }),
        finalize(() => {
          this.refreshing = null;
        }),
        shareReplay(1),
      );

    return this.refreshing;
  }

  /**
   * Cierra la sesión por caducidad: avisa y manda al login. Se distingue del
   * `logout()` voluntario para poder explicar por qué se ha salido.
   */
  private expireSession(): void {
    if (!this.isAuthenticated()) return; // ya estaba fuera: no avisar dos veces
    this.sessionExpired.next();
    this.clearSession();
    this.toast.warning('Tu sesión ha caducado. Entra de nuevo.');
    void this.router.navigate(['/login']);
  }

  updateSession(res: any) {
    this.saveSession(res);
  }

  /**
   * Entra a una sub-cuenta o vuelve a la agencia (HU72). Recarga la app para
   * que ninguna pantalla conserve datos de la empresa anterior.
   */
  switchTenant(tenantId: string): Observable<unknown> {
    return this.http.post(`${this.apiUrl}/auth/switch-tenant`, { tenantId }).pipe(
      tap((res: any) => {
        this.saveSession(res);
        if (typeof window !== 'undefined') window.location.assign('/dashboard');
      }),
    );
  }

  private saveSession(res: any) {
    if (res.access_token) {
      localStorage.setItem('token', res.access_token);
      // Es lo que mantiene la sesión viva entre arranques de la app.
      if (res.refresh_token) {
        localStorage.setItem('refresh_token', res.refresh_token);
      }
      localStorage.setItem('user', JSON.stringify(res.user));
      this._user.set(res.user);
      this.permissionsReset?.();
    }
  }

  private restoreSession() {
    // La landing se prerenderiza en Node, donde no existe `localStorage`. Sin
    // esta salida el servicio reventaría al construirse durante el build.
    if (typeof localStorage === 'undefined') return;
    const token = localStorage.getItem('token');
    const raw = localStorage.getItem('user');
    if (!token || !raw) return;
    try {
      const user = JSON.parse(raw);
      if (user && user.role) {
        this._user.set(user);
      } else {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
      }
    } catch {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
    }
  }
}
