import {
  HttpErrorResponse, HttpEvent, HttpHandlerFn, HttpInterceptorFn, HttpRequest,
} from '@angular/common/http';
import { inject } from '@angular/core';
import { Observable, catchError, switchMap, throwError } from 'rxjs';
import { AuthService } from './auth.service';

/** Peticiones que NO deben reintentarse: son las que gestionan la sesión. */
const SIN_REINTENTO = ['/auth/login', '/auth/refresh', '/auth/register'];

const conToken = (req: HttpRequest<unknown>, token: string | null) =>
  token
    ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
    : req;

/**
 * Añade el token y, si el servidor responde 401 porque caducó, renueva la
 * sesión y reintenta la petición una sola vez.
 *
 * El reintento es lo que mantiene la sesión viva sin que el usuario note nada:
 * el access token dura un día, y cuando expira se canjea el refresh token en
 * silencio. Si la renovación también falla, `AuthService` cierra la sesión y
 * manda al login avisando; aquí solo se propaga el error.
 */
export const authInterceptor: HttpInterceptorFn = (
  req: HttpRequest<unknown>,
  next: HttpHandlerFn,
): Observable<HttpEvent<unknown>> => {
  const auth = inject(AuthService);
  const esDeSesion = SIN_REINTENTO.some((r) => req.url.includes(r));

  return next(conToken(req, auth.getToken())).pipe(
    catchError((err: unknown) => {
      const es401 = err instanceof HttpErrorResponse && err.status === 401;
      if (!es401 || esDeSesion || !auth.getRefreshToken()) {
        return throwError(() => err);
      }
      // Una sola renovación compartida: si caducan diez peticiones a la vez,
      // no se lanzan diez refrescos —el segundo invalidaría al primero por la
      // rotación y acabarían todas expulsando al usuario.
      return auth.refreshSession().pipe(
        switchMap((token) => next(conToken(req, token))),
        catchError((refreshErr: unknown) => throwError(() => refreshErr)),
      );
    }),
  );
};
