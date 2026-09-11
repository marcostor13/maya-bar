import { Component, inject, OnInit } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ToastComponent } from './shared/toast';
import { ConfirmDialogComponent } from './shared/confirm';
import { ProgressBarComponent } from './shared/loader';
import { OfflineBannerComponent } from './shared/offline-banner';
import { NativeAppService } from './core/native-app.service';
import { NetworkService } from './core/network.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    RouterOutlet,
    ToastComponent,
    ConfirmDialogComponent,
    ProgressBarComponent,
    OfflineBannerComponent,
  ],
  template: `
    <app-progress-bar />
    <app-offline-banner />
    <router-outlet />
    <app-toast />
    <app-confirm />
  `
})
export class App implements OnInit {
  private native = inject(NativeAppService);
  private network = inject(NetworkService);

  async ngOnInit() {
    // Ambos son no-op fuera del navegador (prerender de la landing).
    await this.network.init();
    await this.native.init();
    await this.native.hideSplash();
  }
}
