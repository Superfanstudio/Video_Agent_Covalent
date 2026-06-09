import { useState, useEffect, useCallback, useRef } from "react";
import CaptionThread from "./CaptionThread";

const API = {
  conversations: "/api/db/admin/conversations",
  conversation: (id) => `/api/db/admin/conversation?id=${encodeURIComponent(id)}`,
  export: "/api/db/admin/export",
  knowledge: "/api/db/admin/knowledge",
  documents: "/api/db/admin/documents",
  document: (id) => `/api/db/admin/document?id=${encodeURIComponent(id)}`,
  ingestFile: "/api/db/admin/ingest-file",
  search: "/api/db/admin/search",
};

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function getJSON(url) {
  const r = await fetch(url);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.hint || j.detail || j.error || `Request failed (${r.status})`);
  return j;
}

function fmt(ts) {
  if (!ts) return "—";
  try { return new Date(ts).toLocaleString(); } catch { return ts; }
}

export default function AdminPanel() {
  const [tab, setTab] = useState("conversations");
  const [error, setError] = useState("");

  return (
    <div className="adm">
      <style>{STYLES}</style>

      <header className="adm-header">
        <a href="/" className="adm-brand">
          <img src="/covalent-logo.svg" alt="Covalent Medical" className="adm-logo" />
          <span className="adm-badge">Admin Console</span>
        </a>
        <a href="/" className="adm-back">← Back to advisor</a>
      </header>

      <nav className="adm-tabs">
        <button className={`adm-tab ${tab === "conversations" ? "on" : ""}`} onClick={() => setTab("conversations")}>
          Conversations
        </button>
        <button className={`adm-tab ${tab === "knowledge" ? "on" : ""}`} onClick={() => setTab("knowledge")}>
          Knowledge Base
        </button>
      </nav>

      {error && <div className="adm-banner">{error}</div>}

      <main className="adm-main">
        {tab === "conversations"
          ? <Conversations onError={setError} />
          : <Knowledge onError={setError} />}
      </main>
    </div>
  );
}

