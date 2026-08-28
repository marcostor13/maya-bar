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
import { LoginComponent } from './pages/login/login';
import { RegisterComponent } from './pages/register/register';
import { OnboardingComponent } from './pages/onboarding/onboarding';
import { ShellComponent } from './layout/shell/shell';
import { DashboardComponent } from './pages/dashboard/dashboard';
import { LocalsComponent } from './pages/locals/locals';
import { MenuComponent } from './pages/menu/menu';
import { AdminTenantsComponent } from './pages/admin/tenants';
import { OrdersComponent } from './pages/orders/orders';
import { PublicMenuComponent } from './pages/public-menu/public-menu';
import { OrderTrackingComponent } from './pages/order-tracking/order-tracking';
import { ChangePasswordComponent } from './pages/change-password/change-password';
import { UsersComponent } from './pages/users/users';
import { KdsComponent } from './pages/kds/kds';
import { ReservationsComponent } from './pages/reservations/reservations';
import { PublicBookingComponent } from './pages/public-booking/public-booking';
import { EventsComponent } from './pages/events/events';
import { EventDetailComponent } from './pages/events/event-detail';
import { PublicEventComponent } from './pages/public-event/public-event';
import { CustomersComponent } from './pages/customers/customers';
import { CampaignsComponent } from './pages/campaigns/campaigns';
import { WhatsappTemplatesComponent } from './pages/whatsapp-templates/whatsapp-templates';
import { SettingsComponent } from './pages/settings/settings';
import { ListsComponent } from './pages/lists/lists';
import { FormsComponent } from './pages/forms/forms';
import { ImpulsadorPanelComponent } from './pages/impulsador-panel/impulsador-panel';
import { VisitsComponent } from './pages/visits/visits';
import { MisAsistentesComponent } from './pages/mis-asistentes/mis-asistentes';
import { AiAgentsComponent } from './pages/ai-agents/ai-agents';
import { InboxComponent } from './pages/inbox/inbox';
import { LandingComponent } from './pages/landing/landing';

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

export const routes: Routes = [
  // Landing pública. Es la única ruta que se prerenderiza (ver
  // `app.routes.server.ts`), por eso vive fuera del Shell y no lleva guards.
  { path: '', pathMatch: 'full', component: LandingComponent },
  { path: 'login', component: LoginComponent },
  { path: 'register', component: RegisterComponent },
  { path: 'change-password', component: ChangePasswordComponent, canActivate: [authGuard] },
  { path: 'onboarding', component: OnboardingComponent, canActivate: [authGuard] },
  { path: 'q/:localId/:table', component: PublicMenuComponent },
  { path: 'track/:orderId', component: OrderTrackingComponent },
  { path: 'book/:localId', component: PublicBookingComponent },
  { path: 'book/confirm/:token', component: PublicBookingComponent },
  { path: 'e/:slug', component: PublicEventComponent },
  {
    path: '',
    component: ShellComponent,
    canActivate: [authGuard],
    children: [
      {
        path: 'dashboard',
        component: DashboardComponent,
        canActivate: [moduleGuard('dashboard')],
      },
      {
        path: 'impulsador',
        component: ImpulsadorPanelComponent,
        canActivate: [moduleGuard('impulsador-panel')],
      },
      {
        path: 'locals',
        component: LocalsComponent,
        canActivate: [moduleGuard('locals')],
      },
      {
        path: 'menu',
        component: MenuComponent,
        canActivate: [moduleGuard('menu')],
      },
      {
        path: 'orders',
        component: OrdersComponent,
        canActivate: [moduleGuard('orders')],
      },
      {
        path: 'kds',
        component: KdsComponent,
        canActivate: [moduleGuard('kds')],
      },
      {
        path: 'reservations',
        component: ReservationsComponent,
        canActivate: [moduleGuard('reservations')],
      },
      {
        path: 'events',
        component: EventsComponent,
        canActivate: [moduleGuard('events')],
      },
      {
        path: 'events/:id',
        component: EventDetailComponent,
        canActivate: [moduleGuard('events')],
      },
      {
        path: 'customers',
        component: CustomersComponent,
        canActivate: [moduleGuard('customers')],
      },
      {
        path: 'campaigns',
        component: CampaignsComponent,
        canActivate: [moduleGuard('campaigns')],
      },
      {
        path: 'plantillas',
        component: WhatsappTemplatesComponent,
        canActivate: [moduleGuard('templates')],
      },
      {
        path: 'ai-agents',
        component: AiAgentsComponent,
        canActivate: [moduleGuard('ai-agents')],
      },
      {
        path: 'inbox',
        component: InboxComponent,
        canActivate: [moduleGuard('inbox')],
      },
      {
        path: 'lists',
        component: ListsComponent,
        canActivate: [moduleGuard('lists')],
      },
      {
        path: 'forms',
        component: FormsComponent,
        canActivate: [moduleGuard('forms')],
      },
      {
        path: 'visitas',
        component: VisitsComponent,
        canActivate: [moduleGuard('visits')],
      },
      {
        path: 'mis-asistentes',
        component: MisAsistentesComponent,
        canActivate: [moduleGuard('my-guests')],
      },
      {
        path: 'settings',
        component: SettingsComponent,
        canActivate: [moduleGuard('settings')],
      },
      {
        path: 'users',
        component: UsersComponent,
        canActivate: [moduleGuard('users')],
      },
      {
        path: 'admin/tenants',
        component: AdminTenantsComponent,
        canActivate: [roleGuard('SUPERADMIN')],
      },
      { path: 'inicio', pathMatch: 'full', canActivate: [homeRedirectGuard], component: DashboardComponent },
    ],
  },
];
