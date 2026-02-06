import {
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
  provideZonelessChangeDetection,
} from '@angular/core';
import { provideRouter, withHashLocation } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { appRoutes } from './app.routes';
import { authInterceptor } from './core/services/auth.interceptor';

// Detect if running in Tauri desktop app (check protocol for built apps)
const isDesktopApp = typeof window !== 'undefined' &&
  (!!window.__TAURI__ || window.location.protocol === 'tauri:');

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    // Use hash routing for desktop app (tauri:// protocol doesn't support pushState)
    provideRouter(appRoutes, ...(isDesktopApp ? [withHashLocation()] : [])),
    provideHttpClient(withInterceptors([authInterceptor])),
  ],
};
