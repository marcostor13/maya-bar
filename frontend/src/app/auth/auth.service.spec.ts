import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  let service: AuthService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [AuthService, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(AuthService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should authenticate user and set token', () => {
    const credentials = { email: 'test@test.com', password: 'password' };
    const mockResponse = {
      access_token: 'fake-jwt-token',
      user: { id: '1', email: 'test@test.com', role: 'TENANT_ADMIN' },
    };

    service.login(credentials).subscribe();

    const req = httpMock.expectOne('http://localhost:3000/auth/login');
    expect(req.request.method).toBe('POST');
    req.flush(mockResponse);

    expect(service.getToken()).toBe('fake-jwt-token');
    expect(service.isAuthenticated()).toBe(true);
  });

  it('should clear session on logout', () => {
    localStorage.setItem('token', 'some-token');
    localStorage.setItem('user', JSON.stringify({ id: '1', email: 'a@b.com', role: 'TENANT_ADMIN' }));

    service.logout();

    expect(service.getToken()).toBeNull();
    expect(service.isAuthenticated()).toBe(false);
  });

  it('should restore session from localStorage', () => {
    localStorage.setItem('token', 'saved-token');
    localStorage.setItem('user', JSON.stringify({ id: '2', email: 'x@y.com', role: 'MANAGER' }));

    const freshService = new AuthService({ post: () => ({ pipe: () => ({}) } as any) } as any);
    expect(freshService.getToken()).toBe('saved-token');
    expect(freshService.isAuthenticated()).toBe(true);
  });
});
