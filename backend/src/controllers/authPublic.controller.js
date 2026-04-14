import crypto from 'node:crypto';
import axios from 'axios';
import User from '../models/User.js';
import logger from '../config/logger.js';
import {
  getAuthCallbackUrl,
  getBlackholeCookieOptions,
  verifyBlackholeToken,
} from '../middleware/auth.js';

function getRequestCallbackUrl(req) {
  const forwardedProto = req.get('x-forwarded-proto');
  const forwardedHost = req.get('x-forwarded-host');
  const host = (forwardedHost || req.get('host') || '').split(',')[0].trim();
  const proto = (forwardedProto || req.protocol || 'https').split(',')[0].trim();

  if (host && proto) {
    return `${proto}://${host}/auth/callback`;
  }

  return getAuthCallbackUrl();
}

/**
 * POST /api/v1/auth/validate-login-email
 * Validates format; optionally ensures email exists in local User collection
 * (when REQUIRE_LOCAL_EMAIL_FOR_LOGIN=true).
 */
export const validateLoginEmail = async (req, res) => {
  try {
    const email = (req.body?.email || '').trim().toLowerCase();
    if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
      return res.status(400).json({
        success: false,
        message: 'Please enter a valid email address',
      });
    }

    if (process.env.REQUIRE_LOCAL_EMAIL_FOR_LOGIN === 'true') {
      const user = await User.findOne({ email, isActive: true }).select('_id');
      if (!user) {
        return res.status(403).json({
          success: false,
          message: 'This email is not registered. Use “Create new account” or contact your admin.',
        });
      }
    }

    return res.json({ success: true, email });
  } catch (err) {
    logger.error('validateLoginEmail:', err);
    return res.status(500).json({ success: false, message: 'Could not verify email' });
  }
};

/**
 * POST /api/v1/auth/login — proxy to {AUTH}/api/login; set blackhole_token on this host.
 */
export const loginPassword = async (req, res) => {
  try {
    const email = (req.body?.email || '').trim().toLowerCase();
    const password = req.body?.password || '';
    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required' });
    }

    const callbackUrl = getRequestCallbackUrl(req);
    const authBase = (process.env.AUTH_SERVER_URL || 'https://bhiv-auth.onrender.com').replace(/\/$/, '');
    const authRes = await axios.post(
      `${authBase}/api/login`,
      { email, password, redirect: callbackUrl },
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: 20000,
        validateStatus: () => true,
      },
    );

    if (authRes.status === 401 || authRes.status === 403) {
      return res.status(401).json({
        success: false,
        message: authRes.data?.message || 'Invalid email or password',
      });
    }

    if (authRes.status === 429) {
      return res.status(429).json({
        success: false,
        message: authRes.data?.message || 'Too many login attempts. Please try again shortly.',
      });
    }

    if (authRes.status === 400 || authRes.status === 404 || authRes.status === 422) {
      return res.status(400).json({
        success: false,
        message: authRes.data?.message || 'Login request was rejected by auth server',
      });
    }

    if (authRes.status < 200 || authRes.status >= 300) {
      return res.status(502).json({
        success: false,
        message: authRes.data?.message || `Auth server error (${authRes.status})`,
      });
    }

    const token = authRes.data?.token;
    if (!token || typeof token !== 'string') {
      return res.status(502).json({ success: false, message: 'No token from auth server' });
    }

    verifyBlackholeToken(token);
    res.cookie('blackhole_token', token, getBlackholeCookieOptions());
    return res.json({ success: true });
  } catch (err) {
    if (
      err.name === 'JsonWebTokenError' ||
      err.name === 'TokenExpiredError' ||
      err.code === 'JWT_SECRET_MISSING'
    ) {
      logger.error('loginPassword token verification failed:', err.message);
      return res.status(502).json({
        success: false,
        message:
          'Token from auth server could not be verified. Ensure API JWT_SECRET matches auth server signing secret.',
      });
    }
    logger.error('loginPassword:', err.message);
    return res.status(500).json({ success: false, message: 'Login failed' });
  }
};

/**
 * POST /api/v1/auth/magic-link — proxy to {AUTH}/api/magic-link.
 */
