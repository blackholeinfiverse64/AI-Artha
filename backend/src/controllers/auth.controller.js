import User from '../models/User.js';
import logger from '../config/logger.js';
import { signAccessToken } from '../utils/authToken.js';

/**
 * POST /api/v1/auth/login — verify local User password; return JWT (no external auth server).
 */
export const login = async (req, res) => {
  try {
    const email = (req.body?.email || '').trim().toLowerCase();
    const password = req.body?.password || '';
    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required' });
    }

    const user = await User.findOne({ email, isActive: true }).select('+password');
    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

    user.lastLogin = new Date();
    await user.save({ validateBeforeSave: false });

    const token = signAccessToken(user);

    return res.json({
      success: true,
      data: {
        token,
        user: {
          id: user._id,
          email: user.email,
          name: user.name,
          role: user.role,
          roles: [user.role],
        },
      },
    });
  } catch (err) {
    logger.error('login:', err.message);
    return res.status(500).json({ success: false, message: 'Login failed' });
  }
};
