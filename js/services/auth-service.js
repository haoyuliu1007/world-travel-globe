(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(typeof globalThis !== 'undefined' ? globalThis : root);
  } else {
    root.AuthService = factory(root);
  }
})(typeof window !== 'undefined' ? window : globalThis, function (global) {
  'use strict';

  const ACTIVE_USER_KEY = 'wtg_active_user_id';
  let currentUser = null;
  let lastCaps = null;

  async function refreshSession() {
    const Api = global.ApiClient;
    try {
      const caps = Api ? await Api.detectWorkerCapabilities() : { available: false, features: {} };
      lastCaps = caps;
      if (!caps || !caps.available || !caps.features || !caps.features.auth) {
        currentUser = null;
        return { available: false, authenticated: false, user: null, caps };
      }
      const res = await fetch('/api/auth/me', { credentials: 'same-origin' });
      const data = await res.json().catch(() => null);
      if (res.ok && data && data.authenticated && data.user) {
        currentUser = data.user;
        try {
          if (global.localStorage) global.localStorage.setItem(ACTIVE_USER_KEY, currentUser.id);
        } catch (e) {}
        return { available: true, authenticated: true, user: currentUser, caps };
      }
      currentUser = null;
      return { available: true, authenticated: false, user: null, caps };
    } catch (e) {
      currentUser = null;
      return { available: false, authenticated: false, user: null, caps: lastCaps };
    }
  }

  async function apiPost(path, body, method) {
    const res = await fetch(path, {
      method: method || 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: body !== undefined ? JSON.stringify(body) : undefined
    });
    const data = await res.json().catch(() => ({ ok: false, error: `HTTP ${res.status}` }));
    return Object.assign({ status: res.status }, data);
  }

  async function register(email, password, displayName) {
    const res = await apiPost('/api/auth/register', { email, password, displayName });
    if (res.ok && res.user) currentUser = res.user;
    return res;
  }

  async function login(email, password) {
    const res = await apiPost('/api/auth/login', { email, password });
    if (res.ok && res.user) currentUser = res.user;
    return res;
  }

  async function logout(opts) {
    await apiPost('/api/auth/logout', {});
    currentUser = null;
    try {
      if (global.localStorage) global.localStorage.removeItem(ACTIVE_USER_KEY);
    } catch (e) {}
    if (opts && opts.wipeAccountLocal && global.StorageDB) {
      await global.StorageDB.wipeAllUserData(true);
    }
    return { ok: true };
  }

  async function updateProfile(patch) {
    return apiPost('/api/account/profile', patch, 'PUT');
  }

  async function migrateLocalArchive() {
    if (!global.StorageDB) return { ok: false, error: 'StorageDB unavailable' };
    await global.StorageDB.createLocalBackupSnapshot();
    const snap = await global.StorageDB.exportAllUserData({ includeSecrets: false });
    return apiPost('/api/account/migrate-local', snap, 'POST');
  }

  async function exportAccountData() {
    const res = await fetch('/api/account/export', { credentials: 'same-origin' });
    return res.json().catch(() => null);
  }

  async function deleteAccount() {
    const res = await apiPost('/api/account', undefined, 'DELETE');
    if (res.ok) {
      currentUser = null;
      try {
        if (global.localStorage) global.localStorage.removeItem(ACTIVE_USER_KEY);
      } catch (e) {}
    }
    return res;
  }

  function getCurrentUser() {
    return currentUser;
  }

  async function openAccountCenter() {
    if (global.LazyLoader && typeof global.LazyLoader.loadScript === 'function') {
      await global.LazyLoader.loadScript('js/lazy/account-center.js');
    }
    if (global.AccountCenter && typeof global.AccountCenter.open === 'function') {
      return global.AccountCenter.open();
    }
  }

  return {
    refreshSession,
    register,
    login,
    logout,
    updateProfile,
    migrateLocalArchive,
    exportAccountData,
    deleteAccount,
    getCurrentUser,
    openAccountCenter
  };
});
