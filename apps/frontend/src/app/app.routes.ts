import { Route } from '@angular/router';
import { desktopRedirectGuard } from './core/guards/desktop-redirect.guard';

export const appRoutes: Route[] = [
  { path: '', redirectTo: 'presentations', pathMatch: 'full' },
  {
    path: 'login',
    canActivate: [desktopRedirectGuard],
    loadComponent: () =>
      import('./features/auth/login.component').then((m) => m.LoginComponent),
  },
  {
    path: 'presentations',
    loadComponent: () =>
      import('./features/presentations/presentation-list.component').then((m) => m.PresentationListComponent),
  },
  {
    path: 'editor/:id',
    loadComponent: () =>
      import('./features/editor/editor-page.component').then((m) => m.EditorPageComponent),
  },
  {
    path: 'settings',
    loadComponent: () =>
      import('./features/settings/settings.component').then((m) => m.SettingsComponent),
  },
  {
    path: 'present/:id',
    loadComponent: () =>
      import('./features/presenter/presenter.component').then((m) => m.PresenterComponent),
  },
];
