import React, { useEffect, useMemo, useState } from 'react';
import './App.css';
import './mobile.css';

interface AlbumFile {
  url: string;
  originalname: string;
  type: string;
  mimetype: string;
  size: number;
}

interface Comment {
  id: number;
  content: string;
  username: string;
  userId?: number | null;
  account?: string;
  createdAt: string;
}

interface Album {
  id: number;
  title: string;
  description: string;
  files: AlbumFile[];
  createdAt: string;
  creator: string;
  creatorId?: number | null;
  creatorAccount?: string;
  tags: string[];
  category: string;
  isFavorite: boolean;
  comments: Comment[];
}

interface User {
  id: number;
  name: string;
  account: string;
  username?: string;
  avatarUrl?: string;
  bio?: string;
}

type LoginMode = 'login' | 'register';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';
const categories = ['全部', '旅行', '日常', '纪念日', '美食', '其他'];

const getFileUrl = (fileUrl?: string) => {
  if (!fileUrl) return '';
  if (fileUrl.startsWith('http')) return fileUrl;
  const baseUrl = API_BASE_URL.endsWith('/') ? API_BASE_URL.slice(0, -1) : API_BASE_URL;
  const relativePath = fileUrl.startsWith('/') ? fileUrl : `/${fileUrl}`;
  return `${baseUrl}${relativePath}`;
};

