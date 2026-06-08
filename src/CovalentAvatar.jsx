import { useState, useRef, useEffect } from "react";
import {
  LiveAvatarSession, SessionEvent, SessionState,
  VoiceChatEvent, AgentEventsEnum,
} from "@heygen/liveavatar-web-sdk";

const QUICK_QUESTIONS = [
  "Why partner with Covalent?",
  "How does the private-label capital model work?",
  "What are the GPO terms for injectables and fillers?",
  "Will this cannibalize my direct sales force?",
  "What does Covalify do for my brand?",
  "What is the revenue opportunity per partner?",
  "How are regenerative suppliers handled?",
  "What are the next steps to partner?",
];

// Signature corner-bracket motif from the Covalent deck.
function CornerBracket({ flip = false }) {
  return (
    <svg
      className={`cv-bracket ${flip ? "cv-bracket--flip" : ""}`}
      width="64" height="64" viewBox="0 0 64 64" fill="none" aria-hidden="true"
    >
      <path d="M2 2 H40" stroke="currentColor" strokeWidth="2" />
      <path d="M2 2 V40" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

export default function CovalentAvatar() {
  const [sessionState, setSessionState] = useState(SessionState.INACTIVE);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [avatars, setAvatars] = useState([]);
  const [voices, setVoices] = useState([]);
  const [selectedAvatarId, setSelectedAvatarId] = useState("");
  const [selectedVoiceId, setSelectedVoiceId] = useState("");
  const [micState, setMicState] = useState("off"); // off | starting | listening | muted
  const [micError, setMicError] = useState("");
  const [userTranscript, setUserTranscript] = useState("");
  const [avatarSpeaking, setAvatarSpeaking] = useState(false);
  const sessionRef = useRef(null);
  const videoRef = useRef(null);

  const startSession = async () => {
    if (sessionRef.current) return;
    setError("");
    setLoading(true);
    try {
      const tokenRes = await fetch("/api/heygen/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "FULL",
          avatar_id: selectedAvatarId || undefined,
          voice_id: selectedVoiceId || undefined,
        }),
      });
      const tokenJson = await tokenRes.json();
      if (!tokenRes.ok) {
        const upstreamDetail = Array.isArray(tokenJson?.data)
          ? tokenJson.data.map(d => d.message).filter(Boolean).join("; ")
          : "";
        const msg = tokenJson.hint || upstreamDetail || tokenJson.message || tokenJson.error || `Token request failed (${tokenRes.status})`;
        throw new Error(msg);
      }
      const sessionToken = tokenJson?.data?.session_token;
      if (!sessionToken) throw new Error("No session_token in response");

      const session = new LiveAvatarSession(sessionToken, { voiceChat: false });
      sessionRef.current = session;

      session.on(SessionEvent.SESSION_STATE_CHANGED, setSessionState);
      session.on(SessionEvent.SESSION_STREAM_READY, () => {
        if (videoRef.current) session.attach(videoRef.current);
      });
      session.on(SessionEvent.SESSION_DISCONNECTED, () => {
        sessionRef.current = null;
        setMicState("off");
      });

      session.on(AgentEventsEnum.USER_TRANSCRIPTION, (e) => {
        setUserTranscript(e.text || "");
      });
      session.on(AgentEventsEnum.AVATAR_SPEAK_STARTED, () => setAvatarSpeaking(true));
      session.on(AgentEventsEnum.AVATAR_SPEAK_ENDED, () => setAvatarSpeaking(false));

      session.voiceChat.on(VoiceChatEvent.MUTED, () => setMicState("muted"));
      session.voiceChat.on(VoiceChatEvent.UNMUTED, () => setMicState("listening"));

      await session.start();
    } catch (err) {
      setError(err.message || String(err));
      sessionRef.current = null;
    } finally {
      setLoading(false);
    }
  };

  const stopSession = async () => {
    const session = sessionRef.current;
    if (!session) return;
    try { await session.stop(); } catch { /* ignore */ }
    sessionRef.current = null;
    setSessionState(SessionState.INACTIVE);
  };

  const ask = (text) => {
    const session = sessionRef.current;
    if (!session) return;
    const t = text.trim();
    if (!t) return;
    session.message(t);
  };

  const toggleMic = async () => {
    const session = sessionRef.current;
    if (!session) return;
    setMicError("");
    try {
      if (micState === "off") {
        setMicState("starting");
        await session.voiceChat.start({ defaultMuted: false });
      } else if (micState === "listening") {
        await session.voiceChat.mute();
      } else if (micState === "muted") {
        await session.voiceChat.unmute();
      }
    } catch (err) {
      setMicError(err?.message || "Microphone unavailable");
      setMicState("off");
    }
  };

  useEffect(() => {
    return () => {
      if (sessionRef.current) {
        try { sessionRef.current.stop(); } catch { /* ignore */ }
        sessionRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/heygen/options")
      .then(r => r.json())
      .then(data => {
        if (cancelled) return;
        setAvatars(data.avatars || []);
        setVoices(data.voices || []);
        const defaultId = data.defaults?.avatar_id;
        setSelectedAvatarId(prev =>
          prev || (defaultId && data.avatars?.some(a => a.id === defaultId) ? defaultId : data.avatars?.[0]?.id || "")
        );
      })
      .catch(() => { /* keep defaults */ });
    return () => { cancelled = true; };
  }, []);

  const isActive = sessionState === SessionState.CONNECTED || sessionState === SessionState.CONNECTING;
  const connected = sessionState === SessionState.CONNECTED;

  const micLabel =
    avatarSpeaking ? "Advisor speaking…"
    : micState === "off" ? "Tap to talk"
    : micState === "starting" ? "Starting microphone…"
    : micState === "listening" ? "Listening"
    : "Muted";

  return (
    <div className="cv-app">
      <style>{STYLES}</style>

      <header className="cv-header">
        <div className="cv-header__brand">
          <span className="cv-mark" aria-hidden="true" />
          <div className="cv-wordmark">
            <div className="cv-wordmark__name">COVALENT&nbsp;MEDICAL</div>
            <div className="cv-wordmark__tag">The Practice Success Platform</div>
          </div>
        </div>
        <div className="cv-header__badge">For OEM &amp; Manufacturer Partners</div>
      </header>

      <main className="cv-stage">
        <CornerBracket />

        {!isActive ? (
          <section className="cv-lobby">
            <div className="cv-lobby__intro">
              <div className="cv-eyebrow">Partner Briefing · Confidential</div>
              <h1 className="cv-display">
                The North American channel,<br />
                <span className="cv-display__accent">already built.</span>
              </h1>
              <p className="cv-lead">
                Speak directly with the Covalent partnership advisor. Built for
                OEMs, manufacturers, and suppliers evaluating an integrated
                supplier partnership across capital, injectables, skincare, and
                regenerative categories.
              </p>
            </div>

            <div className="cv-panel">
              <div className="cv-field">
                <div className="cv-label">Select your advisor</div>
                <div className="cv-avatars">
                  {avatars.map(a => {
                    const sel = selectedAvatarId === a.id;
                    return (
                      <button
                        key={a.id}
                        type="button"
                        className={`cv-avatar ${sel ? "cv-avatar--on" : ""}`}
                        onClick={() => setSelectedAvatarId(a.id)}
                        title={a.name}
                      >
                        <img src={a.preview_url} alt={a.name} />
                        <span className="cv-avatar__name">{a.name}</span>
                      </button>
                    );
                  })}
                  {avatars.length === 0 && (
                    <div className="cv-avatars__empty">Loading advisors…</div>
                  )}
                </div>
              </div>

              {voices.length > 0 && (
                <div className="cv-field">
                  <div className="cv-label">Voice</div>
                  <select
                    className="cv-select"
                    value={selectedVoiceId}
                    onChange={e => setSelectedVoiceId(e.target.value)}
                  >
                    <option value="">Default advisor voice</option>
                    {voices.map(v => (
                      <option key={v.id} value={v.id}>
                        {v.name}{v.gender ? ` · ${v.gender}` : ""}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <button
                className="cv-cta"
                onClick={startSession}
                disabled={loading || !selectedAvatarId}
                data-loading={loading ? "true" : "false"}
              >
                {loading ? "Connecting…" : "Begin Briefing"}
                <span className="cv-cta__arrow" aria-hidden="true">→</span>
              </button>

              {error && <p className="cv-error">{error}</p>}
            </div>
          </section>
        ) : (
          <section className="cv-session">
            <div className="cv-video-wrap">
              <video ref={videoRef} autoPlay playsInline className="cv-video" />
              <div className={`cv-status ${connected ? "cv-status--live" : ""}`}>
                <span className="cv-status__dot" />
                {connected ? "Live" : "Connecting…"}
              </div>
            </div>

            <div className="cv-controls">
              <button
                className={`cv-mic cv-mic--${micState} ${avatarSpeaking ? "cv-mic--speaking" : ""}`}
                onClick={toggleMic}
                disabled={!connected || micState === "starting"}
                title={micLabel}
                aria-label={micLabel}
              >
                <MicIcon muted={micState === "muted"} />
              </button>
              <div className="cv-mic__label">{micLabel}</div>
              {micError && <div className="cv-error cv-error--sm">{micError}</div>}
              {userTranscript && (
                <div className="cv-transcript">“{userTranscript}”</div>
              )}
            </div>

            <div className="cv-prompts">
              <div className="cv-label cv-label--center">Ask the advisor</div>
              <div className="cv-chips">
                {QUICK_QUESTIONS.map(q => (
                  <button
                    key={q}
                    className="cv-chip"
                    onClick={() => ask(q)}
                    disabled={!connected}
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>

            <button className="cv-end" onClick={stopSession}>End briefing</button>
          </section>
        )}

        <CornerBracket flip />
      </main>

      <footer className="cv-footer">
        Covalent Medical · An integrated supplier partner for the US aesthetic &amp; wellness market
      </footer>
    </div>
  );
}

function MicIcon({ muted }) {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="9" y="3" width="6" height="11" rx="3" stroke="currentColor" strokeWidth="1.7" />
      <path d="M5 11a7 7 0 0 0 14 0" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M12 18v3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      {muted && <path d="M4 4 L20 20" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />}
    </svg>
  );
}

const STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');

  .cv-app * { box-sizing: border-box; margin: 0; padding: 0; }

  .cv-app {
    --navy: #0C1B2E;
    --navy-2: #0F2643;
    --ink: #081320;
    --bronze: #B5895A;
    --bronze-bright: #CCA876;
    --cream: #F1ECE2;
    --text: #EAEFF5;
    --muted: #93A6BC;
    --line: rgba(181,137,90,0.28);

    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    color: var(--text);
    background:
      radial-gradient(1200px 600px at 80% -10%, rgba(181,137,90,0.10), transparent 60%),
      radial-gradient(900px 500px at 0% 110%, rgba(15,38,67,0.9), transparent 60%),
      linear-gradient(165deg, #0B1929 0%, #0C1B2E 45%, #081320 100%);
    -webkit-font-smoothing: antialiased;
  }

  /* ---------- Header ---------- */
  .cv-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 20px 40px;
    border-bottom: 1px solid var(--line);
    background: rgba(8,19,32,0.5);
    backdrop-filter: blur(6px);
  }
  .cv-header__brand { display: flex; align-items: center; gap: 16px; }
  .cv-mark {
    width: 30px; height: 30px;
    border: 2px solid var(--bronze);
    border-radius: 4px;
    position: relative;
    flex: 0 0 auto;
  }
  .cv-mark::after {
    content: ""; position: absolute; inset: 6px;
    background: linear-gradient(135deg, var(--bronze-bright), var(--bronze));
    border-radius: 1px;
  }
  .cv-wordmark__name {
    font-weight: 800; font-size: 16px; letter-spacing: 3px; color: #fff;
  }
  .cv-wordmark__tag {
    font-size: 10px; letter-spacing: 2.5px; text-transform: uppercase;
    color: var(--bronze-bright); margin-top: 3px;
  }
  .cv-header__badge {
    font-size: 11px; letter-spacing: 1.5px; text-transform: uppercase;
    color: var(--muted);
    border: 1px solid var(--line);
    padding: 7px 14px; border-radius: 999px;
  }

  /* ---------- Stage ---------- */
  .cv-stage {
    flex: 1; position: relative;
    display: flex; align-items: center; justify-content: center;
    padding: 48px 24px;
  }
  .cv-bracket {
    position: absolute; color: var(--bronze); opacity: 0.55;
    top: 28px; left: 32px;
  }
  .cv-bracket--flip { top: auto; left: auto; bottom: 28px; right: 32px; transform: rotate(180deg); }

  /* ---------- Lobby ---------- */
  .cv-lobby {
    display: grid; grid-template-columns: 1.05fr 0.95fr; gap: 56px;
    align-items: center; max-width: 1080px; width: 100%;
  }
  .cv-lobby__intro { min-width: 0; }
  .cv-eyebrow {
    font-size: 11px; letter-spacing: 3px; text-transform: uppercase;
    color: var(--bronze-bright); margin-bottom: 22px; font-weight: 600;
  }
  .cv-display {
    font-size: clamp(34px, 4.4vw, 56px); font-weight: 800; line-height: 1.04;
    letter-spacing: -0.5px; color: #fff;
  }
  .cv-display__accent { color: var(--bronze-bright); }
  .cv-lead {
    margin-top: 22px; font-size: 16px; line-height: 1.65; color: var(--muted);
    max-width: 460px;
  }

  .cv-panel {
    min-width: 0;
    background: rgba(241,236,226,0.04);
    border: 1px solid var(--line);
    border-radius: 16px;
    padding: 32px;
    backdrop-filter: blur(4px);
    box-shadow: 0 30px 80px rgba(0,0,0,0.35);
  }
  .cv-field { margin-bottom: 24px; }
  .cv-label {
    font-size: 11px; letter-spacing: 2px; text-transform: uppercase;
    color: var(--bronze-bright); font-weight: 600; margin-bottom: 14px;
  }
  .cv-label--center { text-align: center; }

  .cv-avatars {
    min-width: 0; display: flex; gap: 14px; overflow-x: auto; padding-bottom: 6px;
    scrollbar-width: thin; scrollbar-color: var(--bronze) transparent;
  }
  .cv-avatars__empty { color: var(--muted); font-size: 13px; padding: 16px 0; }
  .cv-avatar {
    flex: 0 0 auto; width: 84px; background: none; border: none; cursor: pointer;
    display: flex; flex-direction: column; align-items: center; gap: 8px;
  }
  .cv-avatar img {
    width: 72px; height: 72px; border-radius: 50%; object-fit: cover;
    border: 2px solid rgba(255,255,255,0.12);
    transition: border-color 0.18s, box-shadow 0.18s, transform 0.18s;
  }
  .cv-avatar:hover img { transform: translateY(-2px); border-color: rgba(204,168,118,0.5); }
  .cv-avatar--on img {
    border-color: var(--bronze-bright);
    box-shadow: 0 0 0 4px rgba(181,137,90,0.18);
  }
  .cv-avatar__name {
    font-size: 11px; color: var(--muted); max-width: 84px;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; text-align: center;
  }
  .cv-avatar--on .cv-avatar__name { color: var(--text); }

  .cv-select {
    width: 100%; padding: 13px 16px; border-radius: 10px;
    background: var(--ink); color: var(--text);
    border: 1px solid var(--line); font-family: inherit; font-size: 14px;
    cursor: pointer; outline: none;
  }
  .cv-select:focus { border-color: var(--bronze); }
  .cv-select option { background: var(--navy); }

  .cv-cta {
    width: 100%; margin-top: 8px; padding: 16px 24px; border: none; border-radius: 10px;
    background: linear-gradient(135deg, var(--bronze-bright), var(--bronze));
    color: #1A1206; font-weight: 700; font-size: 15px; letter-spacing: 0.5px;
    cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 10px;
    transition: transform 0.15s, box-shadow 0.2s, filter 0.15s;
    box-shadow: 0 12px 30px rgba(181,137,90,0.28);
  }
  .cv-cta:hover:not(:disabled) { transform: translateY(-1px); filter: brightness(1.05); }
  .cv-cta:disabled { opacity: 0.5; cursor: not-allowed; }
  .cv-cta__arrow { transition: transform 0.18s; }
  .cv-cta:hover:not(:disabled) .cv-cta__arrow { transform: translateX(4px); }

  .cv-error { color: #E8857A; font-size: 13px; margin-top: 14px; line-height: 1.5; }
  .cv-error--sm { margin-top: 4px; font-size: 12px; }

  /* ---------- Session ---------- */
  .cv-session {
    display: flex; flex-direction: column; align-items: center; gap: 24px;
    width: 100%; max-width: 760px;
  }
  .cv-video-wrap { position: relative; width: 100%; }
  .cv-video {
    width: 100%; aspect-ratio: 16/9; border-radius: 16px; background: #000;
    border: 1px solid var(--line);
    box-shadow: 0 30px 80px rgba(0,0,0,0.5);
  }
  .cv-status {
    position: absolute; top: 16px; left: 16px;
    display: flex; align-items: center; gap: 7px;
    font-size: 11px; letter-spacing: 1.5px; text-transform: uppercase; font-weight: 600;
    background: rgba(8,19,32,0.7); color: var(--muted);
    padding: 6px 12px; border-radius: 999px; border: 1px solid var(--line);
    backdrop-filter: blur(4px);
  }
  .cv-status__dot {
    width: 7px; height: 7px; border-radius: 50%; background: var(--muted);
  }
  .cv-status--live { color: #7FE0A8; }
  .cv-status--live .cv-status__dot { background: #4FD18A; box-shadow: 0 0 10px #4FD18A; animation: cv-pulse 1.8s infinite; }
  @keyframes cv-pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }

  .cv-controls { display: flex; flex-direction: column; align-items: center; gap: 10px; }
  .cv-mic {
    width: 72px; height: 72px; border-radius: 50%; cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    border: 1px solid var(--line); background: rgba(255,255,255,0.05); color: var(--text);
    transition: all 0.2s;
  }
  .cv-mic:disabled { opacity: 0.5; cursor: not-allowed; }
  .cv-mic--listening {
    background: rgba(79,209,138,0.16); color: #8FE9B5; border-color: rgba(79,209,138,0.5);
    box-shadow: 0 0 26px rgba(79,209,138,0.3);
  }
  .cv-mic--muted { background: rgba(232,133,122,0.14); color: #F0A79D; border-color: rgba(232,133,122,0.4); }
  .cv-mic--speaking {
    border-color: var(--bronze-bright);
    box-shadow: 0 0 0 8px rgba(181,137,90,0.14), 0 0 30px rgba(181,137,90,0.3);
  }
  .cv-mic__label {
    font-size: 12px; letter-spacing: 1.5px; text-transform: uppercase; color: var(--muted);
  }
  .cv-transcript {
    font-size: 14px; color: var(--bronze-bright); font-style: italic;
    text-align: center; max-width: 600px;
  }

  .cv-prompts { width: 100%; }
  .cv-chips { display: flex; flex-wrap: wrap; justify-content: center; gap: 9px; }
  .cv-chip {
    padding: 9px 16px; border-radius: 999px; cursor: pointer;
    border: 1px solid var(--line); background: rgba(241,236,226,0.05);
    color: var(--text); font-size: 13px; font-family: inherit;
    transition: background 0.15s, border-color 0.15s, transform 0.12s;
  }
  .cv-chip:hover:not(:disabled) {
    background: rgba(181,137,90,0.14); border-color: var(--bronze-bright); transform: translateY(-1px);
  }
  .cv-chip:disabled { opacity: 0.4; cursor: not-allowed; }

  .cv-end {
    background: none; border: none; cursor: pointer; margin-top: 4px;
    color: var(--muted); font-size: 12px; letter-spacing: 1.5px; text-transform: uppercase;
    font-family: inherit; transition: color 0.15s;
  }
  .cv-end:hover { color: #E8857A; }

  /* ---------- Footer ---------- */
  .cv-footer {
    text-align: center; padding: 18px; font-size: 11px; letter-spacing: 0.5px;
    color: var(--muted); border-top: 1px solid var(--line);
  }

  /* ---------- Responsive ---------- */
  @media (max-width: 860px) {
    .cv-lobby { grid-template-columns: 1fr; gap: 36px; }
    .cv-header { padding: 16px 20px; }
    .cv-header__badge { display: none; }
    .cv-bracket { display: none; }
    .cv-stage { padding: 32px 18px; }
  }
`;
