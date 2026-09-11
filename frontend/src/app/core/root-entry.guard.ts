import { CanActivateFn, Router } from '@angular/router';
import { inject } from '@angular/core';
import { AuthService } from '../auth/auth.service';
import { PlatformService } from './platform.service';

/**
 * La app nativa siempre arranca en `/`, que en web es la landing de marketing.
 * Dentro del WebView eso no tiene sentido, así que se desvía a la aplicación.
 *
 * En web devuelve `true` sin tocar nada: la landing sigue siendo la única ruta
 * prerenderizada y el SEO no se ve afectado.
 */
export const rootEntryGuard: CanActivateFn = () => {
  const platform = inject(PlatformService);
  if (!platform.isNative) return true;

  const auth = inject(AuthService);
  const router = inject(Router);
  const user = auth.currentUser();

  if (!user) return router.parseUrl('/login');
  if (user.mustChangePassword) return router.parseUrl('/change-password');
  return router.parseUrl('/inicio');
};
