const crypto = require('crypto');

const TOKEN_SECRET = process.env.TOKEN_SECRET || 'couple-album-dev-secret-change-in-production';

function base64UrlEncode(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function signPayload(payload) {
  return crypto
    .createHmac('sha256', TOKEN_SECRET)
    .update(payload)
    .digest('base64url');
}

function signToken(user) {
  const payload = base64UrlEncode({
    id: user.id,
    account: user.account || user.username,
    exp: Date.now() + 30 * 24 * 60 * 60 * 1000,
  });
  return `${payload}.${signPayload(payload)}`;
}

function verifyToken(token) {
  const [payload, signature] = String(token || '').split('.');
  if (!payload || !signature || signPayload(payload) !== signature) {
    return null;
  }

  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!parsed.exp || parsed.exp < Date.now()) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  const payload = verifyToken(token);
  if (!payload) {
    return res.status(401).json({ success: false, message: '请先登录或重新登录' });
  }
  req.user = payload;
  next();
}

module.exports = { signToken, requireAuth };
