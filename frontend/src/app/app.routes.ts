import { CONTENT_SLUGS } from './pages/content/content.slugs';
import { Routes } from '@angular/router';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { authGuard } from './auth/auth.guard';
// SUPERADMIN sigue con roleGuard: es un rol de plataforma, no de empresa,
// y por eso queda fuera de la matriz configurable.
import { roleGuard } from './auth/role.guard';
import { moduleGuard, homeFor } from './auth/module.guard';
import { rootEntryGuard } from './core/root-entry.guard';
import { PermissionsService } from './auth/permissions.service';
import { AuthService } from './auth/auth.service';
import { ShellComponent } from './layout/shell/shell';
import { isCustomDomain, isPanelDomain } from './shared/custom-domain';

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
  // `app.routes.server.ts`), por eso vive fuera del Shell.
  // `rootEntryGuard` solo actúa dentro de la app nativa, donde `/` es el punto
  // de arranque del WebView y debe llevar a la aplicación, no a la landing.
  // Dominio propio de un cliente (HU25): su raíz es la landing de un evento,
  // que se busca por el host. En el servidor (prerender) nunca coincide.
  // Panel con marca blanca de una agencia (HU72): su raíz es el login o la
  // app, nunca la landing de Maya.
  {
    path: '',
    pathMatch: 'full',
    canMatch: [() => isPanelDomain()],
    canActivate: [() => inject(Router).parseUrl(inject(AuthService).isAuthenticated() ? '/dashboard' : '/login')],
    children: [],
  },
  {
    path: '',
    pathMatch: 'full',
    canMatch: [() => isCustomDomain()],
    loadComponent: () =>
      import('./pages/public-event/public-event').then(m => m.PublicEventComponent),
  },
  {
    path: '',
    pathMatch: 'full',
    canActivate: [rootEntryGuard],
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
  // Checkout de planes (HU46): público, también desde la cuenta en prueba.
  {
    path: 'checkout',
    loadComponent: () => import('./pages/checkout/checkout').then(m => m.CheckoutComponent),
  },
  {
    path: 'checkout/resultado',
    loadComponent: () =>
      import('./pages/checkout/checkout-result').then(m => m.CheckoutResultComponent),
  },
  {
    path: 'change-password',
    loadComponent: () =>
      import('./pages/change-password/change-password').then(m => m.ChangePasswordComponent),
    canActivate: [authGuard],
  },
  // Enlace de acceso tras pagar (HU47): público, el token va en la URL.
  {
    path: 'acceso',
    loadComponent: () => import('./pages/access/access').then(m => m.AccessComponent),
  },
  {
    path: 'onboarding',
    loadComponent: () => import('./pages/onboarding/onboarding').then(m => m.OnboardingComponent),
    canActivate: [authGuard],
  },
  // Legales públicas: Meta las pide en la app y en la revisión.
  ...(['privacy', 'terms', 'deletion'] as const).map((doc) => ({
    path: { privacy: 'privacidad', terms: 'terminos', deletion: 'eliminacion-datos' }[doc],
    data: { doc },
    loadComponent: () => import('./pages/legal/legal').then(m => m.LegalComponent),
  })),
  // Contenido indexable (HU79–HU83): funciones, industrias, comparativas y guías.
  {
    path: 'recursos',
    loadComponent: () => import('./pages/content/resources').then(m => m.ResourcesComponent),
  },
  ...CONTENT_SLUGS.map((slug) => ({
    path: slug,
    data: { slug },
    loadComponent: () => import('./pages/content/content-page').then(m => m.ContentPageComponent),
  })),
  {
    // Link público de una cotización (HU68).
    path: 'q/:token',
    loadComponent: () =>
      import('./pages/public-quote/public-quote').then(m => m.PublicQuoteComponent),
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
        // Reportes configurables (HU64): mismo permiso que el dashboard.
        path: 'reportes',
        loadComponent: () => import('./pages/reports/reports').then(m => m.ReportsComponent),
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
        // Con cambios sin guardar pregunta antes de salir (HU29).
        canDeactivate: [(c: { canLeave(): Promise<boolean> }) => c.canLeave()],
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
        // Cotización a pantalla completa desde la oportunidad (HU68).
        path: 'cotizaciones/:id',
        loadComponent: () => import('./pages/quotes/quote-editor').then(m => m.QuoteEditorComponent),
        canActivate: [moduleGuard('leads')],
      },
      {
        path: 'prospeccion',
        loadComponent: () =>
          import('./pages/prospecting/prospecting').then(m => m.ProspectingComponent),
        canActivate: [moduleGuard('leads')],
      },
      {
        path: 'prospeccion/:id',
        loadComponent: () =>
          import('./pages/prospecting/prospecting-search').then(m => m.ProspectingSearchComponent),
        canActivate: [moduleGuard('leads')],
      },
      {
        path: 'campaigns',
        loadComponent: () => import('./pages/campaigns/campaigns').then(m => m.CampaignsComponent),
        canActivate: [moduleGuard('campaigns')],
      },
      {
        path: 'automatizaciones',
        loadComponent: () => import('./pages/automations/automations').then(m => m.AutomationsComponent),
        canActivate: [moduleGuard('campaigns')],
      },
      {
        path: 'recuperacion',
        loadComponent: () => import('./pages/recovery/recovery').then(m => m.RecoveryComponent),
        canActivate: [moduleGuard('campaigns')],
      },
      {
        path: 'recuperacion/:id',
        loadComponent: () =>
          import('./pages/recovery/recovery-wizard').then(m => m.RecoveryWizardComponent),
        canActivate: [moduleGuard('campaigns')],
      },
      {
        path: 'links',
        loadComponent: () => import('./pages/links/links').then(m => m.LinksComponent),
        canActivate: [moduleGuard('campaigns')],
      },
      {
        path: 'links/analitica',
        loadComponent: () => import('./pages/links/link-analytics').then(m => m.LinkAnalyticsComponent),
        canActivate: [moduleGuard('campaigns')],
      },
      {
        path: 'plantillas-email',
        loadComponent: () => import('./pages/templates/email-templates').then(m => m.EmailTemplatesComponent),
        canActivate: [moduleGuard('campaigns')],
      },
      {
        path: 'plantillas-texto',
        loadComponent: () => import('./pages/templates/message-templates').then(m => m.MessageTemplatesComponent),
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
        path: 'ai-agents/generar',
        loadComponent: () => import('./pages/ai-agents/agent-generator').then(m => m.AgentGeneratorComponent),
        canActivate: [moduleGuard('ai-agents')],
      },
      {
        path: 'ai-agents/:id/mejoras',
        loadComponent: () => import('./pages/ai-agents/agent-improve').then(m => m.AgentImproveComponent),
        canActivate: [moduleGuard('ai-agents')],
      },
      {
        path: 'inbox',
        loadComponent: () => import('./pages/inbox/inbox').then(m => m.InboxComponent),
        canActivate: [moduleGuard('inbox')],
      },
      {
        path: 'llamadas',
        loadComponent: () => import('./pages/calls/calls').then(m => m.CallsPageComponent),
        canActivate: [moduleGuard('calls')],
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
        // Panel de la agencia (HU72): sus sub-cuentas y su marca blanca.
        path: 'agencia',
        loadComponent: () => import('./pages/agency/agency').then(m => m.AgencyComponent),
        canActivate: [roleGuard('TENANT_ADMIN')],
      },
      {
        // Mi plan y consumo (HU44): solo el administrador de la empresa.
        path: 'settings/plan',
        loadComponent: () => import('./pages/settings/my-plan').then(m => m.MyPlanComponent),
        canActivate: [moduleGuard('settings'), roleGuard('TENANT_ADMIN')],
      },
      {
        // Registro de actividad (HU63): solo el administrador de la empresa.
        path: 'settings/activity',
        loadComponent: () => import('./pages/settings/activity-log').then(m => m.ActivityLogComponent),
        canActivate: [moduleGuard('settings'), roleGuard('TENANT_ADMIN')],
      },
      {
        path: 'integraciones',
        loadComponent: () =>
          import('./pages/integrations/integrations').then(m => m.IntegrationsComponent),
        canActivate: [moduleGuard('integrations')],
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
      {
        // Suscripciones, ingresos, cupones y comprobantes (HU57).
        path: 'admin/billing',
        loadComponent: () => import('./pages/admin/billing-admin').then(m => m.AdminBillingComponent),
        canActivate: [roleGuard('SUPERADMIN')],
      },
      {
        // Implementaciones pagadas (HU55).
        path: 'admin/onboarding',
        loadComponent: () => import('./pages/admin/onboarding').then(m => m.AdminOnboardingComponent),
        canActivate: [roleGuard('SUPERADMIN')],
      },
      {
        path: 'admin/users',
        loadComponent: () => import('./pages/admin/users').then(m => m.AdminUsersComponent),
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
