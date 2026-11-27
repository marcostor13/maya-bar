import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { PlatformAiNoticeComponent } from './platform-ai-notice';
import { environment } from '../../../environments/environment';

const API = `${environment.apiUrl}/ai-agents/platform-ai`;

describe('PlatformAiNoticeComponent (HU85 C11)', () => {
  let http: HttpTestingController;

  async function render(body: object, status = 200) {
    await TestBed.configureTestingModule({
      imports: [PlatformAiNoticeComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    const f = TestBed.createComponent(PlatformAiNoticeComponent);
    f.detectChanges();
    http.expectOne(API).flush(body, status === 200 ? {} : { status, statusText: 'x' });
    f.detectChanges();
    return f.nativeElement as HTMLElement;
  }

  afterEach(() => http?.verify());

  it('muestra proveedor y modelo de la plataforma cuando aplica', async () => {
    const el = await render({ active: true, provider: 'claude', model: 'claude-haiku-4-5' });
    const n = el.querySelector('[data-test="platform-ai-notice"]');
    expect(n?.textContent).toContain('Claude');
    expect(n?.textContent).toContain('claude-haiku-4-5');
    expect(n?.textContent).toContain('sin gastar créditos');
  });

  it('no muestra nada si no aplica o si falla la consulta', async () => {
    let el = await render({ active: false });
    expect(el.querySelector('[data-test="platform-ai-notice"]')).toBeNull();
    TestBed.resetTestingModule();
    el = await render({ message: 'x' }, 500);
    expect(el.querySelector('[data-test="platform-ai-notice"]')).toBeNull();
  });
});
