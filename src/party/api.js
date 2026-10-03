export const PARTY_API = '/api/party.php';

export async function partyPost(body) {
  const res = await fetch(PARTY_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (!res.ok) {
    const err = new Error(data?.error || `Party ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return data;
}
