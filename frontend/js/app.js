/**
 * Huddle Auth Frontend Controller
 * Handles live validation, password toggle, button states, and backend API integration.
 */

// Backend API Base URL
const API_BASE_URL = (() => {
  if (typeof window.__HUDDLE_API_URL__ === 'string' && window.__HUDDLE_API_URL__.trim()) {
    return window.__HUDDLE_API_URL__.trim().replace(/\/+$/, '');
  }
  if (window.HuddleApi && window.HuddleApi.BASE_URL !== undefined) {
    return window.HuddleApi.BASE_URL;
  }
  if (window.location && window.location.protocol && window.location.protocol.startsWith('http')) {
    return '';
  }
  return 'http://localhost:3000';
})();

document.addEventListener('DOMContentLoaded', () => {
  // If already authenticated, redirect to dashboard
  if (window.HuddleApi && !window.location.search.includes('logout=true')) {
    if (window.HuddleApi.redirectIfAuthenticated('dashboard.html')) {
      return;
    }
  }

  initPasswordToggles();
  initPasswordRequirements();
  initFormValidation();
  initAuthFormSubmit();
});

/**
 * Toggle password visibility (eye icon)
 */
function initPasswordToggles() {
  const toggleButtons = document.querySelectorAll('[data-toggle="password"]');
  
  toggleButtons.forEach((button) => {
    button.addEventListener('click', (e) => {
      e.preventDefault();
      const targetId = button.getAttribute('data-target');
      const input = document.getElementById(targetId);
      if (!input) return;

      const isPassword = input.type === 'password';
      input.type = isPassword ? 'text' : 'password';

      // Update eye icon SVG
      button.innerHTML = isPassword ? getEyeOffIcon() : getEyeIcon();
      button.setAttribute('aria-label', isPassword ? 'Hide password' : 'Show password');
    });
  });
}

/**
 * Password requirements real-time chip validation and dropdown
 */
function initPasswordRequirements() {
  const passwordInput = document.getElementById('password');
  const reqContainer = document.getElementById('passwordRequirements');
  if (!passwordInput || !reqContainer) return;

  const chips = {
    lower: reqContainer.querySelector('[data-req="lower"]'),
    number: reqContainer.querySelector('[data-req="number"]'),
    upper: reqContainer.querySelector('[data-req="upper"]'),
    special: reqContainer.querySelector('[data-req="special"]'),
    length: reqContainer.querySelector('[data-req="length"]'),
  };

  function checkPasswordRequirements(val) {
    return {
      lower: /[a-z]/.test(val),
      number: /[0-9]/.test(val),
      upper: /[A-Z]/.test(val),
      special: /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?`~]/.test(val),
      length: val.length >= 8,
    };
  }

  function updateChips() {
    const val = passwordInput.value;
    const checks = checkPasswordRequirements(val);
    let allMet = true;

    for (const [key, met] of Object.entries(checks)) {
      const chip = chips[key];
      if (!chip) continue;
      const icon = chip.querySelector('.req-icon');
      if (met) {
        chip.classList.add('met');
        chip.classList.remove('unmet');
        if (icon) icon.textContent = '✓';
      } else {
        chip.classList.add('unmet');
        chip.classList.remove('met');
        if (icon) icon.textContent = '✕';
        allMet = false;
      }
    }
    return allMet;
  }

  // When user clicks or focuses into password input, drop down the requirements
  const openDropdown = () => {
    reqContainer.classList.add('is-open');
    updateChips();
  };

  passwordInput.addEventListener('focus', openDropdown);
  passwordInput.addEventListener('click', openDropdown);
  passwordInput.addEventListener('input', () => {
    openDropdown();
    updateChips();
  });

  passwordInput.addEventListener('blur', () => {
    if (!passwordInput.value) {
      reqContainer.classList.remove('is-open');
    }
  });

  // Initial state setup
  updateChips();
}

/**
 * Real-time form validation to enable / disable the Continue button
 */
function initFormValidation() {
  const forms = document.querySelectorAll('.auth-form');

  forms.forEach((form) => {
    const submitBtn = form.querySelector('.submit-btn');
    const nameInput = form.querySelector('#name');
    const emailInput = form.querySelector('#email');
    const passwordInput = form.querySelector('#password');
    const reqContainer = form.querySelector('#passwordRequirements');

    const checkValidity = () => {
      let isValid = true;

      // Check name if present (signup form)
      if (nameInput) {
        const nameVal = nameInput.value.trim();
        const wrapper = nameInput.closest('.input-wrapper');
        if (nameVal.length >= 2) {
          wrapper?.classList.add('has-value');
        } else {
          wrapper?.classList.remove('has-value');
          isValid = false;
        }
      }

      // Check email
      if (emailInput) {
        const emailVal = emailInput.value.trim();
        const wrapper = emailInput.closest('.input-wrapper');
        const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (emailVal.length > 0 && emailPattern.test(emailVal)) {
          wrapper?.classList.add('has-value');
        } else {
          wrapper?.classList.remove('has-value');
          isValid = false;
        }
      }

      // Check password
      if (passwordInput) {
        const passVal = passwordInput.value;
        const wrapper = passwordInput.closest('.input-wrapper');
        if (passVal.length > 0) {
          wrapper?.classList.add('has-value');
        } else {
          wrapper?.classList.remove('has-value');
        }

        if (reqContainer) {
          // Signup form requires all 5 password rules
          const checks = {
            lower: /[a-z]/.test(passVal),
            number: /[0-9]/.test(passVal),
            upper: /[A-Z]/.test(passVal),
            special: /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?`~]/.test(passVal),
            length: passVal.length >= 8,
          };
          const allChecksPassed = Object.values(checks).every(Boolean);
          if (!allChecksPassed) {
            isValid = false;
          }
        } else {
          // Signin form requires non-empty password
          if (passVal.length < 1) {
            isValid = false;
          }
        }
      }

      if (submitBtn) {
        if (isValid) {
          submitBtn.removeAttribute('disabled');
          submitBtn.classList.add('is-active');
        } else {
          submitBtn.setAttribute('disabled', 'true');
          submitBtn.classList.remove('is-active');
        }
      }
    };

    const inputs = form.querySelectorAll('input');
    inputs.forEach((input) => {
      input.addEventListener('input', checkValidity);
      input.addEventListener('change', checkValidity);
      
      const wrapper = input.closest('.input-wrapper');
      input.addEventListener('focus', () => {
        wrapper?.classList.add('active-border');
      });
      input.addEventListener('blur', () => {
        wrapper?.classList.remove('active-border');
      });
    });

    // Run initial check
    checkValidity();
  });
}

