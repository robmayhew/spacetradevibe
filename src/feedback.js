const API = '/api';

export async function fetchFeatures() {
  const res = await fetch(`${API}/feedback.php?kind=feature`);
  if (!res.ok) throw new Error('offline');
  return res.json();
}

export async function submitFeedback(payload) {
  const res = await fetch(`${API}/feedback.php`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || 'offline');
    err.status = res.status;
    err.body = data;
    throw err;
  }
  return data;
}
