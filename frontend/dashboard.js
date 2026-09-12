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
  // Global Keyboard Shortcuts (Escape Key)
  // ========================================================================

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (joinModalOverlay && joinModalOverlay.classList.contains('open')) {
        closeJoinModal();
      } else if (createModalOverlay && createModalOverlay.classList.contains('open')) {
        closeCreateModal();
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

  async function initializeWorkspace() {
    let currentUser = window.HuddleApi ? window.HuddleApi.getUser() : null;

    // Refresh user profile from backend
    try {
      if (window.HuddleApi) {
        const freshUser = await window.HuddleApi.auth.getMe();
        if (freshUser) {
          currentUser = freshUser;
          window.HuddleApi.setUser(freshUser);
        }
      }
    } catch {}

    // Update user info across UI
    if (currentUser) {
      const userNameEl = document.querySelector('.user-name');
      const userEmailEl = document.querySelector('.user-email');
      const mobileAvatarEl = document.querySelector('.mobile-avatar');

      if (userNameEl) userNameEl.textContent = currentUser.fullName || 'Huddle Member';
      if (userEmailEl) {
        userEmailEl.textContent = currentUser.email || '';
        userEmailEl.title = currentUser.email || '';
      }
      if (mobileAvatarEl) {
        mobileAvatarEl.title = currentUser.fullName || 'User Profile';
      }
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
      }
    } catch (err) {
      console.error('[Huddle] Error during workspace initialization:', err);
    }
  }

  function renderWorkspaceUI(activeWs, allWorkspaces) {
    if (!activeWs) return;

    // Update document title & sidebar triggers
    document.title = `Huddle — ${activeWs.name}`;

    const triggerNameEl = document.querySelector('.workspace-name-text');
    if (triggerNameEl) triggerNameEl.textContent = activeWs.name;

    const popoverTitleEl = document.querySelector('.popover-workspace-title');
    if (popoverTitleEl) popoverTitleEl.textContent = activeWs.name;

    // Render other workspaces in dropdown popover if available
    let existingOthersList = document.getElementById('popover-other-workspaces-list');
    if (!existingOthersList) {
      existingOthersList = document.createElement('div');
      existingOthersList.id = 'popover-other-workspaces-list';
      const popoverHeader = document.querySelector('.popover-row-header');
      if (popoverHeader && popoverHeader.parentNode) {
        popoverHeader.parentNode.insertBefore(existingOthersList, popoverHeader.nextSibling);
      }
    }

    existingOthersList.innerHTML = '';
    const otherWorkspaces = (allWorkspaces || []).filter((w) => w.id !== activeWs.id);

    if (otherWorkspaces.length > 0) {
      otherWorkspaces.forEach((w) => {
        const itemBtn = document.createElement('button');
        itemBtn.type = 'button';
        itemBtn.className = 'popover-item-btn';
        itemBtn.style.padding = '8px 16px';
        itemBtn.innerHTML = `
          <div class="popover-avatar-lg" style="width:24px;height:24px;font-size:12px;" aria-hidden="true">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
            </svg>
          </div>
          <span class="popover-item-label" style="font-size:13px;font-weight:600;">${escapeHtml(w.name)}</span>
        `;

        itemBtn.addEventListener('click', async () => {
          window.HuddleApi.setActiveWorkspaceId(w.id);
          window.HuddleApi.setActiveWorkspaceName(w.name);
          window.HuddleApi.setActiveChannelId('');
          togglePopover(false);
          window.showHuddleToast(`Switched to "${w.name}"`, 'info');
          await initializeWorkspace();
        });

        existingOthersList.appendChild(itemBtn);
      });
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

  function renderChannelMainView(channel) {
    const mainArea = document.getElementById('dashboard-main');
    if (!mainArea || !channel) return;

    mainArea.innerHTML = `
      <div style="display:flex;flex-direction:column;height:100%;width:100%;background:#ffffff;border-radius:18px;overflow:hidden;">
        <!-- Channel Header -->
        <header style="display:flex;align-items:center;justify-content:space-between;padding:18px 24px;border-bottom:1px solid #EAECF0;background:#ffffff;">
          <div style="display:flex;align-items:center;gap:10px;">
            <span style="font-size:20px;font-weight:700;color:#101828;">#${escapeHtml(channel.name)}</span>
            <span style="display:inline-flex;padding:2px 8px;border-radius:12px;background:#F2F4F7;color:#344054;font-size:12px;font-weight:600;text-transform:capitalize;">
              ${escapeHtml(channel.type || 'public')}
            </span>
          </div>
          <div style="display:flex;align-items:center;gap:12px;">
            <a href="create-channel.html" style="display:inline-flex;align-items:center;gap:6px;padding:8px 14px;background:#FF6A00;color:#ffffff;border-radius:10px;font-size:13px;font-weight:600;text-decoration:none;transition:background 0.15s ease;">
              + New Channel
            </a>
          </div>
        </header>

        <!-- Channel Chat Messages Area -->
        <div style="flex:1;overflow-y:auto;padding:28px 24px;display:flex;flex-direction:column;justify-content:flex-end;">
          <div style="max-width:540px;margin-bottom:24px;">
            <div style="width:48px;height:48px;border-radius:14px;background:#FFF4ED;display:flex;align-items:center;justify-content:center;margin-bottom:14px;color:#FF6A00;">
              <span style="font-size:24px;font-weight:800;">#</span>
            </div>
            <h2 style="font-size:22px;font-weight:700;color:#101828;margin-bottom:6px;">Welcome to #${escapeHtml(channel.name)}!</h2>
            <p style="font-size:14px;color:#667085;line-height:1.5;">This is the start of the #${escapeHtml(channel.name)} channel. Share messages, files, and collaborate with your workspace teammates.</p>
          </div>
        </div>

        <!-- Chat Input Area -->
        <div style="padding:16px 24px;border-top:1px solid #EAECF0;background:#ffffff;">
          <div style="display:flex;align-items:center;gap:10px;background:#F9FAFB;border:1px solid #D0D5DD;border-radius:12px;padding:8px 14px;">
            <input
              type="text"
              placeholder="Message #${escapeHtml(channel.name)}"
              style="flex:1;background:none;border:none;outline:none;font-size:14px;color:#101828;font-family:inherit;"
              onkeydown="if(event.key==='Enter'){window.showHuddleToast('Messaging connection active. Type messages to chat!','info');this.value='';}"
            />
            <button type="button" style="background:#FF6A00;border:none;border-radius:8px;padding:6px 12px;color:#fff;font-weight:600;font-size:13px;cursor:pointer;">Send</button>
          </div>
        </div>
      </div>
    `;
  }

  // Initial Load
  await initializeWorkspace();
});
