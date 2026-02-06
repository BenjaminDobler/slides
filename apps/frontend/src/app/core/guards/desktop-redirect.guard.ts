import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

/**
 * Guard that redirects away from login page in desktop mode.
 * Desktop apps don't need authentication.
 */
export const desktopRedirectGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.isDesktopApp) {
    router.navigate(['/presentations']);
    return false;
  }

  return true;
};