/**
 * Handle form submission and backend API integration
 */
function initAuthFormSubmit() {
  const signupForm = document.getElementById('signupForm');
  const signinForm = document.getElementById('signinForm');

  if (signupForm) {
    signupForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      await handleSignup(signupForm);
    });
  }

  if (signinForm) {
    signinForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      await handleSignin(signinForm);
    });
  }
}

/**
 * Execute Sign Up POST /api/v1/auth/signup
 */
async function handleSignup(form) {
  const submitBtn = form.querySelector('.submit-btn');
  const nameInput = document.getElementById('name');
  const emailInput = document.getElementById('email');
  const passwordInput = document.getElementById('password');

  const fullName = nameInput?.value.trim();
  const email = emailInput?.value.trim();
  const password = passwordInput?.value;

  if (!fullName || !email || !password) {
    return;
  }

  const hasLower = /[a-z]/.test(password);
  const hasUpper = /[A-Z]/.test(password);
  const hasNum = /[0-9]/.test(password);
  const hasSpecial = /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?`~]/.test(password);
  const hasLength = password.length >= 8;

  if (!hasLower || !hasUpper || !hasNum || !hasSpecial || !hasLength) {
    // Unmet requirement chips already show red - no notification needed
    return;
  }

  setButtonLoading(submitBtn, true);

  try {
    if (window.HuddleApi) {
      await window.HuddleApi.auth.signup(fullName, email, password);
      // Automatically log user in
      try {
        await window.HuddleApi.auth.login(email, password);
        showToast('Account created! Welcome to Huddle.', 'success');
        setTimeout(() => {
          window.location.href = 'dashboard.html';
        }, 1000);
        return;
      } catch {
        showToast('Account created successfully! Please sign in.', 'success');
        setTimeout(() => {
          window.location.href = 'signin.html';
        }, 1200);
        return;
      }
    }

    // Fallback if HuddleApi not loaded
    const res = await fetch(`${API_BASE_URL}/api/v1/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fullName, email, password }),
    });
    const data = await res.json();
    if (res.ok) {
      showToast('Account created successfully! Redirecting...', 'success');
      setTimeout(() => {
        window.location.href = 'signin.html';
      }, 1200);
    } else {
      const msg = Array.isArray(data.message) ? data.message.join(', ') : (data.message || 'Registration failed');
      showToast(msg, 'error');
    }
  } catch (err) {
    console.error('Signup error:', err);
    showToast(err.message || 'Could not connect to backend server. Make sure API is running.', 'error');
  } finally {
    setButtonLoading(submitBtn, false);
  }
}

