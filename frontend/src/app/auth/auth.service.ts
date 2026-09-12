import { Injectable, inject, signal, computed } from '@angular/core';
import { Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { Observable, catchError, finalize, map, shareReplay, tap, throwError } from 'rxjs';
import { ToastService } from '../shared/toast';
import { environment } from '../../environments/environment';

export interface AuthUser {
  id: string;
  email: string;
  name?: string;
  role: string;
  tenantId?: string;
  mustChangePassword?: boolean;
  referralCode?: string | null;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
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

  login(credentials: { email: string; password: string }): Observable<any> {
    return this.http.post(`${this.apiUrl}/auth/login`, credentials).pipe(
      tap((res: any) => this.saveSession(res)),
    );
  }

  register(data: {
    name: string;
    ruc?: string;
    email: string;
    phone?: string;
    ownerName: string;
    ownerPassword: string;
  }): Observable<any> {
    return this.http.post(`${this.apiUrl}/auth/register`, data).pipe(
      tap((res: any) => this.saveSession(res)),
    );
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
    this.clearSession();
    this.toast.warning('Tu sesión ha caducado. Entra de nuevo.');
    void this.router.navigate(['/login']);
  }

  updateSession(res: any) {
    this.saveSession(res);
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
