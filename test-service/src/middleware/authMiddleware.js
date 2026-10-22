const crypto = require('crypto');

/**
 * Authentication middleware for internal APIs.
 * Uses constant-time comparison to prevent timing attacks.
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
const authMiddleware = (req, res, next) => {
  const token = req.headers['x-internal-token'];
  const expectedToken = process.env.INTERNAL_API_TOKEN;

  // Reject if server token is not configured
  if (!expectedToken) {
    return res.status(500).json({ error: 'Server misconfiguration: INTERNAL_API_TOKEN not set' });
  }

  if (!token) {
    return res.status(401).json({ error: 'Unauthorized: Missing X-Internal-Token header' });
  }

  // Constant-time comparison to prevent timing attacks
  const tokenBuf = Buffer.from(String(token));
  const expectedBuf = Buffer.from(String(expectedToken));
  if (tokenBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(tokenBuf, expectedBuf)) {
    return res.status(401).json({ error: 'Unauthorized: Invalid X-Internal-Token' });
  }

  next();
};

module.exports = authMiddleware;
