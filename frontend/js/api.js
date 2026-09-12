/**
 * Huddle API Client & Shared Services
 * Provides unified authentication, request handling, error formatting,
 * and workspace/channel management across all frontend pages.
 */

(function (window) {
  // Determine backend base URL
  const isLocalHost3000 =
    window.location.protocol.startsWith('http') &&
    (window.location.host === 'localhost:3000' || window.location.host === '127.0.0.1:3000');

  const API_BASE = isLocalHost3000 ? '' : 'http://localhost:3000';

  const STORAGE_KEYS = {
    TOKEN: 'huddle_token',
    REFRESH_TOKEN: 'huddle_refresh_token',
    USER: 'huddle_user',
    WORKSPACE_ID: 'huddle_active_workspace_id',
    WORKSPACE_NAME: 'huddle_active_workspace_name',
    CHANNEL_ID: 'huddle_active_channel_id',
    CHANNEL_NAME: 'huddle_active_channel_name',
  };

  const ApiClient = {
    BASE_URL: API_BASE,

    // Token & Session Management
    getToken() {
      return localStorage.getItem(STORAGE_KEYS.TOKEN);
    },
    setToken(token) {
      if (token) localStorage.setItem(STORAGE_KEYS.TOKEN, token);
      else localStorage.removeItem(STORAGE_KEYS.TOKEN);
    },
    getRefreshToken() {
      return localStorage.getItem(STORAGE_KEYS.REFRESH_TOKEN);
    },
    setRefreshToken(token) {
      if (token) localStorage.setItem(STORAGE_KEYS.REFRESH_TOKEN, token);
      else localStorage.removeItem(STORAGE_KEYS.REFRESH_TOKEN);
    },
    getUser() {
      try {
        const raw = localStorage.getItem(STORAGE_KEYS.USER);
        return raw ? JSON.parse(raw) : null;
      } catch {
        return null;
      }
    },
    setUser(user) {
      if (user) localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(user));
      else localStorage.removeItem(STORAGE_KEYS.USER);
    },
    getActiveWorkspaceId() {
      return localStorage.getItem(STORAGE_KEYS.WORKSPACE_ID);
    },
    setActiveWorkspaceId(id) {
      if (id) localStorage.setItem(STORAGE_KEYS.WORKSPACE_ID, id);
      else localStorage.removeItem(STORAGE_KEYS.WORKSPACE_ID);
    },
    getActiveWorkspaceName() {
      return localStorage.getItem(STORAGE_KEYS.WORKSPACE_NAME) || "My Workspace";
    },
    setActiveWorkspaceName(name) {
      if (name) localStorage.setItem(STORAGE_KEYS.WORKSPACE_NAME, name);
      else localStorage.removeItem(STORAGE_KEYS.WORKSPACE_NAME);
    },
    getActiveChannelId() {
      return localStorage.getItem(STORAGE_KEYS.CHANNEL_ID);
    },
    setActiveChannelId(id) {
      if (id) localStorage.setItem(STORAGE_KEYS.CHANNEL_ID, id);
      else localStorage.removeItem(STORAGE_KEYS.CHANNEL_ID);
    },
    clearSession() {
      Object.values(STORAGE_KEYS).forEach((k) => localStorage.removeItem(k));
    },
    isAuthenticated() {
      return !!this.getToken();
    },
    requireAuth(redirectUrl = 'signin.html') {
      if (!this.isAuthenticated()) {
        window.location.href = redirectUrl;
        return false;
      }
      return true;
    },
    redirectIfAuthenticated(redirectUrl = 'dashboard.html') {
      if (this.isAuthenticated()) {
        window.location.href = redirectUrl;
        return true;
      }
      return false;
    },

    // Unified fetch request wrapper
    async request(path, options = {}) {
      const url = path.startsWith('http') ? path : `${this.BASE_URL}${path}`;
      const headers = Object.assign({}, options.headers || {});

      const token = this.getToken();
      if (token && !headers['Authorization']) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      if (options.body && typeof options.body === 'object' && !(options.body instanceof FormData)) {
        headers['Content-Type'] = 'application/json';
        options.body = JSON.stringify(options.body);
      }

      options.headers = headers;

      let response;
      try {
        response = await fetch(url, options);
      } catch (err) {
        console.error(`[API Network Error] ${options.method || 'GET'} ${url}`, err);
        throw new Error('Unable to connect to Huddle server. Please check your internet connection or verify the backend is running.');
      }

      // Handle 401 Unauthorized (attempt token refresh if possible)
      if (response.status === 401 && !path.includes('/auth/login') && !path.includes('/auth/refresh') && !path.includes('/auth/signup')) {
        const refreshed = await this.tryRefreshToken();
        if (refreshed) {
          headers['Authorization'] = `Bearer ${this.getToken()}`;
          return this.request(path, Object.assign({}, options, { headers }));
        } else {
          this.clearSession();
          if (!window.location.pathname.endsWith('signin.html') && !window.location.pathname.endsWith('signup.html')) {
            window.location.href = 'signin.html';
          }
          throw new Error('Session expired. Please sign in again.');
        }
      }

      let payload = null;
      const text = await response.text();
      try {
        payload = text ? JSON.parse(text) : null;
      } catch {
        payload = text;
      }

      if (!response.ok) {
        let msg = 'An unexpected error occurred';
        if (payload && typeof payload === 'object') {
          if (Array.isArray(payload.message)) {
            msg = payload.message.join(', ');
          } else if (payload.message) {
            msg = payload.message;
          } else if (payload.error) {
            msg = payload.error;
          }
        } else if (typeof payload === 'string') {
          msg = payload;
        }
        const err = new Error(msg);
        err.status = response.status;
        err.data = payload;
        throw err;
      }

      // Unwrap standard NestJS TransformInterceptor: { success: true, data: ... }
      if (payload && typeof payload === 'object' && 'data' in payload && payload.success === true) {
        return payload.data;
      }

      return payload;
    },

    async tryRefreshToken() {
      const refreshToken = this.getRefreshToken();
      if (!refreshToken) return false;

      try {
        const res = await fetch(`${this.BASE_URL}/api/v1/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken }),
        });
        if (!res.ok) return false;
        const data = await res.json();
        const access = data.accessToken || data.data?.accessToken;
        if (access) {
          this.setToken(access);
          return true;
        }
        return false;
      } catch {
        return false;
      }
    },

    // ------------------------------------------------------------------------
    // Domain Services
    // ------------------------------------------------------------------------

    auth: {
      async signup(fullName, email, password) {
        let data;
        try {
          data = await ApiClient.request('/api/v1/auth/signup', {
            method: 'POST',
            body: { fullName, email, password },
          });
        } catch (err) {
          // Fallback to unversioned route
          data = await ApiClient.request('/auth/signup', {
            method: 'POST',
            body: { fullName, email, password },
          });
        }
        return data;
      },

      async login(email, password) {
        let data;
        try {
          data = await ApiClient.request('/api/v1/auth/login', {
            method: 'POST',
            body: { email, password },
          });
        } catch (err) {
          data = await ApiClient.request('/auth/login', {
            method: 'POST',
            body: { email, password },
          });
        }

        if (data.accessToken) ApiClient.setToken(data.accessToken);
        if (data.refreshToken) ApiClient.setRefreshToken(data.refreshToken);
        if (data.user) ApiClient.setUser(data.user);

        return data;
      },

      async logout() {
        try {
          await ApiClient.request('/api/v1/auth/logout', { method: 'POST' });
        } catch {}
        ApiClient.clearSession();
      },

      async getMe() {
        return ApiClient.request('/api/v1/users/me');
      },
    },

    workspaces: {
      async list() {
        return ApiClient.request('/api/v1/workspaces');
      },

      async create(name, slug) {
        // Derive clean slug if missing
        if (!slug) {
          const base = name
            .toLowerCase()
            .trim()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '')
            .substring(0, 45) || 'workspace';
          const randomSuffix = Math.random().toString(36).substring(2, 6);
          slug = `${base}-${randomSuffix}`.replace(/-+/g, '-').replace(/^-+|-+$/g, '');
        }

        return ApiClient.request('/api/v1/workspaces', {
          method: 'POST',
          body: { name, slug },
        });
      },

      async get(workspaceId) {
        return ApiClient.request(`/api/v1/workspaces/${workspaceId}`);
      },

      async getMembers(workspaceId) {
        return ApiClient.request(`/api/v1/workspaces/${workspaceId}/members`);
      },

      async join(identifier) {
        return ApiClient.request(`/api/v1/workspaces/${encodeURIComponent(identifier)}/join`, {
          method: 'POST',
        });
      },
    },

    channels: {
      async list(workspaceId) {
        return ApiClient.request(`/channels?workspaceId=${encodeURIComponent(workspaceId)}`);
      },

      async create(workspaceId, name, type = 'public') {
        const cleanName = name.replace(/^#/, '').trim();
        return ApiClient.request('/channels', {
          method: 'POST',
          body: {
            workspaceId,
            name: cleanName,
            type: type.toLowerCase(),
          },
        });
      },

      async get(channelId) {
        return ApiClient.request(`/channels/${channelId}`);
      },

      async addMember(channelId, userId) {
        return ApiClient.request(`/channels/${channelId}/members`, {
          method: 'POST',
          body: { userId },
        });
      },

      async addMembers(channelId, userIds) {
        return ApiClient.request(`/channels/${channelId}/members/bulk`, {
          method: 'POST',
          body: { userIds },
        });
      },
    },

    invites: {
      async send(workspaceId, email) {
        return ApiClient.request(`/workspaces/${workspaceId}/invites`, {
          method: 'POST',
          body: { email: email.trim().toLowerCase() },
        });
      },

      async accept(token) {
        return ApiClient.request('/invites/accept', {
          method: 'POST',
          body: { token: token.trim() },
        });
      },
    },

    messages: {
      async list(channelId, limit = 50) {
        return ApiClient.request(`/channels/${channelId}/messages?limit=${limit}`);
      },

      async send(channelId, content, attachmentIds = []) {
        return ApiClient.request(`/channels/${channelId}/messages`, {
          method: 'POST',
          body: { content, attachmentIds },
        });
      },
    },
  };

  // --------------------------------------------------------------------------
  // Global Toast System
  // --------------------------------------------------------------------------
  function showToast(message, type = 'info', duration = 3800) {
    let container = document.getElementById('huddle-toast-shelf');
    if (!container) {
      container = document.createElement('div');
      container.id = 'huddle-toast-shelf';
      container.style.cssText = `
        position: fixed;
        bottom: 24px;
        right: 24px;
        display: flex;
        flex-direction: column;
        gap: 10px;
        z-index: 99999;
        pointer-events: none;
        max-width: 420px;
      `;
      document.body.appendChild(container);
    }

    const t = document.createElement('div');
    t.className = `huddle-toast toast-${type}`;
    t.style.cssText = `
      pointer-events: auto;
      display: flex;
      align-items: center;
      gap: 10px;
      background: #1D2939;
      color: #FFFFFF;
      padding: 12px 18px;
      border-radius: 10px;
      box-shadow: 0 10px 25px -5px rgba(0,0,0,0.25);
      font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
      font-size: 14px;
      font-weight: 500;
      line-height: 1.4;
      opacity: 0;
      transform: translateY(12px);
      transition: opacity 0.25s ease, transform 0.25s ease;
      border-left: 4px solid ${
        type === 'success' ? '#12B76A' : type === 'error' ? '#F04438' : '#FF6A00'
      };
    `;

    const iconSvg =
      type === 'success'
        ? `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#12B76A" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>`
        : type === 'error'
        ? `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#F04438" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>`
        : `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#FF6A00" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`;

    t.innerHTML = `${iconSvg}<span style="flex:1;">${escapeHtml(message)}</span>`;
    container.appendChild(t);

    requestAnimationFrame(() => {
      t.style.opacity = '1';
      t.style.transform = 'translateY(0)';
    });

    setTimeout(() => {
      t.style.opacity = '0';
      t.style.transform = 'translateY(8px)';
      setTimeout(() => t.remove(), 250);
    }, duration);
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  window.HuddleApi = ApiClient;
  window.showHuddleToast = showToast;
})(window);
