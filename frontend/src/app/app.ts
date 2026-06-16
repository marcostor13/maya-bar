import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ToastComponent } from './shared/toast';
import { ConfirmDialogComponent } from './shared/confirm';
import { ProgressBarComponent } from './shared/loader';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, ToastComponent, ConfirmDialogComponent, ProgressBarComponent],
  template: `
    <app-progress-bar />
    <router-outlet />
    <app-toast />
    <app-confirm />
  `
})
export class App {}
