// Client-side conversation capture. Talks to /api/db/* which persists to Supabase
// server-side. All calls are best-effort and never block or break the UI.

const CLIENT_KEY = "cv_client_id";

// A persistent, unique id for this browser/device (the "system id").
export function getClientId() {
  try {
    let id = localStorage.getItem(CLIENT_KEY);
    if (!id) {
      id = (crypto?.randomUUID?.() || `cid-${Date.now()}-${Math.round(Math.random() * 1e9)}`);
      localStorage.setItem(CLIENT_KEY, id);
    }
    return id;
  } catch {
    return "anon";
  }
}

export async function createConversation(payload) {
  try {
    const r = await fetch("/api/db/conversation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const j = await r.json().catch(() => ({}));
    return r.ok ? j.id : null;
  } catch {
    return null;
  }
}

export function postMessage(payload) {
  try {
    fetch("/api/db/message", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      keepalive: true,
    }).catch(() => {});
  } catch { /* ignore */ }
}

export function endConversation(conversation_id) {
  if (!conversation_id) return;
  try {
    fetch("/api/db/end", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversation_id }),
      keepalive: true,
    }).catch(() => {});
  } catch { /* ignore */ }
}
