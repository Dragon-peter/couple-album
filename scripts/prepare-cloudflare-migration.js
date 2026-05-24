#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'cloudflare', 'generated');
const USERS_PATH = path.join(ROOT, 'users.json');
const ALBUMS_PATH = path.join(ROOT, 'albums.json');
const UPLOADS_DIR = path.join(ROOT, 'server', 'uploads');

function readJson(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function sqlString(value) {
  if (value === null || value === undefined) return 'NULL';
  return `'${String(value).replace(/'/g, "''")}'`;
}

function sqlNumber(value) {
  if (value === null || value === undefined || value === '') return 'NULL';
  const number = Number(value);
  return Number.isFinite(number) ? String(number) : 'NULL';
}

function normalizeDate(value) {
  if (!value) return new Date().toISOString();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function isPasswordHash(value) {
  return String(value || '').startsWith('pbkdf2_sha256$');
}

function hashLegacyPassword(password) {
  if (!password) return '';
  if (isPasswordHash(password)) return password;
  const salt = crypto.randomBytes(16).toString('base64url');
  const hash = crypto.pbkdf2Sync(String(password), salt, 120000, 32, 'sha256').toString('base64url');
  return `pbkdf2_sha256$${salt}$${hash}`;
}

function splitUploadUrl(url) {
  const normalized = String(url || '').replace(/^https?:\/\/[^/]+/, '');
  if (!normalized.startsWith('/uploads/')) return null;
  const filename = decodeURIComponent(normalized.slice('/uploads/'.length));
  const localPath = path.join(UPLOADS_DIR, filename);
  const key = filename.includes('/') ? filename : `legacy/${filename}`;
  return { filename, localPath, key };
}

function fileMime(filename, fallback = '') {
  const ext = path.extname(filename).toLowerCase();
  if (fallback) return fallback;
  if (['.jpg', '.jpeg'].includes(ext)) return 'image/jpeg';
  if (ext === '.png') return 'image/png';
  if (ext === '.gif') return 'image/gif';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.mp4') return 'video/mp4';
  if (ext === '.mov') return 'video/quicktime';
  return 'application/octet-stream';
}

function buildMigration() {
  const users = readJson(USERS_PATH, []);
  const albums = readJson(ALBUMS_PATH, []);
  const userByName = new Map(users.map((user) => [user.name || user.username, user]));
  const userByAccount = new Map(users.map((user) => [user.account || user.username, user]));
  let nextCommentId = 1;
  const sql = [
    'PRAGMA foreign_keys = OFF;',
    'DELETE FROM comments;',
    'DELETE FROM album_files;',
    'DELETE FROM albums;',
    'DELETE FROM users;',
  ];
  const uploads = [
    '#!/usr/bin/env bash',
    'set -euo pipefail',
    'BUCKET="${R2_BUCKET:-couple-album-uploads}"',
    'WRANGLER="${WRANGLER:-npx wrangler}"',
    '',
  ];

  users.forEach((user, index) => {
    const id = Number(user.id) || index + 1;
    const account = user.account || user.username || `user${id}`;
    const passwordHash = user.passwordHash || user.password_hash || hashLegacyPassword(user.password);
    sql.push(`INSERT INTO users (id, name, account, username, password_hash, avatar_url, bio, created_at) VALUES (${id}, ${sqlString(user.name || user.username || account)}, ${sqlString(account)}, ${sqlString(user.username || account)}, ${sqlString(passwordHash)}, ${sqlString(user.avatarUrl || user.avatar_url || '')}, ${sqlString(user.bio || '')}, ${sqlString(normalizeDate(user.createdAt || user.created_at))});`);
  });

  albums.forEach((album, albumIndex) => {
    const albumId = Number(album.id) || albumIndex + 1;
    const creator = album.creator || 'unknown';
    const owner = userByAccount.get(album.creatorAccount) || userByName.get(creator) || null;
    const creatorId = album.creatorId || album.creator_id || (owner && owner.id) || null;
    const creatorAccount = album.creatorAccount || album.creator_account || (owner && (owner.account || owner.username)) || '';
    sql.push(`INSERT INTO albums (id, title, description, created_at, creator, creator_id, creator_account, category, tags_json, is_favorite) VALUES (${albumId}, ${sqlString(album.title)}, ${sqlString(album.description)}, ${sqlString(normalizeDate(album.createdAt || album.created_at))}, ${sqlString(creator)}, ${sqlNumber(creatorId)}, ${sqlString(creatorAccount)}, ${sqlString(album.category || '其他')}, ${sqlString(JSON.stringify(album.tags || []))}, ${album.isFavorite || album.is_favorite ? 1 : 0});`);

    (album.files || []).forEach((file, fileIndex) => {
      const upload = splitUploadUrl(file.url);
      const r2Key = upload ? upload.key : null;
      const url = r2Key ? `/uploads/${r2Key}` : file.url;
      sql.push(`INSERT INTO album_files (album_id, url, r2_key, originalname, type, mimetype, size, sort_order) VALUES (${albumId}, ${sqlString(url)}, ${sqlString(r2Key)}, ${sqlString(file.originalname || (upload && upload.filename) || '')}, ${sqlString(file.type || 'image')}, ${sqlString(file.mimetype || fileMime(file.originalname || (upload && upload.filename) || ''))}, ${sqlNumber(file.size || 0)}, ${fileIndex});`);
      if (upload && fs.existsSync(upload.localPath)) {
        uploads.push(`$WRANGLER r2 object put "$BUCKET/${upload.key}" --remote --file ${JSON.stringify(upload.localPath)} --content-type ${JSON.stringify(fileMime(upload.filename, file.mimetype))}`);
      }
    });

    (album.comments || []).forEach((comment) => {
      const owner = userByAccount.get(comment.account) || userByName.get(comment.username) || null;
      const commentId = nextCommentId;
      nextCommentId += 1;
      sql.push(`INSERT INTO comments (id, album_id, content, username, user_id, account, created_at) VALUES (${commentId}, ${albumId}, ${sqlString(comment.content)}, ${sqlString(comment.username || '')}, ${sqlNumber(comment.userId || comment.user_id || (owner && owner.id))}, ${sqlString(comment.account || (owner && (owner.account || owner.username)) || '')}, ${sqlString(normalizeDate(comment.createdAt || comment.created_at))});`);
    });
  });

  sql.push('PRAGMA foreign_keys = ON;');
  return { sql: sql.join('\n'), uploads: uploads.join('\n') + '\n' };
}

fs.mkdirSync(OUT_DIR, { recursive: true });
const migration = buildMigration();
fs.writeFileSync(path.join(OUT_DIR, 'seed.sql'), migration.sql);
fs.writeFileSync(path.join(OUT_DIR, 'upload-r2.sh'), migration.uploads, { mode: 0o755 });

console.log('已生成 cloudflare/generated/seed.sql');
console.log('已生成 cloudflare/generated/upload-r2.sh');
console.log('执行前请先创建 D1/R2，并把 wrangler.toml 中 database_id 替换为真实 ID。');
