const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { signToken, requireAuth, hashPassword, isPasswordHash, verifyPassword, TOKEN_SECRET } = require('./middleware/auth');

const app = express();
const PORT = process.env.PORT || 3001;
const uploadDir = path.join(__dirname, '../uploads');
const albumsDataPath = path.join(__dirname, '../../albums.json');
const usersDataPath = path.join(__dirname, '../../users.json');
const MAX_ALBUM_FILES = 9;

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(uploadDir));

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});

const upload = multer({
  storage,
  fileFilter: (_req, file, cb) => {
    const allowedTypes = [
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
      'video/mp4',
      'video/webm',
      'video/ogg',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ];
    cb(allowedTypes.includes(file.mimetype) ? null : new Error('不支持的文件类型'), allowedTypes.includes(file.mimetype));
  },
  limits: { fileSize: 100 * 1024 * 1024 },
});

const avatarUpload = multer({
  storage,
  fileFilter: (_req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    cb(allowedTypes.includes(file.mimetype) ? null : new Error('头像只支持图片文件'), allowedTypes.includes(file.mimetype));
  },
  limits: { fileSize: 5 * 1024 * 1024 },
});

function readJson(filePath, fallback) {
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    }
  } catch (err) {
    console.error(`读取数据失败: ${filePath}`, err);
  }
  return fallback;
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

function getFileType(mimetype) {
  if (mimetype.startsWith('image/')) return 'image';
  if (mimetype.startsWith('video/')) return 'video';
  if (mimetype.startsWith('application/')) return 'document';
  return 'other';
}

function nextId(items) {
  const ids = items.map(item => Number(item.id)).filter(Number.isFinite);
  return ids.length ? Math.max(...ids) + 1 : 1;
}

function normalizeText(value) {
  return String(value || '').trim();
}

function publicUser(user) {
  return {
    id: user.id,
    name: user.name || user.username || user.account,
    account: user.account || user.username,
    username: user.account || user.username,
    avatarUrl: user.avatarUrl || '',
    bio: user.bio || '',
  };
}

function getStoredPassword(user) {
  return user.passwordHash || user.password || '';
}

function normalizeUsers(rawUsers) {
  return rawUsers.map((user, index) => ({
    id: user.id || index + 1,
    name: user.name || user.nickname || user.username || user.account || `用户${index + 1}`,
    account: user.account || user.username || `user${index + 1}`,
    username: user.account || user.username || `user${index + 1}`,
    password: user.password || '',
    passwordHash: user.passwordHash || (isPasswordHash(user.password) ? user.password : ''),
    avatarUrl: user.avatarUrl || '',
    bio: user.bio || '',
  }));
}

function normalizeAlbums(rawAlbums) {
  return rawAlbums.map((album, albumIndex) => ({
    ...album,
    id: album.id || albumIndex + 1,
    files: (album.files || []).map((file, fileIndex) => ({
      ...file,
      id: file.id || fileIndex + 1,
      sortOrder: Number.isFinite(Number(file.sortOrder)) ? Number(file.sortOrder) : fileIndex,
    })),
    creator: album.creator || album.creatorName || 'unknown',
    creatorId: album.creatorId || null,
    creatorAccount: album.creatorAccount || '',
    tags: Array.isArray(album.tags) ? album.tags : [],
    comments: (album.comments || []).map((comment, commentIndex) => ({
      ...comment,
      id: comment.id || commentIndex + 1,
      username: comment.username || comment.name || 'unknown',
      userId: comment.userId || null,
      account: comment.account || '',
      createdAt: comment.createdAt || new Date().toISOString(),
    })),
  }));
}

let users = normalizeUsers(readJson(usersDataPath, [{ id: 1, name: 'user1', account: 'user1', username: 'user1', password: 'password1' }]));
let albums = normalizeAlbums(readJson(albumsDataPath, []));
repairLegacyAlbumOwnership();

function saveUsers() {
  writeJson(usersDataPath, users);
}

function saveAlbums() {
  writeJson(albumsDataPath, albums);
}

function findCurrentUser(req) {
  return users.find(user => String(user.id) === String(req.user.id));
}

function isAlbumOwner(album, user) {
  if (!album || !user) return false;
  return String(album.creatorId || '') === String(user.id)
    || (!!album.creatorAccount && album.creatorAccount === user.account)
    || (!album.creatorId && !album.creatorAccount && album.creator === user.name);
}

function findUserByDisplayIdentity(displayName) {
  const name = normalizeText(displayName);
  if (!name || name === 'unknown') return null;
  return users.find(user => user.account === name || user.username === name || user.name === name) || null;
}

