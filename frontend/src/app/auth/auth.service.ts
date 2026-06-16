import { Injectable, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
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
  private apiUrl = environment.apiUrl;

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
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    this._user.set(null);
  }

  forgotPassword(email: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/auth/forgot-password`, { email });
  }

  resetPassword(email: string, code: string, newPassword: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/auth/reset-password`, { email, code, newPassword });
  }

  getToken(): string | null {
    return localStorage.getItem('token');
  }

  updateSession(res: any) {
    this.saveSession(res);
  }

  private saveSession(res: any) {
    if (res.access_token) {
      localStorage.setItem('token', res.access_token);
      localStorage.setItem('user', JSON.stringify(res.user));
      this._user.set(res.user);
    }
  }

  private restoreSession() {
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
