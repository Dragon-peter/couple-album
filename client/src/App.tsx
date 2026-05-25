import React, { useEffect, useMemo, useState } from 'react';
import './App.css';

interface AlbumFile {
  id?: number | string;
  url: string;
  coverUrl?: string;
  isLive?: boolean;
  liveVideoUrl?: string;
  liveType?: string;
  originalname: string;
  type: string;
  mimetype: string;
  size: number;
  sortOrder?: number;
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
type MediaItem = {
  key: string;
  source: 'existing' | 'new';
  id?: number | string;
  clientId?: string;
  file?: File;
  previewUrl: string;
  coverPreviewUrl?: string;
  coverFile?: File;
  isLive?: boolean;
  liveVideoPreviewUrl?: string;
  liveVideoFile?: File;
  liveType?: string;
  originalname: string;
  type: string;
};
type PreviewFile = {
  url: string;
  type: string;
  name: string;
  isLive?: boolean;
  liveVideoUrl?: string;
};

const MAX_ALBUM_FILES = 9;

function resolveApiBaseUrl(): string {
  const envUrl = process.env.REACT_APP_API_URL;
  if (envUrl === 'SAME_ORIGIN') return '';
  if (envUrl) return envUrl.replace(/\/$/, '');
  if (typeof window !== 'undefined') return window.location.origin;
  return 'http://localhost:3001';
}

const API_BASE_URL = resolveApiBaseUrl();
const categories = ['全部', '旅行', '日常', '纪念日', '美食', '其他'];
const mineCategory = '我的发布';

const getFileUrl = (fileUrl?: string) => {
  if (!fileUrl) return '';
  if (fileUrl.startsWith('http')) return fileUrl;
  const baseUrl = (
    API_BASE_URL ||
    (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3001')
  ).replace(/\/$/, '');
  const relativePath = fileUrl.startsWith('/') ? fileUrl : `/${fileUrl}`;
  return `${baseUrl}${relativePath}`;
};

const getDefaultAvatar = (name?: string) => {
  const label = encodeURIComponent((name || '你').slice(0, 1));
  return `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="%23ffb6b9"/><stop offset="1" stop-color="%23ffd6e0"/></linearGradient></defs><rect width="96" height="96" rx="48" fill="url(%23g)"/><text x="48" y="58" text-anchor="middle" font-size="38" font-family="Arial, sans-serif" fill="white">${label}</text></svg>`;
};

function App() {
  const [albums, setAlbums] = useState<Album[]>([]);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [createMediaItems, setCreateMediaItems] = useState<MediaItem[]>([]);
  const [draggedCreateIndex, setDraggedCreateIndex] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('全部');
  const [newTag, setNewTag] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [selectedAlbum, setSelectedAlbum] = useState<Album | null>(null);
  const [commentDrafts, setCommentDrafts] = useState<Record<number, string>>({});
  const [expandedComments, setExpandedComments] = useState<Record<number, boolean>>({});
  const [appMessage, setAppMessage] = useState('');
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
  const [editMediaItems, setEditMediaItems] = useState<MediaItem[]>([]);
  const [draggedEditIndex, setDraggedEditIndex] = useState<number | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createCategory, setCreateCategory] = useState('日常');
  const [isEditProfileModalOpen, setIsEditProfileModalOpen] = useState(false);
  const [editName, setEditName] = useState('');
  const [editBio, setEditBio] = useState('');
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState('');
  const [previewFile, setPreviewFile] = useState<PreviewFile | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);

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

