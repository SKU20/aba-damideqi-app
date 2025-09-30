/**
 * Send one or more Expo push messages.
 * @param {Array|Object} messages - Message or array of messages: { to, title, body, data, channelId }
 * @returns {Promise<object>} Expo API response JSON
 */
async function sendExpoPushAsync(messages) {
  const payload = Array.isArray(messages) ? messages : [messages];
  const doFetch = async (url, opts) => {
    if (typeof fetch === 'function') return fetch(url, opts);
    const mod = await import('node-fetch');
    return mod.default(url, opts);
  };

  console.log('[push] Sending Expo push payloads:', payload.length);
  const res = await doFetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.warn('[push] Expo push failed', res.status, json);
  }
  console.log('[push] Expo push response:', json);
  return json;
}

module.exports = { sendExpoPushAsync };
