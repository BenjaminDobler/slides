import {
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
  provideZonelessChangeDetection,
} from '@angular/core';
import { provideRouter, withHashLocation } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { appRoutes } from './app.routes';
import { authInterceptor } from './core/services/auth.interceptor';

// Detect if running in Tauri desktop app
// Check multiple indicators since __TAURI__ may not be available at module load time
const isDesktopApp = typeof window !== 'undefined' && (
  !!window.__TAURI__ ||
  window.location.protocol === 'tauri:' ||
  window.location.hostname === 'tauri.localhost' ||
  // @ts-expect-error - Tauri internals injected before __TAURI__
  !!window.__TAURI_INTERNALS__
);

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    // Use hash routing for desktop app (tauri:// protocol doesn't support pushState)
    provideRouter(appRoutes, ...(isDesktopApp ? [withHashLocation()] : [])),
    provideHttpClient(withInterceptors([authInterceptor])),
  ],
};