function repairLegacyAlbumOwnership() {
  let changed = false;

  albums.forEach(album => {
    if (!album.creatorId || !album.creatorAccount) {
      const owner = findUserByDisplayIdentity(album.creator);
      if (owner) {
        album.creator = owner.name;
        album.creatorId = owner.id;
        album.creatorAccount = owner.account;
        changed = true;
      }
    }

    (album.comments || []).forEach(comment => {
      if (!comment.userId || !comment.account) {
        const author = findUserByDisplayIdentity(comment.username);
        if (author) {
          comment.username = author.name;
          comment.userId = author.id;
          comment.account = author.account;
          changed = true;
        }
      }
    });
  });

  if (changed) saveAlbums();
}

function removeUploadedFile(fileUrl) {
  if (!fileUrl || !fileUrl.startsWith('/uploads/')) return;
  const filePath = path.join(uploadDir, path.basename(fileUrl));
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}

function parseJsonField(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

app.post('/api/login', (req, res) => {
  const account = normalizeText(req.body.account || req.body.username);
  const password = normalizeText(req.body.password);

  if (!account || !password) {
    return res.status(400).json({ success: false, message: '账户和密码不能为空' });
  }

  const user = users.find(item => item.account === account);
  if (!user) {
    return res.status(401).json({ success: false, message: '账户或密码错误' });
  }
  if (!verifyPassword(password, getStoredPassword(user))) {
    return res.status(401).json({ success: false, message: '账户或密码错误' });
  }

  if (!user.passwordHash || !isPasswordHash(user.passwordHash)) {
    user.passwordHash = hashPassword(password);
    delete user.password;
    saveUsers();
  }

  res.json({ success: true, user: publicUser(user), token: signToken(user) });
});

app.post('/api/register', (req, res) => {
  const name = normalizeText(req.body.name);
  const account = normalizeText(req.body.account || req.body.username);
  const password = normalizeText(req.body.password);

  if (!name || !account || !password) {
    return res.status(400).json({ success: false, message: '名字、账户和密码不能为空' });
  }
  if (users.some(user => user.account === account)) {
    return res.status(409).json({ success: false, message: '账户已存在' });
  }

  const user = {
    id: nextId(users),
    name,
    account,
    username: account,
    passwordHash: hashPassword(password),
    avatarUrl: '',
    bio: '',
  };
  users.push(user);
  saveUsers();
  res.json({ success: true, user: publicUser(user), token: signToken(user) });
});

app.get('/api/me', requireAuth, (req, res) => {
  const user = findCurrentUser(req);
  if (!user) return res.status(404).json({ success: false, message: '用户不存在' });
  res.json({ success: true, user: publicUser(user) });
});

app.put('/api/me', requireAuth, avatarUpload.single('avatar'), (req, res) => {
  const user = findCurrentUser(req);
  if (!user) return res.status(404).json({ success: false, message: '用户不存在' });

  const name = normalizeText(req.body.name);
  const bio = normalizeText(req.body.bio);

  if (!name) {
    return res.status(400).json({ success: false, message: '名字不能为空' });
  }

  user.name = name;
  user.bio = bio;
  if (req.file) {
    removeUploadedFile(user.avatarUrl);
    user.avatarUrl = `/uploads/${req.file.filename}`;
  }

  albums.forEach(album => {
    if (String(album.creatorId || '') === String(user.id) || album.creatorAccount === user.account) {
      album.creator = user.name;
    }
    album.comments.forEach(comment => {
      if (String(comment.userId || '') === String(user.id) || comment.account === user.account) {
        comment.username = user.name;
      }
    });
  });

  saveUsers();
  saveAlbums();
  res.json({ success: true, user: publicUser(user) });
});

app.post('/api/album', requireAuth, upload.array('files', MAX_ALBUM_FILES), (req, res) => {
  const user = findCurrentUser(req);
  if (!user) return res.status(404).json({ success: false, message: '用户不存在' });

  const title = normalizeText(req.body.title);
  const description = normalizeText(req.body.description);
  const category = normalizeText(req.body.category) || '其他';
  if (!title || !description) {
    return res.status(400).json({ success: false, message: '标题和描述不能为空' });
  }
  if (category === '全部') {
    return res.status(400).json({ success: false, message: '请选择有效分类' });
  }

  const files = (req.files || []).map(file => ({
    id: 0,
    url: `/uploads/${file.filename}`,
    originalname: file.originalname,
    type: getFileType(file.mimetype),
    mimetype: file.mimetype,
    size: file.size,
    sortOrder: 0,
  }));

  if (!files.length) {
    return res.status(400).json({ success: false, message: '请选择文件' });
  }
  if (files.length > MAX_ALBUM_FILES) {
    return res.status(400).json({ success: false, message: `最多只能上传 ${MAX_ALBUM_FILES} 个文件` });
  }

  files.forEach((file, index) => {
    file.id = index + 1;
    file.sortOrder = index;
  });

  const album = {
    id: nextId(albums),
    title,
    description,
    files,
    createdAt: new Date().toISOString(),
    creator: user.name,
    creatorId: user.id,
    creatorAccount: user.account,
    category,
    tags: parseTags(req.body.tags),
    isFavorite: false,
    comments: [],
  };
  albums.push(album);
  saveAlbums();
  res.json({ success: true, album });
});

app.get('/api/album', (_req, res) => {
  res.json({ success: true, albums });
});

app.post('/api/album/:id/favorite', requireAuth, (req, res) => {
  const album = albums.find(item => String(item.id) === String(req.params.id));
  if (!album) return res.status(404).json({ success: false, message: '相册不存在' });
  album.isFavorite = !album.isFavorite;
  saveAlbums();
  res.json({ success: true, album });
});

app.post('/api/album/:id/comment', requireAuth, (req, res) => {
  const user = findCurrentUser(req);
  const album = albums.find(item => String(item.id) === String(req.params.id));
  const content = normalizeText(req.body.content);

  if (!user) return res.status(404).json({ success: false, message: '用户不存在' });
  if (!album) return res.status(404).json({ success: false, message: '相册不存在' });
  if (!content) return res.status(400).json({ success: false, message: '评论内容不能为空' });

  const comment = {
    id: nextId(album.comments || []),
    content,
    username: user.name,
    userId: user.id,
    account: user.account,
    createdAt: new Date().toISOString(),
  };
  album.comments.push(comment);
  saveAlbums();
  res.json({ success: true, comment });
});

app.delete('/api/album/:id/comment/:commentId', requireAuth, (req, res) => {
  const user = findCurrentUser(req);
  const album = albums.find(item => String(item.id) === String(req.params.id));

  if (!user) return res.status(404).json({ success: false, message: '用户不存在' });
  if (!album) return res.status(404).json({ success: false, message: '相册不存在' });

  const commentIndex = album.comments.findIndex(comment => String(comment.id) === String(req.params.commentId));
  if (commentIndex === -1) {
    return res.status(404).json({ success: false, message: '评论不存在' });
  }

  const comment = album.comments[commentIndex];
  const isCommentOwner = String(comment.userId || '') === String(user.id)
    || comment.account === user.account
    || (!comment.userId && !comment.account && comment.username === user.name);

  if (!isCommentOwner && !isAlbumOwner(album, user)) {
    return res.status(403).json({ success: false, message: '没有权限删除此评论' });
  }

  album.comments.splice(commentIndex, 1);
  saveAlbums();
  res.json({ success: true });
});

app.delete('/api/album/:id', requireAuth, (req, res) => {
  const user = findCurrentUser(req);
  const albumIndex = albums.findIndex(item => String(item.id) === String(req.params.id));

  if (!user) return res.status(404).json({ success: false, message: '用户不存在' });
  if (albumIndex === -1) return res.status(404).json({ success: false, message: '相册不存在' });

  const album = albums[albumIndex];
  if (!isAlbumOwner(album, user)) {
    return res.status(403).json({ success: false, message: '只能删除自己发布的相册' });
  }

  album.files.forEach(file => removeUploadedFile(file.url));
  albums.splice(albumIndex, 1);
  saveAlbums();
  res.json({ success: true });
});

app.put('/api/album/:id', requireAuth, upload.array('files', MAX_ALBUM_FILES), (req, res) => {
  const user = findCurrentUser(req);
  const album = albums.find(item => String(item.id) === String(req.params.id));
  const title = normalizeText(req.body.title);
  const description = normalizeText(req.body.description);
  const category = normalizeText(req.body.category);

  if (!user) return res.status(404).json({ success: false, message: '用户不存在' });
  if (!album) return res.status(404).json({ success: false, message: '相册不存在' });
  if (!isAlbumOwner(album, user)) {
    return res.status(403).json({ success: false, message: '只能修改自己发布的相册' });
  }
  if (!title || !description || !category || category === '全部') {
    return res.status(400).json({ success: false, message: '请填写有效的相册信息' });
  }

  let nextAlbumFiles = null;
  if (req.body.mediaOrder) {
    const mediaOrder = parseJsonField(req.body.mediaOrder, []);
    if (!Array.isArray(mediaOrder)) {
      (req.files || []).forEach(file => removeUploadedFile(`/uploads/${file.filename}`));
      return res.status(400).json({ success: false, message: '图片顺序数据无效' });
    }
    if (mediaOrder.length < 1) {
      (req.files || []).forEach(file => removeUploadedFile(`/uploads/${file.filename}`));
      return res.status(400).json({ success: false, message: '至少保留 1 个文件' });
    }
    if (mediaOrder.length > MAX_ALBUM_FILES) {
      (req.files || []).forEach(file => removeUploadedFile(`/uploads/${file.filename}`));
      return res.status(400).json({ success: false, message: `最多只能保留 ${MAX_ALBUM_FILES} 个文件` });
    }

    const currentById = new Map((album.files || []).map(file => [String(file.id), file]));
    const clientIds = Array.isArray(req.body.fileClientIds)
      ? req.body.fileClientIds.map(String)
      : req.body.fileClientIds
        ? [String(req.body.fileClientIds)]
        : [];
    const newFileByClientId = new Map((req.files || []).map((file, index) => [clientIds[index], file]));
    const keptExistingIds = new Set();
    const usedNewClientIds = new Set();
    const nextFiles = [];

    for (let index = 0; index < mediaOrder.length; index += 1) {
      const item = mediaOrder[index];
      if (item && item.source === 'existing') {
        const id = String(item.id || '');
        const existingFile = currentById.get(id);
        if (!existingFile || keptExistingIds.has(id)) {
          (req.files || []).forEach(file => removeUploadedFile(`/uploads/${file.filename}`));
          return res.status(400).json({ success: false, message: '图片数据不属于当前相册' });
        }
        keptExistingIds.add(id);
        nextFiles.push({ ...existingFile, sortOrder: index });
      } else if (item && item.source === 'new') {
        const clientId = String(item.clientId || '');
        const uploadFile = newFileByClientId.get(clientId);
        if (!uploadFile || usedNewClientIds.has(clientId)) {
          (req.files || []).forEach(file => removeUploadedFile(`/uploads/${file.filename}`));
          return res.status(400).json({ success: false, message: '新增文件数据无效' });
        }
        usedNewClientIds.add(clientId);
        nextFiles.push({
          id: nextId([...album.files, ...nextFiles]),
          url: `/uploads/${uploadFile.filename}`,
          originalname: uploadFile.originalname,
          type: getFileType(uploadFile.mimetype),
          mimetype: uploadFile.mimetype,
          size: uploadFile.size,
          sortOrder: index,
        });
      } else {
        (req.files || []).forEach(file => removeUploadedFile(`/uploads/${file.filename}`));
        return res.status(400).json({ success: false, message: '图片顺序数据无效' });
      }
    }
    if (usedNewClientIds.size !== (req.files || []).length) {
      (req.files || []).forEach(file => removeUploadedFile(`/uploads/${file.filename}`));
      return res.status(400).json({ success: false, message: '新增文件数据无效' });
    }

    (album.files || [])
      .filter(file => !keptExistingIds.has(String(file.id)))
      .forEach(file => {
        try {
          removeUploadedFile(file.url);
        } catch (error) {
          console.error('删除本地文件失败:', error);
        }
      });
    nextAlbumFiles = nextFiles;
  }
  album.title = title;
  album.description = description;
  album.category = category;
  album.tags = parseTags(req.body.tags);
  if (nextAlbumFiles) album.files = nextAlbumFiles;
  saveAlbums();
  res.json({ success: true, album });
});

function parseTags(rawTags) {
  if (Array.isArray(rawTags)) return rawTags.map(normalizeText).filter(Boolean);
  try {
    const tags = JSON.parse(rawTags || '[]');
    return Array.isArray(tags) ? tags.map(normalizeText).filter(Boolean) : [];
  } catch {
    return [];
  }
}

app.use((err, _req, res, _next) => {
  console.error('服务器错误:', err);
  res.status(500).json({ success: false, message: err.message || '服务器内部错误' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`后端服务已启动: http://localhost:${PORT}`);
  console.log(`上传目录: ${uploadDir}`);
  if (TOKEN_SECRET === 'couple-album-dev-secret-change-in-production') {
    console.warn('警告: 当前使用默认 TOKEN_SECRET。本机开发可用，生产/公网部署请设置强随机 TOKEN_SECRET。');
  }
});
