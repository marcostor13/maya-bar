import { TestBed, ComponentFixture } from '@angular/core/testing';
import { of } from 'rxjs';
import { RecoveryAnalyzeStepComponent } from './analyze-step';
import { RecoveryApiService } from '../../../core/api/recovery-api.service';
import { ToastService } from '../../../shared/toast';

const toast = { success: vi.fn(), error: vi.fn() };
const api = {
  campaigns: vi.fn(),
  create: vi.fn(),
  reanalyze: vi.fn(),
};

describe('RecoveryAnalyzeStepComponent · campaña', () => {
  let fixture: ComponentFixture<RecoveryAnalyzeStepComponent>;
  let component: RecoveryAnalyzeStepComponent;

  function create(plan: unknown = null) {
    fixture = TestBed.createComponent(RecoveryAnalyzeStepComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('plan', plan);
    fixture.detectChanges();
  }

  beforeEach(async () => {
    vi.clearAllMocks();
    api.campaigns.mockReturnValue(of([
      { key: 'ad:120', kind: 'ad', id: '120', name: 'Promo verano', count: 4 },
    ]));
    api.create.mockReturnValue(of({ _id: 'p1' }));
    api.reanalyze.mockReturnValue(of({ _id: 'p1' }));
    await TestBed.configureTestingModule({
      imports: [RecoveryAnalyzeStepComponent],
      providers: [
        { provide: RecoveryApiService, useValue: api },
        { provide: ToastService, useValue: toast },
      ],
    }).compileComponents();
  });

  afterEach(() => fixture?.destroy());

  it('muestra las campañas y envía la elegida al crear el plan', () => {
    create();
    expect(fixture.nativeElement.querySelector('#rec-campaign')).not.toBeNull();
    component.campaign = 'ad:120';
    component.start();
    expect(api.create).toHaveBeenCalledWith(expect.objectContaining({ lookbackDays: 30, campaign: 'ad:120' }));
  });

  it('sin campañas no muestra el selector y analiza todas', () => {
    api.campaigns.mockReturnValue(of([]));
    create();
    expect(fixture.nativeElement.querySelector('#rec-campaign')).toBeNull();
    component.start();
    expect(api.create).toHaveBeenCalledWith(expect.objectContaining({ campaign: '' }));
  });

  it('al reanalizar conserva la campaña del plan', () => {
    create({
      _id: 'p1', status: 'failed', lookbackDays: 15, context: '',
      campaign: { kind: 'campaign', id: 'abc', name: 'Black Friday' }, analysis: {},
    });
    expect(component.campaign).toBe('campaign:abc');
    component.start();
    expect(api.reanalyze).toHaveBeenCalledWith('p1', expect.objectContaining({ lookbackDays: 15, campaign: 'campaign:abc' }));
  });
});
