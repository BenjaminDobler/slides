import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { AuthService } from './auth.service';

const DESKTOP_BACKEND_URL = 'http://127.0.0.1:3332';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);

  // In desktop mode, prepend the backend URL for API requests
  if (auth.isDesktopApp && req.url.startsWith('/api')) {
    req = req.clone({ url: `${DESKTOP_BACKEND_URL}${req.url}` });
    return next(req);
  }

  const token = auth.getToken();
  if (token) {
    req = req.clone({ setHeaders: { Authorization: `Bearer ${token}` } });
  }
  return next(req);
};
