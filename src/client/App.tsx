import React, { useState, useEffect, useRef } from 'react';
import { parseMarkdown, validateTitle, validateBody, validateBlacklist } from './utils';

// Client States
type ComposerState = 'INITIALIZING' | 'DRAFTING' | 'VALIDATING' | 'SUBMITTING' | 'SUCCESS' | 'ERROR';

interface SubredditRules {
  title_regex: string;
  min_body: number;
  flair_id: string;
  keyword_blacklist: string;
  minimum_account_age: number;
  minimum_karma: number;
}

interface UserStatus {
  isMod: boolean;
  username: string | null;
}

interface ModStats {
  approved: number;
  rejected: number;
  enforcer_bypassed: number;
}

export default function App() {
  const [appState, setAppState] = useState<ComposerState>('INITIALIZING');
  const [rules, setRules] = useState<SubredditRules | null>(null);
  const [userStatus, setUserStatus] = useState<UserStatus | null>(null);
  const [modStats, setModStats] = useState<ModStats | null>(null);
  const [showModDashboard, setShowModDashboard] = useState<boolean>(false);

  // Form State
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [clientUuid] = useState(() => {
    // Generate UUID fallback
    return 'post-' + Date.now() + '-' + Math.random().toString(36).substring(2, 11);
  });
  
  // Validation Errors
  const [titleError, setTitleError] = useState<string | null>(null);
  const [bodyError, setBodyError] = useState<string | null>(null);
  const [blacklistError, setBlacklistError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [publishedUrl, setPublishedUrl] = useState<string | null>(null);

  // Fetch Rules & User Info on Mount
  useEffect(() => {
    async function initData() {
      try {
        const [rulesRes, statusRes] = await Promise.all([
          fetch('/api/rules'),
          fetch('/api/user-status'),
        ]);

        if (!rulesRes.ok || !statusRes.ok) {
          throw new Error('Failed to load portal configuration.');
        }

        const rulesData: SubredditRules = await rulesRes.json();
        const statusData: UserStatus = await statusRes.json();

        setRules(rulesData);
        setUserStatus(statusData);
        setAppState('DRAFTING');
      } catch (err: any) {
        setServerError(err.message || 'Initialization failed.');
        setAppState('ERROR');
      }
    }

    initData();
  }, []);

  // Fetch Stats when showing Mod Dashboard
  useEffect(() => {
    if (showModDashboard) {
      fetchStats();
    }
  }, [showModDashboard]);

  async function fetchStats() {
    try {
      const res = await fetch('/api/stats');
      if (res.ok) {
        const data: ModStats = await res.json();
        setModStats(data);
      }
    } catch (err) {
      console.error('Failed to fetch stats:', err);
    }
  }

  // Real-time rules validation (Debounced)
  useEffect(() => {
    if (appState !== 'DRAFTING' || !rules) return;

    const timer = setTimeout(() => {
      setTitleError(validateTitle(title, rules.title_regex));
      setBodyError(validateBody(body, rules.min_body));
      setBlacklistError(validateBlacklist(title, body, rules.keyword_blacklist));
    }, 300);

    return () => clearTimeout(timer);
  }, [title, body, rules, appState]);

  // Intercept paste event to strip rich media / HTML and keep bundle under 4MB limit
  function handlePaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        e.preventDefault();
        alert('🚫 Direct image embedding is disabled in this portal. Please upload images directly to Reddit or use image hosting links.');
        return;
      }
    }

    const htmlData = e.clipboardData.getData('text/html');
    if (htmlData && htmlData.length > 50000) {
      e.preventDefault();
      // Strip html and insert pure text to prevent huge base64 payload bloating
      const plainText = e.clipboardData.getData('text/plain');
      const start = e.currentTarget.selectionStart;
      const end = e.currentTarget.selectionEnd;
      const val = e.currentTarget.value;
      setBody(val.substring(0, start) + plainText + val.substring(end));
    }
  }

  // Handle Publishing to Subreddit
  async function handlePublish(e: React.FormEvent) {
    e.preventDefault();
    if (titleError || bodyError || blacklistError || !rules) return;

    setAppState('VALIDATING');

    try {
      // Local client checks before server upload
      if (!title.trim()) {
        throw new Error('Title cannot be empty');
      }

      setAppState('SUBMITTING');

      const response = await fetch('/api/publish', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title,
          body,
          uuid: clientUuid,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to submit post');
      }

      setPublishedUrl(result.url);
      setAppState('SUCCESS');
    } catch (err: any) {
      setServerError(err.message || 'An error occurred during submission.');
      setAppState('ERROR');
    }
  }

  // Reset Form for New Submission
  function resetComposer() {
    setTitle('');
    setBody('');
    setServerError(null);
    setPublishedUrl(null);
    setAppState('DRAFTING');
  }

  // RENDER LOADING / INITIALIZING STATE
  if (appState === 'INITIALIZING') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', padding: '2rem' }}>
        <div className="spinner" style={{ color: 'hsl(var(--primary))', width: '40px', height: '40px', borderWidth: '3px', marginBottom: '1.5rem' }}></div>
        <p style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: '1.2rem', color: '#fff' }}>PostPilot Subreddit Portal</p>
        <p style={{ color: 'hsl(var(--text-secondary))', fontSize: '0.9rem', marginTop: '0.5rem' }}>Connecting to verification servers...</p>
      </div>
    );
  }

  // RENDER MODERATOR ANALYTICS DASHBOARD
  if (showModDashboard && userStatus?.isMod) {
    return (
      <div className="animate-fade-in" style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto', fontFamily: 'var(--font-sans)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
          <div>
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '2rem', fontWeight: 800, background: 'linear-gradient(135deg, #ff4500, #ff8700)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              PostPilot Telemetry Hub
            </h1>
            <p style={{ color: 'hsl(var(--text-secondary))', fontSize: '0.95rem' }}>
              Moderator administration controls & enforcement metrics
            </p>
          </div>
          <button
            onClick={() => setShowModDashboard(false)}
            style={{
              padding: '0.6rem 1.2rem',
              background: 'hsla(var(--border) / 0.5)',
              border: '1px solid hsl(var(--border))',
              color: 'hsl(var(--text-primary))',
              borderRadius: '8px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              transition: 'all 0.2s',
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.background = 'hsl(var(--bg-surface-elevated))';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.background = 'hsla(var(--border) / 0.5)';
            }}
          >
            ← Write Post
          </button>
        </div>

        {/* Stats Cards Row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem', marginBottom: '2.5rem' }}>
          <div className="glass-panel" style={{ padding: '1.5rem', borderLeft: '4px solid hsl(var(--success))' }}>
            <span style={{ color: 'hsl(var(--text-secondary))', fontSize: '0.85rem', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.05em' }}>Verified Submissions</span>
            <div style={{ fontSize: '2.5rem', fontWeight: 800, color: 'hsl(var(--success))', margin: '0.5rem 0' }}>{modStats?.approved ?? 0}</div>
            <p style={{ color: 'hsl(var(--text-muted))', fontSize: '0.85rem' }}>Validated and approved posts published via portal</p>
          </div>
          <div className="glass-panel" style={{ padding: '1.5rem', borderLeft: '4px solid hsl(var(--danger))' }}>
            <span style={{ color: 'hsl(var(--text-secondary))', fontSize: '0.85rem', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.05em' }}>Validation Rejections</span>
            <div style={{ fontSize: '2.5rem', fontWeight: 800, color: 'hsl(var(--danger))', margin: '0.5rem 0' }}>{modStats?.rejected ?? 0}</div>
            <p style={{ color: 'hsl(var(--text-muted))', fontSize: '0.85rem' }}>Attempts blocked by portal rules engine</p>
          </div>
          <div className="glass-panel" style={{ padding: '1.5rem', borderLeft: '4px solid hsl(var(--warning))' }}>
            <span style={{ color: 'hsl(var(--text-secondary))', fontSize: '0.85rem', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.05em' }}>Enforcer Catches</span>
            <div style={{ fontSize: '2.5rem', fontWeight: 800, color: 'hsl(var(--warning))', margin: '0.5rem 0' }}>{modStats?.enforcer_bypassed ?? 0}</div>
            <p style={{ color: 'hsl(var(--text-muted))', fontSize: '0.85rem' }}>Native composers bypassed and auto-removed</p>
          </div>
        </div>

        {/* High-Fidelity Custom Pure-CSS Chart */}
        <div className="glass-panel" style={{ padding: '2rem', marginBottom: '2.5rem' }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.25rem', fontWeight: 700, marginBottom: '1.5rem' }}>Traffic Distribution Analysis</h2>
          {modStats && (modStats.approved > 0 || modStats.rejected > 0 || modStats.enforcer_bypassed > 0) ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
              {/* Approved Bar */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', marginBottom: '0.4rem' }}>
                  <span style={{ fontWeight: 600 }}>Approved submissions</span>
                  <span style={{ color: 'hsl(var(--success))', fontWeight: 600 }}>
                    {modStats.approved} ({Math.round((modStats.approved / (modStats.approved + modStats.rejected + modStats.enforcer_bypassed)) * 100)}%)
                  </span>
                </div>
                <div style={{ height: '12px', background: 'rgba(255,255,255,0.05)', borderRadius: '6px', overflow: 'hidden' }}>
                  <div
                    style={{
                      height: '100%',
                      background: 'hsl(var(--success))',
                      width: `${(modStats.approved / (modStats.approved + modStats.rejected + modStats.enforcer_bypassed)) * 100}%`,
                      transition: 'width 0.5s ease',
                    }}
                  />
                </div>
              </div>

              {/* Rejected Bar */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', marginBottom: '0.4rem' }}>
                  <span style={{ fontWeight: 600 }}>Validation Rejections</span>
                  <span style={{ color: 'hsl(var(--danger))', fontWeight: 600 }}>
                    {modStats.rejected} ({Math.round((modStats.rejected / (modStats.approved + modStats.rejected + modStats.enforcer_bypassed)) * 100)}%)
                  </span>
                </div>
                <div style={{ height: '12px', background: 'rgba(255,255,255,0.05)', borderRadius: '6px', overflow: 'hidden' }}>
                  <div
                    style={{
                      height: '100%',
                      background: 'hsl(var(--danger))',
                      width: `${(modStats.rejected / (modStats.approved + modStats.rejected + modStats.enforcer_bypassed)) * 100}%`,
                      transition: 'width 0.5s ease',
                    }}
                  />
                </div>
              </div>

              {/* Bypassed Bar */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', marginBottom: '0.4rem' }}>
                  <span style={{ fontWeight: 600 }}>Enforcer bypasses (Auto-removed)</span>
                  <span style={{ color: 'hsl(var(--warning))', fontWeight: 600 }}>
                    {modStats.enforcer_bypassed} ({Math.round((modStats.enforcer_bypassed / (modStats.approved + modStats.rejected + modStats.enforcer_bypassed)) * 100)}%)
                  </span>
                </div>
                <div style={{ height: '12px', background: 'rgba(255,255,255,0.05)', borderRadius: '6px', overflow: 'hidden' }}>
                  <div
                    style={{
                      height: '100%',
                      background: 'hsl(var(--warning))',
                      width: `${(modStats.enforcer_bypassed / (modStats.approved + modStats.rejected + modStats.enforcer_bypassed)) * 100}%`,
                      transition: 'width 0.5s ease',
                    }}
                  />
                </div>
              </div>
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '2rem 0', color: 'hsl(var(--text-muted))' }}>No moderation events have been recorded yet. Try publishing a post or configuring settings!</div>
          )}
        </div>

        {/* Settings Info Box */}
        <div className="glass-panel" style={{ padding: '2rem' }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.25rem', fontWeight: 700, marginBottom: '1.25rem' }}>Active Portal Configuration Rules</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.5rem', fontSize: '0.95rem' }}>
            <div>
              <p style={{ color: 'hsl(var(--text-secondary))', marginBottom: '0.2rem' }}>Title Pattern (Regex):</p>
              <code style={{ background: 'rgba(0,0,0,0.3)', padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.85rem' }}>
                {rules?.title_regex || 'None (Disabled)'}
              </code>
            </div>
            <div>
              <p style={{ color: 'hsl(var(--text-secondary))', marginBottom: '0.2rem' }}>Min Body Character Count:</p>
              <strong style={{ color: '#fff' }}>{rules?.min_body || 0} characters</strong>
            </div>
            <div>
              <p style={{ color: 'hsl(var(--text-secondary))', marginBottom: '0.2rem' }}>Mandatory Auto-Flair Template:</p>
              <code style={{ background: 'rgba(0,0,0,0.3)', padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.85rem' }}>
                {rules?.flair_id || 'None (Disabled)'}
              </code>
            </div>
            <div>
              <p style={{ color: 'hsl(var(--text-secondary))', marginBottom: '0.2rem' }}>Minimum Account Age:</p>
              <strong style={{ color: '#fff' }}>{rules?.minimum_account_age || 0} days</strong>
            </div>
            <div>
              <p style={{ color: 'hsl(var(--text-secondary))', marginBottom: '0.2rem' }}>Minimum Combined Karma:</p>
              <strong style={{ color: '#fff' }}>{rules?.minimum_karma || 0} karma</strong>
            </div>
            <div>
              <p style={{ color: 'hsl(var(--text-secondary))', marginBottom: '0.2rem' }}>Blacklisted keywords count:</p>
              <strong style={{ color: '#fff' }}>
                {rules?.keyword_blacklist ? rules.keyword_blacklist.split(',').filter(Boolean).length : 0} keywords
              </strong>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // RENDER PUBLISH SUCCESS STATE
  if (appState === 'SUCCESS') {
    return (
      <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', padding: '2rem', maxWidth: '550px', margin: '0 auto', textAlign: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '80px', height: '80px', borderRadius: '50%', background: 'hsla(var(--success-glow))', color: 'hsl(var(--success))', fontSize: '2.5rem', marginBottom: '1.5rem', border: '1px solid hsla(var(--success) / 0.3)' }}>
          ✓
        </div>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '1.75rem', fontWeight: 800, color: '#fff', marginBottom: '0.75rem' }}>
          Post Published Successfully!
        </h1>
        <p style={{ color: 'hsl(var(--text-secondary))', lineHeight: '1.6', marginBottom: '2rem' }}>
          Your draft passed all subreddit rules and was safely processed by PostPilot.
        </p>
        <div style={{ display: 'flex', gap: '1rem', width: '100%' }}>
          {publishedUrl && (
            <a
              href={`https://reddit.com${publishedUrl}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                flex: 1,
                padding: '0.8rem 1.5rem',
                background: 'hsl(var(--primary))',
                color: '#fff',
                textDecoration: 'none',
                borderRadius: '8px',
                fontWeight: 600,
                textAlign: 'center',
                boxShadow: '0 4px 14px 0 rgba(255, 69, 0, 0.3)',
                transition: 'all 0.2s',
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.transform = 'translateY(-1px)';
                e.currentTarget.style.boxShadow = '0 6px 20px 0 rgba(255, 69, 0, 0.4)';
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.transform = 'none';
                e.currentTarget.style.boxShadow = '0 4px 14px 0 rgba(255, 69, 0, 0.3)';
              }}
            >
              View on Reddit ↗
            </a>
          )}
          <button
            onClick={resetComposer}
            style={{
              flex: 1,
              padding: '0.8rem 1.5rem',
              background: 'hsla(var(--border) / 0.5)',
              border: '1px solid hsl(var(--border))',
              color: 'hsl(var(--text-primary))',
              borderRadius: '8px',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.background = 'hsl(var(--bg-surface-elevated))';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.background = 'hsla(var(--border) / 0.5)';
            }}
          >
            Create New Draft
          </button>
        </div>
      </div>
    );
  }

  // RENDER PUBLISH ERROR STATE
  if (appState === 'ERROR') {
    return (
      <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', padding: '2rem', maxWidth: '550px', margin: '0 auto', textAlign: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '80px', height: '80px', borderRadius: '50%', background: 'hsla(var(--danger-glow))', color: 'hsl(var(--danger))', fontSize: '2.5rem', marginBottom: '1.5rem', border: '1px solid hsla(var(--danger) / 0.3)' }}>
          ✕
        </div>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '1.75rem', fontWeight: 800, color: '#fff', marginBottom: '0.75rem' }}>
          Publishing Blocked
        </h1>
        <p style={{ color: 'hsl(var(--text-secondary))', lineHeight: '1.6', marginBottom: '1.5rem' }}>
          Your post failed verification constraints.
        </p>
        <div style={{
          width: '100%',
          background: 'rgba(0,0,0,0.3)',
          border: '1px solid hsla(var(--danger) / 0.2)',
          padding: '1.25rem',
          borderRadius: '8px',
          color: 'hsl(var(--danger))',
          fontWeight: 500,
          textAlign: 'left',
          fontSize: '0.95rem',
          marginBottom: '2rem',
        }}>
          {serverError || 'Submission was rejected by the server rules enforcer.'}
        </div>
        <button
          onClick={() => setAppState('DRAFTING')}
          style={{
            width: '100%',
            padding: '0.8rem 1.5rem',
            background: 'hsl(var(--primary))',
            color: '#fff',
            border: 'none',
            borderRadius: '8px',
            fontWeight: 600,
            cursor: 'pointer',
            boxShadow: '0 4px 14px 0 rgba(255, 69, 0, 0.3)',
            transition: 'all 0.2s',
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.transform = 'translateY(-1px)';
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.transform = 'none';
          }}
        >
          Return to Edit Draft
        </button>
      </div>
    );
  }

  // RENDER DRAFTING COMPOSER UI (STATE = DRAFTING, VALIDATING, SUBMITTING)
  const isSubmitting = appState === 'SUBMITTING' || appState === 'VALIDATING';

  return (
    <div className="animate-fade-in" style={{ padding: '1.5rem', maxWidth: '1440px', margin: '0 auto', fontFamily: 'var(--font-sans)' }}>
      {/* Portal Top Header */}
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', borderBottom: '1px solid hsla(var(--border) / 0.5)', paddingBottom: '1rem' }}>
        <div>
          <span style={{ fontSize: '0.8rem', color: 'hsl(var(--primary))', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            Subreddit Interactive Composer
          </span>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '1.6rem', fontWeight: 800, color: '#fff' }}>
            PostPilot Submission Gateway
          </h1>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          {userStatus?.isMod && (
            <button
              onClick={() => setShowModDashboard(true)}
              style={{
                padding: '0.5rem 1rem',
                background: 'hsla(var(--primary-glow))',
                border: '1px solid hsla(var(--primary) / 0.3)',
                color: 'hsl(var(--primary))',
                borderRadius: '6px',
                fontWeight: 600,
                fontSize: '0.9rem',
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.background = 'hsla(var(--primary-glow) / 0.3)';
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.background = 'hsla(var(--primary-glow))';
              }}
            >
              ⚙ Telemetry Hub
            </button>
          )}
          {userStatus?.username && (
            <div className="glass-panel" style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem', color: 'hsl(var(--text-secondary))', fontWeight: 500 }}>
              Posting as: <strong style={{ color: '#fff' }}>u/{userStatus.username}</strong>
            </div>
          )}
        </div>
      </header>

      {/* Constraints Dashboard Section */}
      <section className="glass-panel" style={{ padding: '1rem', marginBottom: '1.5rem' }}>
        <h3 style={{ fontSize: '0.85rem', textTransform: 'uppercase', color: 'hsl(var(--text-secondary))', fontWeight: 700, marginBottom: '0.75rem', letterSpacing: '0.05em' }}>
          Real-Time Verification Checklist
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem', fontSize: '0.85rem' }}>
          
          {/* Rules items with green check/red crosses */}
          {rules?.title_regex && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ color: titleError || !title ? 'hsl(var(--danger))' : 'hsl(var(--success))', fontSize: '1rem', fontWeight: 'bold' }}>
                {titleError || !title ? '✕' : '✓'}
              </span>
              <span style={{ color: titleError || !title ? 'hsl(var(--text-secondary))' : '#fff' }}>
                Title Matches Pattern
              </span>
            </div>
          )}

          {rules?.min_body ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ color: bodyError ? 'hsl(var(--danger))' : 'hsl(var(--success))', fontSize: '1rem', fontWeight: 'bold' }}>
                {bodyError ? '✕' : '✓'}
              </span>
              <span style={{ color: bodyError ? 'hsl(var(--text-secondary))' : '#fff' }}>
                Body length ({body.length}/{rules.min_body})
              </span>
            </div>
          ) : null}

          {rules?.keyword_blacklist ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ color: blacklistError ? 'hsl(var(--danger))' : 'hsl(var(--success))', fontSize: '1rem', fontWeight: 'bold' }}>
                {blacklistError ? '✕' : '✓'}
              </span>
              <span style={{ color: blacklistError ? 'hsl(var(--text-secondary))' : '#fff' }}>
                Forbidden Words Clean
              </span>
            </div>
          ) : null}

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ color: 'hsl(var(--success))', fontSize: '1rem', fontWeight: 'bold' }}>✓</span>
            <span style={{ color: '#fff' }}>Reddit Auth verified</span>
          </div>

        </div>
      </section>

      {/* Main Drafting Editor Column */}
      <form onSubmit={handlePublish} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
        
        {/* Left Side: Input Composer */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          
          {/* Title Input */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <label style={{ fontSize: '0.9rem', fontWeight: 600, color: 'hsl(var(--text-secondary))' }}>
              Post Title <span style={{ color: 'hsl(var(--primary))' }}>*</span>
            </label>
            <input
              type="text"
              placeholder={rules?.title_regex ? `Title must match: ${rules.title_regex}` : 'Enter your post title'}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={isSubmitting}
              required
              style={{
                width: '100%',
                padding: '0.75rem 1rem',
                background: 'hsl(var(--bg-surface))',
                border: titleError ? '1px solid hsl(var(--danger))' : '1px solid hsl(var(--border))',
                borderRadius: '8px',
                color: '#fff',
                fontSize: '1rem',
                outline: 'none',
                transition: 'border-color 0.2s',
              }}
              onFocus={(e) => {
                if (!titleError) e.currentTarget.style.borderColor = 'hsl(var(--border-focus))';
              }}
              onBlur={(e) => {
                if (!titleError) e.currentTarget.style.borderColor = 'hsl(var(--border))';
              }}
            />
            {titleError && (
              <span style={{ fontSize: '0.8rem', color: 'hsl(var(--danger))', fontWeight: 500 }}>
                {titleError}
              </span>
            )}
          </div>

          {/* Body Editor Input */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', flex: 1 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label style={{ fontSize: '0.9rem', fontWeight: 600, color: 'hsl(var(--text-secondary))' }}>
                Post Body (Markdown supported)
              </label>
              <span style={{ fontSize: '0.8rem', color: 'hsl(var(--text-muted))' }}>
                {body.length} chars
              </span>
            </div>
            <textarea
              placeholder="Draft your post using Markdown formatting..."
              value={body}
              onChange={(e) => setBody(e.target.value)}
              onPaste={handlePaste}
              disabled={isSubmitting}
              style={{
                width: '100%',
                minHeight: '260px',
                padding: '1rem',
                background: 'hsl(var(--bg-surface))',
                border: bodyError ? '1px solid hsl(var(--danger))' : '1px solid hsl(var(--border))',
                borderRadius: '8px',
                color: '#fff',
                fontSize: '0.95rem',
                lineHeight: '1.6',
                resize: 'vertical',
                outline: 'none',
                transition: 'border-color 0.2s',
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, monospace',
              }}
              onFocus={(e) => {
                if (!bodyError) e.currentTarget.style.borderColor = 'hsl(var(--border-focus))';
              }}
              onBlur={(e) => {
                if (!bodyError) e.currentTarget.style.borderColor = 'hsl(var(--border))';
              }}
            />
            {bodyError && (
              <span style={{ fontSize: '0.8rem', color: 'hsl(var(--danger))', fontWeight: 500 }}>
                {bodyError}
              </span>
            )}
            {blacklistError && (
              <span style={{ fontSize: '0.8rem', color: 'hsl(var(--danger))', fontWeight: 500 }}>
                {blacklistError}
              </span>
            )}
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isSubmitting || !!titleError || !!bodyError || !!blacklistError || !title.trim()}
            style={{
              padding: '0.9rem 1.5rem',
              background: 'hsl(var(--primary))',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              fontWeight: 700,
              fontSize: '1rem',
              cursor: isSubmitting || !!titleError || !!bodyError || !!blacklistError || !title.trim() ? 'not-allowed' : 'pointer',
              opacity: isSubmitting || !!titleError || !!bodyError || !!blacklistError || !title.trim() ? 0.5 : 1,
              boxShadow: isSubmitting || !!titleError || !!bodyError || !!blacklistError || !title.trim() ? 'none' : '0 4px 14px 0 rgba(255, 69, 0, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.75rem',
              transition: 'all 0.2s',
            }}
            onMouseOver={(e) => {
              if (!isSubmitting && !titleError && !bodyError && !blacklistError && title.trim()) {
                e.currentTarget.style.transform = 'translateY(-1px)';
                e.currentTarget.style.boxShadow = '0 6px 20px 0 rgba(255, 69, 0, 0.4)';
              }
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.transform = 'none';
              e.currentTarget.style.boxShadow = isSubmitting || !!titleError || !!bodyError || !!blacklistError || !title.trim() ? 'none' : '0 4px 14px 0 rgba(255, 69, 0, 0.3)';
            }}
          >
            {isSubmitting ? (
              <>
                <div className="spinner"></div>
                <span>{appState === 'VALIDATING' ? 'Verifying rules...' : 'Publishing to Reddit...'}</span>
              </>
            ) : (
              <span>🚀 Submit Verified Post</span>
            )}
          </button>
        </div>

        {/* Right Side: Live Markdown Preview */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <label style={{ fontSize: '0.9rem', fontWeight: 600, color: 'hsl(var(--text-secondary))' }}>
            Live Markdown Preview
          </label>
          <div
            className="glass-panel markdown-preview"
            style={{
              flex: 1,
              padding: '1.25rem',
              minHeight: '410px',
              maxHeight: '520px',
              overflowY: 'auto',
              borderRadius: '8px',
              background: 'rgba(30, 37, 51, 0.3)',
            }}
          >
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem', color: '#fff', borderBottom: '1px solid hsla(var(--border) / 0.4)', paddingBottom: '0.3rem', marginTop: '0', marginBottom: '1rem' }}>
              {title || 'Untitled Draft'}
            </h1>
            {body ? (
              <div dangerouslySetInnerHTML={{ __html: parseMarkdown(body) }} />
            ) : (
              <div style={{ color: 'hsl(var(--text-muted))', fontStyle: 'italic', display: 'flex', height: '80%', alignItems: 'center', justifyContent: 'center' }}>
                Your formatted text preview will appear here...
              </div>
            )}
          </div>
        </div>

      </form>
    </div>
  );
}
