const PASSWORD_PREFIX = 'pbkdf2_sha256';
const PBKDF2_ITERATIONS = 100000;
const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const DEFAULT_TOKEN_SECRET = 'couple-album-dev-secret-change-in-production';

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  },
});

const text = (value, status = 200) => new Response(value, {
  status,
  headers: { 'Content-Type': 'text/plain; charset=utf-8' },
});

const normalizeText = (value) => String(value || '').trim();
const nowIso = () => new Date().toISOString();

function base64UrlEncode(input) {
  const bytes = input instanceof Uint8Array ? input : new TextEncoder().encode(input);
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlDecode(input) {
  const padded = String(input).replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(input.length / 4) * 4, '=');
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function hmacSha256(value, secret) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value)));
}

async function signToken(user, env) {
  const payload = base64UrlEncode(JSON.stringify({
    id: user.id,
    account: user.account || user.username,
    exp: Date.now() + TOKEN_TTL_MS,
  }));
  const signature = base64UrlEncode(await hmacSha256(payload, env.TOKEN_SECRET || DEFAULT_TOKEN_SECRET));
  return `${payload}.${signature}`;
}

async function verifyToken(token, env) {
  const [payload, signature] = String(token || '').split('.');
  if (!payload || !signature) return null;
  const expected = base64UrlEncode(await hmacSha256(payload, env.TOKEN_SECRET || DEFAULT_TOKEN_SECRET));
  if (expected !== signature) return null;

  try {
    const parsed = JSON.parse(new TextDecoder().decode(base64UrlDecode(payload)));
    if (!parsed.exp || parsed.exp < Date.now()) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(String(password)),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    material,
    256,
  );
  return `${PASSWORD_PREFIX}$${base64UrlEncode(salt)}$${base64UrlEncode(new Uint8Array(bits))}`;
}

function isPasswordHash(value) {
  return String(value || '').startsWith(`${PASSWORD_PREFIX}$`);
}

async function verifyPassword(password, storedValue) {
  const stored = String(storedValue || '');
  if (!isPasswordHash(stored)) return stored === String(password);
  const [, saltEncoded, expected] = stored.split('$');
  if (!saltEncoded || !expected) return false;

  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(String(password)),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: base64UrlDecode(saltEncoded), iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    material,
    256,
  );
  return base64UrlEncode(new Uint8Array(bits)) === expected;
}

function publicUser(user) {
  return {
    id: user.id,
    name: user.name || user.username || user.account,
    account: user.account || user.username,
    username: user.account || user.username,
    avatarUrl: user.avatar_url || user.avatarUrl || '',
    bio: user.bio || '',
  };
}