function App() {
  const [albums, setAlbums] = useState<Album[]>([]);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [files, setFiles] = useState<FileList | null>(null);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('全部');
  const [newTag, setNewTag] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [selectedAlbum, setSelectedAlbum] = useState<Album | null>(null);
  const [commentDrafts, setCommentDrafts] = useState<Record<number, string>>({});
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState('');
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [loginMode, setLoginMode] = useState<LoginMode>('login');
  const [loginName, setLoginName] = useState('');
  const [loginAccount, setLoginAccount] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [editingAlbum, setEditingAlbum] = useState<Album | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const [editTags, setEditTags] = useState<string[]>([]);
  const [editNewTag, setEditNewTag] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createCategory, setCreateCategory] = useState('日常');
  const [isEditProfileModalOpen, setIsEditProfileModalOpen] = useState(false);
  const [editName, setEditName] = useState('');
  const [editBio, setEditBio] = useState('');
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState('');
  const [previewImg, setPreviewImg] = useState<string | null>(null);

  const authHeaders = useMemo(() => ({
    Authorization: `Bearer ${token}`,
  }), [token]);

  useEffect(() => {
    const savedUser = localStorage.getItem('user');
    const savedToken = localStorage.getItem('token');
    if (savedUser && savedToken) {
      setUser(JSON.parse(savedUser));
      setToken(savedToken);
    } else {
      setIsLoginModalOpen(true);
    }
    fetchAlbums();
  }, []);

  useEffect(() => {
    if (!selectedAlbum) return;
    const freshAlbum = albums.find(album => album.id === selectedAlbum.id);
    if (freshAlbum) setSelectedAlbum(freshAlbum);
  }, [albums, selectedAlbum]);

  const fetchAlbums = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/album`);
      const data = await response.json();
      if (data.success) {
        setAlbums(data.albums);
      }
    } catch (error) {
      console.error('获取相册失败:', error);
    }
  };

  const saveSession = (nextUser: User, nextToken: string) => {
    setUser(nextUser);
    setToken(nextToken);
    localStorage.setItem('user', JSON.stringify(nextUser));
    localStorage.setItem('token', nextToken);
    setIsLoginModalOpen(false);
    setLoginName('');
    setLoginAccount('');
    setLoginPassword('');
  };

  const handleAuth = async () => {
    const name = loginName.trim();
    const account = loginAccount.trim();
    const password = loginPassword.trim();

    if (!name || !account || !password) {
      alert('请填写名字、账户和密码');
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/api/${loginMode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, account, password }),
      });
      const data = await response.json();
      if (data.success) {
        saveSession(data.user, data.token);
      } else {
        alert(data.message || '操作失败');
      }
    } catch (error) {
      console.error('登录失败:', error);
      alert('服务器连接失败，请稍后重试');
    }
  };

  const handleLogout = () => {
    setUser(null);
    setToken('');
    localStorage.removeItem('user');
    localStorage.removeItem('token');
    setIsLoginModalOpen(true);
  };

  const requireLogin = () => {
    if (user && token) return true;
    alert('请先登录');
    setIsLoginModalOpen(true);
    return false;
  };

  const isAlbumOwner = (album: Album) => {
    if (!user) return false;
    return String(album.creatorId || '') === String(user.id)
      || (!!album.creatorAccount && album.creatorAccount === user.account)
      || (!album.creatorId && !album.creatorAccount && album.creator === user.name);
  };

  const canDeleteComment = (album: Album, comment: Comment) => {
    if (!user) return false;
    const isCommentOwner = String(comment.userId || '') === String(user.id)
      || comment.account === user.account
      || (!comment.userId && !comment.account && comment.username === user.name);
    return isCommentOwner || isAlbumOwner(album);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = e.target.files;
    if (!selectedFiles) return;
    setFiles(selectedFiles);
    setPreviewUrls(Array.from(selectedFiles).map(file => URL.createObjectURL(file)));
  };

  const handleAddTag = () => {
    const tag = newTag.trim();
    if (tag && !tags.includes(tag)) {
      setTags([...tags, tag]);
      setNewTag('');
    }
  };

  const handleEditAddTag = () => {
    const tag = editNewTag.trim();
    if (tag && !editTags.includes(tag)) {
      setEditTags([...editTags, tag]);
      setEditNewTag('');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!requireLogin()) return;
    if (!files || files.length === 0) {
      alert('请选择文件');
      return;
    }

    const formData = new FormData();
    formData.append('title', title);
    formData.append('description', description);
    formData.append('category', createCategory);
    formData.append('tags', JSON.stringify(tags));
    Array.from(files).forEach(file => formData.append('files', file));

    try {
      const response = await fetch(`${API_BASE_URL}/api/album`, {
        method: 'POST',
        headers: authHeaders,
        body: formData,
      });
      const data = await response.json();
      if (data.success) {
        setTitle('');
        setDescription('');
        setFiles(null);
        setPreviewUrls([]);
        setTags([]);
        setCreateCategory('日常');
        setShowCreateModal(false);
        fetchAlbums();
      } else {
        alert(data.message || '创建相册失败');
      }
    } catch (error) {
      console.error('创建相册失败:', error);
      alert('创建相册失败，请重试');
    }
  };

  const toggleFavorite = async (albumId: number) => {
    if (!requireLogin()) return;
    try {
      const response = await fetch(`${API_BASE_URL}/api/album/${albumId}/favorite`, {
        method: 'POST',
        headers: authHeaders,
      });
      const data = await response.json();
      if (data.success) fetchAlbums();
      else alert(data.message || '更新收藏状态失败');
    } catch (error) {
      console.error('更新收藏状态失败:', error);
    }
  };

  const handleAddComment = async (albumId: number) => {
    if (!requireLogin()) return;
    const content = (commentDrafts[albumId] || '').trim();
    if (!content) {
      alert('请输入评论内容');
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/api/album/${albumId}/comment`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders,
        },
        body: JSON.stringify({ content }),
      });
      const data = await response.json();
      if (data.success) {
        setCommentDrafts(current => ({ ...current, [albumId]: '' }));
        fetchAlbums();
      } else {
        alert(data.message || '添加评论失败');
      }
    } catch (error) {
      console.error('添加评论失败:', error);
      alert('添加评论失败，请重试');
    }
  };

  const handleDeleteComment = async (albumId: number, commentId: number) => {
    if (!requireLogin()) return;
    if (!window.confirm('确定要删除这条评论吗？')) return;

    try {
      const response = await fetch(`${API_BASE_URL}/api/album/${albumId}/comment/${commentId}`, {
        method: 'DELETE',
        headers: authHeaders,
      });
      const data = await response.json();
      if (data.success) fetchAlbums();
      else alert(data.message || '删除评论失败');
    } catch (error) {
      console.error('删除评论失败:', error);
      alert('删除评论失败，请重试');
    }
  };

  const handleDeleteAlbum = async (album: Album) => {
    if (!requireLogin()) return;
    if (!isAlbumOwner(album)) {
      alert('只能删除自己发布的相册');
      return;
    }
    if (!window.confirm('确定要删除这个相册吗？')) return;

    try {
      const response = await fetch(`${API_BASE_URL}/api/album/${album.id}`, {
        method: 'DELETE',
        headers: authHeaders,
      });
      const data = await response.json();
      if (data.success) {
        if (selectedAlbum?.id === album.id) setSelectedAlbum(null);
        fetchAlbums();
      } else {
        alert(data.message || '删除相册失败');
      }
    } catch (error) {
      console.error('删除相册失败:', error);
      alert('删除相册失败，请重试');
    }
  };

  const handleEditAlbum = (album: Album) => {
    if (!isAlbumOwner(album)) {
      alert('只能修改自己发布的相册');
      return;
    }
    setEditingAlbum(album);
    setEditTitle(album.title);
    setEditDescription(album.description);
    setEditCategory(album.category);
    setEditTags(album.tags || []);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAlbum || !requireLogin()) return;

    try {
      const response = await fetch(`${API_BASE_URL}/api/album/${editingAlbum.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders,
        },
        body: JSON.stringify({
          title: editTitle,
          description: editDescription,
          category: editCategory,
          tags: editTags,
        }),
      });
      const data = await response.json();
      if (data.success) {
        setEditingAlbum(null);
        fetchAlbums();
      } else {
        alert(data.message || '修改相册失败');
      }
    } catch (error) {
      console.error('修改相册失败:', error);
      alert('修改相册失败，请重试');
    }
  };

  const handleEditProfile = () => {
    if (!user) return;
    setEditName(user.name);
    setEditBio(user.bio || '');
    setAvatarFile(null);
    setAvatarPreview(getFileUrl(user.avatarUrl));
    setIsEditProfileModalOpen(true);
  };

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  };

  const handleProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!requireLogin()) return;

    const formData = new FormData();
    formData.append('name', editName);
    formData.append('bio', editBio);
    if (avatarFile) formData.append('avatar', avatarFile);

    try {
      const response = await fetch(`${API_BASE_URL}/api/me`, {
        method: 'PUT',
        headers: authHeaders,
        body: formData,
      });
      const data = await response.json();
      if (data.success) {
        setUser(data.user);
        localStorage.setItem('user', JSON.stringify(data.user));
        setIsEditProfileModalOpen(false);
        fetchAlbums();
      } else {
        alert(data.message || '更新失败');
      }
    } catch (error) {
      console.error('更新用户信息失败:', error);
      alert('更新失败，请重试');
    }
  };

  const filteredAlbums = albums.filter(album => {
    const query = searchTerm.toLowerCase();
    const matchesSearch = album.title.toLowerCase().includes(query)
      || album.description.toLowerCase().includes(query)
      || (album.creator || '').toLowerCase().includes(query)
      || (album.tags || []).some(tag => tag.toLowerCase().includes(query));
    const matchesCategory = selectedCategory === '全部' || album.category === selectedCategory;
    const matchesFavorite = !showFavoritesOnly || album.isFavorite;
    return matchesSearch && matchesCategory && matchesFavorite;
  });

  const renderComments = (album: Album) => (
    <div className="comment-section card-comment-section">
      <h4>评论 ({album.comments.length})</h4>
      <div className="comment-list">
        {album.comments.map(comment => (
          <div key={comment.id} className="comment-item">
            <div className="comment-meta">
              <span className="comment-username">{comment.username}</span>
              {canDeleteComment(album, comment) && (
                <button className="comment-delete-btn" onClick={() => handleDeleteComment(album.id, comment.id)}>
                  删除
                </button>
              )}
            </div>
            <div className="comment-content-row">
              <span className="comment-content">{comment.content}</span>
              <span className="comment-time">
                {new Date(comment.createdAt).toLocaleString('zh-CN', {
                  year: '2-digit',
                  month: '2-digit',
                  day: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            </div>
          </div>
        ))}
      </div>
      <div className="comment-input-row">
        <textarea
          value={commentDrafts[album.id] || ''}
          onChange={e => setCommentDrafts(current => ({ ...current, [album.id]: e.target.value }))}
          placeholder="写下你的评论..."
          className="comment-input"
        />
        <button className="button comment-btn" onClick={() => handleAddComment(album.id)}>
          发表
        </button>
      </div>
    </div>
  );

  if (isLoginModalOpen) {
    return (
      <div className="login-modal">
        <div className="login-content">
          <h2>欢迎来到我们的照片墙</h2>
          <div className="auth-tabs">
            <button className={loginMode === 'login' ? 'active' : ''} onClick={() => setLoginMode('login')}>
              登录
            </button>
            <button className={loginMode === 'register' ? 'active' : ''} onClick={() => setLoginMode('register')}>
              注册
            </button>
          </div>
          <input type="text" value={loginName} onChange={e => setLoginName(e.target.value)} placeholder="名字" />
          <input type="text" value={loginAccount} onChange={e => setLoginAccount(e.target.value)} placeholder="账户" />
          <input
            type="password"
            value={loginPassword}
            onChange={e => setLoginPassword(e.target.value)}
            placeholder="密码"
            onKeyDown={e => e.key === 'Enter' && handleAuth()}
          />
          <button onClick={handleAuth}>{loginMode === 'login' ? '登录' : '创建账户'}</button>
        </div>
      </div>
    );
  }

  return (
    <div className="App">
      <div className="heart-decor">♥</div>
      <header className={`App-header${showCreateModal ? ' hide-header' : ''}`}>
        <div className="header-content">
          <h1>我们的照片墙</h1>
          {user && (
            <div className="user-info">
              <img className="user-avatar" src={getFileUrl(user.avatarUrl) || undefined} alt="" />
              <div className="user-summary">
                <span>{user.name}</span>
                <small>{user.account}</small>
              </div>
              <button onClick={handleEditProfile} className="edit-profile-btn">编辑资料</button>
              <button onClick={handleLogout} className="logout-btn">退出</button>
            </div>
          )}
        </div>
        <div className="search-bar">
          <input type="text" placeholder="搜索相册..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
          <button className="search-btn">搜索</button>
          <button className="create-memory-btn" onClick={() => setShowCreateModal(true)}>
            + 创建新回忆
          </button>
        </div>
      </header>

      <main className="App-main">
        {selectedAlbum ? (
          <div className="album-detail">
            <button className="button" onClick={() => setSelectedAlbum(null)}>返回</button>
            <h2 style={{ textAlign: 'center' }}>{selectedAlbum.title}</h2>
            <p className="album-detail-meta">
              {selectedAlbum.creator} · {new Date(selectedAlbum.createdAt).toLocaleString('zh-CN')}
            </p>
            <div className={`album-photos${selectedAlbum.files.length === 1 ? ' single' : ''}`}>
              {selectedAlbum.files.map(file => (
                <img
                  key={file.url}
                  src={getFileUrl(file.url)}
                  alt={file.originalname}
                  className="album-photo"
                  onClick={() => setPreviewImg(getFileUrl(file.url))}
                />
              ))}
            </div>
            {renderComments(selectedAlbum)}
          </div>
        ) : (
          <section className="albums-section">
            <div className="albums-title-bar">
              <h2>我们的相册</h2>
              <button className={`favorite-filter styled-favorite-btn ${showFavoritesOnly ? 'active' : ''}`} onClick={() => setShowFavoritesOnly(!showFavoritesOnly)}>
                {showFavoritesOnly ? '显示全部' : '只看收藏'}
              </button>
            </div>
            <div className="category-filter">
              {categories.map(category => (
                <button key={category} className={selectedCategory === category ? 'active' : ''} onClick={() => setSelectedCategory(category)}>
                  {category}
                </button>
              ))}
            </div>
            <div className="albums-grid">
              {filteredAlbums.map(album => (
                <div key={album.id} className="album-card" style={{ cursor: 'default' }}>
                  <h3 style={{ textAlign: 'center' }}>{album.title}</h3>
                  <div className={`album-photo-matrix matrix-count-${Math.min(album.files.length, 9)}`}>
                    {album.files.slice(0, 9).map(file => (
                      <img key={file.url} src={getFileUrl(file.url)} alt={file.originalname} className="album-photo matrix" />
                    ))}
                  </div>
                  <div style={{ textAlign: 'center', marginTop: 8, color: '#888' }}>{album.description}</div>
                  <div style={{ textAlign: 'center', fontSize: '12px', color: '#666', marginTop: 4 }}>
                    创建者: {album.creator} · 创建于 {new Date(album.createdAt).toLocaleString('zh-CN', {
                      year: 'numeric',
                      month: '2-digit',
                      day: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </div>
                  <button className={`favorite-btn${album.isFavorite ? ' active' : ''}`} onClick={() => toggleFavorite(album.id)} title={album.isFavorite ? '取消收藏' : '收藏'}>
                    {album.isFavorite ? '★' : '☆'}
                  </button>
                  <div className="card-action-btn-group">
                    <button className="card-action-btn" onClick={() => setSelectedAlbum(album)}>详情</button>
                    {isAlbumOwner(album) && (
                      <>
                        <button className="card-action-btn" onClick={() => handleEditAlbum(album)}>修改</button>
                        <button className="card-action-btn danger" onClick={() => handleDeleteAlbum(album)}>删除</button>
                      </>
                    )}
                  </div>
                  {renderComments(album)}
                </div>
              ))}
            </div>
          </section>
        )}

        {showCreateModal && (
          <div className="create-modal">
            <div className="create-content">
              <h2>创建新回忆</h2>
              <form onSubmit={handleSubmit}>
                <div className="form-group">
                  <label>相册标题：</label>
                  <input type="text" value={title} onChange={e => setTitle(e.target.value)} placeholder="给这个美好的回忆起个名字吧~" required />
                </div>
                <div className="form-group">
                  <label>相册描述：</label>
                  <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="记录下这个瞬间的故事..." required />
                </div>
                <div className="form-group">
                  <label>分类：</label>
                  <select value={createCategory} onChange={e => setCreateCategory(e.target.value)} required>
                    {categories.filter(c => c !== '全部').map(category => (
                      <option key={category} value={category}>{category}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>标签：</label>
                  <div className="tags-input">
                    <input
                      type="text"
                      value={newTag}
                      onChange={e => setNewTag(e.target.value)}
                      placeholder="添加标签..."
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddTag();
                        }
                      }}
                    />
                    <button type="button" onClick={handleAddTag}>添加</button>
                  </div>
                  <div className="tags-list">
                    {tags.map(tag => (
                      <span key={tag} className="tag">
                        {tag}
                        <button type="button" onClick={() => setTags(tags.filter(item => item !== tag))}>&times;</button>
                      </span>
                    ))}
                  </div>
                </div>
                <div className="form-group">
                  <label className="file-upload-label" htmlFor="photo-upload">选择文件</label>
                  <input id="photo-upload" type="file" multiple accept="image/*,video/*,.pdf,.doc,.docx" onChange={handleFileChange} required />
                  {previewUrls.length > 0 && (
                    <div className="preview-photos">
                      {previewUrls.map((url, index) => <img key={url} src={url} alt={`预览 ${index + 1}`} />)}
                    </div>
                  )}
                </div>
                <button type="submit">创建新回忆</button>
                <button type="button" className="cancel-btn" onClick={() => setShowCreateModal(false)}>取消</button>
              </form>
            </div>
          </div>
        )}
      </main>

      {editingAlbum && (
        <div className="edit-modal">
          <div className="edit-content">
            <h2>编辑相册</h2>
            <form onSubmit={handleEditSubmit}>
              <div className="form-group">
                <label>相册标题：</label>
                <input type="text" value={editTitle} onChange={e => setEditTitle(e.target.value)} required />
              </div>
              <div className="form-group">
                <label>相册描述：</label>
                <textarea value={editDescription} onChange={e => setEditDescription(e.target.value)} required />
              </div>
              <div className="form-group">
                <label>分类：</label>
                <select value={editCategory} onChange={e => setEditCategory(e.target.value)} required>
                  {categories.filter(c => c !== '全部').map(category => <option key={category} value={category}>{category}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>标签：</label>
                <div className="tags-input">
                  <input
                    type="text"
                    value={editNewTag}
                    onChange={e => setEditNewTag(e.target.value)}
                    placeholder="添加标签..."
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleEditAddTag();
                      }
                    }}
                  />
                  <button type="button" onClick={handleEditAddTag}>添加</button>
                </div>
                <div className="tags-list">
                  {editTags.map(tag => (
                    <span key={tag} className="tag">
                      {tag}
                      <button type="button" onClick={() => setEditTags(editTags.filter(item => item !== tag))}>&times;</button>
                    </span>
                  ))}
                </div>
              </div>
              <div className="edit-actions">
                <button type="submit">保存修改</button>
                <button type="button" onClick={() => setEditingAlbum(null)}>取消</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isEditProfileModalOpen && (
        <div className="modal">
          <div className="modal-content profile-modal">
            <h2>编辑个人信息</h2>
            <form onSubmit={handleProfileSubmit}>
              <div className="profile-avatar-edit">
                <img src={avatarPreview} alt="" />
                <label className="file-upload-label" htmlFor="avatar-upload">更换头像</label>
                <input id="avatar-upload" type="file" accept="image/*" onChange={handleAvatarChange} />
              </div>
              <input type="text" value={editName} onChange={e => setEditName(e.target.value)} placeholder="名字" required />
              <textarea value={editBio} onChange={e => setEditBio(e.target.value)} placeholder="个人简介" />
              <div className="modal-buttons">
                <button type="submit">保存</button>
                <button type="button" onClick={() => setIsEditProfileModalOpen(false)}>取消</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {previewImg && (
        <div className="modal" onClick={() => setPreviewImg(null)}>
          <img src={previewImg} className="modal-img" alt="" />
          <a className="save-btn" href={previewImg} download onClick={e => e.stopPropagation()}>保存图片</a>
        </div>
      )}
    </div>
  );
}

export default App;
