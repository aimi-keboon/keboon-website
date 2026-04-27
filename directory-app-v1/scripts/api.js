async function apiGet(action, params = {}) {
  const url = new URL(APP_CONFIG.API_BASE_URL);
  url.searchParams.set('action', action);

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, value);
    }
  });

  const response = await fetch(url.toString());
  const result = await response.json();

  if (!result.ok) {
    throw new Error(result.error?.message || 'API request failed');
  }

  return result.data;
}

async function apiPost(action, payload = {}) {
  const response = await fetch(APP_CONFIG.API_BASE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/plain;charset=utf-8',
    },
    body: JSON.stringify({
      action,
      ...payload,
    }),
  });

  const result = await response.json();

  if (!result.ok) {
    throw new Error(result.error?.message || 'API request failed');
  }

  return result.data;
}