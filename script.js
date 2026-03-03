'use strict';

/* =========================================================
   Shared helpers
========================================================= */

const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

function safeGet(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // ignore (private mode / blocked storage)
  }
}

function getFocusableElements(container) {
  if (!container) return [];
  return Array.from(
    container.querySelectorAll(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((el) => !el.hasAttribute('hidden') && el.getClientRects().length);
}

/* =========================================================
   Theme switching (dark/light)
========================================================= */

const THEME_KEY = 'theme';
const root = document.documentElement;
const themeToggles = Array.from(document.querySelectorAll('[data-theme-toggle]'));
const colorSchemeQuery = window.matchMedia('(prefers-color-scheme: light)');

function normalizeTheme(value) {
  return value === 'light' || value === 'dark' ? value : null;
}

function getSystemTheme() {
  return colorSchemeQuery.matches ? 'light' : 'dark';
}

function getInitialTheme() {
  const stored = normalizeTheme(safeGet(THEME_KEY));
  if (stored) return stored;

  const fromMarkup = normalizeTheme(root.getAttribute('data-theme'));
  if (fromMarkup) return fromMarkup;

  return getSystemTheme();
}

function applyTheme(theme, { persist = false } = {}) {
  const normalized = normalizeTheme(theme) ?? 'dark';
  root.setAttribute('data-theme', normalized);

  if (persist) safeSet(THEME_KEY, normalized);

  // aria-pressed: "true" means light mode is ON (you can invert if you prefer)
  const pressed = normalized === 'light' ? 'true' : 'false';
  const label = normalized === 'light' ? 'Switch to dark theme' : 'Switch to light theme';

  themeToggles.forEach((btn) => {
    btn.setAttribute('aria-pressed', pressed);
    btn.setAttribute('aria-label', label);
  });
}

function toggleTheme() {
  const current = normalizeTheme(root.getAttribute('data-theme')) ?? 'dark';
  const next = current === 'dark' ? 'light' : 'dark';
  applyTheme(next, { persist: true });
}

// Init
applyTheme(getInitialTheme(), { persist: false });

themeToggles.forEach((btn) => {
  btn.addEventListener('click', toggleTheme);
});

// If user hasn't chosen a theme, follow system changes
colorSchemeQuery.addEventListener('change', () => {
  const stored = normalizeTheme(safeGet(THEME_KEY));
  if (!stored) applyTheme(getSystemTheme(), { persist: false });
});

/* =========================================================
   Back-to-top button (show after 300 px + lift near footer)
========================================================= */

const backToTopBtn = document.getElementById('backToTop');
const footer = document.getElementById('pageFooter');

if (backToTopBtn) {
  const SHOW_AFTER_PX = 300;

  function updateBackToTop() {
    const isVisible = window.scrollY >= SHOW_AFTER_PX;

    backToTopBtn.classList.toggle('is-visible', isVisible);

    // Prevent keyboard focus when hidden (keep this)
    backToTopBtn.tabIndex = isVisible ? 0 : -1;
    backToTopBtn.setAttribute('aria-hidden', String(!isVisible));
  }

  updateBackToTop();
  window.addEventListener('scroll', updateBackToTop, { passive: true });

  backToTopBtn.addEventListener('click', () => {
    const behavior = prefersReducedMotion.matches ? 'auto' : 'smooth';
    window.scrollTo({ top: 0, left: 0, behavior });
  });

  // Lift it when the footer is visible (prevents overlap)
  if (footer && 'IntersectionObserver' in window) {
    const io = new IntersectionObserver(
      ([entry]) => {
        backToTopBtn.classList.toggle('is-lifted', entry.isIntersecting);
      },
      { threshold: 0.01 },
    );

    io.observe(footer);
  }
}

/* =========================================================
   Offcanvas navigation (open/close + accessibility)
========================================================= */

const navToggle = document.getElementById('navToggle');
const offcanvasNav = document.getElementById('offcanvasNav');
const backdrop = document.querySelector('.nav-backdrop');

let navOpen = false;
let restoreFocusEl = null;

function setTabbable(container, enabled) {
  if (!container) return;

  const all = Array.from(
    container.querySelectorAll('a[href], button, input, select, textarea, [tabindex]'),
  );

  all.forEach((el) => {
    const key = 'prevTabindex';

    if (!enabled) {
      if (!(key in el.dataset)) {
        el.dataset[key] = el.hasAttribute('tabindex') ? el.getAttribute('tabindex') : '';
      }
      el.setAttribute('tabindex', '-1');
    } else if (key in el.dataset) {
      const prev = el.dataset[key];
      delete el.dataset[key];

      if (prev === '') el.removeAttribute('tabindex');
      else el.setAttribute('tabindex', prev);
    }
  });
}

function setNavOpen(open) {
  navOpen = open;

  document.body.classList.toggle('nav-open', open);

  if (navToggle) navToggle.setAttribute('aria-expanded', String(open));
  if (offcanvasNav) offcanvasNav.setAttribute('aria-hidden', String(!open));
  if (backdrop) backdrop.setAttribute('aria-hidden', String(!open));

  // Prevent tabbing to offcanvas/backdrop when closed
  if ('inert' in HTMLElement.prototype) {
    if (offcanvasNav) offcanvasNav.inert = !open;
    if (backdrop) backdrop.inert = !open;
  } else {
    setTabbable(offcanvasNav, open);
  }

  if (backdrop) backdrop.tabIndex = open ? 0 : -1;

  if (open) {
    restoreFocusEl = document.activeElement;
    const focusables = getFocusableElements(offcanvasNav);
    if (focusables[0]) focusables[0].focus({ preventScroll: true });
  } else if (restoreFocusEl && typeof restoreFocusEl.focus === 'function') {
    restoreFocusEl.focus({ preventScroll: true });
  }
}

function closeNav() {
  setNavOpen(false);
}

function trapFocus(e) {
  if (!navOpen || e.key !== 'Tab' || !offcanvasNav) return;

  const focusables = getFocusableElements(offcanvasNav);
  if (focusables.length === 0) return;

  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  const active = document.activeElement;

  if (e.shiftKey && active === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && active === last) {
    e.preventDefault();
    first.focus();
  }
}

if (navToggle && offcanvasNav && backdrop) {
  // Initial state
  setNavOpen(false);

  navToggle.addEventListener('click', () => {
    setNavOpen(!navOpen);
  });

  backdrop.addEventListener('click', closeNav);

  offcanvasNav.addEventListener('click', (e) => {
    if (e.target && e.target.matches('a[href]')) closeNav();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && navOpen) closeNav();
    trapFocus(e);
  });
}
