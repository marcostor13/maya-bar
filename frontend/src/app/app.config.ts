import { ApplicationConfig, inject, provideAppInitializer, provideZonelessChangeDetection } from '@angular/core';
import { provideRouter, withEnabledBlockingInitialNavigation } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';

import { routes } from './app.routes';
import { authInterceptor } from './auth/auth.interceptor';
import { loadingInterceptor } from './shared/loader';
import { planLimitInterceptor } from './shared/plan-limit';
import { BrandService } from './core/brand.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZonelessChangeDetection(),
    provideRouter(routes, withEnabledBlockingInitialNavigation()),
    provideHttpClient(withInterceptors([authInterceptor, loadingInterceptor, planLimitInterceptor])),
    // Marca blanca (HU72): antes de la primera navegación, para que el dominio
    // de una agencia abra su panel y no la landing de un evento.
    provideAppInitializer(() => inject(BrandService).initFromHost()),
  ]
};
