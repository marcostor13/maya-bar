import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { LoadingService, ProgressBarComponent, loadingInterceptor, silentRequest } from './loader';

describe('loadingInterceptor', () => {
  let client: HttpClient;
  let http: HttpTestingController;
  let loading: LoadingService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withInterceptors([loadingInterceptor])), provideHttpClientTesting()],
    });
    client = TestBed.inject(HttpClient);
    http = TestBed.inject(HttpTestingController);
    loading = TestBed.inject(LoadingService);
  });

  afterEach(() => http.verify());

  it('enciende la carga mientras la petición está en curso y la apaga al responder', () => {
    expect(loading.isLoading()).toBe(false);
    client.get('/a').subscribe();
    expect(loading.isLoading()).toBe(true);
    http.expectOne('/a').flush({});
    expect(loading.isLoading()).toBe(false);
  });

  it('con varias peticiones sigue cargando hasta que termina la última', () => {
    client.get('/a').subscribe();
    client.get('/b').subscribe();
    http.expectOne('/a').flush({});
    expect(loading.isLoading()).toBe(true);
    http.expectOne('/b').flush({});
    expect(loading.isLoading()).toBe(false);
  });

  it('también la apaga cuando la petición falla', () => {
    client.get('/a').subscribe({ error: () => undefined });
    http.expectOne('/a').flush({ message: 'x' }, { status: 500, statusText: 'Error' });
    expect(loading.isLoading()).toBe(false);
  });

  it('la apaga si la petición se cancela', () => {
    const sub = client.get('/a').subscribe();
    expect(loading.isLoading()).toBe(true);
    sub.unsubscribe();
    expect(loading.isLoading()).toBe(false);
    expect(http.expectOne('/a').cancelled).toBe(true);
  });

  it('una petición silenciosa no enciende la barra', () => {
    client.get('/poll', { context: silentRequest() }).subscribe();
    expect(loading.isLoading()).toBe(false);
    http.expectOne('/poll').flush({});
    expect(loading.isLoading()).toBe(false);
  });
});

describe('LoadingService', () => {
  it('decrement nunca baja de cero', () => {
    const loading = TestBed.inject(LoadingService);
    loading.decrement();
    loading.increment();
    expect(loading.isLoading()).toBe(true);
    loading.decrement();
    expect(loading.isLoading()).toBe(false);
  });
});

describe('ProgressBarComponent', () => {
  it('pinta la barra solo mientras hay carga', () => {
    const fixture = TestBed.createComponent(ProgressBarComponent);
    const loading = TestBed.inject(LoadingService);
    const el = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
    expect(el.querySelector('.progress-bar')).toBeNull();

    loading.increment();
    fixture.detectChanges();
    expect(el.querySelector('.progress-bar')).not.toBeNull();

    loading.decrement();
    fixture.detectChanges();
    expect(el.querySelector('.progress-bar')).toBeNull();
  });
});
