import { Routes } from '@angular/router';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { authGuard } from './auth/auth.guard';
// SUPERADMIN sigue con roleGuard: es un rol de plataforma, no de empresa,
// y por eso queda fuera de la matriz configurable.
import { roleGuard } from './auth/role.guard';
import { moduleGuard, homeFor } from './auth/module.guard';
import { PermissionsService } from './auth/permissions.service';
import { AuthService } from './auth/auth.service';
import { ShellComponent } from './layout/shell/shell';

/**
 * Todas las páginas se cargan bajo demanda (`loadComponent`). Importarlas
 * arriba metía la aplicación entera —diseñador de invitaciones, editor de
 * campañas, bandeja…— en el bundle inicial, que es justo lo que descarga un
 * móvil con datos antes de ver el login.
 *
 * El Shell sí va estático: es el marco de todas las pantallas privadas y
 * cargarlo aparte solo añadiría una espera antes de pintar el menú.
 */
const homeRedirectGuard = async () => {
  const auth = inject(AuthService);
  const permissions = inject(PermissionsService);
  const router = inject(Router);
  const user = auth.currentUser();
  if (!user?.role) { router.navigate(['/login']); return false; }
  if (user.mustChangePassword) { router.navigate(['/change-password']); return false; }
  if (user.role === 'SUPERADMIN') { router.navigate(['/admin/tenants']); return false; }
  // La primera pantalla depende de los módulos configurados, no del rol.
  await permissions.load();
  router.navigateByUrl(homeFor(user.role, permissions)); return false;
};

// Las rutas de hostelería (menú, pedidos, KDS, reservas y sus páginas públicas)
// quedan sin registrar al reposicionar el producto como CRM. Los componentes
// siguen en el repositorio: volver a añadirlas aquí y vaciar `HIDDEN_MODULES`
// en el backend las reactiva.
export const routes: Routes = [
  // Landing pública. Es la única ruta que se prerenderiza (ver
  // `app.routes.server.ts`), por eso vive fuera del Shell y no lleva guards.
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () => import('./pages/landing/landing').then(m => m.LandingComponent),
  },
  {
    path: 'login',
    loadComponent: () => import('./pages/login/login').then(m => m.LoginComponent),
  },
  {
    path: 'register',
    loadComponent: () => import('./pages/register/register').then(m => m.RegisterComponent),
  },
  {
    path: 'change-password',
    loadComponent: () =>
      import('./pages/change-password/change-password').then(m => m.ChangePasswordComponent),
    canActivate: [authGuard],
  },
  {
    path: 'onboarding',
    loadComponent: () => import('./pages/onboarding/onboarding').then(m => m.OnboardingComponent),
    canActivate: [authGuard],
  },
  {
    path: 'e/:slug',
    loadComponent: () =>
      import('./pages/public-event/public-event').then(m => m.PublicEventComponent),
  },
  {
    path: '',
    component: ShellComponent,
    canActivate: [authGuard],
    children: [
      {
        path: 'dashboard',
        loadComponent: () => import('./pages/dashboard/dashboard').then(m => m.DashboardComponent),
        canActivate: [moduleGuard('dashboard')],
      },
      {
        path: 'impulsador',
        loadComponent: () =>
          import('./pages/impulsador-panel/impulsador-panel').then(m => m.ImpulsadorPanelComponent),
        canActivate: [moduleGuard('impulsador-panel')],
      },
      {
        path: 'locals',
        loadComponent: () => import('./pages/locals/locals').then(m => m.LocalsComponent),
        canActivate: [moduleGuard('locals')],
      },
      {
        path: 'events',
        loadComponent: () => import('./pages/events/events').then(m => m.EventsComponent),
        canActivate: [moduleGuard('events')],
      },
      {
        path: 'events/:id',
        loadComponent: () =>
          import('./pages/events/event-detail').then(m => m.EventDetailComponent),
        canActivate: [moduleGuard('events')],
      },
      {
        path: 'customers',
        loadComponent: () => import('./pages/customers/customers').then(m => m.CustomersComponent),
        canActivate: [moduleGuard('customers')],
      },
      {
        path: 'leads',
        loadComponent: () => import('./pages/leads/leads').then(m => m.LeadsComponent),
        canActivate: [moduleGuard('leads')],
      },
      {
        path: 'campaigns',
        loadComponent: () => import('./pages/campaigns/campaigns').then(m => m.CampaignsComponent),
        canActivate: [moduleGuard('campaigns')],
      },
      {
        path: 'plantillas',
        loadComponent: () =>
          import('./pages/whatsapp-templates/whatsapp-templates').then(m => m.WhatsappTemplatesComponent),
        canActivate: [moduleGuard('templates')],
      },
      {
        path: 'ai-agents',
        loadComponent: () => import('./pages/ai-agents/ai-agents').then(m => m.AiAgentsComponent),
        canActivate: [moduleGuard('ai-agents')],
      },
      {
        path: 'inbox',
        loadComponent: () => import('./pages/inbox/inbox').then(m => m.InboxComponent),
        canActivate: [moduleGuard('inbox')],
      },
      {
        path: 'no-contactar',
        loadComponent: () =>
          import('./pages/suppression/suppression').then(m => m.SuppressionComponent),
        canActivate: [moduleGuard('suppression')],
      },
      {
        path: 'lists',
        loadComponent: () => import('./pages/lists/lists').then(m => m.ListsComponent),
        canActivate: [moduleGuard('lists')],
      },
      {
        path: 'forms',
        loadComponent: () => import('./pages/forms/forms').then(m => m.FormsComponent),
        canActivate: [moduleGuard('forms')],
      },
      {
        path: 'visitas',
        loadComponent: () => import('./pages/visits/visits').then(m => m.VisitsComponent),
        canActivate: [moduleGuard('visits')],
      },
      {
        path: 'mis-asistentes',
        loadComponent: () =>
          import('./pages/mis-asistentes/mis-asistentes').then(m => m.MisAsistentesComponent),
        canActivate: [moduleGuard('my-guests')],
      },
      {
        path: 'settings',
        loadComponent: () => import('./pages/settings/settings').then(m => m.SettingsComponent),
        canActivate: [moduleGuard('settings')],
      },
      {
        path: 'users',
        loadComponent: () => import('./pages/users/users').then(m => m.UsersComponent),
        canActivate: [moduleGuard('users')],
      },
      {
        path: 'admin/tenants',
        loadComponent: () => import('./pages/admin/tenants').then(m => m.AdminTenantsComponent),
        canActivate: [roleGuard('SUPERADMIN')],
      },
      // Nunca llega a pintarse: el guard siempre redirige a la primera pantalla
      // que le toque al rol. El componente está solo porque la ruta lo exige.
      {
        path: 'inicio',
        pathMatch: 'full',
        canActivate: [homeRedirectGuard],
        loadComponent: () => import('./pages/dashboard/dashboard').then(m => m.DashboardComponent),
      },
    ],
  },
];