/**
 * Execute Sign In POST /api/v1/auth/login
 */
async function handleSignin(form) {
  const submitBtn = form.querySelector('.submit-btn');
  const emailInput = document.getElementById('email');
  const passwordInput = document.getElementById('password');

  const email = emailInput?.value.trim();
  const password = passwordInput?.value;

  if (!email || !password) {
    showToast('Please enter your email and password.', 'error');
    return;
  }

  setButtonLoading(submitBtn, true);

  try {
    if (window.HuddleApi) {
      const data = await window.HuddleApi.auth.login(email, password);
      showToast(`Welcome back${data.user?.fullName ? ', ' + data.user.fullName : ''}!`, 'success');
      setTimeout(() => {
        window.location.href = 'dashboard.html';
      }, 900);
      return;
    }

    const res = await fetch(`${API_BASE_URL}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (res.ok) {
      const token = data.accessToken || data.data?.accessToken;
      const user = data.user || data.data?.user;
      if (token) localStorage.setItem('huddle_token', token);
      if (user) localStorage.setItem('huddle_user', JSON.stringify(user));
      showToast('Signed in successfully!', 'success');
      setTimeout(() => {
        window.location.href = 'dashboard.html';
      }, 900);
    } else {
      const msg = Array.isArray(data.message) ? data.message.join(', ') : (data.message || 'Invalid email or password.');
      showToast(msg, 'error');
    }
  } catch (err) {
    console.error('Signin error:', err);
    showToast(err.message || 'Could not connect to backend server. Make sure API is running.', 'error');
  } finally {
    setButtonLoading(submitBtn, false);
  }
}

/**
 * Button Loading State Toggle
 */
function setButtonLoading(button, isLoading) {
  if (!button) return;
  if (isLoading) {
    button.classList.add('loading');
    button.setAttribute('disabled', 'true');
    const textSpan = button.querySelector('.btn-text');
    if (textSpan) textSpan.setAttribute('data-original-text', textSpan.textContent);
    if (textSpan) textSpan.textContent = 'Please wait...';
  } else {
    button.classList.remove('loading');
    button.removeAttribute('disabled');
    const textSpan = button.querySelector('.btn-text');
    if (textSpan && textSpan.getAttribute('data-original-text')) {
      textSpan.textContent = textSpan.getAttribute('data-original-text');
    }
  }
}

/**
 * Toast Notification Popup
 */
function showToast(message, type = 'info') {
  let container = document.querySelector('.toast-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  
  let iconSvg = '';
  if (type === 'success') {
    iconSvg = `<svg class="toast-icon" width="20" height="20" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="10" fill="#10b981"/><path d="M6 10l3 3 5-5" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  } else if (type === 'error') {
    iconSvg = `<svg class="toast-icon" width="20" height="20" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="10" fill="#ef4444"/><path d="M7 7l6 6M13 7l-6 6" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  } else {
    iconSvg = `<svg class="toast-icon" width="20" height="20" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="10" fill="#3b82f6"/><path d="M10 6v5M10 14h.01" stroke="#fff" stroke-width="2" stroke-linecap="round"/></svg>`;
  }

  toast.innerHTML = `
    ${iconSvg}
    <span>${escapeHtml(message)}</span>
  `;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(-10px)';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

function escapeHtml(string) {
  const div = document.createElement('div');
  div.textContent = string;
  return div.innerHTML;
}

function getEyeIcon() {
  return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
    <circle cx="12" cy="12" r="3"></circle>
  </svg>`;
}

function getEyeOffIcon() {
  return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
    <line x1="1" y1="1" x2="23" y2="23"></line>
  </svg>`;
}
