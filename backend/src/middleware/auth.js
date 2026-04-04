import jwt from 'jsonwebtoken';
import logger from '../config/logger.js';

const COOKIE_NAME = 'blackhole_token';

/** Full callback URL on this API origin (where auth server sends ?token=). */
export function getAuthCallbackUrl() {
  const base = (process.env.APP_URL || '').replace(/\/$/, '');
  if (!base) {
    logger.warn('APP_URL is not set; auth callback URLs may be wrong');
  }
  return `${base}/auth/callback`;
}

function buildLoginRedirectPath(authPath = 'login') {
  const authUrl = (process.env.AUTH_SERVER_URL || 'https://bhiv-auth.onrender.com').replace(/\/$/, '');
  const callbackUrl = getAuthCallbackUrl();
  return `${authUrl}/${authPath}?redirect=${encodeURIComponent(callbackUrl)}`;
}

/**
 * Optional: JWT `allowedApps` must include this id (e.g. setu, sampada, niyantran, artha).
 * Set APP_ID or BHIV_APP_ID in env to enforce; leave empty to skip.
 */
export function requireAllowedApp(appId) {
  const id = appId || process.env.APP_ID || process.env.BHIV_APP_ID;
  return (req, res, next) => {
    if (!id) return next();
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Not authenticated' });
    }
    const apps = req.user.allowedApps || [];
    if (!apps.includes(id)) {
      return res.status(403).json({
        success: false,
        message: 'You do not have access to this application',
        code: 'app_not_allowed',
      });
    }
    next();
  };
}

/**
 * Protect routes — reads `blackhole_token` HTTP-only cookie.
 * JSON requests: 401/403 JSON; browser navigations: redirect to auth server.
 */
export const protect = (req, res, next) => {
  try {
    const token = req.cookies?.[COOKIE_NAME];
    const loginUrl = buildLoginRedirectPath('login');

    if (!token) {
      if (req.accepts('json') === 'json') {
        return res.status(401).json({
          success: false,
          message: 'Not authenticated',
          redirect: loginUrl,
        });
      }
      return res.redirect(loginUrl);
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      req.user = {
        _id: decoded.user_id,
        user_id: decoded.user_id,
        email: decoded.email,
        name: decoded.name || decoded.email?.split('@')[0] || 'User',
        roles: decoded.roles || [],
        role: decoded.roles?.[0] || 'user',
        allowedApps: decoded.allowedApps || [],
        isActive: true,
      };

      const appId = process.env.APP_ID || process.env.BHIV_APP_ID;
      if (appId && !(req.user.allowedApps || []).includes(appId)) {
        if (req.accepts('json') === 'json') {
          return res.status(403).json({
            success: false,
            message: 'You do not have access to this application',
            code: 'app_not_allowed',
          });
        }
        return res.redirect(`${process.env.FRONTEND_URL || ''}/login?error=app_not_allowed`);
      }

      next();
    } catch (err) {
      logger.error('JWT verification failed:', err.message);
      res.clearCookie(COOKIE_NAME, { path: '/' });
      if (req.accepts('json') === 'json') {
        return res.status(401).json({
          success: false,
          message: 'Token is invalid or expired',
          redirect: loginUrl,
        });
      }
      return res.redirect(loginUrl);
    }
  } catch (error) {
    logger.error('Auth middleware error:', error);
    return res.status(500).json({
      success: false,
      message: 'Authentication error',
    });
  }
};

export const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Not authenticated' });
    }

    const userRoles = req.user.roles || [];
    const hasRole = roles.some(
      (r) => userRoles.includes(r) || req.user.role === r,
    );

    if (!hasRole) {
      return res.status(403).json({
        success: false,
        message: `Role '${req.user.role}' is not authorized to access this route`,
      });
    }
    next();
  };
};

const auth = protect;
export default auth;
