/**
 * Huddle Workspace Dashboard - Interactive Logic & Backend Integration
 * Includes Workspace Popover, Mobile Drawer, Join Workspace Modal, Create Workspace Modal,
 * and Live Channels / Workspaces Data Synchronization.
 */

document.addEventListener('DOMContentLoaded', async () => {
  // 1. Auth Guard - redirect immediately if user is not authenticated
  if (window.HuddleApi && !window.HuddleApi.requireAuth('signin.html')) {
    return;
  }

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

  // Sidebar Channels Elements
  const sidebarSectionsWrapper = document.getElementById('sidebar-sections-wrapper');
  const sidebarChannelsList = document.getElementById('sidebar-channels-list');
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

  // --- Workspace Popover Logic ---

  function togglePopover(forceState) {
    if (!workspacePopover || !switcherTrigger) return;
    const shouldOpen = typeof forceState === 'boolean'
      ? forceState
      : !workspacePopover.classList.contains('open');

    if (shouldOpen) {
      workspacePopover.classList.add('open');
      workspacePopover.setAttribute('aria-hidden', 'false');
      switcherTrigger.classList.add('active');
      switcherTrigger.setAttribute('aria-expanded', 'true');
    } else {
      workspacePopover.classList.remove('open');
      workspacePopover.setAttribute('aria-hidden', 'true');
      switcherTrigger.classList.remove('active');
      switcherTrigger.setAttribute('aria-expanded', 'false');
    }
  }

  if (switcherTrigger) {
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
    const isValid = val.length > 0;

    if (isValid) {
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

        // Auto-create a #general channel for this new workspace
        try {
          await window.HuddleApi.channels.create(ws.id, 'general', 'public');
        } catch {}

        closeCreateModal();
        window.showHuddleToast(`Workspace "${ws.name}" created!`, 'success');
        await initializeWorkspace();
      } catch (err) {
        console.error('[Huddle Create Workspace Error]:', err);
        window.showHuddleToast(err.message || 'Failed to create workspace.', 'error');
      } finally {
        createModalSubmitBtn.textContent = 'Create Workspace';
        validateWorkspaceName();
      }
    });
  }

  // ========================================================================
  // User Profile Modal Logic (Avatar, Full Name, Unique Username, Email)
  // ========================================================================

  let isProfileModalClosing = false;

  function updateProfileAvatarPreview(url, name) {
    if (!profileAvatarImg || !profileAvatarInitials) return;
    if (url && url.trim()) {
      profileAvatarImg.src = url.trim();
      profileAvatarImg.style.display = 'block';
      profileAvatarInitials.style.display = 'none';
      profileAvatarImg.onerror = () => {
        profileAvatarImg.style.display = 'none';
        profileAvatarInitials.style.display = 'block';
        profileAvatarInitials.textContent = (name || 'U').charAt(0).toUpperCase();
      };
    } else {
      profileAvatarImg.style.display = 'none';
      profileAvatarInitials.style.display = 'block';
      profileAvatarInitials.textContent = (name || 'U').charAt(0).toUpperCase();
    }
  }

  function openProfileModal() {
    togglePopover(false);
    closeMobileDrawer();

    const currentUser = window.HuddleApi ? window.HuddleApi.getUser() : null;
    if (!currentUser) return;

    if (profileFullNameInput) profileFullNameInput.value = currentUser.fullName || '';
    if (profileUsernameInput) profileUsernameInput.value = currentUser.username || '';
    if (profileEmailInput) profileEmailInput.value = currentUser.email || '';
    if (profileAvatarInput) profileAvatarInput.value = currentUser.avatarUrl || '';

    updateProfileAvatarPreview(currentUser.avatarUrl, currentUser.fullName);

    isProfileModalClosing = false;
    userProfileModal.classList.remove('closing');
    userProfileModal.classList.add('open');
    userProfileModal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';

    setTimeout(() => {
      profileUsernameInput?.focus();
    }, 60);
  }

  function closeProfileModal() {
    if (isProfileModalClosing || !userProfileModal || !userProfileModal.classList.contains('open')) return;

    isProfileModalClosing = true;
    userProfileModal.classList.add('closing');

    setTimeout(() => {
      userProfileModal.classList.remove('open', 'closing');
      userProfileModal.setAttribute('aria-hidden', 'true');
      document.body.style.overflow = '';
      isProfileModalClosing = false;
    }, 180);
  }

  if (userProfileBtn) {
    userProfileBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      openProfileModal();
    });
  }

  if (profileModalCloseBtn) {
    profileModalCloseBtn.addEventListener('click', closeProfileModal);
  }

  if (profileModalCancelBtn) {
    profileModalCancelBtn.addEventListener('click', closeProfileModal);
  }

  if (profileModalBackdrop) {
    profileModalBackdrop.addEventListener('click', closeProfileModal);
  }

  if (profileAvatarInput) {
    profileAvatarInput.addEventListener('input', () => {
      const name = profileFullNameInput ? profileFullNameInput.value : '';
      updateProfileAvatarPreview(profileAvatarInput.value, name);
    });
  }

  document.querySelectorAll('.avatar-preset-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const presetUrl = btn.getAttribute('data-url') || '';
      if (profileAvatarInput) {
        profileAvatarInput.value = presetUrl;
      }
      const name = profileFullNameInput ? profileFullNameInput.value : '';
      updateProfileAvatarPreview(presetUrl, name);
    });
  });

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
  // Channel Add Member Modal Logic (Add by Unique Username or Email)
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

    addMemberLiveResults.innerHTML = users.map((u) => {
      const initial = (u.fullName || 'U').charAt(0).toUpperCase();
      const avatarHtml = u.avatarUrl
        ? `<div class="live-result-avatar"><img src="${escapeHtml(u.avatarUrl)}" alt="" /></div>`
        : `<div class="live-result-avatar">${escapeHtml(initial)}</div>`;

      return `
        <div class="live-result-item" data-username="${escapeHtml(u.username || '')}" data-user-id="${escapeHtml(u.id)}">
          <div class="live-result-user">
            ${avatarHtml}
            <div class="live-result-info">
              <span class="live-result-name">${escapeHtml(u.fullName || '')}</span>
              <span class="live-result-handle">@${escapeHtml(u.username || '')}</span>
            </div>
          </div>
          <span class="live-result-add-badge">+ Select</span>
        </div>
      `;
    }).join('');

    addMemberLiveResults.style.display = 'block';

    addMemberLiveResults.querySelectorAll('.live-result-item').forEach((item) => {
      item.addEventListener('click', () => {
        const username = item.getAttribute('data-username');
        if (username && channelMemberSearchInput) {
          channelMemberSearchInput.value = `@${username}`;
          addMemberLiveResults.style.display = 'none';
          validateAddMemberInput();
          channelAddMemberSubmitBtn?.focus();
        }
      });
    });
  }

  if (channelAddMemberForm) {
    channelAddMemberForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!currentActiveChannelForAdd || !channelAddMemberSubmitBtn || channelAddMemberSubmitBtn.disabled) return;

      const rawInput = channelMemberSearchInput.value.trim();
      if (!rawInput) return;

      const target = rawInput.replace(/^@/, '');
      channelAddMemberSubmitBtn.disabled = true;
      channelAddMemberSubmitBtn.textContent = 'Adding...';

      try {
        await window.HuddleApi.channels.addMember(currentActiveChannelForAdd.id, target);
        closeAddMemberModal();
        window.showHuddleToast(`Added @${target} to #${currentActiveChannelForAdd.name}!`, 'success');
        // Refresh channel view so member list & messages update
        renderChannelMainView(currentActiveChannelForAdd);
      } catch (err) {
        console.error('[Huddle Add Channel Member Error]:', err);
        window.showHuddleToast(err.message || 'Failed to add member to channel', 'error');
      } finally {
        channelAddMemberSubmitBtn.disabled = false;
        channelAddMemberSubmitBtn.textContent = 'Add to Channel';
        validateAddMemberInput();
      }
    });
  }

  // ========================================================================
  // Global Keyboard Shortcuts (Escape Key)
  // ========================================================================

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (joinModalOverlay && joinModalOverlay.classList.contains('open')) {
        closeJoinModal();
      } else if (createModalOverlay && createModalOverlay.classList.contains('open')) {
        closeCreateModal();
      } else if (userProfileModal && userProfileModal.classList.contains('open')) {
        closeProfileModal();
      } else if (channelAddMemberModal && channelAddMemberModal.classList.contains('open')) {
        closeAddMemberModal();
      } else {
        togglePopover(false);
        closeMobileDrawer();
        closeActionDialog();
      }
    }
  });

  // ========================================================================
  // General Action Dialog Helper
  // ========================================================================

  function showActionDialog(title, message) {
    if (!actionDialog) return;
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

  if (dialogCloseBtn) {
    dialogCloseBtn.addEventListener('click', closeActionDialog);
  }

  if (actionDialog) {
    actionDialog.addEventListener('click', (e) => {
      if (e.target === actionDialog) closeActionDialog();
    });
  }

  // Main Content: Create a Channel trigger
  if (createChannelBtn) {
    createChannelBtn.addEventListener('click', () => {
      window.location.href = 'create-channel.html';
    });
  }

  // Mobile Off-Canvas Drawer
  function openMobileDrawer() {
    sidebar?.classList.add('drawer-open');
    drawerBackdrop?.classList.add('active');
    document.body.style.overflow = 'hidden';
  }

  function closeMobileDrawer() {
    sidebar?.classList.remove('drawer-open');
    drawerBackdrop?.classList.remove('active');
    document.body.style.overflow = '';
  }

  if (mobileMenuBtn) mobileMenuBtn.addEventListener('click', openMobileDrawer);
  if (drawerCloseBtn) drawerCloseBtn.addEventListener('click', closeMobileDrawer);
  if (drawerBackdrop) drawerBackdrop.addEventListener('click', closeMobileDrawer);

  // Search input feedback
  if (searchInput) {
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const query = searchInput.value.trim();
        if (query) {
          showActionDialog('Search', `Searching Huddle for "${query}"...`);
        }
      }
    });
  }

  // Log Out Link
  if (sidebarLogoutBtn) {
    sidebarLogoutBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      try {
        if (window.HuddleApi) await window.HuddleApi.auth.logout();
      } catch {}
      if (window.HuddleApi) window.HuddleApi.clearSession();
      window.location.href = 'signin.html';
    });
  }

  if (sidebarAddDmBtn) {
    sidebarAddDmBtn.addEventListener('click', () => {
      showActionDialog('Direct Messages', 'Direct messaging flow coming soon!');
    });
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }

  // ========================================================================
  // Workspace & Channels Initialization & Rendering
  // ========================================================================

  function updateUserUI(user) {
    if (!user) return;
    const userNameEl = document.getElementById('sidebar-user-name') || document.querySelector('.user-name');
    const userHandleEl = document.getElementById('sidebar-user-handle') || document.querySelector('.user-handle');
    const userEmailEl = document.getElementById('sidebar-user-email') || document.querySelector('.user-email');
    const userAvatarEl = document.getElementById('sidebar-user-avatar-circle') || document.querySelector('.user-avatar-circle');
    const mobileAvatarEl = document.querySelector('.mobile-avatar');

    if (userNameEl) userNameEl.textContent = user.fullName || 'Huddle Member';
    if (userHandleEl) userHandleEl.textContent = `@${user.username || 'user'}`;
    if (userEmailEl) {
      userEmailEl.textContent = user.email || '';
      userEmailEl.title = user.email || '';
    }
    if (mobileAvatarEl) {
      mobileAvatarEl.title = `${user.fullName || 'User'} (@${user.username || ''})`;
    }

    if (userAvatarEl) {
      if (user.avatarUrl && user.avatarUrl.trim()) {
        userAvatarEl.innerHTML = `<img src="${escapeHtml(user.avatarUrl.trim())}" alt="" style="width:100%;height:100%;object-fit:cover;" />`;
      } else {
        const initial = (user.fullName || 'U').charAt(0).toUpperCase();
        userAvatarEl.innerHTML = `
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
          </svg>
        `;
      }
    }
  }

  async function initializeWorkspace() {
    let currentUser = window.HuddleApi ? window.HuddleApi.getUser() : null;

    // Refresh user profile from backend
    try {
      if (window.HuddleApi) {
        const freshUser = await window.HuddleApi.users.getMe();
        if (freshUser) {
          currentUser = freshUser;
          window.HuddleApi.setUser(freshUser);
        }
      }
    } catch {}

    // Update user info across UI
    if (currentUser) {
      updateUserUI(currentUser);
    }

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
        // Automatically create a personal workspace on initial login
        const defaultName = currentUser?.fullName
          ? `${currentUser.fullName.split(' ')[0]}'s Workspace`
          : 'My Workspace';
        try {
          activeWs = await window.HuddleApi.workspaces.create(defaultName);
          workspaces = [activeWs];
          // Auto-create initial #general channel
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

      if (activeWs) {
        window.HuddleApi.setActiveWorkspaceId(activeWs.id);
        window.HuddleApi.setActiveWorkspaceName(activeWs.name);
        renderWorkspaceUI(activeWs, workspaces);
        await loadWorkspaceChannels(activeWs.id);
        knownWorkspaceCount = workspaces.length;
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

        // Check if current workspace's channel list has new channels
        const channels = await window.HuddleApi.channels.list(activeWsId);
        if (channels && sidebarChannelsList) {
          const newChannelIds = channels.map((c) => c.id).join(',');
          if (sidebarChannelsList.dataset.channelIds !== newChannelIds) {
            sidebarChannelsList.dataset.channelIds = newChannelIds;
            renderChannelsList(channels);
          }
        }
      } catch {}
    }, 2500);
  }

  function renderWorkspaceUI(activeWs) {
    if (!activeWs) return;

    // Update document title & sidebar triggers
    document.title = `Huddle — ${activeWs.name}`;

    const triggerNameEl = document.querySelector('.workspace-name-text');
    if (triggerNameEl) {
      triggerNameEl.textContent = activeWs.name;
    }

    const popoverTitleEl = document.querySelector('.popover-workspace-title');
    if (popoverTitleEl) popoverTitleEl.textContent = activeWs.name;

    // Populate Workspace ID and setup 1-click Copy
    const wsIdEl = document.getElementById('popover-workspace-id-text');
    if (wsIdEl) wsIdEl.textContent = activeWs.id || 'N/A';

    const copyBtn = document.getElementById('copy-workspace-id-btn');
    if (copyBtn) {
      copyBtn.onclick = async (e) => {
        e.stopPropagation();
        try {
          await navigator.clipboard.writeText(activeWs.id);
          window.showHuddleToast('Workspace ID copied! Share with teammates to join.', 'success');
        } catch {
          const temp = document.createElement('input');
          temp.value = activeWs.id;
          document.body.appendChild(temp);
          temp.select();
          document.execCommand('copy');
          document.body.removeChild(temp);
          window.showHuddleToast('Workspace ID copied to clipboard!', 'success');
        }
      };
    }
  }

  async function loadWorkspaceChannels(workspaceId) {
    if (!workspaceId) return;

    try {
      const channels = await window.HuddleApi.channels.list(workspaceId);
      renderChannelsList(channels);
    } catch (err) {
      console.warn('[Huddle] Failed to fetch channels:', err);
      renderChannelsList([]);
    }
  }

  function renderChannelsList(channels) {
    if (!sidebarSectionsWrapper || !sidebarChannelsList) return;

    const mainArea = document.getElementById('dashboard-main');

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

    const activeChannelId = window.HuddleApi.getActiveChannelId();

    channels.forEach((channel, idx) => {
      const li = document.createElement('li');
      li.className = 'sidebar-channel-item';
      const isSelected = activeChannelId ? channel.id === activeChannelId : idx === 0;

      if (isSelected) {
        li.classList.add('active');
        window.HuddleApi.setActiveChannelId(channel.id);
      }

      const link = document.createElement('a');
      link.href = '#';
      link.className = 'sidebar-channel-link';
      link.innerHTML = `
        <span class="channel-link-prefix" aria-hidden="true">#</span>
        <span class="channel-link-name">${escapeHtml(channel.name)}</span>
      `;

      link.addEventListener('click', (e) => {
        e.preventDefault();
        document.querySelectorAll('.sidebar-channel-item').forEach((el) => el.classList.remove('active'));
        li.classList.add('active');
        window.HuddleApi.setActiveChannelId(channel.id);
        renderChannelMainView(channel);
      });

      li.appendChild(link);
      sidebarChannelsList.appendChild(li);
    });

    const activeChannel = channels.find((c) => c.id === window.HuddleApi.getActiveChannelId()) || channels[0];
    if (activeChannel) {
      renderChannelMainView(activeChannel);
    }
  }

  let activeMessagePollInterval = null;

  async function renderChannelMainView(channel) {
    const mainArea = document.getElementById('dashboard-main');
    if (!mainArea || !channel) return;

    if (activeMessagePollInterval) {
      clearInterval(activeMessagePollInterval);
      activeMessagePollInterval = null;
    }

    const currentUser = window.HuddleApi ? window.HuddleApi.getUser() : null;

    mainArea.innerHTML = `
      <div style="display:flex;flex-direction:column;height:100%;width:100%;background:#ffffff;border-radius:18px;overflow:hidden;">
        <!-- Channel Header -->
        <header style="display:flex;align-items:center;justify-content:space-between;padding:16px 24px;border-bottom:1px solid #EAECF0;background:#ffffff;flex-shrink:0;">
          <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
            <span style="display:inline-flex;padding:3px 8px;border-radius:6px;background:#FFF4ED;color:#FF6A00;font-size:12px;font-weight:700;">
              ${escapeHtml(window.HuddleApi.getActiveWorkspaceName() || 'Workspace')}
            </span>
            <span style="font-size:20px;font-weight:700;color:#101828;">#${escapeHtml(channel.name)}</span>
            <span style="display:inline-flex;padding:2px 8px;border-radius:12px;background:#F2F4F7;color:#344054;font-size:12px;font-weight:600;text-transform:capitalize;">
              ${escapeHtml(channel.type || 'public')}
            </span>
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
            </button>
            <button type="button" id="channel-invite-btn" style="display:inline-flex;align-items:center;gap:6px;padding:8px 16px;background:#FF6A00;color:#ffffff;border:none;border-radius:10px;font-size:13px;font-weight:600;cursor:pointer;transition:background 0.15s ease;">
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

        <!-- Channel Chat Messages Area -->
        <div id="channel-messages-container" style="flex:1;overflow-y:auto;padding:24px;display:flex;flex-direction:column;gap:16px;">
          <!-- Welcome Message -->
          <div style="background:#F9FAFB;border:1px solid #EAECF0;border-radius:12px;padding:20px 24px;">
            <div style="font-size:24px;margin-bottom:6px;">👋</div>
            <h3 style="font-size:16px;font-weight:700;color:#101828;margin-bottom:4px;">Welcome to #${escapeHtml(channel.name)}!</h3>
            <p style="font-size:14px;color:#667085;line-height:1.5;">This is the start of the #${escapeHtml(channel.name)} channel. Share messages, files, and collaborate with your workspace teammates.</p>
          </div>

          <!-- Messages List Stream -->
          <div id="messages-list" style="display:flex;flex-direction:column;gap:14px;flex:1;">
            <div style="color:#98A2B3;font-size:13px;text-align:center;padding:12px 0;">Loading messages...</div>
          </div>
        </div>

        <!-- Chat Input Bar -->
        <div style="padding:16px 24px 20px;border-top:1px solid #EAECF0;background:#ffffff;flex-shrink:0;">
          <form id="channel-chat-form" style="display:flex;align-items:center;gap:10px;background:#F9FAFB;border:1px solid #D0D5DD;border-radius:12px;padding:8px 12px;transition:border-color 0.15s ease;">
            <input
              type="text"
              id="channel-chat-input"
              placeholder="Message #${escapeHtml(channel.name)}..."
              autocomplete="off"
              style="flex:1;border:none;background:transparent;outline:none;font-size:14px;color:#101828;padding:4px 6px;"
            />
            <button
              type="submit"
              id="channel-chat-send-btn"
              style="background:#FF6A00;color:#ffffff;border:none;border-radius:8px;padding:7px 14px;font-size:13px;font-weight:600;cursor:pointer;display:inline-flex;align-items:center;gap:6px;transition:background 0.15s ease;"
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

    if (inviteBtn) {
      inviteBtn.addEventListener('click', () => {
        openAddMemberModal(channel);
      });
    }

    async function loadChannelMembers() {
      try {
        const members = await window.HuddleApi.channels.getMembers(channel.id);
        if (membersCountText && Array.isArray(members)) {
          membersCountText.textContent = `${members.length} Member${members.length === 1 ? '' : 's'}`;
        }
        return members;
      } catch {
        return [];
      }
    }

    if (membersCountBtn) {
      membersCountBtn.addEventListener('click', async () => {
        const members = await loadChannelMembers();
        if (!members || members.length === 0) return;
        const membersListStr = members.map((m) => `• ${m.fullName || 'Member'} (@${m.username || 'user'})`).join('\n');
        showActionDialog(`Channel Members (${members.length})`, membersListStr);
      });
    }

    loadChannelMembers();

    let isFetching = false;
    let lastRenderedMessagesKey = '';

    async function loadMessages() {
      if (isFetching) return;
      isFetching = true;
      try {
        const res = await window.HuddleApi.messages.list(channel.id);
        const list = res?.data?.messages || res?.messages || res?.data || (Array.isArray(res) ? res : []);
        const key = list.map((m) => `${m.id}_${m.content || ''}_${m.created_at || m.createdAt}`).join('|');
        if (key !== lastRenderedMessagesKey) {
          lastRenderedMessagesKey = key;
          renderMessages(list);
        }
      } catch (err) {
        console.error('Failed to load messages:', err);
      } finally {
        isFetching = false;
      }
    }

    function renderMessages(messages) {
      if (!messagesList) return;
      if (!messages || messages.length === 0) {
        messagesList.innerHTML = `
          <div style="color:#98A2B3;font-size:13px;text-align:center;padding:24px 0;">
            No messages yet. Say hello to get the conversation started!
          </div>
        `;
        return;
      }

      const sorted = [...messages].sort((a, b) => new Date(a.created_at || a.createdAt || 0) - new Date(b.created_at || b.createdAt || 0));

      messagesList.innerHTML = sorted.map((msg) => {
        const timeStr = msg.created_at ? formatMessageTime(msg.created_at) : '';

        // Slack-style system announcement for member additions
        if (msg.content && msg.content.includes('was added to #')) {
          return `
            <div class="system-announcement-msg">
              <span class="announcement-icon" aria-hidden="true">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                  <circle cx="8.5" cy="7.5" r="4"></circle>
                  <line x1="20" y1="8" x2="20" y2="14"></line>
                  <line x1="23" y1="11" x2="17" y2="11"></line>
                </svg>
              </span>
              <span>${escapeHtml(msg.content)}</span>
              <span style="font-size:11px;color:#98A2B3;margin-left:4px;">${escapeHtml(timeStr)}</span>
            </div>
          `;
        }

        const isMe = currentUser && (msg.sender_id === currentUser.id || msg.senderId === currentUser.id || msg.sender?.id === currentUser.id);
        const senderName = msg.sender?.full_name || msg.sender?.fullName || (isMe ? (currentUser.fullName || 'You') : 'Teammate');
        const senderUsername = msg.sender?.username || (isMe ? (currentUser.username || 'you') : '');
        const initial = senderName.charAt(0).toUpperCase();
        const avatarUrl = msg.sender?.avatar_url || msg.sender?.avatarUrl || (isMe ? currentUser.avatarUrl : null);

        const avatarInnerHtml = avatarUrl
          ? `<img src="${escapeHtml(avatarUrl)}" alt="" style="width:100%;height:100%;object-fit:cover;" />`
          : escapeHtml(initial);

        return `
          <div style="display:flex;align-items:flex-start;gap:12px;padding:8px 10px;border-radius:10px;">
            <div style="width:36px;height:36px;border-radius:50%;background:${isMe ? '#FF6A00' : '#475467'};color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:14px;flex-shrink:0;overflow:hidden;">
              ${avatarInnerHtml}
            </div>
            <div style="flex:1;">
              <div style="display:flex;align-items:center;gap:6px;margin-bottom:3px;flex-wrap:wrap;">
                <span style="font-weight:700;font-size:14px;color:#101828;">${escapeHtml(senderName)}</span>
                ${senderUsername ? `<span style="font-size:12px;font-weight:600;color:#FF6A00;">@${escapeHtml(senderUsername)}</span>` : ''}
                <span style="font-size:11.5px;color:#98A2B3;margin-left:4px;">${escapeHtml(timeStr)}</span>
              </div>
              <div style="font-size:14px;color:#344054;line-height:1.5;word-break:break-word;">
                ${escapeHtml(msg.content || '')}
              </div>
            </div>
          </div>
        `;
      }).join('');

      if (messagesContainer) {
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
      }
    }

    function formatMessageTime(dateString) {
      try {
        const d = new Date(dateString);
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      } catch {
        return '';
      }
    }

    if (chatForm && chatInput) {
      chatForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const text = chatInput.value.trim();
        if (!text) return;

        chatInput.value = '';

        try {
          await window.HuddleApi.messages.send(channel.id, text);
          lastRenderedMessagesKey = '';
          await loadMessages();
        } catch (err) {
          console.error('Failed to send message:', err);
          window.showHuddleToast(err.message || 'Failed to send message. Please try again.', 'error');
        }
      });
    }

    await loadMessages();
    activeMessagePollInterval = setInterval(loadMessages, 1500);
  }

  function openInviteModal() {
    let modal = document.getElementById('invite-member-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'invite-member-modal';
      modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        background: rgba(16, 24, 40, 0.5);
        backdrop-filter: blur(4px);
        z-index: 10000;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 16px;
      `;
      modal.innerHTML = `
        <div style="background:#ffffff;border-radius:16px;max-width:440px;width:100%;padding:28px;box-shadow:0 20px 25px -5px rgba(0,0,0,0.1),0 10px 10px -5px rgba(0,0,0,0.04);position:relative;">
          <button type="button" id="close-invite-modal" style="position:absolute;top:20px;right:20px;background:none;border:none;color:#98A2B3;cursor:pointer;padding:4px;" aria-label="Close modal">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
          <div style="width:48px;height:48px;border-radius:12px;background:#FFF4ED;color:#FF6A00;display:flex;align-items:center;justify-content:center;margin-bottom:16px;">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="8.5" cy="7.5" r="4"></circle><line x1="20" y1="8" x2="20" y2="14"></line><line x1="23" y1="11" x2="17" y2="11"></line></svg>
          </div>
          <h3 style="font-size:20px;font-weight:700;color:#101828;margin-bottom:6px;">Invite Teammates</h3>
          <p style="font-size:14px;color:#667085;margin-bottom:20px;line-height:1.4;">Enter their email address to invite them to this workspace.</p>
          <form id="send-invite-form" style="display:flex;flex-direction:column;gap:14px;">
            <div>
              <label for="invite-email-input" style="display:block;font-size:13px;font-weight:600;color:#344054;margin-bottom:6px;">Email address</label>
              <input
                type="email"
                id="invite-email-input"
                placeholder="colleague@company.com"
                required
                style="width:100%;height:46px;padding:0 14px;border:1.5px solid #D0D5DD;border-radius:10px;font-size:14px;font-family:inherit;outline:none;"
              />
            </div>
            <div style="display:flex;gap:10px;margin-top:8px;">
              <button type="button" id="cancel-invite-btn" style="flex:1;height:44px;border:1px solid #D0D5DD;background:#fff;color:#344054;border-radius:10px;font-weight:600;font-size:14px;cursor:pointer;">Cancel</button>
              <button type="submit" id="submit-invite-btn" style="flex:1;height:44px;border:none;background:#FF6A00;color:#fff;border-radius:10px;font-weight:600;font-size:14px;cursor:pointer;">Send Invite</button>
            </div>
          </form>
        </div>
      `;
      document.body.appendChild(modal);

      modal.querySelector('#close-invite-modal').addEventListener('click', () => {
        modal.style.display = 'none';
      });
      modal.querySelector('#cancel-invite-btn').addEventListener('click', () => {
        modal.style.display = 'none';
      });
      modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.style.display = 'none';
      });

      modal.querySelector('#send-invite-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const emailInput = modal.querySelector('#invite-email-input');
        const submitBtn = modal.querySelector('#submit-invite-btn');
        const email = emailInput?.value.trim();
        if (!email) return;

        const activeWsId = window.HuddleApi.getActiveWorkspaceId();
        if (!activeWsId) {
          window.showHuddleToast('No active workspace selected', 'error');
          return;
        }

        submitBtn.disabled = true;
        submitBtn.textContent = 'Sending...';

        try {
          await window.HuddleApi.invites.send(activeWsId, email);
          window.showHuddleToast(`Invite sent successfully to ${email}!`, 'success');
          modal.style.display = 'none';
          emailInput.value = '';
        } catch (err) {
          window.showHuddleToast(err.message || 'Failed to send invite.', 'error');
        } finally {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Send Invite';
        }
      });
    }

    modal.style.display = 'flex';
    const emailInput = modal.querySelector('#invite-email-input');
    if (emailInput) {
      emailInput.value = '';
      emailInput.focus();
    }
  }

  // Initial Load
  await initializeWorkspace();
});
