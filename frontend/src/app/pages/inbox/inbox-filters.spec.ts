import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { InboxFiltersComponent } from './inbox-filters';
import { environment } from '../../../environments/environment';

const API = environment.apiUrl;
const campaigns = [
  { key: 'ad:120', kind: 'ad', id: '120', name: 'Promo verano', count: 4 },
  { key: 'campaign:abc', kind: 'campaign', id: 'abc', name: 'Black Friday', count: 2 },
];

describe('InboxFiltersComponent · campaña', () => {
  let fixture: ComponentFixture<InboxFiltersComponent>;
  let component: InboxFiltersComponent;
  let http: HttpTestingController;

  function flushOptions() {
    http.match(`${API}/conversations/agents`).forEach(r => r.flush([]));
    http.match(`${API}/conversations/tags`).forEach(r => r.flush([]));
    http.match(`${API}/conversations/campaigns`).forEach(r => r.flush(campaigns));
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [InboxFiltersComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(InboxFiltersComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    flushOptions();
  });

  afterEach(() => http.verify());

  it('carga las campañas de origen de los chats', () => {
    expect(component.campaigns().map(c => c.key)).toEqual(['ad:120', 'campaign:abc']);
  });

  it('aplicar una campaña la deja activa y pide la lista al servidor', () => {
    const emitted = vi.fn();
    component.serverChange.subscribe(emitted);
    component.openPanel();
    flushOptions();
    component.draftCampaign.set('campaign:abc');
    component.apply();
    expect(component.campaign()).toBe('campaign:abc');
    expect(component.campaignName()).toBe('Black Friday');
    expect(component.activeCount()).toBe(1);
    expect(emitted).toHaveBeenCalledTimes(1);
  });

  it('limpiar quita también la campaña', () => {
    component.campaign.set('ad:120');
    component.clear();
    expect(component.campaign()).toBe('');
    expect(component.activeCount()).toBe(0);
  });
});
