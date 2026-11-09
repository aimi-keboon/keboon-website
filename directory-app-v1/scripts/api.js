const API_TIMEOUT_MS = 20000;

// Keep the existing Apps Script API contract while providing bounded requests
// and clearer failures when the network or endpoint is unavailable.
async function apiRequest(url, options = {}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    if (!response.ok) {
      throw new Error(`API request failed (HTTP ${response.status})`);
    }
    const result = await response.json();
    if (!result || !result.ok) {
      throw new Error(result?.error?.message || 'API request failed');
    }
    return result.data;
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error('Request timed out. Please try again.');
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function apiGet(action, params = {}) {
  const url = new URL(APP_CONFIG.API_BASE_URL);
  url.searchParams.set('action', action);

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, value);
    }
  });
  return apiRequest(url.toString());
}

async function apiPost(action, payload = {}) {
  return apiRequest(APP_CONFIG.API_BASE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/plain;charset=utf-8',
    },
    body: JSON.stringify({ action, ...payload }),
  });
}