  useEffect(() => {
    if (!previewFile) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeImagePreview();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [previewFile]);

  const fetchAlbums = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/album`);
      const data = await response.json();
      if (data.success) {
        setAlbums(data.albums);
        setAppMessage('');
      } else {
        setAppMessage(data.message || '相册加载失败');
      }
    } catch (error) {
      console.error('获取相册失败:', error);
      setAppMessage('服务器连接失败，请确认后端服务已启动');
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

    if (!account || !password || (loginMode === 'register' && !name)) {
      alert(loginMode === 'login' ? '请填写账户和密码' : '请填写名字、账户和密码');
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/api/${loginMode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(loginMode === 'login' ? { account, password } : { name, account, password }),
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
    if (selectedCategory === mineCategory) setSelectedCategory('全部');
    setIsLoginModalOpen(true);
  };

  const requireLogin = () => {
    if (user && token) return true;
    alert('请先登录');
    setIsLoginModalOpen(true);
    return false;
  };

  const handleAuthFailure = (message?: string) => {
    setUser(null);
    setToken('');
    localStorage.removeItem('user');
    localStorage.removeItem('token');
    setIsLoginModalOpen(true);
    alert(message || '登录已过期，请重新登录');
  };

  const parseApiResponse = async (response: Response) => {
    const data = await response.json();
    if (response.status === 401) {
      handleAuthFailure(data.message);
    }
    return data;
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

  const getFileExtension = (name: string) => name.toLowerCase().split('.').pop() || '';
  const getFileStem = (name: string) => name.replace(/\.[^.]+$/, '').toLowerCase();
  const isImageFile = (file: File) => (
    file.type.startsWith('image/')
    || ['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif'].includes(getFileExtension(file.name))
  );
  const isVideoFile = (file: File) => (
    file.type.startsWith('video/')
    || ['mov', 'mp4', 'm4v', 'webm', 'ogg'].includes(getFileExtension(file.name))
  );

  const getMediaType = (file: File) => (
    isVideoFile(file) ? 'video' : isImageFile(file) ? 'image' : 'document'
  );

  const captureVideoCover = (file: File): Promise<File | null> => new Promise(resolve => {
    if (!file.type.startsWith('video/')) {
      resolve(null);
      return;
    }
    const video = document.createElement('video');
    const url = URL.createObjectURL(file);
    const cleanup = () => URL.revokeObjectURL(url);
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;
    video.src = url;
    video.onloadeddata = () => {
      try {
        video.currentTime = Math.min(0.1, video.duration || 0);
      } catch {
        cleanup();
        resolve(null);
      }
    };
    video.onseeked = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth || 640;
        canvas.height = video.videoHeight || 360;
        const context = canvas.getContext('2d');
        if (!context) {
          cleanup();
          resolve(null);
          return;
        }
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(blob => {
          cleanup();
          if (!blob) {
            resolve(null);
            return;
          }
          resolve(new File([blob], `${file.name.replace(/\.[^.]+$/, '')}-cover.jpg`, { type: 'image/jpeg' }));
        }, 'image/jpeg', 0.82);
      } catch {
        cleanup();
        resolve(null);
      }
    };
    video.onerror = () => {
      cleanup();
      resolve(null);
    };
  });

  const createMediaItemFromFile = async (
    file: File,
    index: number,
    liveVideoFile?: File,
  ): Promise<MediaItem> => {
    const clientId = `${Date.now()}-${index}-${Math.random().toString(36).slice(2)}`;
      const type = getMediaType(file);
      const coverFile = type === 'video' && !liveVideoFile ? await captureVideoCover(file) : null;
      return {
        key: `new-${clientId}`,
        source: 'new',
        clientId,
        file,
        previewUrl: URL.createObjectURL(file),
        coverFile: coverFile || undefined,
        coverPreviewUrl: coverFile ? URL.createObjectURL(coverFile) : '',
        isLive: Boolean(liveVideoFile),
        liveVideoFile,
        liveVideoPreviewUrl: liveVideoFile ? URL.createObjectURL(liveVideoFile) : '',
        liveType: liveVideoFile ? 'apple-live-photo-pair' : '',
        originalname: file.name,
        type,
      };
  };

  const buildNewMediaItems = async (selectedFiles: File[]): Promise<MediaItem[]> => {
    const grouped = new Map<string, { images: File[]; videos: File[]; others: File[] }>();
    selectedFiles.forEach(file => {
      const stem = getFileStem(file.name);
      const group = grouped.get(stem) || { images: [], videos: [], others: [] };
      if (isImageFile(file)) group.images.push(file);
      else if (isVideoFile(file)) group.videos.push(file);
      else group.others.push(file);
      grouped.set(stem, group);
    });

    const orderedFiles: Array<{ file: File; liveVideoFile?: File }> = [];
    grouped.forEach(group => {
      const [firstImage, ...extraImages] = group.images;
      const [firstVideo, ...extraVideos] = group.videos;
      if (firstImage && firstVideo) {
        orderedFiles.push({ file: firstImage, liveVideoFile: firstVideo });
      } else if (firstImage) {
        orderedFiles.push({ file: firstImage });
      } else if (firstVideo) {
        orderedFiles.push({ file: firstVideo });
      }
      extraImages.forEach(file => orderedFiles.push({ file }));
      extraVideos.forEach(file => orderedFiles.push({ file }));
      group.others.forEach(file => orderedFiles.push({ file }));
    });

    return Promise.all(orderedFiles.map((item, index) => createMediaItemFromFile(item.file, index, item.liveVideoFile)));
  };

  const addMediaFiles = async (
    e: React.ChangeEvent<HTMLInputElement>,
    currentCount: number,
    setItems: React.Dispatch<React.SetStateAction<MediaItem[]>>,
  ) => {
    const selectedFiles = Array.from(e.target.files || []);
    if (!selectedFiles.length) return;
    const availableSlots = MAX_ALBUM_FILES - currentCount;
    if (availableSlots <= 0) {
      alert(`最多只能保留 ${MAX_ALBUM_FILES} 个文件`);
      e.target.value = '';
      return;
    }
    const nextItems = await buildNewMediaItems(selectedFiles);
    if (nextItems.length > availableSlots) {
      alert(`最多还能添加 ${availableSlots} 个文件`);
    }
    setItems(current => [...current, ...nextItems.slice(0, availableSlots)]);
    e.target.value = '';
  };

  const moveMediaItem = (
    setItems: React.Dispatch<React.SetStateAction<MediaItem[]>>,
    fromIndex: number,
    toIndex: number,
  ) => {
    setItems(current => {
      if (toIndex < 0 || toIndex >= current.length || fromIndex === toIndex) return current;
      const next = [...current];
      const [item] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, item);
      return next;
    });
  };

  const removeMediaItem = (setItems: React.Dispatch<React.SetStateAction<MediaItem[]>>, index: number) => {
    setItems(current => current.filter((_, itemIndex) => itemIndex !== index));
  };

  const handleMediaCoverChange = (
    e: React.ChangeEvent<HTMLInputElement>,
    setItems: React.Dispatch<React.SetStateAction<MediaItem[]>>,
    index: number,
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      alert('封面只支持图片文件');
      e.target.value = '';
      return;
    }
    setItems(current => current.map((item, itemIndex) => (
      itemIndex === index
        ? { ...item, coverFile: file, coverPreviewUrl: URL.createObjectURL(file) }
        : item
    )));
    e.target.value = '';
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
    if (isUploading) return;
    if (!createMediaItems.length) {
      alert('请选择文件');
      return;
    }
    if (createMediaItems.length > MAX_ALBUM_FILES) {
      alert(`最多只能上传 ${MAX_ALBUM_FILES} 个文件`);
      return;
    }

    const formData = new FormData();
    formData.append('title', title);
    formData.append('description', description);
    formData.append('category', createCategory);
    formData.append('tags', JSON.stringify(tags));
    formData.append('mediaOrder', JSON.stringify(createMediaItems.map(item => ({ source: 'new', clientId: item.clientId }))));
    createMediaItems.forEach(item => {
      if (item.file && item.clientId) {
        formData.append('fileClientIds', item.clientId);
        formData.append('files', item.file);
      }
      if (item.type === 'video' && item.coverFile && item.clientId) {
        formData.append('coverClientIds', item.clientId);
        formData.append('newCovers', item.coverFile);
      }
      if (item.isLive && item.liveVideoFile && item.clientId) {
        formData.append('liveClientIds', item.clientId);
        formData.append('liveVideos', item.liveVideoFile);
      }
    });

    setIsUploading(true);
    setUploadProgress(0);

    try {
      const data = await new Promise<any>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', `${API_BASE_URL}/api/album`);
        xhr.setRequestHeader('Authorization', `Bearer ${token}`);
        xhr.upload.onprogress = event => {
          setUploadProgress(event.lengthComputable ? Math.round((event.loaded / event.total) * 100) : null);
        };
        xhr.onload = () => {
          try {
            const parsed = JSON.parse(xhr.responseText || '{}');
            if (xhr.status === 401) handleAuthFailure(parsed.message);
            resolve(parsed);
          } catch (error) {
            reject(error);
          }
        };
        xhr.onerror = () => reject(new Error('上传失败'));
        xhr.send(formData);
      });
      if (data.success) {
        setTitle('');
        setDescription('');
        setCreateMediaItems([]);
        setTags([]);
        setCreateCategory('日常');
        setShowCreateModal(false);
        setUploadProgress(null);
        fetchAlbums();
      } else {
        alert(data.message || '创建相册失败');
      }
    } catch (error) {
      console.error('创建相册失败:', error);
      alert('创建相册失败，请重试');
    } finally {
      setIsUploading(false);
      setUploadProgress(null);
    }
  };

  const toggleFavorite = async (albumId: number) => {
    if (!requireLogin()) return;
    try {
      const response = await fetch(`${API_BASE_URL}/api/album/${albumId}/favorite`, {
        method: 'POST',
        headers: authHeaders,
      });
      const data = await parseApiResponse(response);
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
      const data = await parseApiResponse(response);
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
      const data = await parseApiResponse(response);
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
      const data = await parseApiResponse(response);
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
    setEditMediaItems((album.files || []).map((file, index) => ({
      key: `existing-${file.id ?? file.url}-${index}`,
      source: 'existing',
      id: file.id,
      previewUrl: getFileUrl(file.url),
      coverPreviewUrl: getFileUrl(file.coverUrl),
      isLive: Boolean(file.isLive || file.liveVideoUrl),
      liveVideoPreviewUrl: getFileUrl(file.liveVideoUrl),
      liveType: file.liveType || '',
      originalname: file.originalname || `媒体 ${index + 1}`,
      type: file.type || (file.mimetype || '').split('/')[0] || 'image',
    })));
  };

  const handleEditFilesChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    await addMediaFiles(e, editMediaItems.length, setEditMediaItems);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAlbum || !requireLogin()) return;
    if (!editMediaItems.length) {
      alert('至少保留 1 个文件');
      return;
    }
    if (editMediaItems.length > MAX_ALBUM_FILES) {
      alert(`最多只能保留 ${MAX_ALBUM_FILES} 个文件`);
      return;
    }

    try {
      const formData = new FormData();
      const newItems = editMediaItems.filter(item => item.source === 'new' && item.file && item.clientId);
      formData.append('title', editTitle);
      formData.append('description', editDescription);
      formData.append('category', editCategory);
      formData.append('tags', JSON.stringify(editTags));
      formData.append('mediaOrder', JSON.stringify(editMediaItems.map(item => (
        item.source === 'existing'
          ? { source: 'existing', id: item.id }
          : { source: 'new', clientId: item.clientId }
      ))));
      newItems.forEach(item => {
        if (item.file && item.clientId) {
          formData.append('fileClientIds', item.clientId);
          formData.append('files', item.file);
        }
      });
      editMediaItems.forEach(item => {
        if (item.type !== 'video' || !item.coverFile) return;
        if (item.source === 'existing' && item.id) {
          formData.append('coverExistingIds', String(item.id));
          formData.append('existingCovers', item.coverFile);
        }
        if (item.source === 'new' && item.clientId) {
          formData.append('coverClientIds', item.clientId);
          formData.append('newCovers', item.coverFile);
        }
      });
      editMediaItems.forEach(item => {
        if (!item.isLive || !item.liveVideoFile) return;
        if (item.source === 'existing' && item.id) {
          formData.append('liveExistingIds', String(item.id));
          formData.append('existingLiveVideos', item.liveVideoFile);
        }
        if (item.source === 'new' && item.clientId) {
          formData.append('liveClientIds', item.clientId);
          formData.append('liveVideos', item.liveVideoFile);
        }
      });

      const response = await fetch(`${API_BASE_URL}/api/album/${editingAlbum.id}`, {
        method: 'PUT',
        headers: authHeaders,
        body: formData,
      });
      const data = await parseApiResponse(response);
      if (data.success) {
        setEditingAlbum(null);
        setEditMediaItems([]);
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

  const openImagePreview = (file: AlbumFile) => {
    setPreviewFile({
      url: getFileUrl(file.url),
      type: file.type || (file.mimetype || '').split('/')[0] || 'image',
      name: file.originalname || 'album-photo',
      isLive: Boolean(file.isLive || file.liveVideoUrl),
      liveVideoUrl: getFileUrl(file.liveVideoUrl),
    });
  };

  const closeImagePreview = () => {
    setPreviewFile(null);
  };

  const renderMediaPreview = (url: string, type: string, name: string, coverUrl = '', liveVideoUrl = '', isLive = false) => {
    if (isLive && liveVideoUrl) {
      return (
        <div className="live-thumb">
          <img src={url} alt={name} />
          <video src={liveVideoUrl} muted loop playsInline preload="metadata" autoPlay />
          <span className="live-badge">LIVE</span>
        </div>
      );
    }
    const displayUrl = type === 'video' && coverUrl ? coverUrl : url;
    if (type === 'video') {
      return (
        <div className="video-thumb">
          {coverUrl ? <img src={displayUrl} alt={name} /> : <video src={displayUrl} muted playsInline />}
          <span className="play-indicator" aria-hidden="true">▶</span>
        </div>
      );
    }
    if (type === 'image') {
      return <img src={displayUrl} alt={name} />;
    }
    return <div className="media-file-placeholder">{name.split('.').pop()?.toUpperCase() || 'FILE'}</div>;
  };

  const renderMediaGrid = (
    items: MediaItem[],
    setItems: React.Dispatch<React.SetStateAction<MediaItem[]>>,
    inputId: string,
    onFilesChange: (e: React.ChangeEvent<HTMLInputElement>) => void,
    draggedIndex: number | null,
    setDraggedIndex: React.Dispatch<React.SetStateAction<number | null>>,
    disabled = false,
  ) => (
    <>
      <div className="edit-media-grid">
        {items.map((item, index) => (
          <div
            key={item.key}
            className={`edit-media-tile${draggedIndex === index ? ' dragging' : ''}`}
            draggable={!disabled}
            onDragStart={() => setDraggedIndex(index)}
            onDragOver={event => {
              event.preventDefault();
              if (disabled || draggedIndex === null || draggedIndex === index) return;
              moveMediaItem(setItems, draggedIndex, index);
              setDraggedIndex(index);
            }}
            onDragEnd={() => setDraggedIndex(null)}
          >
            <div className="edit-media-preview">
              {renderMediaPreview(item.previewUrl, item.type, item.originalname, item.coverPreviewUrl, item.liveVideoPreviewUrl, item.isLive)}
            </div>
            {!disabled && (
              <>
                <button type="button" className="media-remove-btn" onClick={() => removeMediaItem(setItems, index)} aria-label="删除文件">
                  &times;
                </button>
                <div className="media-order-controls">
                  <button type="button" onClick={() => moveMediaItem(setItems, index, index - 1)} disabled={index === 0} aria-label="向前移动">
                    ‹
                  </button>
                  <button type="button" onClick={() => moveMediaItem(setItems, index, index + 1)} disabled={index === items.length - 1} aria-label="向后移动">
                    ›
                  </button>
                </div>
              </>
            )}
            {item.type === 'video' && !disabled && (
              <>
                <label className="media-cover-btn" htmlFor={`${inputId}-cover-${item.key}`}>
                  封面
                </label>
                <input
                  id={`${inputId}-cover-${item.key}`}
                  type="file"
                  accept="image/*"
                  onChange={event => handleMediaCoverChange(event, setItems, index)}
                />
              </>
            )}
          </div>
        ))}
        {items.length < MAX_ALBUM_FILES && !disabled && (
          <label className="edit-media-add" htmlFor={inputId}>
            <span>+</span>
            <small>添加</small>
          </label>
        )}
      </div>
      <input id={inputId} type="file" multiple accept="image/*,video/*,.heic,.heif,.mov,.pdf,.doc,.docx" onChange={onFilesChange} disabled={disabled} />
    </>
  );

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
      const data = await parseApiResponse(response);
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
    const matchesCategory = selectedCategory === '全部'
      || (selectedCategory === mineCategory && isAlbumOwner(album))
      || album.category === selectedCategory;
    const matchesFavorite = !showFavoritesOnly || album.isFavorite;
    return matchesSearch && matchesCategory && matchesFavorite;
  });

  const renderComments = (album: Album, compact = false) => (
    <div className={`comment-section card-comment-section${compact ? ' compact' : ''}`}>
      <h4>评论 ({album.comments.length})</h4>
      {(!compact || expandedComments[album.id]) && (
        <>
          <div className="comment-list">
            {album.comments.length === 0 && <div className="empty-comments">还没有评论</div>}
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
        </>
      )}
      {compact && (
        <button
          className="comment-toggle-btn"
          onClick={() => setExpandedComments(current => ({ ...current, [album.id]: !current[album.id] }))}
        >
          {expandedComments[album.id] ? '收起评论' : album.comments.length ? `查看 ${album.comments.length} 条评论` : '写评论'}
        </button>
      )}
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
          {loginMode === 'register' && (
            <input type="text" value={loginName} onChange={e => setLoginName(e.target.value)} placeholder="名字" />
          )}
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
              <img className="user-avatar" src={getFileUrl(user.avatarUrl) || getDefaultAvatar(user.name)} alt="" />
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
                <button
                  type="button"
                  key={file.url}
                  className="album-photo detail-media-btn"
                  onClick={() => openImagePreview(file)}
                  aria-label={`查看${file.isLive ? 'Live 图' : file.type === 'video' ? '视频' : '图片'} ${file.originalname}`}
                >
                  {renderMediaPreview(getFileUrl(file.url), file.type, file.originalname, getFileUrl(file.coverUrl), getFileUrl(file.liveVideoUrl), Boolean(file.isLive || file.liveVideoUrl))}
                </button>
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
              {[...categories.slice(0, 1), ...(user ? [mineCategory] : []), ...categories.slice(1)].map(category => (
                <button key={category} className={selectedCategory === category ? 'active' : ''} onClick={() => setSelectedCategory(category)}>
                  {category}
                </button>
              ))}
            </div>
            <div className="albums-grid">
              {appMessage && <div className="empty-state">{appMessage}</div>}
              {!appMessage && filteredAlbums.length === 0 && (
                <div className="empty-state">
                  {selectedCategory === mineCategory ? '还没有你发布的相册' : searchTerm || selectedCategory !== '全部' || showFavoritesOnly ? '没有找到符合条件的相册' : '还没有相册，创建一个新回忆吧'}
                </div>
              )}
              {filteredAlbums.map(album => (
                <div key={album.id} className="album-card" style={{ cursor: 'default' }}>
                  <h3 style={{ textAlign: 'center' }}>{album.title}</h3>
                  <div className={`album-photo-matrix matrix-count-${Math.min(album.files.length, 9)}`}>
                    {album.files.slice(0, 9).map(file => (
                      <button
                        type="button"
                        key={file.url}
                        className="album-photo-btn"
                        onClick={() => openImagePreview(file)}
                        aria-label={`查看${file.isLive ? 'Live 图' : file.type === 'video' ? '视频' : '图片'} ${file.originalname}`}
                      >
                        <span className="album-photo matrix">
                          {renderMediaPreview(getFileUrl(file.url), file.type, file.originalname, getFileUrl(file.coverUrl), getFileUrl(file.liveVideoUrl), Boolean(file.isLive || file.liveVideoUrl))}
                        </span>
                      </button>
                    ))}
                  </div>
                  <div className="album-description">{album.description}</div>
                  <div className="album-meta">
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
                  {renderComments(album, true)}
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
                  <input type="text" value={title} onChange={e => setTitle(e.target.value)} placeholder="给这个美好的回忆起个名字吧~" required disabled={isUploading} />
                </div>
                <div className="form-group">
                  <label>相册描述：</label>
                  <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="记录下这个瞬间的故事..." required disabled={isUploading} />
                </div>
                <div className="form-group">
                  <label>分类：</label>
                  <select value={createCategory} onChange={e => setCreateCategory(e.target.value)} required disabled={isUploading}>
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
                      disabled={isUploading}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddTag();
                        }
                      }}
                    />
                    <button type="button" onClick={handleAddTag} disabled={isUploading}>添加</button>
                  </div>
                  <div className="tags-list">
                    {tags.map(tag => (
                      <span key={tag} className="tag">
                        {tag}
                        <button type="button" onClick={() => setTags(tags.filter(item => item !== tag))} disabled={isUploading}>&times;</button>
                      </span>
                    ))}
                  </div>
                </div>
                <div className="form-group">
                  <div className="edit-media-header">
                    <label>相册文件：</label>
                    <span>{createMediaItems.length}/{MAX_ALBUM_FILES}</span>
                  </div>
                  {createMediaItems.some(item => item.isLive) && (
                    <p className="live-pair-hint">已自动配对 {createMediaItems.filter(item => item.isLive).length} 个 Live 图</p>
                  )}
                  {createMediaItems.length === 0 && (
                    <label className={`file-upload-label upload-card${isUploading ? ' disabled' : ''}`} htmlFor="photo-upload">
                      <span className="upload-card-icon">+</span>
                      <span>添加照片/视频</span>
                      <small>最多 {MAX_ALBUM_FILES} 个文件，可拖动排序</small>
                    </label>
                  )}
                  {createMediaItems.length > 0 && renderMediaGrid(
                    createMediaItems,
                    setCreateMediaItems,
                    'photo-upload',
                    event => { void addMediaFiles(event, createMediaItems.length, setCreateMediaItems); },
                    draggedCreateIndex,
                    setDraggedCreateIndex,
                    isUploading,
                  )}
                  {createMediaItems.length === 0 && (
                    <input
                      id="photo-upload"
                      type="file"
                      multiple
                      accept="image/*,video/*,.heic,.heif,.mov,.pdf,.doc,.docx"
                      onChange={event => { void addMediaFiles(event, createMediaItems.length, setCreateMediaItems); }}
                      disabled={isUploading}
                    />
                  )}
                </div>
                {isUploading && (
                  <div className={`upload-progress${uploadProgress === null ? ' indeterminate' : ''}`} role="status" aria-live="polite">
                    <div className="upload-progress-track">
                      <div className="upload-progress-fill" style={{ width: uploadProgress === null ? undefined : `${uploadProgress}%` }} />
                    </div>
                    <span>{uploadProgress === null ? '上传中...' : `上传中 ${uploadProgress}%`}</span>
                  </div>
                )}
                <div className="create-actions">
                  <button type="submit" disabled={isUploading}>{isUploading ? '上传中...' : '创建新回忆'}</button>
                  <button type="button" className="cancel-btn" onClick={() => setShowCreateModal(false)} disabled={isUploading}>取消</button>
                </div>
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
              <div className="form-group">
                <div className="edit-media-header">
                  <label>相册文件：</label>
                  <span>{editMediaItems.length}/{MAX_ALBUM_FILES}</span>
                </div>
                {editMediaItems.some(item => item.isLive) && (
                  <p className="live-pair-hint">已识别 {editMediaItems.filter(item => item.isLive).length} 个 Live 图</p>
                )}
                {renderMediaGrid(
                  editMediaItems,
                  setEditMediaItems,
                  'edit-photo-upload',
                  event => { void handleEditFilesChange(event); },
                  draggedEditIndex,
                  setDraggedEditIndex,
                )}
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
                <img src={avatarPreview || getDefaultAvatar(editName || user?.name)} alt="" />
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

      {previewFile && (
        <div className="modal image-preview-modal" onClick={closeImagePreview}>
          <div className="image-preview-content" onClick={e => e.stopPropagation()}>
            <button className="image-preview-close" type="button" onClick={closeImagePreview} aria-label="关闭图片预览">
              &times;
            </button>
            {previewFile.isLive && previewFile.liveVideoUrl ? (
              <video src={previewFile.liveVideoUrl} className="modal-img modal-video" controls playsInline poster={previewFile.url} />
            ) : previewFile.type === 'video' ? (
              <video src={previewFile.url} className="modal-img modal-video" controls playsInline />
            ) : (
              <img src={previewFile.url} className="modal-img" alt="" />
            )}
            <div className="preview-actions">
              <a className="save-btn" href={previewFile.url} download={previewFile.name || true}>
                {previewFile.type === 'video' ? '保存视频' : '保存图片'}
              </a>
              {previewFile.isLive && previewFile.liveVideoUrl && (
                <a className="save-btn" href={previewFile.liveVideoUrl} download={`${previewFile.name.replace(/\.[^.]+$/, '')}-live.mov`}>
                  保存 Live 视频
                </a>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
