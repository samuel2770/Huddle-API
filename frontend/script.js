/**
 * Huddle Login Page - Interactive Logic & State Management
 */

document.addEventListener('DOMContentLoaded', () => {
  // DOM Elements
  const form = document.getElementById('login-form');
  const emailInput = document.getElementById('email');
  const emailWrapper = document.getElementById('email-input-wrapper');
  const passwordInput = document.getElementById('password');
  const passwordWrapper = document.getElementById('password-input-wrapper');
  const passwordGroup = document.getElementById('password-field-group');
  const togglePasswordBtn = document.getElementById('toggle-password-btn');
  const errorBanner = document.getElementById('error-banner');
  const continueBtn = document.getElementById('continue-btn');
  const successModal = document.getElementById('success-modal');
  const successCloseBtn = document.getElementById('success-close-btn');

  // State
  let isErrorActive = false;
  let isSubmitting = false;

  // Standard email validation pattern
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  /**
   * Update the email icon and password field muted state based on email focus & value.
   * Specification:
   * - Empty + focused: switch left icon to person icon, warm focus ring, password field muted.
   * - Has value / unfocused: mail icon, neutral border (or error state), password normal.
   */
  function updateEmailAndMutedState() {
    const isEmailFocused = document.activeElement === emailInput;
    const isEmailEmpty = emailInput.value.trim() === '';

    if (isEmailFocused && isEmailEmpty) {
      emailWrapper.classList.add('show-person-icon');
      passwordGroup.classList.add('muted');
    } else {
      emailWrapper.classList.remove('show-person-icon');
      passwordGroup.classList.remove('muted');
    }

    if (isEmailFocused) {
      emailWrapper.classList.add('focused');
    } else {
      emailWrapper.classList.remove('focused');
    }
  }

  /**
   * Check whether form inputs pass client-side validation rules:
   * 1. Valid email format
   * 2. Non-empty password
   */
  function checkFormValidity() {
    const emailVal = emailInput.value.trim();
    const passwordVal = passwordInput.value;
    const isEmailValid = emailRegex.test(emailVal);
    const isPasswordValid = passwordVal.length > 0;

    return isEmailValid && isPasswordValid;
  }

  /**
   * Re-evaluates validity and updates the Continue button state.
   * If error is active, button is kept disabled.
   */
  function evaluateContinueButton() {
    if (isErrorActive || isSubmitting) {
      setContinueButtonActive(false);
      return;
    }

    const isValid = checkFormValidity();
    setContinueButtonActive(isValid);
  }

  /**
   * Set Continue button active/disabled UI states
   */
  function setContinueButtonActive(isActive) {
    if (isActive) {
      continueBtn.disabled = false;
      continueBtn.classList.add('active');
    } else {
      continueBtn.disabled = true;
      continueBtn.classList.remove('active');
    }
  }

  /**
   * Clears the error banner and red borders when user modifies any input.
   */
  function clearErrorState() {
    if (!isErrorActive) return;

    isErrorActive = false;
    errorBanner.classList.remove('visible');
    emailWrapper.classList.remove('error');
    passwordWrapper.classList.remove('error');
    evaluateContinueButton();
  }

  /**
   * Applies the error state on failed authentication:
   * - Error banner shown
   * - Red borders + red glow on both input fields
   * - Continue button forced back to disabled
   */
  function applyErrorState() {
    isErrorActive = true;
    errorBanner.classList.add('visible');
    emailWrapper.classList.add('error');
    passwordWrapper.classList.add('error');
    setContinueButtonActive(false);

    // Announce error for accessibility screen readers
    errorBanner.setAttribute('aria-hidden', 'false');
  }

  /**
   * Simulated authentication check
   * Successful credential: email "grace@teamname.com" and password "password123"
   * Any mismatch triggers the specified error state.
   */
  async function simulateAuth(email, password) {
    isSubmitting = true;
    continueBtn.classList.add('loading');
    setContinueButtonActive(false);

    try {
      let data;
      if (window.HuddleApi) {
        data = await window.HuddleApi.auth.login(email, password);
      } else {
        const base = window.location.origin.includes('localhost:3000') ? '' : 'http://localhost:3000';
        let res = await fetch(`${base}/api/v1/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password }),
        }).catch(() => null);

        if (!res || !res.ok) {
          res = await fetch(`${base}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password }),
          }).catch(() => null);
        }

        if (!res || !res.ok) {
          const errData = res ? await res.json().catch(() => ({})) : {};
          const msg = Array.isArray(errData.message)
            ? errData.message.join(', ')
            : errData.message || 'Invalid email or password, please try again';
          throw new Error(msg);
        }

        data = await res.json();
        const token = data.accessToken || data.data?.accessToken;
        const user = data.user || data.data?.user;
        if (token) localStorage.setItem('huddle_token', token);
        if (user) localStorage.setItem('huddle_user', JSON.stringify(user));
      }

      console.log('[Huddle Auth] Authentication successful for:', email);
      if (successModal) {
        successModal.classList.add('open');
        successModal.setAttribute('aria-hidden', 'false');
        setTimeout(() => {
          window.location.href = 'dashboard.html';
        }, 800);
      } else {
        window.location.href = 'dashboard.html';
      }
    } catch (err) {
      console.warn('[Huddle Auth] Authentication error:', err.message);
      if (errorBanner) {
        const textSpan = errorBanner.querySelector('.error-text');
        if (textSpan) textSpan.textContent = err.message || 'Invalid email or password, please try again';
      }
      applyErrorState();
    } finally {
      isSubmitting = false;
      continueBtn.classList.remove('loading');
    }
  }

  // --- Event Listeners ---

  // Email Focus / Blur / Input
  emailInput.addEventListener('focus', () => {
    updateEmailAndMutedState();
  });

  emailInput.addEventListener('blur', () => {
    updateEmailAndMutedState();
  });

  emailInput.addEventListener('input', () => {
    clearErrorState();
    updateEmailAndMutedState();
    evaluateContinueButton();
  });

  // Password Focus / Blur / Input
  passwordInput.addEventListener('focus', () => {
    passwordWrapper.classList.add('focused');
  });

  passwordInput.addEventListener('blur', () => {
    passwordWrapper.classList.remove('focused');
  });

  passwordInput.addEventListener('input', () => {
    clearErrorState();
    evaluateContinueButton();
  });

  // Toggle Password Visibility (Eye Icon)
  togglePasswordBtn.addEventListener('click', (e) => {
    e.preventDefault();
    const isCurrentlyPassword = passwordInput.type === 'password';
    passwordInput.type = isCurrentlyPassword ? 'text' : 'password';
    togglePasswordBtn.classList.toggle('showing-password', isCurrentlyPassword);

    togglePasswordBtn.setAttribute(
      'aria-label',
      isCurrentlyPassword ? 'Hide password' : 'Show password'
    );
    passwordInput.focus();
  });

  // Form Submission
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (continueBtn.disabled || isSubmitting) {
      return;
    }

    const email = emailInput.value.trim();
    const password = passwordInput.value;

    if (checkFormValidity() && !isErrorActive) {
      simulateAuth(email, password);
    }
  });

  // Success Modal Close / Enter Workspace
  if (successCloseBtn) {
    successCloseBtn.addEventListener('click', () => {
      window.location.href = 'dashboard.html';
    });
  }

  // Language Selector Interactive Feedback
  const langSelector = document.getElementById('lang-selector');
  if (langSelector) {
    langSelector.addEventListener('click', () => {
      const current = langSelector.querySelector('.lang-text').textContent.trim();
      const nextLang = current === 'ENG US' ? 'ENG UK' : 'ENG US';
      langSelector.querySelector('.lang-text').textContent = nextLang;
    });
  }

  // Initial State Check
  updateEmailAndMutedState();
  evaluateContinueButton();
});
