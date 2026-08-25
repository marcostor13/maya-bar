import { TestBed } from '@angular/core/testing';
import { signal, WritableSignal } from '@angular/core';
import { AuthService, AuthUser } from '../auth/auth.service';
import { injectRoles, Roles } from './roles';

describe('injectRoles', () => {
  let user: WritableSignal<AuthUser | null>;

  function setup(initial: AuthUser | null): Roles {
    user = signal<AuthUser | null>(initial);
    TestBed.configureTestingModule({
      providers: [{ provide: AuthService, useValue: { currentUser: user } }],
    });
    return TestBed.runInInjectionContext(() => injectRoles());
  }

  it('exposes empty role and no permissions without session', () => {
    const roles = setup(null);
    expect(roles.role()).toBe('');
    expect(roles.canManage()).toBe(false);
    expect(roles.canCreate()).toBe(false);
    expect(roles.isImpulsador()).toBe(false);
    expect(roles.referralCode()).toBeNull();
  });

  it('TENANT_ADMIN can manage and create but is not impulsador', () => {
    const roles = setup({ id: '1', email: 'a@b.com', role: 'TENANT_ADMIN' });
    expect(roles.role()).toBe('TENANT_ADMIN');
    expect(roles.canManage()).toBe(true);
    expect(roles.canCreate()).toBe(true);
    expect(roles.isImpulsador()).toBe(false);
  });

  it('MANAGER can manage and create', () => {
    const roles = setup({ id: '1', email: 'a@b.com', role: 'MANAGER' });
    expect(roles.canManage()).toBe(true);
    expect(roles.canCreate()).toBe(true);
    expect(roles.isImpulsador()).toBe(false);
  });

  it('IMPULSADOR can create but not manage, and exposes referralCode', () => {
    const roles = setup({ id: '1', email: 'a@b.com', role: 'IMPULSADOR', referralCode: 'ABC123' });
    expect(roles.canManage()).toBe(false);
    expect(roles.canCreate()).toBe(true);
    expect(roles.isImpulsador()).toBe(true);
    expect(roles.referralCode()).toBe('ABC123');
  });

  it('WAITER has no event permissions', () => {
    const roles = setup({ id: '1', email: 'a@b.com', role: 'WAITER' });
    expect(roles.canManage()).toBe(false);
    expect(roles.canCreate()).toBe(false);
  });

  it('is reactive to changes in the current user', () => {
    const roles = setup({ id: '1', email: 'a@b.com', role: 'MANAGER' });
    expect(roles.canManage()).toBe(true);

    user.set({ id: '2', email: 'x@y.com', role: 'IMPULSADOR' });
    expect(roles.canManage()).toBe(false);
    expect(roles.isImpulsador()).toBe(true);

    user.set(null);
    expect(roles.role()).toBe('');
    expect(roles.canCreate()).toBe(false);
  });
});
