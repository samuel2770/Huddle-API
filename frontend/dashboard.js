/**
 * Huddle Workspace Dashboard - Interactive Logic & Full Backend Integration
 * Features:
 * - Real-Time WebSockets (Socket.io /chat namespace) with instant message delivery
 * - Live Typing Indicators ("X is typing...")
 * - Online Presence Tracking (Green dots on avatars & DM lists)
 * - Message Emoji Reactions (Quick bar & interactive chips)
 * - Message Editing & Soft Deletion
 * - Direct Messages (DMs) conversation flow & teammate picker modal
 * - Workspace Search (Real-time debounced query across channels & messages)
 * - Shimmer Skeleton Loading States
 * - Date Dividers & Consecutive Message Grouping
 * - Workspace Switcher, Join/Create Modals, Profile Edit, and Member Invites
 */

document.addEventListener('DOMContentLoaded', async () => {
  // 1. Auth Guard - verify session and silent refresh before rendering
  if (window.HuddleApi && !(await window.HuddleApi.ensureAuthenticated('signin.html'))) {
    return;
  }

  // Immediately display stored user info to prevent dummy placeholder flash
  const cachedUser = window.HuddleApi?.getUser();
  if (cachedUser) {
    updateUserUI(cachedUser);
  }

  // Define robust global toast notification helper
  window.showHuddleToast = function (message, type = 'info') {
    let container = document.querySelector('.toast-container');
    if (!container) {
      container = document.createElement('div');
      container.className = 'toast-container';
      container.style.cssText = 'position:fixed;bottom:24px;right:24px;z-index:999999;display:flex;flex-direction:column;gap:8px;pointer-events:none;';
      document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    const bgColor = type === 'success' ? '#079455' : type === 'error' ? '#D92D20' : '#101828';
    toast.style.cssText = `
      background: ${bgColor};
      color: #ffffff;
      padding: 12px 18px;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(16, 24, 40, 0.15);
      font-size: 14px;
      font-weight: 500;
      pointer-events: auto;
      display: flex;
      align-items: center;
      gap: 10px;
      transition: opacity 0.3s ease, transform 0.3s ease;
    `;
    toast.innerHTML = `<span>${escapeHtml(message)}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  };

  // Hoisted references
  let workspaceSyncInterval = null;
  let socket = null;
  let activeChannel = null;
  let userWorkspaces = [];
  let onlineUsersSet = new Set();
  let typingUsersMap = new Map(); // userId -> timer
  let isTypingSelf = false;
  let typingSelfTimeout = null;

  // DOM Elements - Sidebar & Switcher
  const switcherTrigger = document.getElementById('workspace-switcher-trigger');
  const workspacePopover = document.getElementById('workspace-popover');
  const joinWorkspaceTrigger = document.getElementById('join-workspace-btn');
  const createWorkspaceTrigger = document.getElementById('create-workspace-btn');
  const createChannelBtn = document.getElementById('create-channel-btn');
  const sidebarLogoutBtn = document.getElementById('sidebar-logout-btn');
  const searchInput = document.getElementById('sidebar-search-input');

  // Mobile Drawer Elements
  const mobileMenuBtn = document.getElementById('mobile-menu-btn');
  const drawerCloseBtn = document.getElementById('drawer-close-btn');
  const drawerBackdrop = document.getElementById('drawer-backdrop');
  const sidebar = document.getElementById('dashboard-sidebar');

  // Join a Workspace Modal Elements
  const joinModalOverlay = document.getElementById('join-workspace-modal');
  const joinModalBackdrop = document.getElementById('join-modal-backdrop');
  const joinModalCancelBtn = document.getElementById('join-modal-cancel-btn');
  const joinModalSubmitBtn = document.getElementById('join-modal-submit-btn');
  const workspaceIdInput = document.getElementById('workspace-id-input');
  const modalInputWrapper = document.getElementById('modal-input-wrapper');
  const joinWorkspaceForm = document.getElementById('join-workspace-form');

  // Create a Workspace Modal Elements
  const createModalOverlay = document.getElementById('create-workspace-modal');
  const createModalBackdrop = document.getElementById('create-modal-backdrop');
  const createModalCancelBtn = document.getElementById('create-modal-cancel-btn');
  const createModalSubmitBtn = document.getElementById('create-modal-submit-btn');
  const workspaceNameInput = document.getElementById('workspace-name-input');
  const createInputWrapper = document.getElementById('create-input-wrapper');
  const createWorkspaceForm = document.getElementById('create-workspace-form');

  // General Action Dialog Elements
  const actionDialog = document.getElementById('action-dialog');
  const dialogTitle = document.getElementById('action-dialog-title');
  const dialogMessage = document.getElementById('action-dialog-message');
  const dialogCloseBtn = document.getElementById('action-dialog-close-btn');

  // Sidebar Channels & DMs Elements
  const sidebarSectionsWrapper = document.getElementById('sidebar-sections-wrapper');
  const sidebarChannelsList = document.getElementById('sidebar-channels-list');
  const sidebarDmsList = document.getElementById('sidebar-dms-list');
  const sidebarAddDmBtn = document.getElementById('sidebar-add-dm-btn');

  // User Profile Modal Elements
  const userProfileBtn = document.getElementById('sidebar-user-profile-btn');
  const userProfileModal = document.getElementById('user-profile-modal');
  const profileModalBackdrop = document.getElementById('profile-modal-backdrop');
  const profileModalCloseBtn = document.getElementById('profile-modal-close-btn');
  const profileModalCancelBtn = document.getElementById('profile-modal-cancel-btn');
  const profileModalSubmitBtn = document.getElementById('profile-modal-submit-btn');
  const profileFullNameInput = document.getElementById('profile-fullname-input');
  const profileUsernameInput = document.getElementById('profile-username-input');
  const profileEmailInput = document.getElementById('profile-email-input');
  const profileAvatarInput = document.getElementById('profile-avatar-input');
  const profileAvatarImg = document.getElementById('profile-avatar-img');
  const profileAvatarInitials = document.getElementById('profile-avatar-initials');
  const profileEditForm = document.getElementById('profile-edit-form');

  // Channel Add Member Modal Elements
  const channelAddMemberModal = document.getElementById('channel-add-member-modal');
  const channelAddMemberBackdrop = document.getElementById('channel-add-member-backdrop');
  const channelAddMemberCloseBtn = document.getElementById('channel-add-member-close-btn');
  const channelAddMemberCancelBtn = document.getElementById('channel-add-member-cancel-btn');
  const channelAddMemberSubmitBtn = document.getElementById('channel-add-member-submit-btn');
  const channelMemberSearchInput = document.getElementById('channel-member-search-input');
  const channelAddMemberForm = document.getElementById('channel-add-member-form');
  const addMemberLiveResults = document.getElementById('add-member-live-results');
  const addMemberModalSubheading = document.getElementById('add-member-modal-subheading');

  // --- Real-Time Socket.io Connection ---
  function initWebSocket() {
    if (typeof io === 'undefined') {
      console.warn('[Huddle] Socket.io client not found. Falling back.');
      return;
    }

    const token = window.HuddleApi.getToken();
    if (!token) return;

    if (socket) {
      socket.disconnect();
    }

    socket = io('/chat', {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 10,
    });

    socket.on('connect', () => {
      console.log('[Huddle] WebSocket connected to /chat namespace');
      if (activeChannel) {
        socket.emit('channel:join', { channelId: activeChannel.id });
      }
    });

    socket.on('connected', (data) => {
      if (data && Array.isArray(data.onlineUserIds)) {
        onlineUsersSet = new Set(data.onlineUserIds);
        updateAllPresenceDots();
      }
    });

    socket.on('user:online', ({ userId }) => {
      if (userId) {
        onlineUsersSet.add(userId);
        updateAllPresenceDots();
      }
    });

    socket.on('user:offline', ({ userId }) => {
      if (userId) {
        onlineUsersSet.delete(userId);
        updateAllPresenceDots();
      }
    });

    socket.on('message:new', (payload) => {
      const msg = payload?.message || payload;
      const cId = payload?.channelId || payload?.channel_id || msg?.channelId || msg?.channel_id;
      if (activeChannel && activeChannel.id === cId) {
        handleIncomingMessage(msg);
      } else if (cId) {
        incrementChannelBadge(cId);
      }
    });

    socket.on('message:updated', ({ message, channelId }) => {
      if (activeChannel && activeChannel.id === channelId) {
        handleMessageUpdated(message);
      }
    });

    socket.on('message:deleted', ({ messageId, channelId }) => {
      if (activeChannel && activeChannel.id === channelId) {
        handleMessageDeleted(messageId);
      }
    });

    socket.on('message:reaction', ({ messageId, reactions, channelId }) => {
      if (activeChannel && activeChannel.id === channelId) {
        handleReactionsUpdated(messageId, reactions);
      }
    });

    socket.on('typing:start', ({ userId, channelId }) => {
      if (activeChannel && activeChannel.id === channelId) {
        showTypingIndicator(userId);
      }
    });

    socket.on('typing:stop', ({ userId, channelId }) => {
      if (activeChannel && activeChannel.id === channelId) {
        hideTypingIndicator(userId);
      }
    });

    socket.on('channel:invited', async ({ channel }) => {
      console.log('[Huddle] Invited to channel:', channel?.name);
      window.showHuddleToast(`You were added to #${channel?.name || 'a channel'}`, 'success');
      try {
        const wsId = window.HuddleApi.getActiveWorkspaceId();
        if (wsId && typeof loadWorkspaceChannels === 'function') {
          await loadWorkspaceChannels(wsId);
        }
        // Auto-navigate to the newly invited channel
        if (channel && channel.id) {
          window.HuddleApi.setActiveChannelId(channel.id);
          document.querySelectorAll('.sidebar-channel-item').forEach((el) => el.classList.remove('active'));
          const newItem = document.querySelector(`[data-channel-id="${channel.id}"]`);
          if (newItem) newItem.classList.add('active');
          renderChannelMainView(channel);
        }
      } catch (err) {
        console.error('Error refreshing on channel:invited:', err);
      }
    });

    socket.on('channel:member_joined', async (payload) => {
      const cId = payload?.channelId || payload?.channel_id;
      if (activeChannel && activeChannel.id === cId) {
        if (payload?.notificationText) {
          window.showHuddleToast(payload.notificationText, 'info');
        }
        // Refresh channel members count pill in channel header
        const textEl = document.getElementById('channel-members-count-text');
        if (textEl && window.HuddleApi?.channels?.getMembers) {
          try {
            const members = await window.HuddleApi.channels.getMembers(activeChannel.id);
            if (Array.isArray(members)) {
              currentChannelMembers = members;
              textEl.textContent = `${members.length} Member${members.length === 1 ? '' : 's'}`;
              updateAllPresenceDots();
            }
          } catch {}
        }
      }
    });

    window.huddleSocket = socket;
  }

  function updateAllPresenceDots() {
    document.querySelectorAll('[data-user-id]').forEach((el) => {
      const uId = el.dataset.userId;
      const isOnline = onlineUsersSet.has(uId);
      const dot = el.querySelector('.presence-dot');
      if (dot) {
        if (isOnline) {
          dot.classList.add('online');
          dot.classList.remove('offline');
        } else {
          dot.classList.remove('online');
          dot.classList.add('offline');
        }
      }
    });

    // Update active DM header presence status
    const dmHeaderStatusText = document.getElementById('dm-header-status-text');
    const dmHeaderStatusDot = document.querySelector('.dm-header-status-row .presence-dot');
    const dmHeaderPresenceDot = document.getElementById('dm-header-presence-dot');
    if (activeChannel && activeChannel.type === 'dm' && dmHeaderStatusText) {
      const currentUser = window.HuddleApi.getUser();
      const otherMember = (activeChannel.members || []).find((m) => m.user_id !== currentUser?.id) || activeChannel.members?.[0];
      const teammateId = otherMember?.user?.id || otherMember?.user_id;
      const isOnline = teammateId && onlineUsersSet.has(teammateId);
      dmHeaderStatusText.textContent = isOnline ? 'Active now' : 'Offline';
      if (dmHeaderStatusDot) {
        dmHeaderStatusDot.className = `presence-dot ${isOnline ? 'online' : 'offline'}`;
      }
      if (dmHeaderPresenceDot) {
        dmHeaderPresenceDot.className = `presence-dot ${isOnline ? 'online' : 'offline'}`;
      }
    }

    // Update active channel header online count
    const countEl = document.getElementById('channel-online-count-badge');
    if (countEl && currentChannelMembers) {
      const onlineCount = currentChannelMembers.filter((m) =>
        onlineUsersSet.has(m.userId || m.user_id || m.id),
      ).length;
      countEl.textContent = `${onlineCount} online`;
    }
  }

  function incrementChannelBadge(channelId) {
    const item = document.querySelector(`[data-channel-id="${channelId}"]`);
    if (item) {
      item.classList.add('has-unread');
      let badge = item.querySelector('.channel-unread-badge');
      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'channel-unread-badge';
        badge.textContent = '1';
        item.querySelector('.sidebar-channel-link')?.appendChild(badge);
      } else {
        const cur = parseInt(badge.textContent || '0', 10);
        badge.textContent = String(cur + 1);
      }
    }
  }

  function clearChannelBadge(channelId) {
    const item = document.querySelector(`[data-channel-id="${channelId}"]`);
    if (item) {
      item.classList.remove('has-unread');
      const badge = item.querySelector('.channel-unread-badge');
      if (badge) badge.remove();
    }
  }

  // --- Workspace Popover Logic ---
  function togglePopover(forceState) {
    if (!workspacePopover || !switcherTrigger) return;
    const shouldOpen =
      typeof forceState === 'boolean'
        ? forceState
        : !workspacePopover.classList.contains('open');

    if (shouldOpen) {
      workspacePopover.classList.add('open');
      workspacePopover.setAttribute('aria-hidden', 'false');
      switcherTrigger.classList.add('active');
      switcherTrigger.setAttribute('aria-expanded', 'true');
      refreshWorkspacesList();
    } else {
      workspacePopover.classList.remove('open');
      workspacePopover.setAttribute('aria-hidden', 'true');
      switcherTrigger.classList.remove('active');
      switcherTrigger.setAttribute('aria-expanded', 'false');
    }
  }

  async function refreshWorkspacesList() {
    try {
      if (!window.HuddleApi || !window.HuddleApi.workspaces) return;
      const workspaces = await window.HuddleApi.workspaces.list();
      if (Array.isArray(workspaces)) {
        userWorkspaces = workspaces;
        const currentWsId = window.HuddleApi.getActiveWorkspaceId();
        const activeWs = userWorkspaces.find((w) => w.id === currentWsId) || userWorkspaces[0];
        if (activeWs) {
          renderWorkspaceUI(activeWs, userWorkspaces);
        }
      }
    } catch (err) {
      console.warn('[Huddle] Failed to refresh workspaces list:', err);
    }
  }

  if (switcherTrigger) {
    switcherTrigger.style.cursor = 'pointer';
    const chevron = switcherTrigger.querySelector('.switcher-chevron');
    if (chevron) chevron.style.display = '';
    switcherTrigger.addEventListener('click', (e) => {
      e.stopPropagation();
      togglePopover();
    });
  }

  if (workspacePopover) {
    workspacePopover.addEventListener('click', (e) => {
      e.stopPropagation();
    });
  }

  document.addEventListener('click', (e) => {
    if (switcherTrigger && workspacePopover) {
      if (!switcherTrigger.contains(e.target) && !workspacePopover.contains(e.target)) {
        togglePopover(false);
      }
    }
  });

  // ========================================================================
  // Join a Workspace Modal Logic
  // ========================================================================
  let isJoinModalClosing = false;

  function openJoinModal() {
    togglePopover(false);
    closeMobileDrawer();
    if (createModalOverlay && createModalOverlay.classList.contains('open')) {
      closeCreateModal(true);
    }

    isJoinModalClosing = false;
    joinModalOverlay.classList.remove('closing');
    joinModalOverlay.classList.add('open');
    joinModalOverlay.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';

    setTimeout(() => {
      if (workspaceIdInput) {
        workspaceIdInput.focus();
      }
    }, 60);
  }

  function closeJoinModal(immediate = false) {
    if (isJoinModalClosing || !joinModalOverlay || !joinModalOverlay.classList.contains('open')) return;

    if (immediate) {
      joinModalOverlay.classList.remove('open', 'closing');
      joinModalOverlay.setAttribute('aria-hidden', 'true');
      document.body.style.overflow = '';
      if (workspaceIdInput) workspaceIdInput.value = '';
      if (modalInputWrapper) modalInputWrapper.classList.remove('focused');
      validateWorkspaceId();
      return;
    }

    isJoinModalClosing = true;
    joinModalOverlay.classList.add('closing');

    setTimeout(() => {
      joinModalOverlay.classList.remove('open', 'closing');
      joinModalOverlay.setAttribute('aria-hidden', 'true');
      document.body.style.overflow = '';
      isJoinModalClosing = false;

      if (workspaceIdInput) workspaceIdInput.value = '';
      if (modalInputWrapper) modalInputWrapper.classList.remove('focused');
      validateWorkspaceId();
    }, 180);
  }

  function validateWorkspaceId() {
    if (!workspaceIdInput || !joinModalSubmitBtn) return;
    const val = workspaceIdInput.value.trim();
    const hasValue = val.length > 0;

    if (hasValue) {
      joinModalSubmitBtn.disabled = false;
      joinModalSubmitBtn.classList.add('active');
    } else {
      joinModalSubmitBtn.disabled = true;
      joinModalSubmitBtn.classList.remove('active');
    }
  }

  if (workspaceIdInput && modalInputWrapper) {
    workspaceIdInput.addEventListener('focus', () => {
      modalInputWrapper.classList.add('focused');
    });

    workspaceIdInput.addEventListener('blur', () => {
      modalInputWrapper.classList.remove('focused');
      validateWorkspaceId();
    });

    workspaceIdInput.addEventListener('input', () => {
      validateWorkspaceId();
    });
  }

  if (joinWorkspaceTrigger) {
    joinWorkspaceTrigger.addEventListener('click', (e) => {
      e.stopPropagation();
      openJoinModal();
    });
  }

  if (joinModalCancelBtn) {
    joinModalCancelBtn.addEventListener('click', (e) => {
      e.preventDefault();
      closeJoinModal();
    });
  }

  if (joinModalBackdrop) {
    joinModalBackdrop.addEventListener('click', (e) => {
      e.preventDefault();
      closeJoinModal();
    });
  }

  if (joinWorkspaceForm) {
    joinWorkspaceForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!joinModalSubmitBtn || joinModalSubmitBtn.disabled) return;

      const enteredId = workspaceIdInput.value.trim();
      joinModalSubmitBtn.textContent = 'Joining...';
      joinModalSubmitBtn.disabled = true;
      joinModalSubmitBtn.classList.remove('active');

      try {
        const ws = await window.HuddleApi.workspaces.join(enteredId);
        window.HuddleApi.setActiveWorkspaceId(ws.id);
        window.HuddleApi.setActiveWorkspaceName(ws.name);
        closeJoinModal();
        window.showHuddleToast(`Successfully joined "${ws.name}"!`, 'success');
        await initializeWorkspace();
      } catch (err) {
        console.error('[Huddle Join Workspace Error]:', err);
        window.showHuddleToast(err.message || 'Failed to join workspace. Verify the ID/slug.', 'error');
      } finally {
        joinModalSubmitBtn.textContent = 'Join workspace';
        validateWorkspaceId();
      }
    });
  }

  // ========================================================================
  // Create a Workspace Modal Logic
  // ========================================================================
  let isCreateModalClosing = false;

  function openCreateModal() {
    togglePopover(false);
    closeMobileDrawer();
    if (joinModalOverlay && joinModalOverlay.classList.contains('open')) {
      closeJoinModal(true);
    }

    isCreateModalClosing = false;
    createModalOverlay.classList.remove('closing');
    createModalOverlay.classList.add('open');
    createModalOverlay.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';

    setTimeout(() => {
      if (workspaceNameInput) {
        workspaceNameInput.focus();
      }
    }, 60);
  }

  function closeCreateModal(immediate = false) {
    if (isCreateModalClosing || !createModalOverlay || !createModalOverlay.classList.contains('open')) return;

    if (immediate) {
      createModalOverlay.classList.remove('open', 'closing');
      createModalOverlay.setAttribute('aria-hidden', 'true');
      document.body.style.overflow = '';
      if (workspaceNameInput) workspaceNameInput.value = '';
      if (createInputWrapper) createInputWrapper.classList.remove('focused');
      validateWorkspaceName();
      return;
    }

    isCreateModalClosing = true;
    createModalOverlay.classList.add('closing');

    setTimeout(() => {
      createModalOverlay.classList.remove('open', 'closing');
      createModalOverlay.setAttribute('aria-hidden', 'true');
      document.body.style.overflow = '';
      isCreateModalClosing = false;

      if (workspaceNameInput) workspaceNameInput.value = '';
      if (createInputWrapper) createInputWrapper.classList.remove('focused');
      validateWorkspaceName();
    }, 180);
  }

  function validateWorkspaceName() {
    if (!workspaceNameInput || !createModalSubmitBtn) return;
    const val = workspaceNameInput.value.trim();
    const hasValue = val.length > 0;

    if (hasValue) {
      createModalSubmitBtn.disabled = false;
      createModalSubmitBtn.classList.add('active');
    } else {
      createModalSubmitBtn.disabled = true;
      createModalSubmitBtn.classList.remove('active');
    }
  }

  if (workspaceNameInput && createInputWrapper) {
    workspaceNameInput.addEventListener('focus', () => {
      createInputWrapper.classList.add('focused');
    });

    workspaceNameInput.addEventListener('blur', () => {
      createInputWrapper.classList.remove('focused');
      validateWorkspaceName();
    });

    workspaceNameInput.addEventListener('input', () => {
      validateWorkspaceName();
    });
  }

  if (createWorkspaceTrigger) {
    createWorkspaceTrigger.addEventListener('click', (e) => {
      e.stopPropagation();
      openCreateModal();
    });
  }

  if (createModalCancelBtn) {
    createModalCancelBtn.addEventListener('click', (e) => {
      e.preventDefault();
      closeCreateModal();
    });
  }

  if (createModalBackdrop) {
    createModalBackdrop.addEventListener('click', (e) => {
      e.preventDefault();
      closeCreateModal();
    });
  }

  if (createWorkspaceForm) {
    createWorkspaceForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!createModalSubmitBtn || createModalSubmitBtn.disabled) return;

      const enteredName = workspaceNameInput.value.trim();
      createModalSubmitBtn.textContent = 'Creating...';
      createModalSubmitBtn.disabled = true;
      createModalSubmitBtn.classList.remove('active');

      try {
        const ws = await window.HuddleApi.workspaces.create(enteredName);
        window.HuddleApi.setActiveWorkspaceId(ws.id);
        window.HuddleApi.setActiveWorkspaceName(ws.name);

        // Auto-create initial #general channel
        try {
          await window.HuddleApi.channels.create(ws.id, 'general', 'public');
        } catch {}

        closeCreateModal();
        window.showHuddleToast(`Workspace "${ws.name}" created!`, 'success');
        await initializeWorkspace();
      } catch (err) {
        console.error('[Huddle Create Workspace Error]:', err);
        window.showHuddleToast(err.message || 'Failed to create workspace', 'error');
      } finally {
        createModalSubmitBtn.textContent = 'Create workspace';
        validateWorkspaceName();
      }
    });
  }

  // ========================================================================
  // User Profile Modal Logic
  // ========================================================================
  function openProfileModal() {
    const user = window.HuddleApi ? window.HuddleApi.getUser() : null;
    if (!user) return;

    if (profileFullNameInput) profileFullNameInput.value = user.fullName || '';
    if (profileUsernameInput) profileUsernameInput.value = user.username || '';
    if (profileEmailInput) profileEmailInput.value = user.email || '';
    if (profileAvatarInput) profileAvatarInput.value = user.avatarUrl || '';

    updateProfileAvatarPreview(user.avatarUrl, user.fullName);

    userProfileModal.classList.remove('closing');
    userProfileModal.classList.add('open');
    userProfileModal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }

  function closeProfileModal() {
    if (!userProfileModal || !userProfileModal.classList.contains('open')) return;
    userProfileModal.classList.add('closing');
    setTimeout(() => {
      userProfileModal.classList.remove('open', 'closing');
      userProfileModal.setAttribute('aria-hidden', 'true');
      document.body.style.overflow = '';
    }, 180);
  }

  function updateProfileAvatarPreview(url, name) {
    if (!profileAvatarImg || !profileAvatarInitials) return;
    if (url && url.trim().length > 0) {
      profileAvatarImg.src = url.trim();
      profileAvatarImg.style.display = 'block';
      profileAvatarInitials.style.display = 'none';
      profileAvatarImg.onerror = () => {
        profileAvatarImg.style.display = 'none';
        profileAvatarInitials.style.display = 'flex';
        profileAvatarInitials.textContent = (name || 'U').charAt(0).toUpperCase();
      };
    } else {
      profileAvatarImg.style.display = 'none';
      profileAvatarInitials.style.display = 'flex';
      profileAvatarInitials.textContent = (name || 'U').charAt(0).toUpperCase();
    }
  }

  if (profileAvatarInput) {
    profileAvatarInput.addEventListener('input', () => {
      updateProfileAvatarPreview(profileAvatarInput.value, profileFullNameInput?.value);
    });
  }

  document.querySelectorAll('.avatar-preset-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const url = btn.dataset.avatarUrl;
      if (url && profileAvatarInput) {
        profileAvatarInput.value = url;
        updateProfileAvatarPreview(url, profileFullNameInput?.value);
      }
    });
  });

  if (userProfileBtn) userProfileBtn.addEventListener('click', openProfileModal);
  if (profileModalCloseBtn) profileModalCloseBtn.addEventListener('click', closeProfileModal);
  if (profileModalCancelBtn) profileModalCancelBtn.addEventListener('click', closeProfileModal);
  if (profileModalBackdrop) profileModalBackdrop.addEventListener('click', closeProfileModal);

  if (profileEditForm) {
    profileEditForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!profileModalSubmitBtn) return;

      const newFullName = (profileFullNameInput?.value || '').trim();
      const newUsername = (profileUsernameInput?.value || '').trim().replace(/^@/, '');
      const newAvatarUrl = (profileAvatarInput?.value || '').trim();

      if (!newFullName) {
        window.showHuddleToast('Full name is required', 'error');
        return;
      }

      if (!newUsername || newUsername.length < 3) {
        window.showHuddleToast('Username must be at least 3 characters', 'error');
        return;
      }

      if (!/^[a-zA-Z0-9_.]+$/.test(newUsername)) {
        window.showHuddleToast('Username can only contain letters, numbers, underscores, and dots', 'error');
        return;
      }

      profileModalSubmitBtn.disabled = true;
      profileModalSubmitBtn.textContent = 'Saving...';

      try {
        const updatedUser = await window.HuddleApi.users.updateProfile({
          fullName: newFullName,
          username: newUsername,
          avatarUrl: newAvatarUrl || null,
        });

        window.HuddleApi.setUser(updatedUser);
        updateUserUI(updatedUser);
        closeProfileModal();
        window.showHuddleToast('Profile updated successfully!', 'success');
      } catch (err) {
        console.error('[Huddle Profile Update Error]:', err);
        window.showHuddleToast(err.message || 'Failed to update profile', 'error');
      } finally {
        profileModalSubmitBtn.disabled = false;
        profileModalSubmitBtn.textContent = 'Save Changes';
      }
    });
  }

  // ========================================================================
  // Channel Add Member Modal Logic
  // ========================================================================
  let isAddMemberModalClosing = false;
  let currentActiveChannelForAdd = null;
  let searchDebounceTimer = null;

  function openAddMemberModal(channel) {
    currentActiveChannelForAdd = channel;
    const titleEl = document.getElementById('add-member-modal-title');
    if (titleEl && channel) {
      titleEl.textContent = `Add Member to #${channel.name}`;
    }

    if (addMemberModalSubheading && channel) {
      addMemberModalSubheading.textContent = `Enter their unique username or email to add them to #${channel.name}`;
    }

    if (channelMemberSearchInput) channelMemberSearchInput.value = '';
    if (addMemberLiveResults) {
      addMemberLiveResults.innerHTML = '';
      addMemberLiveResults.style.display = 'none';
    }

    validateAddMemberInput();

    isAddMemberModalClosing = false;
    channelAddMemberModal.classList.remove('closing');
    channelAddMemberModal.classList.add('open');
    channelAddMemberModal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';

    setTimeout(() => {
      channelMemberSearchInput?.focus();
    }, 60);
  }

  function closeAddMemberModal() {
    if (isAddMemberModalClosing || !channelAddMemberModal || !channelAddMemberModal.classList.contains('open')) return;

    isAddMemberModalClosing = true;
    channelAddMemberModal.classList.add('closing');

    setTimeout(() => {
      channelAddMemberModal.classList.remove('open', 'closing');
      channelAddMemberModal.setAttribute('aria-hidden', 'true');
      document.body.style.overflow = '';
      isAddMemberModalClosing = false;
    }, 180);
  }

  function validateAddMemberInput() {
    if (!channelMemberSearchInput || !channelAddMemberSubmitBtn) return;
    const val = channelMemberSearchInput.value.trim();
    if (val.length >= 2) {
      channelAddMemberSubmitBtn.disabled = false;
      channelAddMemberSubmitBtn.classList.add('active');
    } else {
      channelAddMemberSubmitBtn.disabled = true;
      channelAddMemberSubmitBtn.classList.remove('active');
    }
  }

  if (channelAddMemberCloseBtn) channelAddMemberCloseBtn.addEventListener('click', closeAddMemberModal);
  if (channelAddMemberCancelBtn) channelAddMemberCancelBtn.addEventListener('click', closeAddMemberModal);
  if (channelAddMemberBackdrop) channelAddMemberBackdrop.addEventListener('click', closeAddMemberModal);

  if (channelMemberSearchInput) {
    channelMemberSearchInput.addEventListener('input', () => {
      validateAddMemberInput();
      const query = channelMemberSearchInput.value.trim().replace(/^@/, '');

      clearTimeout(searchDebounceTimer);
      if (!query || query.length < 2) {
        if (addMemberLiveResults) {
          addMemberLiveResults.innerHTML = '';
          addMemberLiveResults.style.display = 'none';
        }
        return;
      }

      searchDebounceTimer = setTimeout(async () => {
        try {
          const results = await window.HuddleApi.users.search(query);
          renderLiveSearchResults(results);
        } catch (err) {
          console.warn('[Huddle User Search Error]:', err);
        }
      }, 250);
    });
  }

  function renderLiveSearchResults(users) {
    if (!addMemberLiveResults) return;
    if (!users || users.length === 0) {
      addMemberLiveResults.innerHTML = `
        <div style="padding:10px 14px;color:#98A2B3;font-size:12.5px;text-align:center;">
          No matching users found
        </div>
      `;
      addMemberLiveResults.style.display = 'block';
      return;
    }

    addMemberLiveResults.innerHTML = users
      .slice(0, 5)
      .map((u) => {
        const initial = (u.fullName || u.username || 'U').charAt(0).toUpperCase();
        const avatarHtml = u.avatarUrl
          ? `<img src="${escapeHtml(u.avatarUrl)}" alt="" style="width:100%;height:100%;border-radius:50%;object-fit:cover;" />`
          : initial;

        return `
          <div class="live-search-user-row" data-username="${escapeHtml(u.username)}" style="display:flex;align-items:center;gap:10px;padding:8px 12px;cursor:pointer;border-radius:8px;transition:background 0.12s ease;">
            <div style="width:28px;height:28px;border-radius:50%;background:#FFF4ED;color:#FF6A00;font-weight:700;font-size:12px;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
              ${avatarHtml}
            </div>
            <div style="flex:1;overflow:hidden;">
              <div style="font-size:13px;font-weight:600;color:#101828;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(u.fullName || u.username)}</div>
              <div style="font-size:11.5px;color:#667085;">@${escapeHtml(u.username)}</div>
            </div>
            <span style="font-size:12px;color:#FF6A00;font-weight:600;">Add</span>
          </div>
        `;
      })
      .join('');

    addMemberLiveResults.style.display = 'block';

    addMemberLiveResults.querySelectorAll('.live-search-user-row').forEach((row) => {
      row.addEventListener('click', () => {
        const selectedU = row.dataset.username;
        if (channelMemberSearchInput && selectedU) {
          channelMemberSearchInput.value = `@${selectedU}`;
          validateAddMemberInput();
          addMemberLiveResults.style.display = 'none';
        }
      });
    });
  }

  if (channelAddMemberForm) {
    channelAddMemberForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!channelAddMemberSubmitBtn || channelAddMemberSubmitBtn.disabled) return;
      if (!currentActiveChannelForAdd) return;

      const target = channelMemberSearchInput.value.trim();
      if (!target) return;

      channelAddMemberSubmitBtn.disabled = true;
      channelAddMemberSubmitBtn.textContent = 'Adding...';

      try {
        await window.HuddleApi.channels.addMember(currentActiveChannelForAdd.id, target);
        closeAddMemberModal();
        window.showHuddleToast(`Added ${target} to #${currentActiveChannelForAdd.name}!`, 'success');
        if (activeChannel && activeChannel.id === currentActiveChannelForAdd.id) {
          renderChannelMainView(activeChannel);
        }
      } catch (err) {
        console.error('[Huddle Add Member Error]:', err);
        window.showHuddleToast(err.message || 'Failed to add member to channel', 'error');
      } finally {
        channelAddMemberSubmitBtn.disabled = false;
        channelAddMemberSubmitBtn.textContent = 'Add to Channel';
        validateAddMemberInput();
      }
    });
  }

  // ========================================================================
  // Direct Messages (DMs) Teammate Picker Modal
  // ========================================================================
  let dmPickerModal = null;

  function openDmPickerModal() {
    const activeWsId = window.HuddleApi.getActiveWorkspaceId();
    if (!activeWsId) {
      window.showHuddleToast('No active workspace selected', 'error');
      return;
    }

    if (!dmPickerModal) {
      dmPickerModal = document.createElement('div');
      dmPickerModal.id = 'dm-picker-modal';
      dmPickerModal.className = 'dm-picker-overlay';
      dmPickerModal.innerHTML = `
        <div class="dm-picker-card" role="dialog" aria-modal="true" aria-labelledby="dm-picker-title">
          <button type="button" class="dm-picker-close-btn" id="close-dm-modal" aria-label="Close dialog">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
          <div class="dm-picker-icon-badge" aria-hidden="true">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
            </svg>
          </div>
          <h3 class="dm-picker-title" id="dm-picker-title">New Direct Message</h3>
          <p class="dm-picker-subtitle">Select a teammate to start a private, end-to-end confidential conversation.</p>
          <div class="dm-picker-search-wrap">
            <svg class="dm-picker-search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
            <input
              type="text"
              class="dm-picker-input"
              id="dm-search-member-input"
              placeholder="Search teammates by name, @handle or email..."
              autocomplete="off"
            />
          </div>
          <div class="dm-picker-list" id="dm-members-list-container">
            <div style="text-align:center;color:#98A2B3;padding:16px;font-size:13px;">Loading teammates...</div>
          </div>
        </div>
      `;
      document.body.appendChild(dmPickerModal);

      const closeBtn = dmPickerModal.querySelector('#close-dm-modal');
      const closeHandler = () => {
        dmPickerModal.classList.remove('open');
      };
      if (closeBtn) closeBtn.addEventListener('click', closeHandler);

      dmPickerModal.addEventListener('click', (e) => {
        if (e.target === dmPickerModal) closeHandler();
      });

      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && dmPickerModal.classList.contains('open')) {
          closeHandler();
        }
      });
    }

    dmPickerModal.classList.add('open');
    const input = dmPickerModal.querySelector('#dm-search-member-input');
    if (input) {
      input.value = '';
      setTimeout(() => input.focus(), 50);
    }

    loadTeammatesForDm(activeWsId);
  }

  async function loadTeammatesForDm(workspaceId) {
    const container = document.getElementById('dm-members-list-container');
    if (!container) return;

    try {
      const members = await window.HuddleApi.workspaces.getMembers(workspaceId);
      const currentUser = window.HuddleApi.getUser();
      const otherMembers = (members || []).filter(
        (m) => m.userId !== currentUser?.id && m.id !== currentUser?.id,
      );

      if (otherMembers.length === 0) {
        container.innerHTML = `
          <div class="dm-picker-empty">
            No other teammates in this workspace yet. Invite teammates to start direct conversations!
          </div>
        `;
        return;
      }

      function renderList(list) {
        if (list.length === 0) {
          container.innerHTML = `
            <div class="dm-picker-empty">
              No teammates match your search.
            </div>
          `;
          return;
        }

        container.innerHTML = list
          .map((m) => {
            const uId = m.userId || m.id;
            const name = m.fullName || m.name || m.username || 'Teammate';
            const username = m.username || 'user';
            const isOnline = onlineUsersSet.has(uId);
            const initial = name.charAt(0).toUpperCase();
            const avatarHtml = m.avatarUrl
              ? `<img src="${escapeHtml(m.avatarUrl)}" alt="" />`
              : `<div class="initials">${escapeHtml(initial)}</div>`;

            return `
              <div class="dm-picker-row" data-user-id="${escapeHtml(uId)}">
                <div class="dm-picker-row-avatar">
                  ${avatarHtml}
                  <span class="presence-dot ${isOnline ? 'online' : 'offline'}"></span>
                </div>
                <div class="dm-picker-row-meta">
                  <div class="dm-picker-row-name">${escapeHtml(name)}</div>
                  <div class="dm-picker-row-handle">@${escapeHtml(username)}${m.email ? ` • ${escapeHtml(m.email)}` : ''}</div>
                </div>
                <button type="button" class="dm-picker-row-action">Chat</button>
              </div>
            `;
          })
          .join('');

        container.querySelectorAll('.dm-picker-row').forEach((row) => {
          row.addEventListener('click', async () => {
            const targetId = row.dataset.userId;
            if (!targetId) return;

            try {
              if (dmPickerModal) dmPickerModal.classList.remove('open');
              window.showHuddleToast('Opening conversation...', 'info');
              const dmChannel = await window.HuddleApi.channels.createDm(workspaceId, targetId);
              await loadWorkspaceChannels(workspaceId);
              renderChannelMainView(dmChannel);
            } catch (err) {
              console.error('[Huddle DM Create Error]:', err);
              window.showHuddleToast(err.message || 'Failed to start direct message', 'error');
            }
          });
        });
      }

      renderList(otherMembers);

      const searchInputEl = document.getElementById('dm-search-member-input');
      if (searchInputEl) {
        searchInputEl.oninput = () => {
          const q = searchInputEl.value.trim().toLowerCase();
          const filtered = otherMembers.filter(
            (m) =>
              (m.fullName && m.fullName.toLowerCase().includes(q)) ||
              (m.name && m.name.toLowerCase().includes(q)) ||
              (m.username && m.username.toLowerCase().includes(q)) ||
              (m.email && m.email.toLowerCase().includes(q)),
          );
          renderList(filtered);
        };
      }
    } catch (err) {
      container.innerHTML = `<div style="color:#F04438;font-size:13px;padding:8px;text-align:center;">Failed to load teammates.</div>`;
    }
  }

  // ========================================================================
  // Unified Teammates & Workspace Search Logic (Quick Switcher)
  // ========================================================================
  let searchResultsPanel = null;
  let searchDebounce = null;
  let cachedWorkspaceChannels = [];
  let cachedWorkspaceMembers = [];

  async function fetchWorkspaceMembers(workspaceId) {
    if (!workspaceId) return [];
    try {
      const members = await window.HuddleApi.workspaces.getMembers(workspaceId);
      cachedWorkspaceMembers = members || [];
      return cachedWorkspaceMembers;
    } catch (err) {
      console.warn('[Huddle] Failed to fetch workspace members:', err);
      return cachedWorkspaceMembers || [];
    }
  }

  function activateUnifiedSearch(options = {}) {
    if (!searchInput) return;

    // Open mobile sidebar drawer if currently hidden on mobile
    const sidebar = document.getElementById('dashboard-sidebar');
    const backdrop = document.getElementById('drawer-backdrop');
    if (sidebar && !sidebar.classList.contains('open') && window.innerWidth < 768) {
      sidebar.classList.add('open');
      if (backdrop) backdrop.classList.add('active');
    }

    // Modern glowing pulse on the search box
    const wrapper = searchInput.closest('.sidebar-search-wrapper');
    if (wrapper) {
      wrapper.classList.remove('pulse-highlight');
      void wrapper.offsetWidth; // force reflow for smooth re-trigger
      wrapper.classList.add('pulse-highlight');
      setTimeout(() => wrapper.classList.remove('pulse-highlight'), 2600);
    }

    if (options.placeholder) {
      searchInput.placeholder = options.placeholder;
    } else {
      searchInput.placeholder = 'Search teammate or channel...';
    }

    if (typeof options.query === 'string') {
      searchInput.value = options.query;
    }

    searchInput.focus();
    try {
      searchInput.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } catch {}

    performUnifiedSearch(searchInput.value.trim());
  }

  if (sidebarAddDmBtn) {
    sidebarAddDmBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      activateUnifiedSearch({ placeholder: 'Find or message a teammate...' });
    });
  }

  function initSearchPanel() {
    if (!searchInput) return;

    const container = searchInput.closest('.sidebar-search-container') || searchInput.parentElement;
    container.style.position = 'relative';

    searchResultsPanel = document.createElement('div');
    searchResultsPanel.id = 'sidebar-search-results';
    searchResultsPanel.className = 'search-results-panel';
    container.appendChild(searchResultsPanel);

    searchInput.addEventListener('focus', () => {
      performUnifiedSearch(searchInput.value.trim());
    });

    searchInput.addEventListener('input', () => {
      clearTimeout(searchDebounce);
      searchDebounce = setTimeout(() => {
        performUnifiedSearch(searchInput.value.trim());
      }, 150);
    });

    // Keyboard navigation (Up/Down/Enter/Escape)
    searchInput.addEventListener('keydown', (e) => {
      if (!searchResultsPanel || !searchResultsPanel.classList.contains('open')) return;

      const items = Array.from(searchResultsPanel.querySelectorAll('.search-result-item'));
      if (items.length === 0) return;

      let currentIndex = items.findIndex((el) => el.classList.contains('selected'));

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (currentIndex >= 0) items[currentIndex].classList.remove('selected');
        const nextIndex = (currentIndex + 1) % items.length;
        items[nextIndex].classList.add('selected');
        items[nextIndex].scrollIntoView({ block: 'nearest' });
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (currentIndex >= 0) items[currentIndex].classList.remove('selected');
        const prevIndex = (currentIndex - 1 + items.length) % items.length;
        items[prevIndex].classList.add('selected');
        items[prevIndex].scrollIntoView({ block: 'nearest' });
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (currentIndex >= 0 && items[currentIndex]) {
          items[currentIndex].click();
        } else if (items[0]) {
          items[0].click();
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        searchResultsPanel.classList.remove('open');
        searchInput.blur();
        const wrapper = searchInput.closest('.sidebar-search-wrapper');
        if (wrapper) wrapper.classList.remove('pulse-highlight');
      }
    });

    // Close when clicking outside
    document.addEventListener('click', (e) => {
      if (
        !searchInput.contains(e.target) &&
        !searchResultsPanel.contains(e.target) &&
        (!sidebarAddDmBtn || !sidebarAddDmBtn.contains(e.target))
      ) {
        searchResultsPanel.classList.remove('open');
        const wrapper = searchInput.closest('.sidebar-search-wrapper');
        if (wrapper) wrapper.classList.remove('pulse-highlight');
      }
    });
  }

  async function performUnifiedSearch(rawQuery = '') {
    if (!searchResultsPanel) return;

    const activeWsId = window.HuddleApi.getActiveWorkspaceId();
    if (!activeWsId) return;

    const currentUser = window.HuddleApi.getUser();
    const q = rawQuery.trim().toLowerCase();
    const cleanChanQ = q.replace(/^#/, '');

    if (!cachedWorkspaceMembers || cachedWorkspaceMembers.length === 0) {
      await fetchWorkspaceMembers(activeWsId);
    }

    // 1. Teammates search
    const otherMembers = (cachedWorkspaceMembers || []).filter((m) => {
      const uId = m.userId || m.id;
      return uId && uId !== currentUser?.id;
    });

    const matchedMembers = otherMembers.filter((m) => {
      if (!q) return true; // Show all teammates if query is empty
      const fullName = (m.fullName || m.name || '').toLowerCase();
      const username = (m.username || '').toLowerCase();
      const email = (m.email || '').toLowerCase();
      return fullName.includes(q) || username.includes(q) || email.includes(q);
    });

    const memberResults = matchedMembers.map((m) => {
      const uId = m.userId || m.id;
      // Existing 1-on-1 DM channel check
      const existingDm = (cachedWorkspaceChannels || []).find(
        (c) =>
          c.type === 'dm' &&
          (c.members || []).some(
            (mem) =>
              mem.user_id === uId ||
              mem.userId === uId ||
              mem.user?.id === uId,
          ),
      );

      // Shared channels this person belongs to
      const sharedChannels = (cachedWorkspaceChannels || []).filter(
        (c) =>
          c.type !== 'dm' &&
          (c.members || []).some(
            (mem) =>
              mem.user_id === uId ||
              mem.userId === uId ||
              mem.user?.id === uId,
          ),
      );

      return {
        member: m,
        userId: uId,
        existingDm,
        sharedChannels,
      };
    });

    // 2. Channels & Groups search
    const channelMap = new Map();

    // Add shared groups where matched teammates belong
    memberResults.forEach((res) => {
      res.sharedChannels.forEach((ch) => {
        if (!channelMap.has(ch.id)) {
          channelMap.set(ch.id, {
            channel: ch,
            reason: `Shared group with ${res.member.fullName || res.member.username || 'teammate'}`,
          });
        }
      });
    });

    // Add channels matching by name
    (cachedWorkspaceChannels || []).forEach((ch) => {
      if (ch.type !== 'dm') {
        const nameMatches = cleanChanQ && ch.name.toLowerCase().includes(cleanChanQ);
        if (nameMatches && !channelMap.has(ch.id)) {
          channelMap.set(ch.id, {
            channel: ch,
            reason: 'Channel',
          });
        }
      }
    });

    const matchedChannels = Array.from(channelMap.values());

    // 3. Message search (when query >= 2)
    let matchedMessages = [];
    if (q.length >= 2) {
      try {
        const res = await window.HuddleApi.search.query(activeWsId, q);
        matchedMessages = res?.messages || [];
      } catch (err) {
        console.warn('[Huddle Search Messages Error]:', err);
      }
    }

    renderUnifiedSearchResults({
      memberResults,
      matchedChannels,
      matchedMessages,
      query: rawQuery,
      activeWsId,
    });
  }

  function renderUnifiedSearchResults({
    memberResults,
    matchedChannels,
    matchedMessages,
    query,
    activeWsId,
  }) {
    if (!searchResultsPanel) return;

    const hasMembers = memberResults && memberResults.length > 0;
    const hasChannels = matchedChannels && matchedChannels.length > 0;
    const hasMessages = matchedMessages && matchedMessages.length > 0;

    if (!hasMembers && !hasChannels && !hasMessages) {
      searchResultsPanel.innerHTML = `
        <div style="padding: 24px 16px; text-align: center; color: #667085; font-size: 13px;">
          <div style="width: 38px; height: 38px; border-radius: 50%; background: #F2F4F7; color: #98A2B3; display: flex; align-items: center; justify-content: center; margin: 0 auto 10px;">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
          </div>
          <div style="font-weight: 600; color: #101828; margin-bottom: 3px;">No results found</div>
          <div style="font-size: 12px; color: #98A2B3;">No teammate or channel matched "${escapeHtml(query)}"</div>
        </div>
      `;
      searchResultsPanel.classList.add('open');
      return;
    }

    let html = '';

    // ==========================================
    // 1. PEOPLE & DIRECT MESSAGES (PERSON FIRST!)
    // ==========================================
    if (hasMembers) {
      html += `
        <div class="search-group-title">
          <span>People & Direct Messages</span>
          <span class="search-group-count">${memberResults.length}</span>
        </div>
      `;

      memberResults.forEach((item) => {
        const m = item.member;
        const uId = item.userId;
        const displayName = m.fullName || m.name || m.username || 'Teammate';
        const username = m.username ? `@${m.username}` : (m.email || '');
        const isOnline = uId && onlineUsersSet.has(uId);
        const initial = displayName.charAt(0).toUpperCase();
        const avatarHtml = m.avatarUrl
          ? `<img src="${escapeHtml(m.avatarUrl)}" alt="" class="search-result-avatar-thumb" />`
          : `<div class="search-result-avatar-initials">${escapeHtml(initial)}</div>`;

        const hasExistingDm = !!item.existingDm;
        const badgeText = hasExistingDm ? 'Direct Message' : 'Start Chat';

        html += `
          <div class="search-result-item" 
               data-type="person" 
               data-user-id="${escapeHtml(uId)}" 
               data-dm-id="${item.existingDm ? escapeHtml(item.existingDm.id) : ''}">
            <div class="search-result-avatar-wrap">
              ${avatarHtml}
              <span class="presence-dot ${isOnline ? 'online' : 'offline'}"></span>
            </div>
            <div class="search-result-meta">
              <div class="search-result-name-row">
                <span class="search-result-name">${escapeHtml(displayName)}</span>
                <span class="search-result-handle">${escapeHtml(username)}</span>
              </div>
              <div class="search-result-subtext">
                ${hasExistingDm ? 'Direct conversation • Jump to message' : 'Workspace teammate • Click to message'}
              </div>
            </div>
            <span class="search-result-badge">${escapeHtml(badgeText)}</span>
          </div>
        `;
      });
    }

    // ==========================================
    // 2. CHANNELS & GROUPS (UNDER THE PERSON!)
    // ==========================================
    if (hasChannels) {
      html += `
        <div class="search-group-title">
          <span>Channels & Groups</span>
          <span class="search-group-count">${matchedChannels.length}</span>
        </div>
      `;

      matchedChannels.forEach(({ channel, reason }) => {
        const memberCount = channel.members?.length || 0;
        html += `
          <div class="search-result-item" data-type="channel" data-channel-id="${escapeHtml(channel.id)}">
            <span class="search-result-prefix">#</span>
            <div class="search-result-meta">
              <div class="search-result-name-row">
                <span class="search-result-name">${escapeHtml(channel.name)}</span>
              </div>
              <div class="search-result-subtext">
                ${escapeHtml(reason)}${memberCount > 0 ? ` • ${memberCount} members` : ''}
              </div>
            </div>
            <span class="search-result-badge">Open</span>
          </div>
        `;
      });
    }

    // ==========================================
    // 3. MESSAGES (IF ANY)
    // ==========================================
    if (hasMessages) {
      html += `
        <div class="search-group-title">
          <span>Messages</span>
          <span class="search-group-count">${matchedMessages.length}</span>
        </div>
      `;

      matchedMessages.forEach((m) => {
        const sender = m.sender?.full_name || 'Teammate';
        const chanName = m.channel?.name || 'channel';
        html += `
          <div class="search-result-item" 
               data-type="message" 
               data-channel-id="${escapeHtml(m.channel_id || m.channel?.id)}"
               style="flex-direction: column; align-items: flex-start; gap: 3px;">
            <div style="font-size: 11.5px; color: #FF6A00; font-weight: 600;">
              #${escapeHtml(chanName)} • ${escapeHtml(sender)}
            </div>
            <div style="font-size: 12.5px; color: #344054; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; width: 100%;">
              ${escapeHtml(m.content || '')}
            </div>
          </div>
        `;
      });
    }

    // Keyboard navigation footer hint
    html += `
      <div class="search-panel-hint">
        <span><kbd>↑</kbd> <kbd>↓</kbd> to navigate</span>
        <span><kbd>Enter</kbd> to select</span>
        <span><kbd>Esc</kbd> to close</span>
      </div>
    `;

    searchResultsPanel.innerHTML = html;
    searchResultsPanel.classList.add('open');

    // Attach click handlers
    searchResultsPanel.querySelectorAll('.search-result-item').forEach((item) => {
      item.addEventListener('click', async () => {
        const type = item.dataset.type;
        searchResultsPanel.classList.remove('open');
        searchInput.value = '';
        searchInput.placeholder = 'Search';
        closeMobileDrawer();

        const wrapper = searchInput.closest('.sidebar-search-wrapper');
        if (wrapper) wrapper.classList.remove('pulse-highlight');

        if (type === 'person') {
          const targetUserId = item.dataset.userId;
          const dmId = item.dataset.dmId;

          // If DM already exists, switch directly to it
          if (dmId) {
            const existingChannel = (cachedWorkspaceChannels || []).find((c) => c.id === dmId);
            if (existingChannel) {
              document.querySelectorAll('.sidebar-channel-item').forEach((el) => el.classList.remove('active'));
              const sideEl = document.querySelector(`.sidebar-channel-item[data-channel-id="${dmId}"]`);
              if (sideEl) sideEl.classList.add('active');
              window.HuddleApi.setActiveChannelId(dmId);
              renderChannelMainView(existingChannel);
              return;
            }
          }

          // Otherwise, create the direct message conversation
          try {
            window.showHuddleToast('Opening conversation...', 'info');
            const newDm = await window.HuddleApi.channels.createDm(activeWsId, targetUserId);
            await loadWorkspaceChannels(activeWsId);
            document.querySelectorAll('.sidebar-channel-item').forEach((el) => el.classList.remove('active'));
            const sideEl = document.querySelector(`.sidebar-channel-item[data-channel-id="${newDm.id}"]`);
            if (sideEl) sideEl.classList.add('active');
            window.HuddleApi.setActiveChannelId(newDm.id);
            renderChannelMainView(newDm);
          } catch (err) {
            console.error('[Huddle DM Open Error]:', err);
            window.showHuddleToast(err.message || 'Failed to start conversation', 'error');
          }
        } else if (type === 'channel' || type === 'message') {
          const cId = item.dataset.channelId;
          if (cId) {
            const chan = (cachedWorkspaceChannels || []).find((c) => c.id === cId);
            if (chan) {
              document.querySelectorAll('.sidebar-channel-item').forEach((el) => el.classList.remove('active'));
              const sideEl = document.querySelector(`.sidebar-channel-item[data-channel-id="${cId}"]`);
              if (sideEl) sideEl.classList.add('active');
              window.HuddleApi.setActiveChannelId(cId);
              renderChannelMainView(chan);
            } else {
              try {
                const fetched = await window.HuddleApi.channels.get(cId);
                renderChannelMainView(fetched);
              } catch {}
            }
          }
        }
      });
    });
  }

  initSearchPanel();

  // ========================================================================
  // Channels and Workspace UI Synchronization
  // ========================================================================
  let currentChannelMembers = [];

  async function loadWorkspaceChannels(workspaceId) {
    if (!workspaceId) return;

    try {
      const channels = await window.HuddleApi.channels.list(workspaceId);
      cachedWorkspaceChannels = channels || [];
      renderChannelsList(channels);
      // Pre-fetch workspace members in background for instantaneous search
      fetchWorkspaceMembers(workspaceId);
    } catch (err) {
      console.warn('[Huddle] Failed to fetch channels:', err);
      cachedWorkspaceChannels = [];
      renderChannelsList([]);
    }
  }

  function renderChannelsList(channels) {
    if (!sidebarSectionsWrapper || !sidebarChannelsList) return;

    const mainArea = document.getElementById('dashboard-main');
    const currentUser = window.HuddleApi.getUser();

    if (!channels || channels.length === 0) {
      sidebarSectionsWrapper.style.display = 'none';
      if (mainArea) {
        mainArea.innerHTML = `
          <div class="empty-state-container">
            <div class="empty-state-icon-box" aria-hidden="true">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round">
                <line x1="4" y1="9" x2="20" y2="9"></line>
                <line x1="4" y1="15" x2="20" y2="15"></line>
                <line x1="10" y1="3" x2="8" y2="21"></line>
                <line x1="16" y1="3" x2="14" y2="21"></line>
              </svg>
            </div>
            <h1 class="empty-state-heading">No Channels yet</h1>
            <p class="empty-state-body">
              Join a channel your teammates already started, or create your own to get the conversation going.
            </p>
            <button type="button" class="create-channel-btn" id="create-channel-btn-empty">
              Create a channel
            </button>
          </div>
        `;
        const emptyCreateBtn = document.getElementById('create-channel-btn-empty');
        if (emptyCreateBtn) {
          emptyCreateBtn.addEventListener('click', () => {
            window.location.href = 'create-channel.html';
          });
        }
      }
      return;
    }

    sidebarSectionsWrapper.style.display = 'flex';
    sidebarChannelsList.innerHTML = '';
    if (sidebarDmsList) sidebarDmsList.innerHTML = '';

    const publicChannels = channels.filter((c) => c.type !== 'dm');
    const dmChannels = channels.filter((c) => c.type === 'dm');

    const activeChannelId = window.HuddleApi.getActiveChannelId();

    // Render Channels
    publicChannels.forEach((channel, idx) => {
      const li = document.createElement('li');
      li.className = 'sidebar-channel-item';
      li.dataset.channelId = channel.id;
      const isSelected = activeChannelId ? channel.id === activeChannelId : idx === 0 && dmChannels.length === 0;

      if (isSelected) {
        li.classList.add('active');
        window.HuddleApi.setActiveChannelId(channel.id);
      }

      const link = document.createElement('a');
      link.href = '#';
      link.className = 'sidebar-channel-link';
      link.innerHTML = `
        <span class="channel-link-prefix" aria-hidden="true">#</span>
        <span class="channel-link-name channel-name-text">${escapeHtml(channel.name)}</span>
      `;

      link.addEventListener('click', (e) => {
        e.preventDefault();
        document.querySelectorAll('.sidebar-channel-item').forEach((el) => el.classList.remove('active'));
        li.classList.add('active');
        window.HuddleApi.setActiveChannelId(channel.id);
        clearChannelBadge(channel.id);
        renderChannelMainView(channel);
        closeMobileDrawer();
      });

      li.appendChild(link);
      sidebarChannelsList.appendChild(li);
    });

    // Render DMs
    if (sidebarDmsList) {
      dmChannels.forEach((dm) => {
        const otherMember = (dm.members || []).find((m) => m.user_id !== currentUser?.id) || dm.members?.[0];
        const teammate = otherMember?.user;
        const displayName = teammate?.full_name || teammate?.username || 'Teammate';
        const isOnline = teammate?.id && onlineUsersSet.has(teammate.id);

        const li = document.createElement('li');
        li.className = 'sidebar-channel-item';
        li.dataset.channelId = dm.id;
        li.dataset.userId = teammate?.id || '';
        if (activeChannelId === dm.id) {
          li.classList.add('active');
        }

        const initial = (displayName || 'T').charAt(0).toUpperCase();
        const avatarHtml = teammate?.avatar_url
          ? `<img src="${escapeHtml(teammate.avatar_url)}" alt="" class="sidebar-dm-avatar-thumb" />`
          : `<div class="sidebar-dm-avatar-initials">${escapeHtml(initial)}</div>`;

        const link = document.createElement('a');
        link.href = '#';
        link.className = 'sidebar-dm-link';
        link.innerHTML = `
          <div class="sidebar-dm-avatar-wrap">
            ${avatarHtml}
            <span class="presence-dot ${isOnline ? 'online' : 'offline'}"></span>
          </div>
          <span class="sidebar-dm-name">${escapeHtml(displayName)}</span>
        `;

        link.addEventListener('click', (e) => {
          e.preventDefault();
          document.querySelectorAll('.sidebar-channel-item').forEach((el) => el.classList.remove('active'));
          li.classList.add('active');
          window.HuddleApi.setActiveChannelId(dm.id);
          clearChannelBadge(dm.id);
          renderChannelMainView(dm);
          closeMobileDrawer();
        });

        li.appendChild(link);
        sidebarDmsList.appendChild(li);
      });
    }

    const currentActive =
      channels.find((c) => c.id === window.HuddleApi.getActiveChannelId()) || channels[0];
    if (currentActive) {
      renderChannelMainView(currentActive);
    }
  }

  // ========================================================================
  // Main Channel Chat View & Real-Time Engine
  // ========================================================================
  let currentMessages = [];

  async function renderChannelMainView(channel) {
    const mainArea = document.getElementById('dashboard-main');
    if (!mainArea || !channel) return;

    const currentUser = window.HuddleApi.getUser();

    // Socket: leave previous channel room, then join new one
    if (socket) {
      if (activeChannel && activeChannel.id !== channel.id) {
        socket.emit('channel:leave', { channelId: activeChannel.id });
      }
      socket.emit('channel:join', { channelId: channel.id });
    }

    activeChannel = channel;

    // Determine channel title & subtitle
    let channelTitle = `#${channel.name}`;
    let isDm = channel.type === 'dm';
    let dmTeammate = null;

    if (isDm) {
      const otherMember = (channel.members || []).find((m) => m.user_id !== currentUser?.id) || channel.members?.[0];
      dmTeammate = otherMember?.user;
      channelTitle = dmTeammate?.full_name || dmTeammate?.username || 'Direct Message';
    }

    // Update mobile top bar title if present
    const mobileTopTitle = document.getElementById('mobile-top-title');
    if (mobileTopTitle) {
      mobileTopTitle.innerHTML = `<span style="font-size:15px;font-weight:700;color:#101828;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(channelTitle)}</span>`;
    }

    mainArea.innerHTML = `
      <div style="display:flex;flex-direction:column;height:100%;width:100%;background:#ffffff;border-radius:18px;overflow:hidden;">
        <!-- Header -->
        ${
          isDm
            ? `
          <header class="dm-header-container">
            <div class="dm-header-left">
              <div class="dm-header-avatar-wrap">
                ${
                  dmTeammate?.avatar_url
                    ? `<img src="${escapeHtml(dmTeammate.avatar_url)}" alt="" class="dm-header-avatar-img" />`
                    : `<div class="dm-header-avatar-initials">${escapeHtml((channelTitle || 'T').charAt(0).toUpperCase())}</div>`
                }
                <span class="presence-dot ${dmTeammate?.id && onlineUsersSet.has(dmTeammate.id) ? 'online' : 'offline'}" id="dm-header-presence-dot"></span>
              </div>
              <div class="dm-header-info">
                <div class="dm-header-title-row">
                  <span class="dm-header-title">${escapeHtml(channelTitle)}</span>
                  ${dmTeammate?.username ? `<span class="dm-header-handle">@${escapeHtml(dmTeammate.username)}</span>` : ''}
                  <span class="dm-privacy-pill" title="End-to-end private conversation. Only you and this teammate have access.">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                      <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                    </svg>
                    Direct Message
                  </span>
                </div>
                <div class="dm-header-status-row">
                  <span class="presence-dot ${dmTeammate?.id && onlineUsersSet.has(dmTeammate.id) ? 'online' : 'offline'}"></span>
                  <span id="dm-header-status-text">${dmTeammate?.id && onlineUsersSet.has(dmTeammate.id) ? 'Active now' : 'Offline'}</span>
                </div>
              </div>
            </div>
            <div class="dm-header-right">
              <button type="button" class="dm-profile-btn" id="dm-view-profile-btn" title="View teammate profile">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                  <circle cx="12" cy="7" r="4"></circle>
                </svg>
                <span>View Profile</span>
              </button>
            </div>
          </header>
        `
            : `
          <header style="display:flex;align-items:center;justify-content:space-between;padding:12px 18px;border-bottom:1px solid #EAECF0;background:#ffffff;flex-shrink:0;">
            <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;min-width:0;flex:1;">
              <span class="channel-header-workspace-badge" style="display:inline-flex;padding:3px 8px;border-radius:6px;background:#FFF4ED;color:#FF6A00;font-size:12px;font-weight:700;">
                ${escapeHtml(window.HuddleApi.getActiveWorkspaceName() || 'Workspace')}
              </span>
              <div style="display:flex;align-items:center;gap:8px;min-width:0;">
                <span style="font-size:18px;font-weight:700;color:#101828;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(channelTitle)}</span>
              </div>
              ${channel.topic ? `<span style="font-size:13px;color:#667085;border-left:1px solid #EAECF0;padding-left:8px;">${escapeHtml(channel.topic)}</span>` : ''}
            </div>
            <div style="display:flex;align-items:center;gap:10px;">
              <button type="button" id="channel-members-count-btn" class="channel-member-pill" title="View channel members">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                  <circle cx="9" cy="7" r="4"></circle>
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                  <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                </svg>
                <span id="channel-members-count-text">Members</span>
                <span id="channel-online-count-badge" style="font-size:11px;color:#12B76A;font-weight:600;margin-left:4px;"></span>
              </button>
              <button type="button" id="channel-invite-btn" title="Add user to #${escapeHtml(channel.name)}" style="display:inline-flex;align-items:center;gap:6px;padding:8px 16px;background:#FF6A00;color:#ffffff;border:none;border-radius:10px;font-size:13px;font-weight:600;cursor:pointer;transition:background 0.15s ease;">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                  <circle cx="8.5" cy="7.5" r="4"></circle>
                  <line x1="20" y1="8" x2="20" y2="14"></line>
                  <line x1="23" y1="11" x2="17" y2="11"></line>
                </svg>
                <span>+ Add</span>
              </button>
            </div>
          </header>
        `
        }

        <!-- Channel Chat Messages Area -->
        <div id="channel-messages-container" style="flex:1;overflow-y:auto;padding:24px;display:flex;flex-direction:column;gap:12px;">
          <!-- Welcome Box -->
          ${
            isDm
              ? `
            <div class="dm-welcome-hero">
              <div class="dm-welcome-avatar-wrap">
                ${
                  dmTeammate?.avatar_url
                    ? `<img src="${escapeHtml(dmTeammate.avatar_url)}" alt="" class="dm-welcome-avatar-img" />`
                    : `<div class="dm-welcome-avatar-initials">${escapeHtml((channelTitle || 'T').charAt(0).toUpperCase())}</div>`
                }
                <span class="presence-dot ${dmTeammate?.id && onlineUsersSet.has(dmTeammate.id) ? 'online' : 'offline'}"></span>
              </div>
              <h3 class="dm-welcome-title">${escapeHtml(channelTitle)}</h3>
              <p class="dm-welcome-subtitle">
                This conversation is strictly private between you and <strong>${escapeHtml(channelTitle)}</strong>.
                Messages and attachments shared here are end-to-end confidential and cannot be read by anyone else in the workspace.
              </p>
              <div class="dm-security-badge">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                  <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                </svg>
                <span>End-to-End Private & Encrypted in Transit — Workspace Admins cannot access your DMs.</span>
              </div>
            </div>
          `
              : `
            <div style="background:#F9FAFB;border:1px solid #EAECF0;border-radius:12px;padding:18px 22px;margin-bottom:8px;">
              <div style="font-size:22px;margin-bottom:4px;">👋</div>
              <h3 style="font-size:16px;font-weight:700;color:#101828;margin-bottom:4px;">${escapeHtml(channelTitle)}</h3>
              <p style="font-size:13.5px;color:#667085;line-height:1.5;">This is the start of #${escapeHtml(channel.name)}. Share messages and collaborate.</p>
            </div>
          `
          }

          <!-- Messages Stream with Skeletons initially -->
          <div id="messages-list" style="display:flex;flex-direction:column;gap:8px;flex:1;">
            <div style="display:flex;flex-direction:column;gap:16px;padding:12px 0;">
              <div style="display:flex;gap:12px;align-items:center;">
                <div class="skeleton-box" style="width:36px;height:36px;border-radius:50%;"></div>
                <div style="display:flex;flex-direction:column;gap:6px;flex:1;">
                  <div class="skeleton-box" style="width:120px;height:12px;"></div>
                  <div class="skeleton-box" style="width:70%;height:14px;"></div>
                </div>
              </div>
              <div style="display:flex;gap:12px;align-items:center;">
                <div class="skeleton-box" style="width:36px;height:36px;border-radius:50%;"></div>
                <div style="display:flex;flex-direction:column;gap:6px;flex:1;">
                  <div class="skeleton-box" style="width:140px;height:12px;"></div>
                  <div class="skeleton-box" style="width:85%;height:14px;"></div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Composer Area with Typing Indicator -->
        <div class="chat-composer-outer-wrapper" style="padding:10px 24px 20px;border-top:1px solid #EAECF0;background:#ffffff;flex-shrink:0;position:relative;">
          <div id="typing-indicator-bar" class="typing-bar"></div>

          <!-- Staged Attachment Preview Chip -->
          <div id="chat-attachment-preview-bar" class="chat-attachment-preview-bar" style="display:none;">
            <div class="chat-attachment-preview-thumb-wrap">
              <img id="chat-attachment-preview-img" src="" alt="Preview" />
            </div>
            <div class="chat-attachment-preview-info">
              <span id="chat-attachment-preview-name" class="chat-attachment-preview-name">image.png</span>
              <span id="chat-attachment-preview-size" class="chat-attachment-preview-size">0 KB</span>
            </div>
            <button type="button" id="chat-attachment-remove-btn" class="chat-attachment-remove-btn" title="Remove attachment" aria-label="Remove attachment">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>

          <!-- Floating Classic Emoji Popover -->
          <div id="chat-emoji-popover" class="chat-emoji-popover" style="display:none;" role="dialog" aria-label="Emoji Picker">
            <!-- Search Header -->
            <div class="chat-emoji-search-wrap">
              <svg class="chat-emoji-search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="11" cy="11" r="8"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              </svg>
              <input type="text" id="chat-emoji-search-input" class="chat-emoji-search-input" placeholder="Search emoji..." autocomplete="off" />
              <button type="button" id="chat-emoji-close-btn" class="chat-emoji-close-btn" title="Close emoji picker">&times;</button>
            </div>

            <!-- Category Navigation Tabs -->
            <div class="chat-emoji-tabs-bar" id="chat-emoji-tabs-bar"></div>

            <!-- Scrollable Emoji Grid Body -->
            <div class="chat-emoji-body" id="chat-emoji-body"></div>

            <!-- Classic Footer with Live Preview -->
            <div class="chat-emoji-footer" id="chat-emoji-footer">
              <span id="chat-emoji-preview-char" class="chat-emoji-preview-char">😀</span>
              <div class="chat-emoji-preview-text">
                <span id="chat-emoji-preview-name" class="chat-emoji-preview-name">:grinning:</span>
                <span id="chat-emoji-preview-sub" class="chat-emoji-preview-sub">Grinning Face</span>
              </div>
            </div>
          </div>

          <form id="channel-chat-form" class="channel-chat-form" style="display:flex;align-items:center;gap:8px;background:#F9FAFB;border:1px solid #D0D5DD;border-radius:12px;padding:6px 10px;transition:border-color 0.15s ease;">
            
            <!-- Left Tools (Image Attachment + Emoji) -->
            <div style="display:flex;align-items:center;gap:2px;">
              <!-- Add Image Button -->
              <button
                type="button"
                id="chat-attach-btn"
                class="chat-composer-tool-btn"
                title="Add image"
                aria-label="Add image"
              >
                <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="3" ry="3"></rect>
                  <circle cx="8.5" cy="8.5" r="1.5"></circle>
                  <polyline points="21 15 16 10 5 21"></polyline>
                </svg>
              </button>
              <input type="file" id="channel-chat-file-input" accept="image/*" style="display:none;" />

              <!-- Add Emoji Button -->
              <button
                type="button"
                id="chat-emoji-btn"
                class="chat-composer-tool-btn"
                title="Add emoji"
                aria-label="Add emoji"
              >
                <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="12" cy="12" r="10"></circle>
                  <path d="M8 14s1.5 2 4 2 4-2 4-2"></path>
                  <line x1="9" y1="9" x2="9.01" y2="9" stroke-width="2.6"></line>
                  <line x1="15" y1="9" x2="15.01" y2="9" stroke-width="2.6"></line>
                </svg>
              </button>
            </div>

            <!-- Input Box -->
            <input
              type="text"
              id="channel-chat-input"
              placeholder="${isDm ? `Message ${escapeHtml(channelTitle)}...` : `Message #${escapeHtml(channel.name)}...`}"
              autocomplete="off"
              style="flex:1;border:none;background:transparent;outline:none;font-size:14px;color:#101828;padding:6px 4px;"
            />

            <!-- Send Button -->
            <button
              type="submit"
              id="channel-chat-send-btn"
              style="background:#FF6A00;color:#ffffff;border:none;border-radius:8px;padding:7px 14px;font-size:13px;font-weight:600;cursor:pointer;display:inline-flex;align-items:center;gap:6px;transition:background 0.15s ease;flex-shrink:0;"
            >
              <span>Send</span>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <line x1="22" y1="2" x2="11" y2="13"></line>
                <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
              </svg>
            </button>
          </form>
        </div>
      </div>
    `;

    const messagesContainer = document.getElementById('channel-messages-container');
    const messagesList = document.getElementById('messages-list');
    const chatForm = document.getElementById('channel-chat-form');
    const chatInput = document.getElementById('channel-chat-input');
    const inviteBtn = document.getElementById('channel-invite-btn');
    const membersCountBtn = document.getElementById('channel-members-count-btn');
    const membersCountText = document.getElementById('channel-members-count-text');

    // Composer elements
    let stagedImageFile = null;
    const attachBtn = document.getElementById('chat-attach-btn');
    const fileInput = document.getElementById('channel-chat-file-input');
    const previewBar = document.getElementById('chat-attachment-preview-bar');
    const previewImg = document.getElementById('chat-attachment-preview-img');
    const previewName = document.getElementById('chat-attachment-preview-name');
    const previewSize = document.getElementById('chat-attachment-preview-size');
    const removeAttachmentBtn = document.getElementById('chat-attachment-remove-btn');
    const emojiBtn = document.getElementById('chat-emoji-btn');
    const emojiPopover = document.getElementById('chat-emoji-popover');
    const emojiBody = document.getElementById('chat-emoji-body');
    const emojiCloseBtn = document.getElementById('chat-emoji-close-btn');
    const emojiSearchInput = document.getElementById('chat-emoji-search-input');
    const emojiTabsBar = document.getElementById('chat-emoji-tabs-bar');
    const emojiPreviewChar = document.getElementById('chat-emoji-preview-char');
    const emojiPreviewName = document.getElementById('chat-emoji-preview-name');
    const emojiPreviewSub = document.getElementById('chat-emoji-preview-sub');

    // Classic Emoji Catalog
    const CLASSIC_EMOJI_CATEGORIES = [
      {
        id: 'smileys',
        icon: '😀',
        name: 'Smileys & Emotion',
        items: [
          { e: '😀', n: 'grinning face', k: 'smile happy joy' },
          { e: '😃', n: 'grinning face big eyes', k: 'happy joy smile' },
          { e: '😄', n: 'grinning smiling eyes', k: 'happy joy smile' },
          { e: '😁', n: 'beaming face', k: 'grin teeth' },
          { e: '😆', n: 'grinning squinting', k: 'laugh haha' },
          { e: '😅', n: 'face with sweat', k: 'nervous relief' },
          { e: '🤣', n: 'rolling laughing', k: 'rofl lol haha' },
          { e: '😂', n: 'tears of joy', k: 'cry laugh haha lol' },
          { e: '🙂', n: 'slightly smiling', k: 'smile' },
          { e: '🙃', n: 'upside-down face', k: 'silly sarcastic' },
          { e: '😉', n: 'winking face', k: 'wink flirt' },
          { e: '😊', n: 'smiling blushing', k: 'blush smile' },
          { e: '😇', n: 'smiling with halo', k: 'angel innocent' },
          { e: '🥰', n: 'smiling with hearts', k: 'love adore affection' },
          { e: '😍', n: 'heart eyes', k: 'love crush' },
          { e: '🤩', n: 'star-struck', k: 'excited star eyes' },
          { e: '😘', n: 'blowing kiss', k: 'kiss love' },
          { e: '😋', n: 'savoring food', k: 'yum delicious' },
          { e: '😜', n: 'winking with tongue', k: 'crazy silly' },
          { e: '🤪', n: 'zany face', k: 'goofy wild' },
          { e: '🤑', n: 'money mouth', k: 'rich cash dollar' },
          { e: '🤗', n: 'hugging face', k: 'hug embrace' },
          { e: '🤫', n: 'shushing face', k: 'quiet silence' },
          { e: '🤔', n: 'thinking face', k: 'ponder doubt hmm' },
          { e: '🤐', n: 'zipper mouth', k: 'secret silent' },
          { e: '😏', n: 'smirking face', k: 'smug cheeky' },
          { e: '😒', n: 'unamused face', k: 'bored meh' },
          { e: '🙄', n: 'rolling eyes', k: 'eyeroll whatever' },
          { e: '😬', n: 'grimacing face', k: 'awkward eek' },
          { e: '😌', n: 'relieved face', k: 'peace calm' },
          { e: '😴', n: 'sleeping face', k: 'zzz sleep tired' },
          { e: '😷', n: 'medical mask', k: 'sick health' },
          { e: '🥵', n: 'hot face', k: 'heat summer sweat' },
          { e: '🥶', n: 'cold face', k: 'winter freeze ice' },
          { e: '🤯', n: 'exploding head', k: 'mind blown shock' },
          { e: '🥳', n: 'partying face', k: 'celebrate birthday' },
          { e: '😎', n: 'sunglasses', k: 'cool chill rad' },
          { e: '🤓', n: 'nerd face', k: 'geek glasses smart' },
          { e: '🧐', n: 'face with monocle', k: 'fancy inspect' },
          { e: '🥺', n: 'pleading face', k: 'puppy eyes please' },
          { e: '😢', n: 'crying face', k: 'tear sad upset' },
          { e: '😭', n: 'loudly crying', k: 'sob heartbroken' },
          { e: '😱', n: 'screaming in fear', k: 'scream terror omg' },
          { e: '😡', n: 'pouting angry', k: 'mad rage red' },
          { e: '🤬', n: 'cursing face', k: 'swear angry mad' },
          { e: '💀', n: 'skull', k: 'dead lol dying' },
          { e: '💩', n: 'pile of poo', k: 'poop funny' },
          { e: '🤡', n: 'clown face', k: 'circus fool' },
          { e: '👻', n: 'ghost', k: 'spooky halloween' },
          { e: '👽', n: 'alien', k: 'ufo extraterrestrial' },
          { e: '🤖', n: 'robot', k: 'bot ai android' },
        ],
      },
      {
        id: 'people',
        icon: '👋',
        name: 'People & Gestures',
        items: [
          { e: '👋', n: 'waving hand', k: 'wave hello goodbye' },
          { e: '🖐️', n: 'hand splayed', k: 'high five five' },
          { e: '✋', n: 'raised hand', k: 'stop high five' },
          { e: '🖖', n: 'vulcan salute', k: 'spock peace' },
          { e: '👌', n: 'OK hand', k: 'perfect ok good' },
          { e: '🤌', n: 'pinched fingers', k: 'italian chef gesture' },
          { e: '🤏', n: 'pinching hand', k: 'small little bit' },
          { e: '✌️', n: 'victory peace', k: 'peace two win' },
          { e: '🤞', n: 'crossed fingers', k: 'luck hope wish' },
          { e: '🤟', n: 'love you gesture', k: 'ily love' },
          { e: '🤘', n: 'sign of horns', k: 'rock metal' },
          { e: '🤙', n: 'call me', k: 'shaka phone hang loose' },
          { e: '👈', n: 'pointing left', k: 'point left' },
          { e: '👉', n: 'pointing right', k: 'point right' },
          { e: '👆', n: 'pointing up', k: 'point up' },
          { e: '👇', n: 'pointing down', k: 'point down' },
          { e: '👍', n: 'thumbs up', k: 'like agree yes approve good' },
          { e: '👎', n: 'thumbs down', k: 'dislike bad no' },
          { e: '✊', n: 'raised fist', k: 'power solidarity' },
          { e: '👊', n: 'oncoming fist', k: 'punch fist bump' },
          { e: '🤛', n: 'left fist', k: 'fist bump' },
          { e: '🤜', n: 'right fist', k: 'fist bump' },
          { e: '👏', n: 'clapping hands', k: 'applause bravo praise' },
          { e: '🙌', n: 'raising hands', k: 'celebrate hooray praise' },
          { e: '🤝', n: 'handshake', k: 'deal agreement meet partner' },
          { e: '🙏', n: 'folded hands', k: 'please thank you pray namaste' },
          { e: '✍️', n: 'writing hand', k: 'write note sign' },
          { e: '💪', n: 'flexed biceps', k: 'strong muscle fitness power' },
          { e: '👀', n: 'eyes', k: 'look see watch inspect' },
          { e: '👁️', n: 'eye', k: 'look vision see' },
          { e: '🧠', n: 'brain', k: 'smart idea intelligence' },
        ],
      },
      {
        id: 'animals',
        icon: '🐶',
        name: 'Animals & Nature',
        items: [
          { e: '🐶', n: 'dog', k: 'puppy pet bark' },
          { e: '🐱', n: 'cat', k: 'kitten pet meow' },
          { e: '🐭', n: 'mouse', k: 'rodent' },
          { e: '🐰', n: 'rabbit', k: 'bunny pet' },
          { e: '🦊', n: 'fox', k: 'animal clever' },
          { e: '🐻', n: 'bear', k: 'grizzly wild' },
          { e: '🐼', n: 'panda', k: 'bear china' },
          { e: '🐨', n: 'koala', k: 'australia' },
          { e: '🦁', n: 'lion', k: 'king wild roar' },
          { e: '🐮', n: 'cow', k: 'milk farm moo' },
          { e: '🐷', n: 'pig', k: 'oink farm' },
          { e: '🐸', n: 'frog', k: 'pond amphibian' },
          { e: '🐵', n: 'monkey', k: 'primate jungle' },
          { e: '🐔', n: 'chicken', k: 'poultry rooster farm' },
          { e: '🐧', n: 'penguin', k: 'antarctic bird' },
          { e: '🐦', n: 'bird', k: 'fly tweet' },
          { e: '🦉', n: 'owl', k: 'wise night bird' },
          { e: '🐺', n: 'wolf', k: 'howl pack wild' },
          { e: '🦄', n: 'unicorn', k: 'magic fantasy horse' },
          { e: '🐝', n: 'honeybee', k: 'bee honey sting' },
          { e: '🦋', n: 'butterfly', k: 'wings insect pretty' },
          { e: '🌸', n: 'cherry blossom', k: 'flower pink spring' },
          { e: '🌹', n: 'rose', k: 'flower red romantic love' },
          { e: '🌻', n: 'sunflower', k: 'flower yellow summer' },
          { e: '🌱', n: 'seedling', k: 'plant sprout grow' },
          { e: '🌲', n: 'evergreen tree', k: 'pine forest nature' },
          { e: '🌴', n: 'palm tree', k: 'beach tropical summer' },
          { e: '🍀', n: 'four leaf clover', k: 'luck irish shamrock' },
        ],
      },
      {
        id: 'food',
        icon: '🍔',
        name: 'Food & Drink',
        items: [
          { e: '🍎', n: 'red apple', k: 'fruit healthy' },
          { e: '🍌', n: 'banana', k: 'fruit yellow' },
          { e: '🍉', n: 'watermelon', k: 'fruit summer' },
          { e: '🍇', n: 'grapes', k: 'fruit wine' },
          { e: '🍓', n: 'strawberry', k: 'berry fruit red' },
          { e: '🥑', n: 'avocado', k: 'healthy guacamole' },
          { e: '🍕', n: 'pizza', k: 'cheese italian slice' },
          { e: '🍔', n: 'hamburger', k: 'burger beef fast food' },
          { e: '🍟', n: 'french fries', k: 'fries potato fast food' },
          { e: '🌭', n: 'hot dog', k: 'sausage fast food' },
          { e: '🌮', n: 'taco', k: 'mexican food' },
          { e: '🍜', n: 'ramen', k: 'noodles soup asian' },
          { e: '🍣', n: 'sushi', k: 'japanese fish rice' },
          { e: '🍦', n: 'ice cream', k: 'dessert sweet cone' },
          { e: '🍰', n: 'shortcake', k: 'cake sweet dessert' },
          { e: '🍩', n: 'doughnut', k: 'donut sweet pastry' },
          { e: '🍪', n: 'cookie', k: 'chocolate snack sweet' },
          { e: '🍿', n: 'popcorn', k: 'movie snack cinema' },
          { e: '☕', n: 'coffee', k: 'tea cafe morning drink' },
          { e: '🍵', n: 'tea', k: 'green tea matcha' },
          { e: '🥤', n: 'soda', k: 'drink cup straw' },
          { e: '🍺', n: 'beer', k: 'beer pub alcohol drink' },
          { e: '🍻', n: 'cheers beers', k: 'pub alcohol drink party' },
          { e: '🍷', n: 'wine', k: 'red wine alcohol drink' },
          { e: '🥂', n: 'clinking glasses', k: 'champagne celebrate toast' },
        ],
      },
      {
        id: 'activity',
        icon: '⚽',
        name: 'Activities & Sports',
        items: [
          { e: '⚽', n: 'soccer ball', k: 'football sport match' },
          { e: '🏀', n: 'basketball', k: 'hoop nba sport' },
          { e: '🏈', n: 'american football', k: 'nfl superbowl sport' },
          { e: '⚾', n: 'baseball', k: 'sport bat' },
          { e: '🎾', n: 'tennis', k: 'sport court racket' },
          { e: '🏐', n: 'volleyball', k: 'sport beach' },
          { e: '🎱', n: 'pool 8 ball', k: 'billiards game eight' },
          { e: '🏓', n: 'ping pong', k: 'table tennis' },
          { e: '🥊', n: 'boxing glove', k: 'fight sport ring' },
          { e: '🎯', n: 'bullseye', k: 'target dart goal' },
          { e: '🎮', n: 'video game', k: 'controller gaming xbox playstation' },
          { e: '🎲', n: 'game die', k: 'dice board game roll' },
          { e: '🏆', n: 'trophy', k: 'winner prize first champion' },
          { e: '🥇', n: '1st place medal', k: 'gold first prize winner' },
          { e: '🥈', n: '2nd place medal', k: 'silver prize second' },
          { e: '🥉', n: '3rd place medal', k: 'bronze prize third' },
          { e: '🎨', n: 'palette', k: 'paint art draw creative' },
          { e: '🎬', n: 'clapper board', k: 'film movie cinema' },
          { e: '🎤', n: 'microphone', k: 'sing music podcast' },
          { e: '🎧', n: 'headphone', k: 'music audio listen sound' },
          { e: '🎸', n: 'guitar', k: 'rock acoustic music' },
        ],
      },
      {
        id: 'travel',
        icon: '🚀',
        name: 'Travel & Places',
        items: [
          { e: '🚗', n: 'car', k: 'vehicle drive ride' },
          { e: '🚕', n: 'taxi', k: 'cab ride yellow' },
          { e: '🚌', n: 'bus', k: 'transit vehicle' },
          { e: '🏎️', n: 'racing car', k: 'f1 speed race' },
          { e: '🚓', n: 'police car', k: 'cop siren 911' },
          { e: '🚲', n: 'bicycle', k: 'bike cycling ride' },
          { e: '✈️', n: 'airplane', k: 'flight travel fly airport' },
          { e: '🚀', n: 'rocket', k: 'space launch blastoff moon' },
          { e: '🛸', n: 'flying saucer', k: 'ufo alien space' },
          { e: '⛵', n: 'sailboat', k: 'boat sea water ocean' },
          { e: '🏖️', n: 'beach', k: 'vacation umbrella summer sea' },
          { e: '🏕️', n: 'camping', k: 'tent forest campfire' },
          { e: '🏔️', n: 'mountain', k: 'peak snow climb' },
          { e: '🏠', n: 'house', k: 'home building' },
          { e: '🏢', n: 'office building', k: 'work company building' },
          { e: '🗽', n: 'Statue of Liberty', k: 'nyc new york america' },
        ],
      },
      {
        id: 'objects',
        icon: '💡',
        name: 'Objects',
        items: [
          { e: '💻', n: 'laptop', k: 'computer tech mac pc coding work' },
          { e: '🖥️', n: 'desktop computer', k: 'screen monitor pc tech' },
          { e: '📱', n: 'mobile phone', k: 'smartphone iphone call' },
          { e: '⌨️', n: 'keyboard', k: 'typing tech' },
          { e: '💡', n: 'light bulb', k: 'idea insight smart bright solution' },
          { e: '📖', n: 'open book', k: 'read learn study' },
          { e: '📝', n: 'memo', k: 'note write paper document' },
          { e: '📌', n: 'pushpin', k: 'pin location notice' },
          { e: '📍', n: 'round pushpin', k: 'map location here' },
          { e: '📎', n: 'paperclip', k: 'attach office document' },
          { e: '🔑', n: 'key', k: 'lock password access secret' },
          { e: '🔒', n: 'locked', k: 'secure private safe' },
          { e: '🔔', n: 'bell', k: 'notification alert ring' },
          { e: '📦', n: 'package', k: 'box parcel delivery' },
          { e: '🎁', n: 'gift', k: 'present birthday surprise' },
          { e: '🎉', n: 'party popper', k: 'tada celebrate congrats party' },
          { e: '🎈', n: 'balloon', k: 'birthday float party' },
          { e: '✉️', n: 'envelope', k: 'letter mail message' },
          { e: '📅', n: 'calendar', k: 'date schedule day event' },
          { e: '⏰', n: 'alarm clock', k: 'time morning' },
          { e: '💰', n: 'money bag', k: 'dollar rich cash' },
          { e: '💎', n: 'gem stone', k: 'diamond jewel luxury' },
        ],
      },
      {
        id: 'symbols',
        icon: '❤️',
        name: 'Symbols & Hearts',
        items: [
          { e: '❤️', n: 'red heart', k: 'love affection passion favorite' },
          { e: '🧡', n: 'orange heart', k: 'love warmth' },
          { e: '💛', n: 'yellow heart', k: 'love friendship happy' },
          { e: '💚', n: 'green heart', k: 'love nature eco' },
          { e: '💙', n: 'blue heart', k: 'love calm peace trust' },
          { e: '💜', n: 'purple heart', k: 'love royal luxury' },
          { e: '🖤', n: 'black heart', k: 'love dark gothic' },
          { e: '🤍', n: 'white heart', k: 'love pure peace' },
          { e: '💔', n: 'broken heart', k: 'heartbreak sad分手' },
          { e: '💕', n: 'two hearts', k: 'love sweet affection' },
          { e: '💖', n: 'sparkling heart', k: 'love magic special glitter' },
          { e: '🔥', n: 'fire', k: 'flame hot lit trendy burn' },
          { e: '✨', n: 'sparkles', k: 'stars magic shine clean new' },
          { e: '⭐', n: 'star', k: 'favorite gold night' },
          { e: '🌟', n: 'glowing star', k: 'shine bright highlight' },
          { e: '⚡', n: 'high voltage', k: 'lightning bolt zap energy fast' },
          { e: '💥', n: 'collision', k: 'boom bang explosion pop' },
          { e: '💯', n: 'hundred points', k: '100 perfect score keep it real' },
          { e: '✅', n: 'check mark', k: 'yes done complete correct ok' },
          { e: '❌', n: 'cross mark', k: 'no wrong cancel delete' },
          { e: '⚠️', n: 'warning', k: 'caution alert danger' },
          { e: '❓', n: 'question mark', k: 'what help wonder ask' },
          { e: '❗', n: 'exclamation mark', k: 'important alert notice' },
        ],
      },
    ];

    let activeCategoryTab = 'smileys';

    function renderClassicTabs() {
      if (!emojiTabsBar) return;
      emojiTabsBar.innerHTML = CLASSIC_EMOJI_CATEGORIES.map(
        (cat) => `
          <button type="button" class="chat-emoji-tab-btn ${cat.id === activeCategoryTab ? 'active' : ''}" data-cat-id="${cat.id}" title="${escapeHtml(cat.name)}">
            ${cat.icon}
          </button>
        `,
      ).join('');

      emojiTabsBar.querySelectorAll('.chat-emoji-tab-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          const catId = btn.dataset.catId;
          activeCategoryTab = catId;
          emojiTabsBar.querySelectorAll('.chat-emoji-tab-btn').forEach((b) => b.classList.toggle('active', b.dataset.catId === catId));
          const targetSection = document.getElementById(`emoji-sec-${catId}`);
          if (targetSection && emojiBody) {
            targetSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
        });
      });
    }

    function renderClassicEmojiBody(filterQuery = '') {
      if (!emojiBody) return;
      const q = filterQuery.toLowerCase().trim();

      if (!q) {
        // Render all categorized sections
        emojiBody.innerHTML = CLASSIC_EMOJI_CATEGORIES.map(
          (cat) => `
            <div class="chat-emoji-cat-section" id="emoji-sec-${cat.id}">
              <div class="chat-emoji-cat-title">${escapeHtml(cat.name)}</div>
              <div class="chat-emoji-grid">
                ${cat.items
                  .map(
                    (it) => `
                  <button type="button" class="chat-emoji-cell" data-emoji="${it.e}" data-name="${escapeHtml(it.n)}" title="${escapeHtml(it.n)}">
                    ${it.e}
                  </button>
                `,
                  )
                  .join('')}
              </div>
            </div>
          `,
        ).join('');
      } else {
        // Filtered search mode
        const matches = [];
        CLASSIC_EMOJI_CATEGORIES.forEach((cat) => {
          cat.items.forEach((it) => {
            if (it.n.toLowerCase().includes(q) || it.k.toLowerCase().includes(q)) {
              matches.push(it);
            }
          });
        });

        if (matches.length === 0) {
          emojiBody.innerHTML = `
            <div style="text-align:center;padding:24px 10px;color:#98A2B3;font-size:13px;">
              No emojis found for "${escapeHtml(filterQuery)}"
            </div>
          `;
        } else {
          emojiBody.innerHTML = `
            <div class="chat-emoji-cat-section">
              <div class="chat-emoji-cat-title">Search Results (${matches.length})</div>
              <div class="chat-emoji-grid">
                ${matches
                  .map(
                    (it) => `
                  <button type="button" class="chat-emoji-cell" data-emoji="${it.e}" data-name="${escapeHtml(it.n)}" title="${escapeHtml(it.n)}">
                    ${it.e}
                  </button>
                `,
                  )
                  .join('')}
              </div>
            </div>
          `;
        }
      }

      // Attach hover preview listeners
      emojiBody.querySelectorAll('.chat-emoji-cell').forEach((cell) => {
        cell.addEventListener('mouseenter', () => {
          const em = cell.dataset.emoji;
          const nm = cell.dataset.name || '';
          if (emojiPreviewChar) emojiPreviewChar.textContent = em;
          if (emojiPreviewName) emojiPreviewName.textContent = `:${nm.replace(/\s+/g, '_')}:`;
          if (emojiPreviewSub) emojiPreviewSub.textContent = nm.charAt(0).toUpperCase() + nm.slice(1);
        });
      });
    }

    // Initialize classic emoji components
    renderClassicTabs();
    renderClassicEmojiBody();

    // Search input listener
    if (emojiSearchInput) {
      emojiSearchInput.addEventListener('input', (e) => {
        renderClassicEmojiBody(e.target.value);
      });
    }

    // Click emoji to insert into chat input
    if (emojiBody) {
      emojiBody.addEventListener('click', (e) => {
        const btn = e.target.closest('.chat-emoji-cell');
        if (!btn) return;
        const emoji = btn.dataset.emoji;
        if (!emoji || !chatInput) return;
        const start = chatInput.selectionStart ?? chatInput.value.length;
        const end = chatInput.selectionEnd ?? chatInput.value.length;
        const val = chatInput.value;
        chatInput.value = val.substring(0, start) + emoji + val.substring(end);
        chatInput.focus();
        const newPos = start + emoji.length;
        chatInput.setSelectionRange(newPos, newPos);
      });
    }

    // Toggle popover trigger
    if (emojiBtn && emojiPopover) {
      emojiBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = emojiPopover.style.display === 'flex';
        emojiPopover.style.display = isOpen ? 'none' : 'flex';
        emojiBtn.classList.toggle('active', !isOpen);
        if (!isOpen) {
          if (emojiSearchInput) {
            emojiSearchInput.value = '';
            renderClassicEmojiBody('');
            setTimeout(() => emojiSearchInput.focus(), 50);
          }
        }
      });

      if (emojiCloseBtn) {
        emojiCloseBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          emojiPopover.style.display = 'none';
          emojiBtn.classList.remove('active');
        });
      }

      document.addEventListener('click', (e) => {
        if (emojiPopover && emojiPopover.style.display === 'flex') {
          if (!emojiPopover.contains(e.target) && e.target !== emojiBtn && !emojiBtn.contains(e.target)) {
            emojiPopover.style.display = 'none';
            emojiBtn.classList.remove('active');
          }
        }
      });

      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && emojiPopover && emojiPopover.style.display === 'flex') {
          emojiPopover.style.display = 'none';
          emojiBtn.classList.remove('active');
          chatInput?.focus();
        }
      });
    }

    // Attachment file input trigger & preview
    if (attachBtn && fileInput) {
      attachBtn.addEventListener('click', () => {
        fileInput.click();
      });

      fileInput.addEventListener('change', () => {
        const file = fileInput.files?.[0];
        if (!file) return;
        if (file.size > 25 * 1024 * 1024) {
          window.showHuddleToast('Image size exceeds 25MB limit.', 'error');
          fileInput.value = '';
          return;
        }
        stagedImageFile = file;
        const reader = new FileReader();
        reader.onload = (e) => {
          if (previewImg) previewImg.src = e.target.result;
          if (previewName) previewName.textContent = file.name;
          if (previewSize) {
            const kb = Math.round(file.size / 1024);
            previewSize.textContent = kb > 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${kb} KB`;
          }
          if (previewBar) previewBar.style.display = 'flex';
          chatInput?.focus();
        };
        reader.readAsDataURL(file);
      });
    }

    if (removeAttachmentBtn) {
      removeAttachmentBtn.addEventListener('click', () => {
        stagedImageFile = null;
        if (fileInput) fileInput.value = '';
        if (previewBar) previewBar.style.display = 'none';
        if (previewImg) previewImg.src = '';
      });
    }

    if (inviteBtn) {
      inviteBtn.addEventListener('click', () => {
        openAddMemberModal(channel);
      });
    }

    async function loadChannelMembers() {
      if (isDm) return [];
      try {
        const members = await window.HuddleApi.channels.getMembers(channel.id);
        currentChannelMembers = members || [];
        if (membersCountText && Array.isArray(members)) {
          membersCountText.textContent = `${members.length} Member${members.length === 1 ? '' : 's'}`;
        }
        updateAllPresenceDots();
        return members;
      } catch {
        return [];
      }
    }

    if (membersCountBtn) {
      membersCountBtn.addEventListener('click', async () => {
        const members = await loadChannelMembers();
        if (!members || members.length === 0) return;
        const membersListStr = members
          .map((m) => {
            const isOnline = onlineUsersSet.has(m.userId || m.id);
            return `• ${m.fullName || 'Member'} (@${m.username || 'user'}) — ${isOnline ? '🟢 Online' : '⚪ Offline'}`;
          })
          .join('\n');
        showActionDialog(`Channel Members (${members.length})`, membersListStr);
      });
    }

    const dmProfileBtn = document.getElementById('dm-view-profile-btn');
    if (dmProfileBtn && dmTeammate) {
      dmProfileBtn.addEventListener('click', () => {
        const isOnline = dmTeammate.id && onlineUsersSet.has(dmTeammate.id);
        const details = [
          `Name: ${dmTeammate.full_name || dmTeammate.username || 'Teammate'}`,
          `Username: @${dmTeammate.username || 'user'}`,
          `Email: ${dmTeammate.email || 'Not available'}`,
          `Status: ${isOnline ? 'Active now' : 'Offline'}`,
          `\n🔒 Security: This conversation is strictly 1-on-1 private. Only you and this teammate have access to messages and shared media.`
        ].join('\n');
        showActionDialog(`Teammate Profile`, details);
      });
    }

    if (!isDm) {
      loadChannelMembers();
    }

    // Typing emission listener
    if (chatInput) {
      chatInput.addEventListener('input', () => {
        if (!isTypingSelf && socket) {
          socket.emit('typing:start', { channelId: channel.id });
          isTypingSelf = true;
        }
        clearTimeout(typingSelfTimeout);
        typingSelfTimeout = setTimeout(() => {
          if (isTypingSelf && socket) {
            socket.emit('typing:stop', { channelId: channel.id });
            isTypingSelf = false;
          }
        }, 2000);
      });
    }

    // Chat submit
    if (chatForm && chatInput) {
      chatForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const text = chatInput.value.trim();
        if (!text && !stagedImageFile) return;

        const sendBtn = document.getElementById('channel-chat-send-btn');
        const origBtnContent = sendBtn ? sendBtn.innerHTML : 'Send';
        if (sendBtn) {
          sendBtn.disabled = true;
          sendBtn.innerHTML = `<span>${stagedImageFile ? 'Uploading...' : 'Sending...'}</span>`;
        }

        let uploadedAttachments = null;

        try {
          if (stagedImageFile) {
            const uploadRes = await window.HuddleApi.uploads.uploadFile(stagedImageFile);
            if (uploadRes && uploadRes.url) {
              uploadedAttachments = [
                {
                  url: uploadRes.url,
                  file_name: uploadRes.file_name || stagedImageFile.name,
                  file_size: uploadRes.file_size || stagedImageFile.size,
                  file_type: uploadRes.file_type || stagedImageFile.type || 'image/png',
                },
              ];
            }
          }

          chatInput.value = '';
          stagedImageFile = null;
          if (fileInput) fileInput.value = '';
          if (previewBar) previewBar.style.display = 'none';
          if (previewImg) previewImg.src = '';
          if (emojiPopover) {
            emojiPopover.style.display = 'none';
            emojiBtn?.classList.remove('active');
          }

          if (isTypingSelf && socket) {
            socket.emit('typing:stop', { channelId: channel.id });
            isTypingSelf = false;
          }

          const sent = await window.HuddleApi.messages.send(channel.id, text, null, uploadedAttachments);
          if (sent && (sent.id || sent.content || (sent.attachments && sent.attachments.length))) {
            handleIncomingMessage(sent);
          }
        } catch (err) {
          console.error('Failed to send message:', err);
          window.showHuddleToast(err.message || 'Failed to send message.', 'error');
        } finally {
          if (sendBtn) {
            sendBtn.disabled = false;
            sendBtn.innerHTML = origBtnContent;
          }
        }
      });
    }

    // Fetch initial messages once
    try {
      const res = await window.HuddleApi.messages.list(channel.id, 60);
      const list = res?.data?.messages || res?.messages || res?.data || (Array.isArray(res) ? res : []);
      currentMessages = list;
      renderMessagesFeed(currentMessages);

      if (list.length > 0) {
        const lastMsg = list[list.length - 1];
        if (lastMsg && lastMsg.id) {
          window.HuddleApi.messages.markRead(channel.id, lastMsg.id).catch(() => {});
        }
      }
    } catch (err) {
      console.error('Failed to load messages:', err);
      if (messagesList) {
        messagesList.innerHTML = `<div style="color:#F04438;text-align:center;padding:20px;">Could not load messages.</div>`;
      }
    }
  }

  // --- Render Messages Stream (with Grouping, Date Dividers, Reactions & Hover Toolbars) ---
  function renderMessagesFeed(messages) {
    const messagesList = document.getElementById('messages-list');
    const messagesContainer = document.getElementById('channel-messages-container');
    if (!messagesList) return;

    if (!messages || messages.length === 0) {
      messagesList.innerHTML = `
        <div style="color:#98A2B3;font-size:13.5px;text-align:center;padding:28px 0;">
          No messages yet. Say hello to get the conversation started!
        </div>
      `;
      return;
    }

    const sorted = [...messages].sort(
      (a, b) => new Date(a.created_at || a.createdAt || 0) - new Date(b.created_at || b.createdAt || 0),
    );

    const currentUser = window.HuddleApi.getUser();
    let lastDateStr = null;
    let lastSenderId = null;
    let lastTimestamp = 0;
    let html = '';

    sorted.forEach((msg) => {
      const msgDate = new Date(msg.created_at || msg.createdAt || Date.now());
      const dateHeader = formatDateDivider(msgDate);

      // Date Separator Divider
      if (dateHeader !== lastDateStr) {
        lastDateStr = dateHeader;
        html += `
          <div class="chat-date-divider">
            <span class="chat-date-divider-text">${escapeHtml(dateHeader)}</span>
          </div>
        `;
        lastSenderId = null; // Reset grouping across date breaks
      }

      // Check message grouping (within 5 minutes by same sender)
      const isSameSender = lastSenderId && lastSenderId === (msg.sender_id || msg.senderId || msg.sender?.id);
      const isWithin5Min = Math.abs(msgDate.getTime() - lastTimestamp) < 5 * 60 * 1000;
      const isGrouped = isSameSender && isWithin5Min && !msg.is_deleted;

      lastSenderId = msg.sender_id || msg.senderId || msg.sender?.id;
      lastTimestamp = msgDate.getTime();

      html += renderSingleMessageHtml(msg, isGrouped, currentUser);
    });

    messagesList.innerHTML = html;

    attachMessageActionListeners();

    if (messagesContainer) {
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
  }

  function formatDateDivider(date) {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) {
      return 'Today';
    } else if (date.toDateString() === yesterday.toDateString()) {
      return 'Yesterday';
    } else {
      return date.toLocaleDateString(undefined, {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
      });
    }
  }

  function renderSingleMessageHtml(msg, isGrouped, currentUser) {
    const myId = currentUser?.id || currentUser?.user?.id || currentUser?.userId || currentUser?.user_id;
    let tokenSub = null;
    let tokenEmail = null;
    try {
      const tok = window.HuddleApi?.getToken();
      if (tok && tok.includes('.')) {
        const payload = JSON.parse(atob(tok.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
        tokenSub = payload.sub;
        tokenEmail = payload.email;
      }
    } catch {}

    const myEffectiveId = myId || tokenSub;
    const myEmail = (currentUser?.email || currentUser?.user?.email || tokenEmail || '').toLowerCase().trim();
    const myUsername = (currentUser?.username || currentUser?.user?.username || '').toLowerCase().trim();

    const senderId = msg.sender_id || msg.senderId || msg.sender?.id || msg.sender?.userId || msg.user_id || msg.userId;
    const senderEmail = (msg.sender?.email || msg.senderEmail || '').toLowerCase().trim();
    const senderUsername = (msg.sender?.username || msg.senderUsername || '').toLowerCase().trim();

    const isMe = Boolean(
      (myEffectiveId && senderId && String(myEffectiveId).toLowerCase() === String(senderId).toLowerCase()) ||
      (myEmail && senderEmail && myEmail === senderEmail) ||
      (myUsername && senderUsername && myUsername === senderUsername)
    );

    const senderName = msg.sender?.full_name || msg.sender?.fullName || (isMe ? (currentUser?.fullName || 'You') : 'Teammate');
    const senderDisplayUsername = msg.sender?.username || (isMe ? (currentUser?.username || 'you') : '');
    const timeStr = formatTime(msg.created_at || msg.createdAt);
    const isDeleted = Boolean(msg.is_deleted);
    const isEdited = Boolean(msg.is_edited);

    const initial = senderName.charAt(0).toUpperCase();
    const avatarUrl = msg.sender?.avatar_url || msg.sender?.avatarUrl || (isMe ? currentUser?.avatarUrl : null);

    const avatarHtml = avatarUrl
      ? `<img src="${escapeHtml(avatarUrl)}" alt="" style="width:100%;height:100%;border-radius:50%;object-fit:cover;" />`
      : escapeHtml(initial);

    // Grouped Reactions aggregation
    const reactionMap = new Map(); // emoji -> { count, hasReacted }
    (msg.reactions || []).forEach((r) => {
      const entry = reactionMap.get(r.emoji) || { count: 0, hasReacted: false };
      entry.count += 1;
      const rUid = r.user_id || r.userId || r.user?.id;
      if (myEffectiveId && rUid && String(rUid).toLowerCase() === String(myEffectiveId).toLowerCase()) {
        entry.hasReacted = true;
      }
      reactionMap.set(r.emoji, entry);
    });

    let reactionsHtml = '';
    if (reactionMap.size > 0 && !isDeleted) {
      reactionsHtml = `<div class="message-reactions-row" style="display:flex;flex-wrap:wrap;gap:4px;margin-top:4px;${isMe ? 'justify-content:flex-end;' : 'justify-content:flex-start;'}">`;
      reactionMap.forEach((data, emoji) => {
        reactionsHtml += `
          <button type="button" class="reaction-chip ${data.hasReacted ? 'active' : ''}" data-msg-id="${escapeHtml(msg.id)}" data-emoji="${escapeHtml(emoji)}" title="${data.hasReacted ? 'Remove reaction' : 'React'}">
            <span>${escapeHtml(emoji)}</span>
            <span>${data.count}</span>
          </button>
        `;
      });
      reactionsHtml += `</div>`;
    }

    // System notification message styling (e.g. member added to group)
    const isSystemJoinNotice = Boolean(
      msg.content &&
      (msg.content.includes('added') && (msg.content.includes('to #') || msg.content.includes('to the group') || msg.content.includes('was added to')))
    );

    if (isSystemJoinNotice && !isDeleted) {
      return `
        <div class="message-row message-system-announcement" id="msg-row-${escapeHtml(msg.id)}" data-message-id="${escapeHtml(msg.id)}" style="display:flex;justify-content:center;align-items:center;padding:10px 16px;width:100%;box-sizing:border-box;">
          <div style="display:inline-flex;align-items:center;gap:7px;background:#F8F9FA;border:1px solid #EAECF0;border-radius:20px;padding:6px 14px;font-size:12.5px;color:#475467;font-weight:500;box-shadow:0 1px 2px rgba(16,24,40,0.03);">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#FF6A00" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;">
              <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
              <circle cx="8.5" cy="7.5" r="4"></circle>
              <line x1="20" y1="8" x2="20" y2="14"></line>
              <line x1="23" y1="11" x2="17" y2="11"></line>
            </svg>
            <span>${escapeHtml(msg.content)}</span>
            <span style="font-size:11px;color:#98A2B3;margin-left:4px;">${escapeHtml(timeStr)}</span>
          </div>
        </div>
      `;
    }

    return `
      <div class="message-row ${isMe ? 'is-me' : 'is-other'} ${isGrouped ? 'is-grouped' : ''}" id="msg-row-${escapeHtml(msg.id)}" data-message-id="${escapeHtml(msg.id)}" style="position:relative;display:flex;width:100%;box-sizing:border-box;padding:4px 16px;gap:10px;${isMe ? 'flex-direction:row-reverse;justify-content:flex-start;' : 'flex-direction:row;justify-content:flex-start;'}">
        <!-- Hover action toolbar -->
        ${
          !isDeleted
            ? `
          <div class="message-actions-toolbar" style="${isMe ? 'left:20px;right:auto;' : 'right:20px;left:auto;'}">
            <button type="button" class="message-action-btn quick-react-btn" data-emoji="👍" title="React 👍">👍</button>
            <button type="button" class="message-action-btn quick-react-btn" data-emoji="❤️" title="React ❤️">❤️</button>
            <button type="button" class="message-action-btn quick-react-btn" data-emoji="😂" title="React 😂">😂</button>
            <button type="button" class="message-action-btn quick-react-btn" data-emoji="🚀" title="React 🚀">🚀</button>
            <button type="button" class="message-action-btn quick-react-btn" data-emoji="🔥" title="React 🔥">🔥</button>
            ${
              isMe
                ? `
              <button type="button" class="message-action-btn edit-msg-btn" title="Edit message">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
              </button>
              <button type="button" class="message-action-btn delete-msg-btn" title="Delete message">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#F04438" stroke-width="2.2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
              </button>
            `
                : ''
            }
          </div>
        `
            : ''
        }

        <!-- Avatar Column -->
        <div class="message-avatar-col" style="width:34px;height:34px;border-radius:50%;background:${isMe ? '#FF6A00' : '#475467'};color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px;flex-shrink:0;overflow:hidden;${isGrouped ? 'visibility:hidden;height:0;' : ''}">
          ${avatarHtml}
        </div>

        <!-- Bubble & Content Column -->
        <div class="message-bubble-wrapper" style="display:flex;flex-direction:column;max-width:75%;min-width:48px;${isMe ? 'align-items:flex-end;margin-left:auto;margin-right:0;' : 'align-items:flex-start;margin-right:auto;margin-left:0;'}">
          ${
            !isGrouped
              ? `
            <div class="message-header" style="display:flex;align-items:center;gap:6px;margin-bottom:3px;${isMe ? 'justify-content:flex-end;' : 'justify-content:flex-start;'}">
              ${!isMe ? `<span style="font-weight:700;font-size:13px;color:#101828;">${escapeHtml(senderName)}</span>` : ''}
              ${!isMe && senderDisplayUsername ? `<span style="font-size:11.5px;font-weight:600;color:#FF6A00;">@${escapeHtml(senderDisplayUsername)}</span>` : ''}
              <span style="font-size:11px;color:#98A2B3;">${escapeHtml(timeStr)}</span>
              ${isEdited && !isDeleted ? `<span style="font-size:10.5px;color:#98A2B3;font-style:italic;">(edited)</span>` : ''}
            </div>
          `
              : ''
          }

          <div class="message-bubble" style="${isMe ? 'background:#FF6A00;color:#ffffff;border-radius:18px 18px 4px 18px;padding:9px 14px;box-shadow:0 1px 2px rgba(255,106,0,0.18);' : 'background:#F2F4F7;color:#101828;border:1px solid #EAECF0;border-radius:18px 18px 18px 4px;padding:9px 14px;'}">
            ${
              msg.content || isDeleted
                ? `<div class="message-body-content" id="msg-body-${escapeHtml(msg.id)}" style="font-size:14px;line-height:1.45;word-break:break-word;color:${isMe ? '#ffffff' : (isDeleted ? '#98A2B3' : '#1D2939')};font-style:${isDeleted ? 'italic' : 'normal'};">
                    ${isDeleted ? 'This message was deleted' : escapeHtml(msg.content || '')}
                  </div>`
                : ''
            }
            ${
              !isDeleted && msg.attachments && msg.attachments.length > 0
                ? `<div class="message-attachments-container" style="display:flex;flex-direction:column;gap:6px;${msg.content ? 'margin-top:8px;' : ''}">
                    ${msg.attachments.map((att) => `
                      <div class="message-attachment-card" style="border-radius:12px;overflow:hidden;max-width:320px;border:1px solid ${isMe ? 'rgba(255,255,255,0.3)' : '#EAECF0'};background:#ffffff;box-shadow:0 2px 4px rgba(0,0,0,0.06);">
                        <a href="${escapeHtml(att.url)}" target="_blank" rel="noopener noreferrer" style="display:block;cursor:pointer;" title="Click to view full size">
                          <img src="${escapeHtml(att.url)}" alt="${escapeHtml(att.file_name || 'Attached image')}" style="width:100%;max-height:260px;object-fit:cover;display:block;" loading="lazy" />
                        </a>
                      </div>
                    `).join('')}
                  </div>`
                : ''
            }
          </div>

          ${reactionsHtml}
        </div>
      </div>
    `;
  }

  function formatTime(val) {
    try {
      const d = new Date(val);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  }

  // --- Attach Handlers for Reactions, Edits, and Deletes ---
  function attachMessageActionListeners() {
    // Quick Reaction buttons
    document.querySelectorAll('.quick-react-btn').forEach((btn) => {
      btn.onclick = async (e) => {
        e.stopPropagation();
        const row = btn.closest('.message-row');
        const msgId = row?.dataset.messageId;
        const emoji = btn.dataset.emoji;
        if (!activeChannel || !msgId || !emoji) return;

        try {
          await window.HuddleApi.messages.toggleReaction(activeChannel.id, msgId, emoji);
        } catch (err) {
          window.showHuddleToast(err.message || 'Could not react.', 'error');
        }
      };
    });

    // Reaction Chips toggle
    document.querySelectorAll('.reaction-chip').forEach((chip) => {
      chip.onclick = async (e) => {
        e.stopPropagation();
        const msgId = chip.dataset.msgId;
        const emoji = chip.dataset.emoji;
        if (!activeChannel || !msgId || !emoji) return;

        try {
          await window.HuddleApi.messages.toggleReaction(activeChannel.id, msgId, emoji);
        } catch (err) {
          window.showHuddleToast(err.message || 'Could not toggle reaction.', 'error');
        }
      };
    });

    // Edit message button
    document.querySelectorAll('.edit-msg-btn').forEach((btn) => {
      btn.onclick = (e) => {
        e.stopPropagation();
        const row = btn.closest('.message-row');
        const msgId = row?.dataset.messageId;
        if (!msgId || !activeChannel) return;

        const bodyEl = document.getElementById(`msg-body-${msgId}`);
        if (!bodyEl || bodyEl.querySelector('input')) return;

        const currentText = bodyEl.textContent.trim();

        bodyEl.innerHTML = `
          <div style="display:flex;flex-direction:column;gap:6px;margin-top:4px;">
            <input type="text" id="edit-input-${msgId}" value="${escapeHtml(currentText)}" style="width:100%;padding:6px 10px;border:1.5px solid #FF6A00;border-radius:8px;font-size:14px;outline:none;" />
            <div style="display:flex;gap:6px;">
              <button type="button" id="save-edit-${msgId}" style="background:#FF6A00;color:#fff;border:none;border-radius:6px;padding:4px 10px;font-size:12px;font-weight:600;cursor:pointer;">Save</button>
              <button type="button" id="cancel-edit-${msgId}" style="background:#F2F4F7;color:#344054;border:none;border-radius:6px;padding:4px 10px;font-size:12px;font-weight:600;cursor:pointer;">Cancel</button>
            </div>
          </div>
        `;

        const editInput = document.getElementById(`edit-input-${msgId}`);
        editInput?.focus();

        document.getElementById(`cancel-edit-${msgId}`).onclick = () => {
          bodyEl.innerHTML = escapeHtml(currentText);
        };

        const saveAction = async () => {
          const newText = editInput.value.trim();
          if (!newText || newText === currentText) {
            bodyEl.innerHTML = escapeHtml(currentText);
            return;
          }
          try {
            await window.HuddleApi.messages.update(activeChannel.id, msgId, newText);
          } catch (err) {
            window.showHuddleToast(err.message || 'Failed to edit message', 'error');
            bodyEl.innerHTML = escapeHtml(currentText);
          }
        };

        document.getElementById(`save-edit-${msgId}`).onclick = saveAction;
        editInput.onkeydown = (ev) => {
          if (ev.key === 'Enter') saveAction();
          if (ev.key === 'Escape') bodyEl.innerHTML = escapeHtml(currentText);
        };
      };
    });

    // Delete message button
    document.querySelectorAll('.delete-msg-btn').forEach((btn) => {
      btn.onclick = async (e) => {
        e.stopPropagation();
        const row = btn.closest('.message-row');
        const msgId = row?.dataset.messageId;
        if (!msgId || !activeChannel) return;

        if (!confirm('Are you sure you want to delete this message?')) return;

        try {
          await window.HuddleApi.messages.delete(activeChannel.id, msgId);
        } catch (err) {
          window.showHuddleToast(err.message || 'Failed to delete message', 'error');
        }
      };
    });
  }

  // --- Real-Time Socket Event Handlers ---
  function handleIncomingMessage(message) {
    if (!message) return;
    const exists = currentMessages.some((m) => m.id === message.id);
    if (!exists) {
      currentMessages.push(message);
      renderMessagesFeed(currentMessages);
    }
  }

  function handleMessageUpdated(message) {
    if (!message) return;
    const idx = currentMessages.findIndex((m) => m.id === message.id);
    if (idx !== -1) {
      currentMessages[idx] = message;
      renderMessagesFeed(currentMessages);
    }
  }

  function handleMessageDeleted(messageId) {
    const idx = currentMessages.findIndex((m) => m.id === messageId);
    if (idx !== -1) {
      currentMessages[idx].is_deleted = true;
      currentMessages[idx].content = null;
      renderMessagesFeed(currentMessages);
    }
  }

  function handleReactionsUpdated(messageId, reactions) {
    const msg = currentMessages.find((m) => m.id === messageId);
    if (msg) {
      msg.reactions = reactions;
      renderMessagesFeed(currentMessages);
    }
  }

  function showTypingIndicator(userId) {
    const currentUser = window.HuddleApi.getUser();
    if (currentUser && userId === currentUser.id) return;

    const typerMember = currentChannelMembers.find((m) => (m.userId || m.id) === userId);
    const typerName = typerMember?.fullName || typerMember?.username || 'Someone';

    const bar = document.getElementById('typing-indicator-bar');
    if (!bar) return;

    clearTimeout(typingUsersMap.get(userId));
    typingUsersMap.set(
      userId,
      setTimeout(() => {
        hideTypingIndicator(userId);
      }, 3500),
    );

    bar.innerHTML = `
      <div class="typing-dots">
        <span class="typing-dot"></span>
        <span class="typing-dot"></span>
        <span class="typing-dot"></span>
      </div>
      <span>${escapeHtml(typerName)} is typing...</span>
    `;
  }

  function hideTypingIndicator(userId) {
    typingUsersMap.delete(userId);
    const bar = document.getElementById('typing-indicator-bar');
    if (!bar) return;

    if (typingUsersMap.size === 0) {
      bar.innerHTML = '';
    }
  }

  // ========================================================================
  // Workspace UI and Initial Load
  // ========================================================================
  function updateUserUI(user) {
    if (!user) return;

    const displayName = user.fullName || user.full_name || 'User';
    const avatarInitial = displayName.charAt(0).toUpperCase();
    const rawUsername = user.username || '';
    const handle = rawUsername
      ? (rawUsername.startsWith('@') ? rawUsername : `@${rawUsername}`)
      : (user.email ? `@${user.email.split('@')[0]}` : '@user');
    const email = user.email || '';

    // 1. Sidebar bottom avatar & personal details
    const sidebarAvatarEl =
      document.getElementById('sidebar-user-avatar') ||
      document.getElementById('sidebar-user-avatar-circle');
    const sidebarNameEl = document.getElementById('sidebar-user-name');
    const sidebarHandleEl = document.getElementById('sidebar-user-handle');
    const sidebarEmailEl = document.getElementById('sidebar-user-email');

    if (sidebarAvatarEl) {
      if (user.avatarUrl && user.avatarUrl.trim().length > 0) {
        sidebarAvatarEl.innerHTML = `<img src="${escapeHtml(user.avatarUrl)}" alt="${escapeHtml(displayName)}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;" />`;
      } else {
        sidebarAvatarEl.innerHTML = `<span style="font-weight:700;font-size:14px;color:#ffffff;">${escapeHtml(avatarInitial)}</span>`;
      }
    }

    if (sidebarNameEl) sidebarNameEl.textContent = displayName;
    if (sidebarHandleEl) sidebarHandleEl.textContent = handle;
    if (sidebarEmailEl) {
      sidebarEmailEl.textContent = email;
      sidebarEmailEl.title = email;
    }

    // 2. Mobile top bar avatar
    const mobileAvatarEl =
      document.querySelector('.mobile-avatar') ||
      document.getElementById('mobile-top-avatar');
    if (mobileAvatarEl) {
      mobileAvatarEl.title = displayName;
      if (user.avatarUrl && user.avatarUrl.trim().length > 0) {
        mobileAvatarEl.innerHTML = `<img src="${escapeHtml(user.avatarUrl)}" alt="${escapeHtml(displayName)}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;" />`;
      } else {
        mobileAvatarEl.innerHTML = `<span style="font-weight:700;font-size:13px;color:#ffffff;">${escapeHtml(avatarInitial)}</span>`;
      }
    }
  }

  async function initializeWorkspace() {
    let currentUser = window.HuddleApi ? window.HuddleApi.getUser() : null;

    try {
      if (window.HuddleApi) {
        const freshUser = await window.HuddleApi.users.getMe();
        if (freshUser) {
          currentUser = freshUser;
          window.HuddleApi.setUser(freshUser);
        }
      }
    } catch {}

    if (currentUser) {
      updateUserUI(currentUser);
    }

    // Initialize WebSockets
    initWebSocket();

    // Load workspaces
    try {
      let workspaces = [];
      try {
        workspaces = await window.HuddleApi.workspaces.list();
      } catch (wsErr) {
        console.warn('[Huddle] Could not list workspaces:', wsErr);
      }

      let activeWs = null;

      if (!workspaces || workspaces.length === 0) {
        const defaultName = currentUser?.fullName
          ? `${currentUser.fullName.split(' ')[0]}'s Workspace`
          : 'My Workspace';
        try {
          activeWs = await window.HuddleApi.workspaces.create(defaultName);
          workspaces = [activeWs];
          try {
            await window.HuddleApi.channels.create(activeWs.id, 'general', 'public');
          } catch {}
        } catch (createErr) {
          console.error('[Huddle] Failed to auto-create workspace:', createErr);
        }
      } else {
        const savedId = window.HuddleApi.getActiveWorkspaceId();
        activeWs = workspaces.find((w) => w.id === savedId) || workspaces[0];
      }

      userWorkspaces = workspaces || [];

      if (activeWs) {
        window.HuddleApi.setActiveWorkspaceId(activeWs.id);
        window.HuddleApi.setActiveWorkspaceName(activeWs.name);
        renderWorkspaceUI(activeWs, userWorkspaces);
        await loadWorkspaceChannels(activeWs.id);
        startBackgroundWorkspaceSync();
      }
    } catch (err) {
      console.error('[Huddle] Error during workspace initialization:', err);
    }
  }

  function startBackgroundWorkspaceSync() {
    if (workspaceSyncInterval) clearInterval(workspaceSyncInterval);
    workspaceSyncInterval = setInterval(async () => {
      try {
        const activeWsId = window.HuddleApi.getActiveWorkspaceId();
        if (!activeWsId) return;

        const channels = await window.HuddleApi.channels.list(activeWsId);
        if (channels) {
          cachedWorkspaceChannels = channels;
          if (sidebarChannelsList) {
            const newChannelIds = channels.map((c) => c.id).join(',');
            if (sidebarChannelsList.dataset.channelIds !== newChannelIds) {
              sidebarChannelsList.dataset.channelIds = newChannelIds;
              renderChannelsList(channels);
            }
          }
        }
      } catch {}
    }, 4000); // 4s sync check for workspace channel list
  }

  function renderWorkspaceUI(activeWs, workspaces = userWorkspaces) {
    if (!activeWs) return;

    document.title = `Huddle — ${activeWs.name}`;

    const triggerNameEl = document.querySelector('.workspace-name-text');
    if (triggerNameEl) triggerNameEl.textContent = activeWs.name;

    const popoverTitleEl = document.querySelector('.popover-workspace-title');
    if (popoverTitleEl) popoverTitleEl.textContent = activeWs.name;

    const currentUser = window.HuddleApi ? window.HuddleApi.getUser() : null;
    const currentUserId = currentUser?.id || currentUser?.userId;

    // Distinguish Personal Workspace vs Team Workspace:
    // The user's Personal Workspace is their first/earliest owned workspace (or workspaces[0]).
    const myOwnedWorkspaces = (workspaces || []).filter(
      (w) => !w.owner_id || (currentUserId && w.owner_id === currentUserId)
    );
    const personalWs = myOwnedWorkspaces[0] || (workspaces && workspaces[0]);
    const isPersonal = Boolean(personalWs && activeWs.id === personalWs.id);

    // Update popover subtitle
    const popoverSubEl = document.getElementById('popover-workspace-subtitle');
    if (popoverSubEl) {
      popoverSubEl.textContent = isPersonal
        ? '🔒 Personal Workspace (Private)'
        : '👥 Team Workspace (Shareable)';
    }

    // Dynamic ID Box:
    // If Personal: do NOT share personal workspace ID. Show explanation + CTA to create a shareable team workspace.
    // If Team Workspace: show shareable Workspace ID + Copy ID button.
    const idBoxContainer = document.getElementById('popover-workspace-id-box');
    if (idBoxContainer) {
      if (isPersonal) {
        idBoxContainer.innerHTML = `
          <div style="background: #F8F9FA; border: 1px dashed #D0D5DD; border-radius: 8px; padding: 10px 12px; display: flex; flex-direction: column; gap: 6px; width: 100%; box-sizing: border-box;">
            <div style="display: flex; align-items: center; gap: 6px; font-size: 11.5px; font-weight: 700; color: #475467;">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#FF6A00" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
              </svg>
              <span>Private Personal Workspace</span>
            </div>
            <p style="margin: 0; font-size: 11px; color: #667085; line-height: 1.4;">
              Your personal workspace is private and cannot be shared. To collaborate with teammates and share an ID, create a team workspace first!
            </p>
            <button type="button" id="personal-create-ws-cta" style="margin-top: 4px; background: #FF6A00; color: #ffffff; border: none; border-radius: 6px; padding: 7px 10px; font-size: 11.5px; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; gap: 5px; transition: background 0.15s ease;">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
              <span>+ Create a Workspace to Share</span>
            </button>
          </div>
        `;
        const createCta = document.getElementById('personal-create-ws-cta');
        if (createCta) {
          createCta.onclick = (e) => {
            e.stopPropagation();
            togglePopover(false);
            openCreateModal();
          };
        }
      } else {
        idBoxContainer.innerHTML = `
          <div style="display: flex; align-items: center; justify-content: space-between; background: #F8F9FA; border: 1px solid #EAECF0; border-radius: 8px; padding: 7px 10px; width: 100%; box-sizing: border-box;">
            <div style="display: flex; flex-direction: column; min-width: 0;">
              <span style="font-size: 9.5px; font-weight: 700; text-transform: uppercase; color: #98A2B3; letter-spacing: 0.5px;">Shareable Workspace ID</span>
              <code id="popover-workspace-id-text" style="font-size: 11px; font-weight: 600; color: #344054; font-family: monospace; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 140px;">${escapeHtml(activeWs.id || '')}</code>
            </div>
            <button type="button" id="copy-workspace-id-btn" title="Copy Workspace ID to invite teammates"
              style="background: #FF6A00; color: #ffffff; border: none; border-radius: 6px; padding: 5px 9px; font-size: 11px; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; gap: 4px; flex-shrink: 0; transition: opacity 0.15s ease;">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
              </svg>
              <span>Copy ID</span>
            </button>
          </div>
        `;
        const copyBtn = document.getElementById('copy-workspace-id-btn');
        if (copyBtn) {
          copyBtn.onclick = async (e) => {
            e.stopPropagation();
            try {
              await navigator.clipboard.writeText(activeWs.id);
              window.showHuddleToast('Workspace ID copied! Share it with teammates to let them join.', 'success');
            } catch {
              const temp = document.createElement('input');
              temp.value = activeWs.id;
              document.body.appendChild(temp);
              temp.select();
              document.execCommand('copy');
              document.body.removeChild(temp);
              window.showHuddleToast('Workspace ID copied! Share it with teammates to let them join.', 'success');
            }
          };
        }
      }
    }

    // Render list of workspaces to switch between in the popover
    const wsListEl = document.getElementById('popover-workspaces-list');
    if (wsListEl && Array.isArray(workspaces)) {
      wsListEl.innerHTML = '';
      if (workspaces.length === 0) {
        wsListEl.innerHTML = '<div style="padding: 6px 8px; font-size: 12px; color: #98A2B3;">No workspaces found</div>';
      } else {
        workspaces.forEach((ws) => {
          const isCurrent = ws.id === activeWs.id;
          const isWsPersonal = Boolean(personalWs && ws.id === personalWs.id);
          const itemBtn = document.createElement('button');
          itemBtn.type = 'button';
          itemBtn.className = `popover-item-btn workspace-switch-item ${isCurrent ? 'active-ws' : ''}`;
          itemBtn.setAttribute('role', 'menuitem');
          itemBtn.title = isCurrent
            ? `${ws.name} (Current Workspace)`
            : isWsPersonal
            ? `Switch back to your Personal Workspace`
            : `Switch to ${ws.name}`;
          itemBtn.style.cssText = `
            width: 100%;
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 8px 10px;
            border-radius: 8px;
            background: ${isCurrent ? '#F2F4F7' : 'transparent'};
            border: 1px solid ${isCurrent ? '#EAECF0' : 'transparent'};
            cursor: pointer;
            transition: all 0.12s ease;
            text-align: left;
            margin-bottom: 2px;
          `;
          const initial = (ws.name || 'W').charAt(0).toUpperCase();
          itemBtn.innerHTML = `
            <div style="display: flex; align-items: center; gap: 8px; min-width: 0; flex: 1;">
              <div style="width: 22px; height: 22px; border-radius: 6px; background: ${isCurrent ? '#FF6A00' : isWsPersonal ? '#475467' : '#EAECF0'}; color: #ffffff; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 700; flex-shrink: 0;">
                ${escapeHtml(initial)}
              </div>
              <div style="display: flex; align-items: center; gap: 6px; min-width: 0; flex: 1;">
                <span style="font-size: 13px; font-weight: ${isCurrent ? '700' : '500'}; color: #101828; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                  ${escapeHtml(ws.name || 'Workspace')}
                </span>
                <span style="font-size: 9.5px; font-weight: 700; padding: 1px 5px; border-radius: 4px; flex-shrink: 0; ${
                  isWsPersonal
                    ? 'background: #EAECF0; color: #344054;'
                    : 'background: #FFF4ED; color: #FF6A00;'
                }">
                  ${isWsPersonal ? 'Personal' : 'Team'}
                </span>
              </div>
            </div>
            ${
              isCurrent
                ? `
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#FF6A00" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink: 0; margin-left: 6px;">
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
            `
                : ''
            }
          `;

          itemBtn.addEventListener('mouseenter', () => {
            if (!isCurrent) itemBtn.style.background = '#F9FAFB';
          });
          itemBtn.addEventListener('mouseleave', () => {
            if (!isCurrent) itemBtn.style.background = 'transparent';
          });

          itemBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            togglePopover(false);
            if (isCurrent) return;

            window.HuddleApi.setActiveWorkspaceId(ws.id);
            window.HuddleApi.setActiveWorkspaceName(ws.name);
            window.showHuddleToast(
              isWsPersonal
                ? 'Switching back to your Personal Workspace...'
                : `Switching to "${ws.name}"...`,
              'info'
            );
            setTimeout(() => {
              window.location.reload();
            }, 150);
          });

          wsListEl.appendChild(itemBtn);
        });
      }
    }
  }

  // --- Mobile Drawer Helpers ---
  function openMobileDrawer() {
    if (!sidebar) return;
    sidebar.classList.add('open', 'mobile-open', 'drawer-open');
    if (drawerBackdrop) drawerBackdrop.classList.add('show', 'mobile-open', 'active');
    document.body.style.overflow = 'hidden';
  }

  function closeMobileDrawer() {
    if (!sidebar) return;
    sidebar.classList.remove('open', 'mobile-open', 'drawer-open');
    if (drawerBackdrop) drawerBackdrop.classList.remove('show', 'mobile-open', 'active');
    document.body.style.overflow = '';
  }

  if (mobileMenuBtn) mobileMenuBtn.addEventListener('click', openMobileDrawer);
  if (drawerCloseBtn) drawerCloseBtn.addEventListener('click', closeMobileDrawer);
  if (drawerBackdrop) drawerBackdrop.addEventListener('click', closeMobileDrawer);

  const mobileAvatarEl = document.querySelector('.mobile-avatar');
  if (mobileAvatarEl) {
    mobileAvatarEl.style.cursor = 'pointer';
    mobileAvatarEl.addEventListener('click', (e) => {
      e.stopPropagation();
      openProfileModal();
    });
  }

  // --- Logout ---
  if (sidebarLogoutBtn) {
    sidebarLogoutBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      try {
        if (socket) socket.disconnect();
        await window.HuddleApi.auth.logout();
      } catch {}
      window.HuddleApi.clearSession();
      window.location.href = 'signin.html';
    });
  }

  // --- Action Dialog Helper ---
  function showActionDialog(title, message) {
    if (!actionDialog || !dialogTitle || !dialogMessage) return;
    dialogTitle.textContent = title;
    dialogMessage.textContent = message;
    actionDialog.classList.add('open');
    actionDialog.setAttribute('aria-hidden', 'false');
  }

  function closeActionDialog() {
    if (!actionDialog) return;
    actionDialog.classList.remove('open');
    actionDialog.setAttribute('aria-hidden', 'true');
  }

  if (dialogCloseBtn) dialogCloseBtn.addEventListener('click', closeActionDialog);
  if (actionDialog) {
    actionDialog.addEventListener('click', (e) => {
      if (e.target === actionDialog) closeActionDialog();
    });
  }

  function escapeHtml(str) {
    if (!str && str !== 0) return '';
    const div = document.createElement('div');
    div.textContent = String(str);
    return div.innerHTML;
  }

  // Initial Load
  await initializeWorkspace();
});
