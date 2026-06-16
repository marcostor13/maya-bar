import { Routes } from '@angular/router';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { authGuard } from './auth/auth.guard';
import { roleGuard } from './auth/role.guard';
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
import { SettingsComponent } from './pages/settings/settings';
import { ListsComponent } from './pages/lists/lists';
import { ImpulsadorPanelComponent } from './pages/impulsador-panel/impulsador-panel';
import { VisitsComponent } from './pages/visits/visits';
import { MisAsistentesComponent } from './pages/mis-asistentes/mis-asistentes';

const homeRedirectGuard = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const user = auth.currentUser();
  if (!user?.role) { router.navigate(['/login']); return false; }
  if (user.mustChangePassword) { router.navigate(['/change-password']); return false; }
  if (user.role === 'SUPERADMIN') { router.navigate(['/admin/tenants']); return false; }
  if (user.role === 'IMPULSADOR') { router.navigate(['/impulsador']); return false; }
  router.navigate(['/dashboard']); return false;
};

export const routes: Routes = [
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
        canActivate: [roleGuard('TENANT_ADMIN', 'MANAGER', 'HOST', 'SERVER', 'KITCHEN', 'BAR', 'MARKETING')],
      },
      {
        path: 'impulsador',
        component: ImpulsadorPanelComponent,
        canActivate: [roleGuard('IMPULSADOR')],
      },
      {
        path: 'locals',
        component: LocalsComponent,
        canActivate: [roleGuard('TENANT_ADMIN', 'MANAGER')],
      },
      {
        path: 'menu',
        component: MenuComponent,
        canActivate: [roleGuard('TENANT_ADMIN', 'MANAGER', 'KITCHEN', 'BAR')],
      },
      {
        path: 'orders',
        component: OrdersComponent,
        canActivate: [roleGuard('TENANT_ADMIN', 'MANAGER', 'HOST', 'SERVER', 'KITCHEN', 'BAR')],
      },
      {
        path: 'kds',
        component: KdsComponent,
        canActivate: [roleGuard('TENANT_ADMIN', 'MANAGER', 'KITCHEN', 'BAR')],
      },
      {
        path: 'reservations',
        component: ReservationsComponent,
        canActivate: [roleGuard('TENANT_ADMIN', 'MANAGER', 'HOST')],
      },
      {
        path: 'events',
        component: EventsComponent,
        canActivate: [roleGuard('TENANT_ADMIN', 'MANAGER', 'MARKETING', 'IMPULSADOR')],
      },
      {
        path: 'events/:id',
        component: EventDetailComponent,
        canActivate: [roleGuard('TENANT_ADMIN', 'MANAGER', 'MARKETING', 'IMPULSADOR')],
      },
      {
        path: 'customers',
        component: CustomersComponent,
        canActivate: [roleGuard('TENANT_ADMIN', 'MANAGER', 'MARKETING', 'IMPULSADOR')],
      },
      {
        path: 'campaigns',
        component: CampaignsComponent,
        canActivate: [roleGuard('TENANT_ADMIN', 'MANAGER', 'MARKETING', 'IMPULSADOR')],
      },
      {
        path: 'lists',
        component: ListsComponent,
        canActivate: [roleGuard('TENANT_ADMIN', 'MANAGER', 'MARKETING', 'IMPULSADOR')],
      },
      {
        path: 'visitas',
        component: VisitsComponent,
        canActivate: [roleGuard('IMPULSADOR', 'TENANT_ADMIN', 'MANAGER')],
      },
      {
        path: 'mis-asistentes',
        component: MisAsistentesComponent,
        canActivate: [roleGuard('IMPULSADOR')],
      },
      {
        path: 'settings',
        component: SettingsComponent,
        canActivate: [roleGuard('TENANT_ADMIN', 'MANAGER')],
      },
      {
        path: 'users',
        component: UsersComponent,
        canActivate: [roleGuard('TENANT_ADMIN')],
      },
      {
        path: 'admin/tenants',
        component: AdminTenantsComponent,
        canActivate: [roleGuard('SUPERADMIN')],
      },
      { path: '', pathMatch: 'full', canActivate: [homeRedirectGuard], component: DashboardComponent },
    ],
  },
];