async function getCurrentUser(request, env) {
  const authHeader = request.headers.get('authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  const payload = await verifyToken(token, env);
  if (!payload) return null;
  return env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(payload.id).first();
}

async function requireUser(request, env) {
  const user = await getCurrentUser(request, env);
  if (!user) throw new Response(JSON.stringify({ success: false, message: '请先登录或重新登录' }), {
    status: 401,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
  return user;
}

function getFileType(mimetype) {
  if (mimetype.startsWith('image/')) return 'image';
  if (mimetype.startsWith('video/')) return 'video';
  if (mimetype.startsWith('application/')) return 'document';
  return 'other';
}

function parseTags(rawTags) {
  if (Array.isArray(rawTags)) return rawTags.map(normalizeText).filter(Boolean);
  try {
    const parsed = JSON.parse(rawTags || '[]');
    return Array.isArray(parsed) ? parsed.map(normalizeText).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function mapAlbumRows(rows) {
  const byId = new Map();
  rows.forEach((row) => {
    if (!byId.has(row.id)) {
      byId.set(row.id, {
        id: row.id,
        title: row.title,
        description: row.description,
        files: [],
        createdAt: row.created_at,
        creator: row.creator,
        creatorId: row.creator_id,
        creatorAccount: row.creator_account || '',
        category: row.category,
        tags: parseTags(row.tags_json),
        isFavorite: Boolean(row.is_favorite),
        comments: [],
        fileIds: new Set(),
        commentIds: new Set(),
      });
    }
    const album = byId.get(row.id);
    if (row.file_id && !album.fileIds.has(row.file_id)) {
      album.fileIds.add(row.file_id);
      album.files.push({
        url: row.file_url,
        originalname: row.file_originalname,
        type: row.file_type,
        mimetype: row.file_mimetype,
        size: row.file_size,
      });
    }
    if (row.comment_id && !album.commentIds.has(row.comment_id)) {
      album.commentIds.add(row.comment_id);
      album.comments.push({
        id: row.comment_id,
        content: row.comment_content,
        username: row.comment_username,
        userId: row.comment_user_id,
        account: row.comment_account || '',
        createdAt: row.comment_created_at,
      });
    }
  });
  return Array.from(byId.values()).map((album) => {
    const { fileIds, commentIds, ...publicAlbum } = album;
    return publicAlbum;
  });
}

async function listAlbums(env) {
  const { results } = await env.DB.prepare(`
    SELECT
      a.*,
      f.id AS file_id, f.url AS file_url, f.originalname AS file_originalname,
      f.type AS file_type, f.mimetype AS file_mimetype, f.size AS file_size,
      c.id AS comment_id, c.content AS comment_content, c.username AS comment_username,
      c.user_id AS comment_user_id, c.account AS comment_account, c.created_at AS comment_created_at
    FROM albums a
    LEFT JOIN album_files f ON f.album_id = a.id
    LEFT JOIN comments c ON c.album_id = a.id
    ORDER BY a.created_at ASC, f.sort_order ASC, c.created_at ASC
  `).all();
  return mapAlbumRows(results || []);
}

async function getAlbum(env, albumId) {
  return env.DB.prepare('SELECT * FROM albums WHERE id = ?').bind(albumId).first();
}

function isAlbumOwner(album, user) {
  if (!album || !user) return false;
  return String(album.creator_id || '') === String(user.id)
    || (!!album.creator_account && album.creator_account === user.account)
    || (!album.creator_id && !album.creator_account && album.creator === user.name);
}

async function handleLogin(request, env) {
  const body = await request.json();
  const name = normalizeText(body.name);
  const account = normalizeText(body.account || body.username);
  const password = normalizeText(body.password);
  if (!name || !account || !password) return json({ success: false, message: '名字、账户和密码不能为空' }, 400);

  const user = await env.DB.prepare('SELECT * FROM users WHERE account = ? AND name = ?').bind(account, name).first();
  if (!user || !(await verifyPassword(password, user.password_hash || user.password))) {
    return json({ success: false, message: '名字、账户或密码错误' }, 401);
  }
  if (!user.password_hash || !isPasswordHash(user.password_hash)) {
    await env.DB.prepare('UPDATE users SET password_hash = ?, password = NULL WHERE id = ?').bind(await hashPassword(password), user.id).run();
  }
  return json({ success: true, user: publicUser(user), token: await signToken(user, env) });
}

async function handleRegister(request, env) {
  const body = await request.json();
  const name = normalizeText(body.name);
  const account = normalizeText(body.account || body.username);
  const password = normalizeText(body.password);
  if (!name || !account || !password) return json({ success: false, message: '名字、账户和密码不能为空' }, 400);

  const existing = await env.DB.prepare('SELECT id FROM users WHERE account = ?').bind(account).first();
  if (existing) return json({ success: false, message: '账户已存在' }, 409);

  const result = await env.DB.prepare(`
    INSERT INTO users (name, account, username, password_hash, avatar_url, bio, created_at)
    VALUES (?, ?, ?, ?, '', '', ?)
  `).bind(name, account, account, await hashPassword(password), nowIso()).run();
  const user = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(result.meta.last_row_id).first();
  return json({ success: true, user: publicUser(user), token: await signToken(user, env) });
}

async function handleProfileUpdate(request, env) {
  const user = await requireUser(request, env);
  const form = await request.formData();
  const name = normalizeText(form.get('name'));
  const bio = normalizeText(form.get('bio'));
  if (!name) return json({ success: false, message: '名字不能为空' }, 400);

  let avatarUrl = user.avatar_url || '';
  const avatar = form.get('avatar');
  if (avatar && typeof avatar === 'object' && avatar.size) {
    if (!avatar.type.startsWith('image/')) return json({ success: false, message: '头像只支持图片文件' }, 400);
    const ext = avatar.name.includes('.') ? avatar.name.slice(avatar.name.lastIndexOf('.')) : '';
    const key = `avatars/${user.id}-${Date.now()}${ext}`;
    await env.UPLOADS.put(key, avatar.stream(), {
      httpMetadata: { contentType: avatar.type || 'application/octet-stream' },
      customMetadata: { originalname: avatar.name || key },
    });
    avatarUrl = `/uploads/${key}`;
  }

  await env.DB.prepare('UPDATE users SET name = ?, bio = ?, avatar_url = ? WHERE id = ?')
    .bind(name, bio, avatarUrl, user.id)
    .run();
  await env.DB.prepare('UPDATE albums SET creator = ? WHERE creator_id = ?').bind(name, user.id).run();
  await env.DB.prepare('UPDATE comments SET username = ? WHERE user_id = ?').bind(name, user.id).run();

  const updated = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(user.id).first();
  return json({ success: true, user: publicUser(updated) });
}

async function handleAlbumCreate(request, env) {
  const user = await requireUser(request, env);
  const form = await request.formData();
  const title = normalizeText(form.get('title'));
  const description = normalizeText(form.get('description'));
  const category = normalizeText(form.get('category')) || '其他';
  if (!title || !description) return json({ success: false, message: '标题和描述不能为空' }, 400);
  if (category === '全部') return json({ success: false, message: '请选择有效分类' }, 400);

  const files = form.getAll('files').filter((file) => file && typeof file === 'object' && file.size);
  if (!files.length) return json({ success: false, message: '请选择文件' }, 400);

  const createdAt = nowIso();
  const result = await env.DB.prepare(`
    INSERT INTO albums (title, description, created_at, creator, creator_id, creator_account, category, tags_json, is_favorite)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
  `).bind(title, description, createdAt, user.name, user.id, user.account, category, JSON.stringify(parseTags(form.get('tags')))).run();
  const albumId = result.meta.last_row_id;

  for (let index = 0; index < files.length; index += 1) {
    const file = files[index];
    const ext = file.name.includes('.') ? file.name.slice(file.name.lastIndexOf('.')) : '';
    const key = `albums/${albumId}/${Date.now()}-${index}${ext}`;
    await env.UPLOADS.put(key, file.stream(), {
      httpMetadata: { contentType: file.type || 'application/octet-stream' },
      customMetadata: { originalname: file.name || key },
    });
    await env.DB.prepare(`
      INSERT INTO album_files (album_id, url, r2_key, originalname, type, mimetype, size, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(albumId, `/uploads/${key}`, key, file.name || key, getFileType(file.type || ''), file.type || '', file.size || 0, index).run();
  }

  const albums = await listAlbums(env);
  return json({ success: true, album: albums.find((album) => album.id === albumId) });
}

async function handleAlbumUpdate(request, env, albumId) {
  const user = await requireUser(request, env);
  const album = await getAlbum(env, albumId);
  if (!album) return json({ success: false, message: '相册不存在' }, 404);
  if (!isAlbumOwner(album, user)) return json({ success: false, message: '只能修改自己发布的相册' }, 403);

  const body = await request.json();
  const title = normalizeText(body.title);
  const description = normalizeText(body.description);
  const category = normalizeText(body.category);
  if (!title || !description || !category || category === '全部') {
    return json({ success: false, message: '请填写有效的相册信息' }, 400);
  }

  await env.DB.prepare('UPDATE albums SET title = ?, description = ?, category = ?, tags_json = ? WHERE id = ?')
    .bind(title, description, category, JSON.stringify(parseTags(body.tags)), albumId)
    .run();
  const albums = await listAlbums(env);
  return json({ success: true, album: albums.find((item) => item.id === albumId) });
}

async function handleAlbumDelete(request, env, albumId) {
  const user = await requireUser(request, env);
  const album = await getAlbum(env, albumId);
  if (!album) return json({ success: false, message: '相册不存在' }, 404);
  if (!isAlbumOwner(album, user)) return json({ success: false, message: '只能删除自己发布的相册' }, 403);

  const { results } = await env.DB.prepare('SELECT r2_key FROM album_files WHERE album_id = ?').bind(albumId).all();
  await Promise.all((results || []).filter((file) => file.r2_key).map((file) => env.UPLOADS.delete(file.r2_key)));
  await env.DB.prepare('DELETE FROM albums WHERE id = ?').bind(albumId).run();
  return json({ success: true });
}

async function handleFavorite(request, env, albumId) {
  await requireUser(request, env);
  const album = await getAlbum(env, albumId);
  if (!album) return json({ success: false, message: '相册不存在' }, 404);
  await env.DB.prepare('UPDATE albums SET is_favorite = ? WHERE id = ?').bind(album.is_favorite ? 0 : 1, albumId).run();
  const albums = await listAlbums(env);
  return json({ success: true, album: albums.find((item) => item.id === albumId) });
}

async function handleCommentCreate(request, env, albumId) {
  const user = await requireUser(request, env);
  const album = await getAlbum(env, albumId);
  if (!album) return json({ success: false, message: '相册不存在' }, 404);
  const body = await request.json();
  const content = normalizeText(body.content);
  if (!content) return json({ success: false, message: '评论内容不能为空' }, 400);

  const createdAt = nowIso();
  const result = await env.DB.prepare(`
    INSERT INTO comments (album_id, content, username, user_id, account, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(albumId, content, user.name, user.id, user.account, createdAt).run();
  return json({
    success: true,
    comment: { id: result.meta.last_row_id, content, username: user.name, userId: user.id, account: user.account, createdAt },
  });
}

async function handleCommentDelete(request, env, albumId, commentId) {
  const user = await requireUser(request, env);
  const album = await getAlbum(env, albumId);
  if (!album) return json({ success: false, message: '相册不存在' }, 404);

  const comment = await env.DB.prepare('SELECT * FROM comments WHERE id = ? AND album_id = ?').bind(commentId, albumId).first();
  if (!comment) return json({ success: false, message: '评论不存在' }, 404);
  const isCommentOwner = String(comment.user_id || '') === String(user.id)
    || comment.account === user.account
    || (!comment.user_id && !comment.account && comment.username === user.name);
  if (!isCommentOwner && !isAlbumOwner(album, user)) {
    return json({ success: false, message: '没有权限删除此评论' }, 403);
  }

  await env.DB.prepare('DELETE FROM comments WHERE id = ?').bind(commentId).run();
  return json({ success: true });
}

async function routeRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const pathname = url.pathname.replace(/^\/api\/?/, '');
  const segments = pathname.split('/').filter(Boolean);

  if (request.method === 'POST' && segments[0] === 'login') return handleLogin(request, env);
  if (request.method === 'POST' && segments[0] === 'register') return handleRegister(request, env);
  if (request.method === 'GET' && segments[0] === 'me') return json({ success: true, user: publicUser(await requireUser(request, env)) });
  if (request.method === 'PUT' && segments[0] === 'me') return handleProfileUpdate(request, env);
  if (request.method === 'GET' && segments[0] === 'album') return json({ success: true, albums: await listAlbums(env) });
  if (request.method === 'POST' && segments[0] === 'album' && segments.length === 1) return handleAlbumCreate(request, env);

  const albumId = Number(segments[1]);
  if (segments[0] === 'album' && Number.isFinite(albumId)) {
    if (request.method === 'PUT' && segments.length === 2) return handleAlbumUpdate(request, env, albumId);
    if (request.method === 'DELETE' && segments.length === 2) return handleAlbumDelete(request, env, albumId);
    if (request.method === 'POST' && segments[2] === 'favorite') return handleFavorite(request, env, albumId);
    if (request.method === 'POST' && segments[2] === 'comment') return handleCommentCreate(request, env, albumId);
    if (request.method === 'DELETE' && segments[2] === 'comment') return handleCommentDelete(request, env, albumId, Number(segments[3]));
  }

  return text('Not found', 404);
}

export async function onRequest(context) {
  try {
    if (context.request.method === 'OPTIONS') return new Response(null, { status: 204 });
    if (!context.env.DB) return json({ success: false, message: 'Cloudflare D1 binding DB 未配置' }, 500);
    if (!context.env.UPLOADS) return json({ success: false, message: 'Cloudflare R2 binding UPLOADS 未配置' }, 500);
    return await routeRequest(context);
  } catch (error) {
    if (error instanceof Response) return error;
    console.error(error);
    return json({ success: false, message: error.message || '服务器内部错误' }, 500);
  }
}