/* ------------------------------------------------------------------ */
function Conversations({ onError }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null); // conversation detail
  const [detailLoading, setDetailLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const j = await getJSON(API.conversations);
      setRows(j.conversations || []);
      onError("");
    } catch (e) { onError(String(e.message || e)); }
    finally { setLoading(false); }
  }, [onError]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional fetch-on-mount
  useEffect(() => { load(); }, [load]);

  const open = async (id) => {
    setDetailLoading(true);
    try { setSelected(await getJSON(API.conversation(id))); }
    catch (e) { onError(String(e.message || e)); }
    finally { setDetailLoading(false); }
  };

  const removeConversation = async (id) => {
    if (!confirm("Delete this conversation and its transcript?")) return;
    try {
      await fetch(API.conversation(id), { method: "DELETE" });
      setSelected(null);
      await load();
    } catch (e) { onError(String(e.message || e)); }
  };

  const exportAll = async () => {
    try {
      const data = await getJSON(API.export);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `covalent-conversations-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) { onError(String(e.message || e)); }
  };

  return (
    <div className="adm-grid">
      <section className="adm-card adm-list">
        <div className="adm-card__head">
          <h2>Conversations <span className="adm-count">{rows.length}</span></h2>
          <div className="adm-actions">
            <button className="adm-btn-ghost" onClick={load}>Refresh</button>
            <button className="adm-btn" onClick={exportAll}>Export</button>
          </div>
        </div>

        <div className="adm-list-scroll">
          {loading ? <p className="adm-muted">Loading…</p> : rows.length === 0 ? (
            <p className="adm-muted">No conversations captured yet.</p>
          ) : (
            <ul className="adm-conv-list">
              {rows.map(c => (
                <li
                  key={c.id}
                  className={`adm-conv ${selected?.id === c.id ? "sel" : ""}`}
                  onClick={() => open(c.id)}
                >
                  <div className="adm-conv-top">
                    <code title={c.client_id}>{shortId(c.client_id)}</code>
                    {c.ended_at
                      ? <span className="adm-pill done">ended</span>
                      : <span className="adm-pill live">open</span>}
                  </div>
                  <div className="adm-conv-meta">
                    {c.avatar_name || "—"} · {c.message_count ?? 0} msgs
                  </div>
                  <div className="adm-conv-time">{c.ip || "—"} · {fmt(c.started_at)}</div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="adm-card adm-detail">
        <div className="adm-card__head">
          <h2>Transcript</h2>
          {selected && (
            <button className="adm-btn-danger" onClick={() => removeConversation(selected.id)}>Delete</button>
          )}
        </div>
        {detailLoading ? <p className="adm-muted">Loading…</p> : !selected ? (
          <p className="adm-muted">Select a conversation to view its transcript.</p>
        ) : (
          <>
            <div className="adm-meta">
              <div><span>Client</span><code>{selected.client_id}</code></div>
              <div><span>IP</span>{selected.ip || "—"}</div>
              <div><span>Advisor</span>{selected.avatar_name || "—"}</div>
              <div><span>Started</span>{fmt(selected.started_at)}</div>
              <div><span>Ended</span>{fmt(selected.ended_at)}</div>
            </div>
            <div className="adm-transcript">
              <CaptionThread
                messages={selected.messages || []}
                userLabel="Visitor"
                empty={<p className="adm-muted">No messages.</p>}
              />
            </div>
          </>
        )}
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------ */
function Knowledge({ onError }) {
  const [entries, setEntries] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState("");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState(null);
  const [searching, setSearching] = useState(false);
  const fileRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [k, d] = await Promise.all([getJSON(API.knowledge), getJSON(API.documents)]);
      setEntries(k.entries || []);
      setDocuments(d.documents || []);
      onError("");
    } catch (e) { onError(String(e.message || e)); }
    finally { setLoading(false); }
  }, [onError]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional fetch-on-mount
  useEffect(() => { load(); }, [load]);

  const add = async () => {
    if (!content.trim()) return;
    setSaving(true);
    try {
      const r = await fetch(API.knowledge, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim() || null, content: content.trim() }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "Failed to save");
      setTitle(""); setContent(""); await load();
    } catch (e) { onError(String(e.message || e)); }
    finally { setSaving(false); }
  };

  const toggleEntry = async (e) => {
    try {
      await fetch(`${API.knowledge}?id=${encodeURIComponent(e.id)}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !e.enabled }),
      });
      await load();
    } catch (err) { onError(String(err.message || err)); }
  };

  const removeEntry = async (id) => {
    try { await fetch(`${API.knowledge}?id=${encodeURIComponent(id)}`, { method: "DELETE" }); await load(); }
    catch (err) { onError(String(err.message || err)); }
  };

  const onFiles = async (fileList) => {
    const files = Array.from(fileList || []);
    for (const file of files) {
      if (file.size > 8 * 1024 * 1024) { onError(`${file.name} exceeds 8 MB.`); continue; }
      setUploading(`Reading ${file.name}…`);
      try {
        const dataBase64 = await fileToBase64(file);
        setUploading(`Embedding ${file.name}… (chunking + vectors)`);
        const r = await fetch(API.ingestFile, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ filename: file.name, mimetype: file.type, dataBase64 }),
        });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.hint || j.error || "Upload failed");
        onError("");
      } catch (e) { onError(`${file.name}: ${String(e.message || e)}`); }
    }
    setUploading("");
    if (fileRef.current) fileRef.current.value = "";
    await load();
  };

  const toggleDoc = async (d) => {
    try {
      await fetch(API.document(d.id), {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !d.enabled }),
      });
      await load();
    } catch (err) { onError(String(err.message || err)); }
  };

  const removeDoc = async (id) => {
    if (!confirm("Delete this document and all its chunks?")) return;
    try { await fetch(API.document(id), { method: "DELETE" }); await load(); }
    catch (err) { onError(String(err.message || err)); }
  };

  const runSearch = async () => {
    if (!query.trim()) return;
    setSearching(true);
    try {
      const r = await fetch(API.search, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: query.trim(), k: 5 }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.hint || j.error || "Search failed");
      setResults(j.results || []);
      onError("");
    } catch (e) { onError(String(e.message || e)); }
    finally { setSearching(false); }
  };

  return (
    <div className="adm-kb">
      <div className="adm-col">
        <section className="adm-card">
          <div className="adm-card__head"><h2>Upload documents</h2></div>
          <p className="adm-muted adm-hint">
            Upload <strong>.txt, .md, .csv, .pdf, or .docx</strong>. Files are extracted, chunked,
            and embedded (OpenAI embeddings via OpenRouter), then added to the advisor's knowledge.
          </p>
          <div
            className="adm-drop"
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); onFiles(e.dataTransfer.files); }}
          >
            <input
              ref={fileRef} type="file" multiple hidden
              accept=".txt,.md,.csv,.pdf,.docx,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              onChange={(e) => onFiles(e.target.files)}
            />
            <strong>Click to choose files</strong> or drag &amp; drop here
            <span className="adm-muted">txt · md · csv · pdf · docx · max 8 MB</span>
          </div>
          {uploading && <p className="adm-uploading">{uploading}</p>}
        </section>

        <section className="adm-card">
          <div className="adm-card__head"><h2>Add text entry</h2></div>
          <input
            className="adm-input"
            placeholder="Title (optional) — e.g. 2026 pricing update"
            value={title} onChange={e => setTitle(e.target.value)}
          />
          <textarea
            className="adm-textarea" rows={4}
            placeholder="Knowledge content the advisor should know and use…"
            value={content} onChange={e => setContent(e.target.value)}
          />
          <button className="adm-btn" onClick={add} disabled={saving || !content.trim()}>
            {saving ? "Saving…" : "Add text entry"}
          </button>
        </section>
      </div>

      <div className="adm-col">
        <section className="adm-card">
          <div className="adm-card__head"><h2>Search knowledge</h2></div>
          <p className="adm-muted adm-hint">Semantic search across uploaded documents (uses embeddings).</p>
          <div className="adm-search-row">
            <input
              className="adm-input" style={{ marginBottom: 0 }}
              placeholder="e.g. what's the warranty on capital devices?"
              value={query} onChange={e => setQuery(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") runSearch(); }}
            />
            <button className="adm-btn" onClick={runSearch} disabled={searching || !query.trim()}>
              {searching ? "…" : "Search"}
            </button>
          </div>
          {results && (
            <div className="adm-results">
              {results.length === 0 ? <p className="adm-muted">No matches.</p> : results.map((r, i) => (
                <div key={i} className="adm-result">
                  <div className="adm-result-head">
                    <span className="adm-result-doc">{r.document_name}</span>
                    <span className="adm-result-score">{(r.score * 100).toFixed(0)}%</span>
                  </div>
                  <p>{r.content}</p>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="adm-card">
          <div className="adm-card__head">
            <h2>Documents <span className="adm-count">{documents.length}</span></h2>
            <button className="adm-btn-ghost" onClick={load}>Refresh</button>
          </div>
          {loading ? <p className="adm-muted">Loading…</p> : documents.length === 0 ? (
            <p className="adm-muted">No documents uploaded yet.</p>
          ) : (
            <ul className="adm-kb-list">
              {documents.map(d => (
                <li key={d.id} className={`adm-kb-item ${d.enabled ? "" : "off"}`}>
                  <div className="adm-kb-body">
                    <div className="adm-kb-title">📄 {d.name}</div>
                    <div className="adm-kb-content">{d.chunk_count} chunks · {d.char_count.toLocaleString()} chars</div>
                    <div className="adm-kb-date">{fmt(d.created_at)}</div>
                  </div>
                  <div className="adm-kb-actions">
                    <button className="adm-btn-ghost" onClick={() => toggleDoc(d)}>{d.enabled ? "Disable" : "Enable"}</button>
                    <button className="adm-btn-danger" onClick={() => removeDoc(d.id)}>Delete</button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="adm-card">
          <div className="adm-card__head">
            <h2>Text entries <span className="adm-count">{entries.length}</span></h2>
          </div>
          {loading ? <p className="adm-muted">Loading…</p> : entries.length === 0 ? (
            <p className="adm-muted">No text entries yet.</p>
          ) : (
            <ul className="adm-kb-list">
              {entries.map(e => (
                <li key={e.id} className={`adm-kb-item ${e.enabled ? "" : "off"}`}>
                  <div className="adm-kb-body">
                    {e.title && <div className="adm-kb-title">{e.title}</div>}
                    <div className="adm-kb-content">{e.content}</div>
                    <div className="adm-kb-date">{fmt(e.created_at)}</div>
                  </div>
                  <div className="adm-kb-actions">
                    <button className="adm-btn-ghost" onClick={() => toggleEntry(e)}>{e.enabled ? "Disable" : "Enable"}</button>
                    <button className="adm-btn-danger" onClick={() => removeEntry(e.id)}>Delete</button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function shortId(id) {
  if (!id) return "—";
  return id.length > 12 ? `${id.slice(0, 8)}…${id.slice(-4)}` : id;
}

const STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
  .adm * { box-sizing: border-box; margin: 0; padding: 0; }
  .adm {
    --ink:#2B3137; --blue:#1573D8; --blue-deep:#0E54C2; --muted:#6B7682;
    --line:#E4E9EF; --surface:#fff; --bg:#F4F8FC; --shadow:rgba(23,52,92,0.08);
    font-family:'Inter',-apple-system,sans-serif; min-height:100vh; color:var(--ink);
    background:linear-gradient(168deg,#fff 0%,#F4F8FC 60%,#EEF3F9 100%);
    -webkit-font-smoothing:antialiased;
  }
  .adm-header { display:flex; align-items:center; justify-content:space-between;
    padding:16px 32px; border-bottom:1px solid var(--line); background:rgba(255,255,255,0.85); backdrop-filter:blur(8px); }
  .adm-brand { display:flex; align-items:center; gap:14px; text-decoration:none; }
  .adm-logo { height:40px; width:auto; display:block; }
  .adm-badge { font-size:11px; letter-spacing:1.5px; text-transform:uppercase; color:var(--blue);
    font-weight:600; background:rgba(21,115,216,0.07); border:1px solid rgba(21,115,216,0.22); padding:6px 12px; border-radius:999px; }
  .adm-back { color:var(--muted); font-size:13px; text-decoration:none; }
  .adm-back:hover { color:var(--blue); }

  .adm-tabs { display:flex; gap:6px; padding:18px 32px 0; }
  .adm-tab { padding:10px 18px; border:none; background:none; cursor:pointer; font-family:inherit;
    font-size:14px; font-weight:600; color:var(--muted); border-bottom:2px solid transparent; }
  .adm-tab.on { color:var(--blue); border-bottom-color:var(--blue); }

  .adm-banner { margin:16px 32px 0; padding:12px 16px; border-radius:10px; font-size:13px;
    background:rgba(209,67,67,0.08); border:1px solid rgba(209,67,67,0.3); color:#B83333; }

  .adm-main { padding:24px 32px 48px; }
  .adm-grid { display:grid; grid-template-columns:360px minmax(0,1fr); gap:20px;
    height:calc(100vh - 196px); min-height:460px; }
  .adm-list { display:flex; flex-direction:column; overflow:hidden; }
  .adm-list-scroll { flex:1; overflow-y:auto; margin:0 -4px; padding:0 4px; }
  .adm-detail { display:flex; flex-direction:column; overflow:hidden; }
  .adm-kb { display:grid; grid-template-columns:minmax(0,1fr) minmax(0,1.2fr); gap:20px; align-items:start; }
  .adm-col { display:flex; flex-direction:column; gap:20px; min-width:0; }

  .adm-drop { border:1.5px dashed #C3D0DE; border-radius:12px; padding:26px 16px; text-align:center;
    cursor:pointer; display:flex; flex-direction:column; gap:6px; color:var(--ink); font-size:14px;
    background:#FAFCFE; transition:border-color .15s, background .15s; }
  .adm-drop:hover { border-color:var(--blue); background:rgba(21,115,216,0.04); }
  .adm-drop span { font-size:11px; color:var(--muted); }
  .adm-uploading { margin-top:12px; font-size:13px; color:var(--blue); font-weight:600; }

  .adm-search-row { display:flex; gap:8px; align-items:center; }
  .adm-results { margin-top:14px; display:flex; flex-direction:column; gap:10px; }
  .adm-result { border:1px solid var(--line); border-radius:10px; padding:12px; background:#FAFCFE; }
  .adm-result-head { display:flex; justify-content:space-between; align-items:center; margin-bottom:6px; }
  .adm-result-doc { font-size:11px; font-weight:700; color:var(--blue); text-transform:uppercase; letter-spacing:0.5px; }
  .adm-result-score { font-size:11px; font-weight:700; color:#1E9E63; background:rgba(34,178,108,0.12); padding:2px 8px; border-radius:999px; }
  .adm-result p { font-size:13px; line-height:1.5; color:#3a424b; }

  .adm-card { background:var(--surface); border:1px solid var(--line); border-radius:14px;
    box-shadow:0 12px 32px var(--shadow); padding:20px; }
  .adm-card__head { display:flex; align-items:center; justify-content:space-between; margin-bottom:14px; gap:12px; }
  .adm-card__head h2 { font-size:15px; font-weight:700; letter-spacing:0.2px; }
  .adm-count { font-size:12px; color:var(--muted); font-weight:600; margin-left:4px; }
  .adm-actions { display:flex; gap:8px; }
  .adm-muted { color:var(--muted); font-size:13px; }
  .adm-hint { margin-bottom:14px; line-height:1.6; }

  .adm-btn { background:linear-gradient(135deg,#1E84E8,#0E54C2); color:#fff; border:none; cursor:pointer;
    padding:9px 16px; border-radius:9px; font-size:13px; font-weight:600; font-family:inherit; }
  .adm-btn:hover:not(:disabled) { filter:brightness(1.06); }
  .adm-btn:disabled { opacity:0.5; cursor:not-allowed; }
  .adm-btn-ghost { background:#fff; color:var(--ink); border:1px solid var(--line); cursor:pointer;
    padding:8px 14px; border-radius:9px; font-size:13px; font-weight:600; font-family:inherit; }
  .adm-btn-ghost:hover { border-color:var(--blue); color:var(--blue); }
  .adm-btn-danger { background:#fff; color:#D14343; border:1px solid rgba(209,67,67,0.35); cursor:pointer;
    padding:8px 14px; border-radius:9px; font-size:13px; font-weight:600; font-family:inherit; }
  .adm-btn-danger:hover { background:rgba(209,67,67,0.08); }

  .adm-conv-list { list-style:none; display:flex; flex-direction:column; gap:8px; }
  .adm-conv { padding:12px 14px; border:1px solid var(--line); border-radius:10px; cursor:pointer;
    background:#fff; transition:border-color .12s, background .12s; }
  .adm-conv:hover { background:#F6F9FC; }
  .adm-conv.sel { border-color:var(--blue); background:rgba(21,115,216,0.06); }
  .adm-conv-top { display:flex; align-items:center; justify-content:space-between; margin-bottom:6px; }
  .adm-conv-top code { background:#F1F4F8; padding:2px 7px; border-radius:5px; font-size:12px; }
  .adm-conv-meta { font-size:13px; color:var(--ink); font-weight:600; }
  .adm-conv-time { font-size:11px; color:var(--muted); margin-top:3px; }
  .adm-pill { font-size:10px; text-transform:uppercase; letter-spacing:1px; font-weight:700; padding:3px 8px; border-radius:999px; }
  .adm-pill.live { background:rgba(34,178,108,0.12); color:#1E9E63; }
  .adm-pill.done { background:#EEF2F6; color:var(--muted); }

  .adm-meta { display:grid; grid-template-columns:1fr 1fr; gap:8px 16px; margin-bottom:16px;
    padding-bottom:14px; border-bottom:1px solid var(--line); font-size:13px; }
  .adm-meta div { display:flex; flex-direction:column; gap:2px; }
  .adm-meta span { font-size:10px; text-transform:uppercase; letter-spacing:1px; color:var(--muted); font-weight:600; }
  .adm-meta code { font-size:12px; word-break:break-all; }

  .adm-transcript { flex:1; overflow-y:auto; padding-right:4px; }

  .adm-input, .adm-textarea { width:100%; padding:11px 14px; border:1px solid var(--line); border-radius:10px;
    font-family:inherit; font-size:14px; color:var(--ink); margin-bottom:12px; outline:none; resize:vertical; background:#fff; }
  .adm-input:focus, .adm-textarea:focus { border-color:var(--blue); box-shadow:0 0 0 3px rgba(21,115,216,0.12); }

  .adm-kb-list { list-style:none; display:flex; flex-direction:column; gap:10px; }
  .adm-kb-item { display:flex; justify-content:space-between; gap:14px; padding:14px; border:1px solid var(--line);
    border-radius:10px; background:#fff; }
  .adm-kb-item.off { opacity:0.55; }
  .adm-kb-title { font-weight:700; font-size:14px; margin-bottom:3px; }
  .adm-kb-content { font-size:13px; line-height:1.5; color:#3a424b; }
  .adm-kb-date { font-size:11px; color:var(--muted); margin-top:6px; }
  .adm-kb-actions { display:flex; flex-direction:column; gap:6px; flex:0 0 auto; }

  @media (max-width:900px) {
    .adm-grid { grid-template-columns:1fr; height:auto; }
    .adm-list-scroll { max-height:300px; }
    .adm-transcript { max-height:480px; }
    .adm-kb { grid-template-columns:1fr; }
    .adm-header, .adm-tabs, .adm-main { padding-left:18px; padding-right:18px; }
  }
`;
