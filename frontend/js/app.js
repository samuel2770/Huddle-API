/**
 * Huddle Auth Frontend Controller
 * Handles live validation, password toggle, button states, and backend API integration.
 */

// Backend API Base URL
const API_BASE_URL = window.location.origin.includes('localhost:3000')
  ? ''
  : 'http://localhost:3000';

document.addEventListener('DOMContentLoaded', () => {
  // If already authenticated, redirect to dashboard
  if (window.HuddleApi && !window.location.search.includes('logout=true')) {
    if (window.HuddleApi.redirectIfAuthenticated('dashboard.html')) {
      return;
    }
  }

  initPasswordToggles();
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
 * Real-time form validation to enable / disable the Continue button
 */
function initFormValidation() {
  const forms = document.querySelectorAll('.auth-form');

  forms.forEach((form) => {
    const submitBtn = form.querySelector('.submit-btn');
    const inputs = form.querySelectorAll('input[required]');

    const checkValidity = () => {
      let allFilled = true;
      inputs.forEach((input) => {
        const wrapper = input.closest('.input-wrapper');
        if (input.value.trim().length > 0) {
          wrapper?.classList.add('has-value');
        } else {
          wrapper?.classList.remove('has-value');
          allFilled = false;
        }

        // Basic email check if it's an email field
        if (input.type === 'email' && input.value.trim().length > 0) {
          const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          if (!emailPattern.test(input.value.trim())) {
            allFilled = false;
          }
        }

        // Password length check
        if (input.type === 'password' && input.value.length < 6) {
          allFilled = false;
        }
      });

      if (submitBtn) {
        if (allFilled) {
          submitBtn.removeAttribute('disabled');
          submitBtn.classList.add('is-active');
        } else {
          submitBtn.setAttribute('disabled', 'true');
          submitBtn.classList.remove('is-active');
        }
      }
    };

    inputs.forEach((input) => {
      input.addEventListener('input', checkValidity);
      input.addEventListener('change', checkValidity);
      
      // Highlight wrapper active border on focus
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
    showToast('Please fill in all required fields.', 'error');
    return;
  }

  if (password.length < 8) {
    showToast('Password must be at least 8 characters long.', 'error');
    return;
  }

  const hasLower = /[a-z]/.test(password);
  const hasUpper = /[A-Z]/.test(password);
  const hasNum = /\d/.test(password);
  const hasSpecial = /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?`~]/.test(password);

  if (!hasLower || !hasUpper || !hasNum || !hasSpecial) {
    showToast('Password must contain uppercase, lowercase, number, and special character.', 'error');
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
