const crypto = require('crypto');

function generateId() {
  return `${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
}

function matchId(a, b) {
  return String(a) === String(b);
}

module.exports = { generateId, matchId };
