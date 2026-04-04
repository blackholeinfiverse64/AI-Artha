import logger from '../config/logger.js';

/**
 * @desc    Get current user profile (from Blackhole JWT)
 * @route   GET /api/v1/users/me
 */
export const getMe = async (req, res) => {
  try {
    res.json({
      success: true,
      data: {
        _id: req.user._id,
        name: req.user.name,
        email: req.user.email,
        role: req.user.role,
        roles: req.user.roles,
        status: 'active',
      },
    });
  } catch (error) {
    logger.error('Get me error:', error);
    res.status(500).json({ success: false, message: 'Error fetching profile' });
  }
};

/**
 * @desc    Update current user profile (no-op, managed by Blackhole Auth)
 * @route   PUT /api/v1/users/me
 */
export const updateMe = async (req, res) => {
  res.status(400).json({
    success: false,
    message: 'Profile is managed by Blackhole Auth. Update your profile at the auth portal.',
  });
};

/**
 * @desc    Get all users — placeholder (users live in Blackhole Auth)
 * @route   GET /api/v1/users
 */
export const getUsers = async (req, res) => {
  res.json({ success: true, count: 0, data: [] });
};

/**
 * @desc    Get single user — placeholder
 * @route   GET /api/v1/users/:id
 */
export const getUser = async (req, res) => {
  res.status(404).json({ success: false, message: 'User management is handled by Blackhole Auth' });
};

/**
 * @desc    Create user — not supported, handled by Blackhole Auth
 * @route   POST /api/v1/users
 */
export const createUser = async (req, res) => {
  res.status(400).json({
    success: false,
    message: 'Users are managed by Blackhole Auth. Register at the auth portal.',
  });
};

/**
 * @desc    Update user — not supported
 * @route   PUT /api/v1/users/:id
 */
export const updateUser = async (req, res) => {
  res.status(400).json({
    success: false,
    message: 'Users are managed by Blackhole Auth.',
  });
};

/**
 * @desc    Delete user — not supported
 * @route   DELETE /api/v1/users/:id
 */
export const deleteUser = async (req, res) => {
  res.status(400).json({
    success: false,
    message: 'Users are managed by Blackhole Auth.',
  });
};