export const requestMagicLink = async (req, res) => {
  try {
    const email = (req.body?.email || '').trim().toLowerCase();
    const mode = req.body?.mode;
    if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
      return res.status(400).json({
        success: false,
        message: 'Please enter a valid email address',
      });
    }

    if (process.env.REQUIRE_LOCAL_EMAIL_FOR_LOGIN === 'true') {
      const user = await User.findOne({ email, isActive: true }).select('_id');
      if (!user) {
        return res.status(403).json({
          success: false,
          message: 'This email is not registered. Use “Create new account” or contact your admin.',
        });
      }
    }

    const callbackUrl = getRequestCallbackUrl(req);
    const authBase = (process.env.AUTH_SERVER_URL || 'https://bhiv-auth.onrender.com').replace(/\/$/, '');
    const payload = {
      email,
      redirect: callbackUrl,
    };
    if (mode === 'popup') payload.mode = 'popup';

    const authRes = await axios.post(`${authBase}/api/magic-link`, payload, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 20000,
      validateStatus: () => true,
    });

    if (authRes.status < 200 || authRes.status >= 300) {
      const status = authRes.status >= 400 && authRes.status < 600 ? authRes.status : 502;
      const message =
        authRes.data?.message ||
        (status === 503
          ? 'Auth service unavailable (503). Check auth deploy, cold start, or email/SMTP config.'
          : 'Could not send magic link');
      return res.status(status).json({
        success: false,
        message,
      });
    }

    return res.json({
      success: true,
      message: authRes.data?.message || 'Check your email for the sign-in link.',
      devMagicUrl: authRes.data?.devMagicUrl,
    });
  } catch (err) {
    logger.error('requestMagicLink:', err.message);
    if (err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT') {
      return res.status(504).json({
        success: false,
        message: 'Auth server did not respond in time. Try again or check AUTH_SERVER_URL.',
      });
    }
    if (!err.response) {
      return res.status(502).json({
        success: false,
        message: 'Cannot reach auth server. Verify AUTH_SERVER_URL and that the auth service is up.',
      });
    }
    return res.status(500).json({ success: false, message: 'Could not request magic link' });
  }
};

/**
 * POST /api/v1/auth/signup — {AUTH}/api/signup then local User row.
 */
export const signupWithBlackhole = async (req, res) => {
  try {
    const email = (req.body?.email || '').trim().toLowerCase();
    const password = req.body?.password || '';
    const name = (req.body?.name || '').trim();
    const phone = (req.body?.phone || '').trim();

    if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
      return res.status(400).json({ success: false, message: 'Please enter a valid email address' });
    }
    if (!password || password.length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
    }
    if (!name) {
      return res.status(400).json({ success: false, message: 'Name is required' });
    }

    const callbackUrl = getRequestCallbackUrl(req);
    const authBase = (process.env.AUTH_SERVER_URL || 'https://bhiv-auth.onrender.com').replace(/\/$/, '');
    const signupUrl = `${authBase}/api/signup`;

    const authRes = await axios.post(
      signupUrl,
      { email, password, redirect: callbackUrl },
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: 20000,
        validateStatus: () => true,
      },
    );

    if (authRes.status === 409) {
      return res.status(409).json({
        success: false,
        message: authRes.data?.message || 'An account with this email already exists',
      });
    }

    if (authRes.status === 429) {
      return res.status(429).json({
        success: false,
        message: authRes.data?.message || 'Too many sign-up attempts. Please try again shortly.',
      });
    }

    if ([400, 401, 403, 404, 422].includes(authRes.status)) {
      return res.status(400).json({
        success: false,
        message: authRes.data?.message || 'Registration request was rejected by auth server',
      });
    }

    if (authRes.status < 200 || authRes.status >= 300) {
      logger.warn('Blackhole signup rejected', { status: authRes.status, data: authRes.data });
      return res.status(502).json({
        success: false,
        message: authRes.data?.message || 'Could not complete registration with the auth server',
      });
    }

    const existing = await User.findOne({ email }).select('_id');
    if (existing) {
      return res.status(409).json({
        success: false,
        message: 'This email is already registered in Artha',
      });
    }

    const placeholderPassword = crypto.randomBytes(32).toString('hex');
    await User.create({
      email,
      password: placeholderPassword,
      name,
      phone: phone || undefined,
      role: 'viewer',
      isActive: true,
    });

    const token = authRes.data?.token;
    if (token && typeof token === 'string') {
      try {
        verifyBlackholeToken(token);
        res.cookie('blackhole_token', token, getBlackholeCookieOptions());
        return res.status(201).json({
          success: true,
          message: 'Account created. You are signed in.',
          loggedIn: true,
        });
      } catch {
        /* fall through */
      }
    }

    return res.status(201).json({
      success: true,
      message: 'Account created. Sign in with your email and password.',
      loggedIn: false,
    });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ success: false, message: 'This email is already registered in Artha' });
    }
    if (err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT') {
      return res.status(504).json({
        success: false,
        message: 'Auth server did not respond in time. Please try again.',
      });
    }
    if (!err.response) {
      return res.status(502).json({
        success: false,
        message: 'Cannot reach auth server. Verify AUTH_SERVER_URL and auth service status.',
      });
    }
    logger.error('signupWithBlackhole:', err.message);
    return res.status(500).json({ success: false, message: 'Registration failed' });
  }
};
