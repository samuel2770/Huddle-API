/**
 * Huddle Create Channel - Interactive Multi-Step Flow Controller
 * Step 1: Channel details (name & visibility type)
 * Step 2: Add team members (email chip list & simulated loading spinner)
 * Step 3: Channel Created success screen (confirmation & sidebar sync)
 */

document.addEventListener('DOMContentLoaded', async () => {
  // Enforce authentication guard
  if (window.HuddleApi && !window.HuddleApi.requireAuth('signin.html')) {
    return;
  }

  // LocalStorage key for channel persistence fallback
  const STORAGE_KEY = 'huddle_channels';

  // Application Flow State
  const channelState = {
    name: '',
    type: 'public',
    members: []
  };

  // --------------------------------------------------------------------------
  // DOM Elements
  // --------------------------------------------------------------------------

  // Shell & Layout Containers
  const channelMainContent = document.getElementById('channel-main-content');
  const mobileContextText = document.getElementById('mobile-context-text');

  // STEP 1 Elements (Channel Details)
  const channelDetailsSection = document.getElementById('channel-details-section');
  const channelNameInput = document.getElementById('channel-name-input');
  const channelInputWrapper = document.getElementById('channel-input-wrapper');
  const cardPublic = document.getElementById('card-public-channel');
  const cardPrivate = document.getElementById('card-private-channel');
  const channelBackBtn = document.getElementById('channel-back-btn');
  const channelNextBtn = document.getElementById('channel-next-btn');
  const createChannelForm = document.getElementById('create-channel-form');

  // STEP 2 Elements (Add Team Members)
  const channelMembersSection = document.getElementById('channel-members-section');
  const addMembersForm = document.getElementById('add-members-form');
  const inviteEmailInput = document.getElementById('invite-email-input');
  const inviteInputWrapper = document.getElementById('invite-input-wrapper');
  const membersChipList = document.getElementById('members-chip-list');
  const membersBackBtn = document.getElementById('members-back-btn');
  const membersSubmitBtn = document.getElementById('members-submit-btn');
  const submitBtnText = document.getElementById('submit-btn-text');
  const submitSpinner = document.getElementById('submit-spinner');

  // STEP 3 Elements (Channel Created Success)
  const channelSuccessSection = document.getElementById('channel-success-section');
  const successChannelName = document.getElementById('success-channel-name');
  const visitChannelBtn = document.getElementById('visit-channel-btn');
  const createAnotherBtn = document.getElementById('create-another-btn');

  // Shared Sidebar & Popover Elements
  const sidebarSectionsWrapper = document.getElementById('sidebar-sections-wrapper');
  const sidebarChannelsList = document.getElementById('sidebar-channels-list');
  const sidebarAddChannelBtn = document.getElementById('sidebar-add-channel-btn');
  const sidebarAddDmBtn = document.getElementById('sidebar-add-dm-btn');
  const switcherTrigger = document.getElementById('workspace-switcher-trigger');
  const workspacePopover = document.getElementById('workspace-popover');
  const searchInput = document.getElementById('sidebar-search-input');
  const sidebarLogoutBtn = document.getElementById('sidebar-logout-btn');

  // Mobile Drawer Elements
  const mobileMenuBtn = document.getElementById('mobile-menu-btn');
  const drawerCloseBtn = document.getElementById('drawer-close-btn');
  const drawerBackdrop = document.getElementById('drawer-backdrop');
  const sidebar = document.getElementById('dashboard-sidebar');

  // Demo Action Dialog Elements
  const actionDialog = document.getElementById('action-dialog');
  const dialogTitle = document.getElementById('action-dialog-title');
  const dialogMessage = document.getElementById('action-dialog-message');
  const dialogCloseBtn = document.getElementById('action-dialog-close-btn');

  // Utility to escape HTML entities
  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // Basic email format validator
  function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  }

  // --------------------------------------------------------------------------
  // LocalStorage Persistence Helpers
  // --------------------------------------------------------------------------

  function getStoredChannels() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      console.warn('[Huddle] Failed to parse stored channels:', e);
      return [];
    }
  }

  function persistChannel(name, type, members = []) {
    const channels = getStoredChannels();
    const cleanName = name.trim().replace(/^#/, '');
    const existingIndex = channels.findIndex(
      (c) => c.name.toLowerCase() === cleanName.toLowerCase()
    );

    // Mark previous channels as not brand new
    channels.forEach((c) => {
      c.isNew = false;
    });

    const newChannelRecord = {
      name: cleanName,
      type: type || 'public',
      members: members,
      isNew: true,
      createdAt: Date.now()
    };

    if (existingIndex >= 0) {
      channels[existingIndex] = newChannelRecord;
    } else {
      channels.push(newChannelRecord);
    }

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(channels));
    } catch (e) {
      console.warn('[Huddle] Failed to save channel to localStorage:', e);
    }

    return newChannelRecord;
  }

  // Render channels into the sidebar CHANNEL section
  function renderSidebarChannels() {
    const channels = getStoredChannels();

    if (!sidebarSectionsWrapper || !sidebarChannelsList) return;

    if (channels.length === 0) {
      sidebarSectionsWrapper.style.display = 'none';
      return;
    }

    // Reveal channels and DMs sections once at least one channel exists
    sidebarSectionsWrapper.style.display = 'flex';
    sidebarChannelsList.innerHTML = '';

    channels.forEach((channel) => {
      const li = document.createElement('li');
      li.className = 'sidebar-channel-item';
      if (channel.name.toLowerCase() === (channelState.name || '').toLowerCase()) {
        li.classList.add('active');
      }

      const link = document.createElement('a');
      link.href = 'dashboard.html';
      link.className = 'sidebar-channel-link';
      link.innerHTML = `
        <span class="channel-link-prefix" aria-hidden="true">#</span>
        <span class="channel-link-name">${escapeHtml(channel.name)}</span>
      `;

      li.appendChild(link);

      // Render red notification dot badge for the new channel
      if (channel.isNew) {
        const dot = document.createElement('span');
        dot.className = 'channel-badge-dot';
        dot.setAttribute('aria-label', 'New activity');
        dot.setAttribute('title', 'New channel');
        li.appendChild(dot);
      }

      sidebarChannelsList.appendChild(li);
    });
  }

  // --------------------------------------------------------------------------
  // Step 1: Channel Details Logic
  // --------------------------------------------------------------------------

  let selectedChannelType = null;
  const typeCards = [cardPublic, cardPrivate];

  function evaluateFormValidity() {
    if (!channelNameInput || !channelNextBtn) return;

    const hasName = channelNameInput.value.trim().length > 0;
    const hasType = selectedChannelType !== null;
    const isValid = hasName && hasType;

    if (isValid) {
      channelNextBtn.disabled = false;
      channelNextBtn.classList.add('active');
    } else {
      channelNextBtn.disabled = true;
      channelNextBtn.classList.remove('active');
    }
  }

  function selectChannelType(selectedCard) {
    if (!selectedCard) return;

    typeCards.forEach((card) => {
      if (!card) return;
      if (card === selectedCard) {
        card.classList.add('selected');
        card.setAttribute('aria-checked', 'true');
        selectedChannelType = card.getAttribute('data-type');
        channelState.type = selectedChannelType;
      } else {
        card.classList.remove('selected');
        card.setAttribute('aria-checked', 'false');
      }
    });

    evaluateFormValidity();
  }

  // Input Focus & Blur Handlers
  if (channelNameInput && channelInputWrapper) {
    channelNameInput.addEventListener('focus', () => {
      channelInputWrapper.classList.add('focused');
    });

    channelNameInput.addEventListener('blur', () => {
      channelInputWrapper.classList.remove('focused');
    });

    channelNameInput.addEventListener('input', () => {
      channelState.name = channelNameInput.value.trim();
      evaluateFormValidity();
    });
  }

  // Card Selection Handlers
  typeCards.forEach((card) => {
    if (!card) return;
    card.addEventListener('click', () => selectChannelType(card));
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        selectChannelType(card);
      }
    });
  });

  // Step 1 Back Button: Return to Dashboard
  if (channelBackBtn) {
    channelBackBtn.addEventListener('click', () => {
      window.location.href = 'dashboard.html';
    });
  }

  // Step 1 Form Submit -> Proceed to Step 2
  if (createChannelForm) {
    createChannelForm.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!channelNextBtn || channelNextBtn.disabled) return;

      channelState.name = channelNameInput.value.trim() || 'Department';
      channelState.type = selectedChannelType || 'public';

      transitionToStep2();
    });
  }

  // --------------------------------------------------------------------------
  // Step 2: Add Team Members Logic & Chips Management
  // --------------------------------------------------------------------------

  function renderMemberChips() {
    if (!membersChipList) return;
    membersChipList.innerHTML = '';

    channelState.members.forEach((email, index) => {
      const chip = document.createElement('div');
      chip.className = 'members-chip';
      chip.setAttribute('role', 'listitem');

      const emailSpan = document.createElement('span');
      emailSpan.className = 'chip-email-text';
      emailSpan.textContent = email;

      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'chip-remove-btn';
      removeBtn.setAttribute('aria-label', `Remove ${email}`);
      removeBtn.textContent = '×';

      removeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        removeMemberChip(index);
      });

      chip.appendChild(emailSpan);
      chip.appendChild(removeBtn);
      membersChipList.appendChild(chip);
    });
  }

  function addMemberChip(rawText) {
    if (!rawText) return;
    // Split by commas or whitespace if multiple
    const tokens = rawText.split(/[,\s]+/).map((t) => t.trim()).filter(Boolean);

    let addedAny = false;
    tokens.forEach((email) => {
      if (isValidEmail(email)) {
        // Prevent duplicate entries
        const lower = email.toLowerCase();
        const exists = channelState.members.some((m) => m.toLowerCase() === lower);
        if (!exists) {
          channelState.members.push(email);
          addedAny = true;
        }
      }
    });

    if (addedAny) {
      renderMemberChips();
    }
  }

  function removeMemberChip(index) {
    if (index >= 0 && index < channelState.members.length) {
      channelState.members.splice(index, 1);
      renderMemberChips();
    }
  }

  // Invite Email Input Events (Enter, Comma, Paste)
  if (inviteEmailInput && inviteInputWrapper) {
    inviteEmailInput.addEventListener('focus', () => {
      inviteInputWrapper.classList.add('focused');
    });

    inviteEmailInput.addEventListener('blur', () => {
      // If there is valid text still in the input on blur, convert to chip
      const value = inviteEmailInput.value.trim();
      if (value) {
        addMemberChip(value);
        inviteEmailInput.value = '';
      }
      inviteInputWrapper.classList.remove('focused');
    });

    inviteEmailInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ',') {
        e.preventDefault();
        const value = inviteEmailInput.value.trim();
        if (value) {
          addMemberChip(value);
          inviteEmailInput.value = '';
        }
      } else if (e.key === 'Backspace' && inviteEmailInput.value === '') {
        // If backspace on empty input, remove last chip
        if (channelState.members.length > 0) {
          removeMemberChip(channelState.members.length - 1);
        }
      }
    });

    inviteEmailInput.addEventListener('paste', (e) => {
      e.preventDefault();
      const pasted = (e.clipboardData || window.clipboardData).getData('text');
      if (pasted) {
        addMemberChip(pasted);
        inviteEmailInput.value = '';
      }
    });
  }

  // Step 2 Back Button -> Return to Step 1
  if (membersBackBtn) {
    membersBackBtn.addEventListener('click', () => {
      transitionToStep1();
    });
  }

  // Step 2 Form Submit -> Simulate Async Creation with Loading Spinner -> Step 3
  if (addMembersForm) {
    addMembersForm.addEventListener('submit', (e) => {
      e.preventDefault();
      handleCreateChannelSubmission();
    });
  }

  async function handleCreateChannelSubmission() {
    if (membersSubmitBtn.classList.contains('loading')) return;

    // Check if input has uncommitted text
    if (inviteEmailInput && inviteEmailInput.value.trim()) {
      addMemberChip(inviteEmailInput.value.trim());
      inviteEmailInput.value = '';
    }

    let workspaceId = window.HuddleApi ? window.HuddleApi.getActiveWorkspaceId() : null;
    if (!workspaceId && window.HuddleApi) {
      try {
        const workspaces = await window.HuddleApi.workspaces.list();
        if (workspaces && workspaces.length > 0) {
          workspaceId = workspaces[0].id;
          window.HuddleApi.setActiveWorkspaceId(workspaceId);
          window.HuddleApi.setActiveWorkspaceName(workspaces[0].name);
        }
      } catch {}
    }

    if (!workspaceId) {
      window.showHuddleToast?.('No active workspace found. Redirecting to dashboard...', 'error');
      setTimeout(() => (window.location.href = 'dashboard.html'), 1200);
      return;
    }

    // Switch button to loading state
    membersSubmitBtn.classList.add('loading');
    if (mobileContextText) {
      mobileContextText.textContent = 'Creating channel...';
    }

    try {
      const channel = await window.HuddleApi.channels.create(
        workspaceId,
        channelState.name,
        channelState.type || 'public'
      );

      // If team members' emails were entered, send workspace invites
      if (channelState.members && channelState.members.length > 0) {
        for (const email of channelState.members) {
          try {
            await window.HuddleApi.invites.send(workspaceId, email);
          } catch (invErr) {
            console.warn(`[Huddle] Invite warning for ${email}:`, invErr.message);
          }
        }
      }

      window.HuddleApi.setActiveChannelId(channel.id);
      window.HuddleApi.setActiveChannelName(channel.name);

      persistChannel(channel.name, channel.type, channelState.members);
      renderSidebarChannels();

      membersSubmitBtn.classList.remove('loading');
      transitionToStep3(channel.name);
    } catch (err) {
      membersSubmitBtn.classList.remove('loading');
      console.error('[Huddle Create Channel Error]:', err);
      window.showHuddleToast?.(err.message || 'Failed to create channel', 'error');
    }
  }

  // --------------------------------------------------------------------------
  // Multi-Step Screen Transitions
  // --------------------------------------------------------------------------

  function transitionToStep1() {
    if (channelDetailsSection) channelDetailsSection.style.display = 'block';
    if (channelMembersSection) channelMembersSection.style.display = 'none';
    if (channelSuccessSection) channelSuccessSection.style.display = 'none';

    if (channelMainContent) {
      channelMainContent.classList.remove('is-success-state');
    }

    if (mobileContextText) {
      mobileContextText.textContent = 'Create channel';
    }

    document.title = 'Huddle — Create Channel';

    // Retain entered name and type
    if (channelNameInput) {
      channelNameInput.value = channelState.name;
    }
    if (channelState.type === 'public') {
      selectChannelType(cardPublic);
    } else if (channelState.type === 'private') {
      selectChannelType(cardPrivate);
    }

    evaluateFormValidity();
    if (channelNameInput) channelNameInput.focus();
  }

  function transitionToStep2() {
    if (channelDetailsSection) channelDetailsSection.style.display = 'none';
    if (channelMembersSection) channelMembersSection.style.display = 'block';
    if (channelSuccessSection) channelSuccessSection.style.display = 'none';

    if (channelMainContent) {
      channelMainContent.classList.remove('is-success-state');
    }

    // Small muted breadcrumb label above top bar reading "Create channel loading"
    if (mobileContextText) {
      mobileContextText.textContent = 'Create channel loading';
    }

    document.title = 'Huddle — Add Team Members';

    renderMemberChips();

    // Focus invite input
    if (inviteEmailInput) {
      inviteEmailInput.focus();
    }
  }

  function transitionToStep3(channelName) {
    if (channelDetailsSection) channelDetailsSection.style.display = 'none';
    if (channelMembersSection) channelMembersSection.style.display = 'none';
    if (channelSuccessSection) channelSuccessSection.style.display = 'flex';

    if (channelMainContent) {
      channelMainContent.classList.add('is-success-state');
    }

    // Set dynamic channel tag (e.g. #Department)
    const displayName = channelName || channelState.name || 'Department';
    if (successChannelName) {
      successChannelName.textContent = `#${displayName}`;
    }

    // Mobile breadcrumb label: "Channel created successfully"
    if (mobileContextText) {
      mobileContextText.textContent = 'Channel created successfully';
    }

    document.title = 'Huddle — Channel Created';
  }

  // --------------------------------------------------------------------------
  // Step 3: Success Screen Action Buttons
  // --------------------------------------------------------------------------

  // "Visit your new channel" -> Navigates to dashboard
  if (visitChannelBtn) {
    visitChannelBtn.addEventListener('click', () => {
      window.location.href = 'dashboard.html';
    });
  }

  // "Create another channel" -> Resets flow and returns to Step 1
  if (createAnotherBtn) {
    createAnotherBtn.addEventListener('click', () => {
      resetChannelCreationFlow();
    });
  }

  function resetChannelCreationFlow() {
    channelState.name = '';
    channelState.type = null;
    channelState.members = ['sam@email.com', 'semilore@email.com', 'justus@email.com'];
    selectedChannelType = null;

    if (channelNameInput) {
      channelNameInput.value = '';
    }

    typeCards.forEach((card) => {
      if (card) {
        card.classList.remove('selected');
        card.setAttribute('aria-checked', 'false');
      }
    });

    transitionToStep1();
  }

  // --------------------------------------------------------------------------
  // Shared Sidebar Actions
  // --------------------------------------------------------------------------

  // "+" icon next to CHANNEL in sidebar
  if (sidebarAddChannelBtn) {
    sidebarAddChannelBtn.addEventListener('click', (e) => {
      e.preventDefault();
      // If already on create-channel page, reset to Step 1
      resetChannelCreationFlow();
    });
  }

  // "+" icon next to DMS in sidebar
  if (sidebarAddDmBtn) {
    sidebarAddDmBtn.addEventListener('click', () => {
      showActionDialog('Direct Messages', 'Direct messaging flow coming soon!');
    });
  }

  // Workspace Popover Logic
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

  // Mobile Drawer Toggle
  function openMobileDrawer() {
    if (sidebar && drawerBackdrop) {
      sidebar.classList.add('drawer-open');
      drawerBackdrop.classList.add('active');
      document.body.style.overflow = 'hidden';
    }
  }

  function closeMobileDrawer() {
    if (sidebar && drawerBackdrop) {
      sidebar.classList.remove('drawer-open');
      drawerBackdrop.classList.remove('active');
      document.body.style.overflow = '';
    }
  }

  if (mobileMenuBtn) mobileMenuBtn.addEventListener('click', openMobileDrawer);
  if (drawerCloseBtn) drawerCloseBtn.addEventListener('click', closeMobileDrawer);
  if (drawerBackdrop) drawerBackdrop.addEventListener('click', closeMobileDrawer);

  // Keyboard Shortcuts (Escape)
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      togglePopover(false);
      closeMobileDrawer();
      closeActionDialog();
    }
  });

  // Demo Action Dialog Helper
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

  if (dialogCloseBtn) dialogCloseBtn.addEventListener('click', closeActionDialog);
  if (actionDialog) {
    actionDialog.addEventListener('click', (e) => {
      if (e.target === actionDialog) closeActionDialog();
    });
  }

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

  // --------------------------------------------------------------------------
  // URL Query Parameters Support (?step=members | ?step=success)
  // --------------------------------------------------------------------------

  const urlParams = new URLSearchParams(window.location.search);
  const paramStep = urlParams.get('step');
  const paramChannel = urlParams.get('channel');

  if (paramChannel) {
    channelState.name = paramChannel;
    if (channelNameInput) channelNameInput.value = paramChannel;
  }

  // Workspace Name & Profile Display
  const currentWsName = window.HuddleApi ? window.HuddleApi.getActiveWorkspaceName() : 'My Workspace';
  const switcherText = document.querySelector('.workspace-name-text');
  if (switcherText) switcherText.textContent = currentWsName;
  const popoverTitle = document.querySelector('.popover-workspace-title');
  if (popoverTitle) popoverTitle.textContent = currentWsName;

  const currentUser = window.HuddleApi ? window.HuddleApi.getUser() : null;
  if (currentUser) {
    const userNameEl = document.querySelector('.user-name');
    const userEmailEl = document.querySelector('.user-email');
    if (userNameEl) userNameEl.textContent = currentUser.fullName || 'Huddle Member';
    if (userEmailEl) {
      userEmailEl.textContent = currentUser.email || '';
      userEmailEl.title = currentUser.email || '';
    }
  }

  // Initial Load: Render sidebar channels
  renderSidebarChannels();
  const activeWsId = window.HuddleApi ? window.HuddleApi.getActiveWorkspaceId() : null;
  if (activeWsId && window.HuddleApi) {
    window.HuddleApi.channels.list(activeWsId).then((channels) => {
      if (channels && channels.length > 0) {
        channels.forEach((c) => persistChannel(c.name, c.type, []));
        renderSidebarChannels();
      }
    }).catch(() => {});
  }

  if (paramStep === 'members') {
    transitionToStep2();
  } else if (paramStep === 'success') {
    transitionToStep3(channelState.name);
  } else {
    // Default initial step: Step 1
    if (channelNameInput && channelNameInput.value.trim()) {
      selectChannelType(cardPublic);
    }
    evaluateFormValidity();
  }
});
