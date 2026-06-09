// Shared transcript renderer used by BOTH the live caption rail (avatar app)
// and the admin console, so the two always look identical. Consecutive lines
// from the same speaker are grouped under a single label.

export default function CaptionThread({
  messages = [],
  liveUser = "",
  liveAvatar = "",
  userLabel = "You",
  empty = null,
}) {
  const items = messages.map((m) => ({ id: m.id, role: m.role, text: m.text, live: false }));
  if (liveUser) items.push({ id: "live-user", role: "user", text: liveUser, live: true });
  if (liveAvatar) items.push({ id: "live-avatar", role: "avatar", text: liveAvatar, live: true });

  if (items.length === 0) return empty;

  // Group consecutive items by speaker.
  const groups = [];
  for (const it of items) {
    const last = groups[groups.length - 1];
    if (last && last.role === it.role) last.items.push(it);
    else groups.push({ role: it.role, items: [it] });
  }

  return (
    <div className="ct">
      <style>{CT_STYLES}</style>
      {groups.map((g, gi) => (
        <div key={gi} className={`ct-group ct-${g.role === "user" ? "user" : "avatar"}`}>
          <span className="ct-who">{g.role === "user" ? userLabel : "Advisor"}</span>
          <div className="ct-bubbles">
            {g.items.map((it) => (
              <p key={it.id} className={`ct-bubble ${it.live ? "ct-live" : ""}`}>
                {it.text}
                {it.live && <span className="ct-caret" aria-hidden="true" />}
              </p>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

const CT_STYLES = `
  .ct { display:flex; flex-direction:column; gap:16px; }
  .ct-group { display:flex; flex-direction:column; gap:6px; align-items:flex-start; }
  .ct-who { font-size:10px; letter-spacing:1.5px; text-transform:uppercase; font-weight:700; }
  .ct-user .ct-who { color: var(--muted, #6B7682); }
  .ct-avatar .ct-who { color: var(--blue, #1573D8); }
  .ct-bubbles { display:flex; flex-direction:column; gap:6px; width:100%; }
  .ct-bubble {
    font-size:14px; line-height:1.55; color: var(--ink, #2B3137);
    padding:10px 13px; border-radius:12px; max-width:100%;
    border:1px solid var(--line, #E4E9EF); border-top-left-radius:4px;
  }
  .ct-user .ct-bubble { background:#F1F4F8; }
  .ct-avatar .ct-bubble { background:rgba(21,115,216,0.07); border-color:rgba(21,115,216,0.22); }
  .ct-bubble.ct-live { opacity:0.92; }
  .ct-caret {
    display:inline-block; width:7px; height:1.05em; margin-left:3px;
    vertical-align:text-bottom; background:var(--blue, #1573D8);
    animation:ct-blink 1s steps(2,start) infinite;
  }
  @keyframes ct-blink { 0%,100%{opacity:1;} 50%{opacity:0;} }
`;
