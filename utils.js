const jwt = require('jsonwebtoken');

const SECRET = process.env.JWT_SECRET || 'dev-secret';

function signToken(payload) {
  return jwt.sign(payload, SECRET, { expiresIn: '2h' });
}

function verifyToken(token) {
  return jwt.verify(token, SECRET);
}

function sendSuccess(res, data, status = 200) {
  return res.status(status).json({ success: true, data, error: null });
}

function sendError(res, message, code = 'bad_request', status = 400) {
  return res.status(status).json({ success: false, data: null, error: { message, code } });
}

function authMiddleware(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.split(' ')[1];
  if (!token) return sendError(res, 'Unauthorized', 'unauthorized', 401);
  try {
    req.user = verifyToken(token);
    return next();
  } catch (err) {
    return sendError(res, 'Unauthorized', 'unauthorized', 401);
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return sendError(res, 'Forbidden', 'forbidden', 403);
    }
    return next();
  };
}

module.exports = {
  signToken,
  verifyToken,
  sendSuccess,
  sendError,
  authMiddleware,
  requireRole
};
