CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  account TEXT NOT NULL UNIQUE,
  username TEXT,
  password TEXT,
  password_hash TEXT,
  avatar_url TEXT DEFAULT '',
  bio TEXT DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS albums (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  created_at TEXT NOT NULL,
  creator TEXT NOT NULL,
  creator_id INTEGER,
  creator_account TEXT DEFAULT '',
  category TEXT NOT NULL DEFAULT '其他',
  tags_json TEXT NOT NULL DEFAULT '[]',
  is_favorite INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (creator_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS album_files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  album_id INTEGER NOT NULL,
  url TEXT NOT NULL,
  r2_key TEXT,
  cover_url TEXT DEFAULT '',
  cover_r2_key TEXT,
  originalname TEXT,
  type TEXT,
  mimetype TEXT,
  size INTEGER DEFAULT 0,
  sort_order INTEGER DEFAULT 0,
  FOREIGN KEY (album_id) REFERENCES albums(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS comments (
  id INTEGER PRIMARY KEY,
  album_id INTEGER NOT NULL,
  content TEXT NOT NULL,
  username TEXT NOT NULL,
  user_id INTEGER,
  account TEXT DEFAULT '',
  created_at TEXT NOT NULL,
  FOREIGN KEY (album_id) REFERENCES albums(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_albums_created_at ON albums(created_at);
CREATE INDEX IF NOT EXISTS idx_album_files_album_id ON album_files(album_id);
CREATE INDEX IF NOT EXISTS idx_comments_album_id ON comments(album_id);
