import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import axios from 'axios';
import User from '../models/User.js';
import logger from '../config/logger.js';
import { getAuthCallbackUrl, getBlackholeCookieOptions } from '../middleware/auth.js';

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

    const authBase = (process.env.AUTH_SERVER_URL || 'https://bhiv-auth.onrender.com').replace(/\/$/, '');
    const authRes = await axios.post(
      `${authBase}/api/login`,
      { email, password, redirect: getAuthCallbackUrl() },
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

    if (authRes.status < 200 || authRes.status >= 300) {
      return res.status(502).json({
        success: false,
        message: authRes.data?.message || 'Auth server error',
      });
    }

    const token = authRes.data?.token;
    if (!token || typeof token !== 'string') {
      return res.status(502).json({ success: false, message: 'No token from auth server' });
    }

    jwt.verify(token, process.env.JWT_SECRET);
    res.cookie('blackhole_token', token, getBlackholeCookieOptions());
    return res.json({ success: true });
  } catch (err) {
    if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
      return res.status(502).json({
        success: false,
        message: 'Token from auth server could not be verified',
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

    const authBase = (process.env.AUTH_SERVER_URL || 'https://bhiv-auth.onrender.com').replace(/\/$/, '');
    const payload = {
      email,
      redirect: getAuthCallbackUrl(),
    };
    if (mode === 'popup') payload.mode = 'popup';

    const authRes = await axios.post(`${authBase}/api/magic-link`, payload, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 20000,
      validateStatus: () => true,
    });

    if (authRes.status < 200 || authRes.status >= 300) {
      const status = authRes.status >= 400 && authRes.status < 600 ? authRes.status : 502;
      return res.status(status).json({
        success: false,
        message: authRes.data?.message || 'Could not send magic link',
      });
    }

    return res.json({
      success: true,
      message: authRes.data?.message || 'Check your email for the sign-in link.',
      devMagicUrl: authRes.data?.devMagicUrl,
    });
  } catch (err) {
    logger.error('requestMagicLink:', err.message);
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

    const authBase = (process.env.AUTH_SERVER_URL || 'https://bhiv-auth.onrender.com').replace(/\/$/, '');
    const signupUrl = `${authBase}/api/signup`;

    const authRes = await axios.post(
      signupUrl,
      { email, password, redirect: getAuthCallbackUrl() },
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
        jwt.verify(token, process.env.JWT_SECRET);
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
    logger.error('signupWithBlackhole:', err.message);
    return res.status(500).json({ success: false, message: 'Registration failed' });
  }
};
