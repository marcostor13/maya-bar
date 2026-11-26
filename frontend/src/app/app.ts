import { Component, inject, OnInit } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ToastComponent } from './shared/toast';
import { ConfirmDialogComponent } from './shared/confirm';
import { ProgressBarComponent } from './shared/loader';
import { OfflineBannerComponent } from './shared/offline-banner';
import { PlanLimitDialogComponent } from './shared/plan-limit';
import { NativeAppService } from './core/native-app.service';
import { NetworkService } from './core/network.service';
import { MetaTrackingService } from './core/meta-tracking.service';
import { ConsentBannerComponent } from './shared/consent-banner';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    RouterOutlet,
    ToastComponent,
    ConfirmDialogComponent,
    ProgressBarComponent,
    OfflineBannerComponent,
    PlanLimitDialogComponent,
    ConsentBannerComponent,
  ],
  template: `
    <app-progress-bar />
    <app-offline-banner />
    <router-outlet />
    <app-toast />
    <app-confirm />
    <app-plan-limit />
    <app-consent-banner />
  `
})
export class App implements OnInit {
  private native = inject(NativeAppService);
  private network = inject(NetworkService);
  private tracking = inject(MetaTrackingService);

  async ngOnInit() {
    // Ambos son no-op fuera del navegador (prerender de la landing).
    // Medición de anuncios (HU84): no-op en el servidor y sin píxel configurado.
    this.tracking.init();
    await this.network.init();
    await this.native.init();
    await this.native.hideSplash();
  }
}
