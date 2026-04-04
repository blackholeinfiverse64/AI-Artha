import User from '../models/User.js';
import logger from '../config/logger.js';

/**
 * POST /api/v1/auth/validate-login-email
 * Validates format; optionally ensures email exists in local User collection
 * (when REQUIRE_LOCAL_EMAIL_FOR_LOGIN=true). Blackhole still performs real auth.
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
