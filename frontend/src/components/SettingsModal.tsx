import React, { useState, useEffect } from 'react';
import { X, Eye, EyeOff, Check, AlertCircle, Volume2, Activity } from 'lucide-react';

interface SettingsModalProps {
  onClose: () => void;
  onSave: () => void;
  onOpenAbout?: () => void;
  onOpenAdmin?: () => void;
  isAdmin?: boolean;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ onClose, onSave, onOpenAbout, onOpenAdmin, isAdmin }) => {
  const [geminiKey, setGeminiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [isConfigured, setIsConfigured] = useState<boolean | null>(null);
  const [simulateHosted, setSimulateHosted] = useState(false);
  const [initialSimulateHosted, setInitialSimulateHosted] = useState(false);

  const [geminiModel, setGeminiModel] = useState('');
  const [initialGeminiModel, setInitialGeminiModel] = useState('');
  const [availableModels, setAvailableModels] = useState<{ name: string, displayName: string }[]>([]);

  const [githubClientId, setGithubClientId] = useState('');
  const [initialGithubClientId, setInitialGithubClientId] = useState('');
  const [githubClientSecret, setGithubClientSecret] = useState('');
  const [hasGithubSecret, setHasGithubSecret] = useState<boolean | null>(null);
  const [showSecret, setShowSecret] = useState(false);
  
  const [allowedUser, setAllowedUser] = useState('');
  const [initialAllowedUser, setInitialAllowedUser] = useState('');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // TTS Engine & Settings
  const [ttsEngine, setTtsEngine] = useState<'parlando' | 'browser'>(() => {
    return (localStorage.getItem('marginalia_tts_engine') as 'parlando' | 'browser') || 'parlando';
  });
  const [parlandoVoice, setParlandoVoice] = useState<string>(() => {
    return localStorage.getItem('marginalia_parlando_voice') || 'en-US-ChristopherNeural';
  });
  const [parlandoPacing, setParlandoPacing] = useState<string>(() => {
    return localStorage.getItem('marginalia_parlando_pacing') || 'normal';
  });
  const [parlandoSpeed, setParlandoSpeed] = useState<string>(() => {
    return localStorage.getItem('marginalia_parlando_speed') || '1.0';
  });

  const [ttsVoices, setTtsVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedTtsVoice, setSelectedTtsVoice] = useState<string>(() => {
    return localStorage.getItem('marginalia_tts_voice_uri') || '';
  });

  useEffect(() => {
    if (!('speechSynthesis' in window)) return;
    const loadVoices = () => {
      const voices = window.speechSynthesis.getVoices();
      setTtsVoices(voices);
    };
    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
  }, []);

  const fetchConfigStatus = async () => {
    try {
      const res = await fetch('/api/config');
      const data = await res.json();
      setIsConfigured(data.hasGemini);
      setSimulateHosted(!!data.simulateHostedMode);
      setInitialSimulateHosted(!!data.simulateHostedMode);

      setGithubClientId(data.githubClientId || '');
      setInitialGithubClientId(data.githubClientId || '');
      setHasGithubSecret(!!data.hasGithubSecret);
      setAllowedUser(data.allowedUser || '');
      setInitialAllowedUser(data.allowedUser || '');

      setGeminiModel(data.geminiModel || 'gemini-1.5-flash');
      setInitialGeminiModel(data.geminiModel || 'gemini-1.5-flash');

      try {
        const modelsRes = await fetch('/api/gemini/models');
        if (modelsRes.ok) {
          const modelsData = await modelsRes.json();
          setAvailableModels(modelsData);
        }
      } catch (e) {
        console.warn('Failed to load models list', e);
      }
    } catch (err) {
      console.error('Failed to load configuration status:', err);
    }
  };

  useEffect(() => {
    fetchConfigStatus();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Save TTS Preferences
    localStorage.setItem('marginalia_tts_engine', ttsEngine);
    localStorage.setItem('marginalia_parlando_voice', parlandoVoice);
    localStorage.setItem('marginalia_parlando_pacing', parlandoPacing);
    localStorage.setItem('marginalia_parlando_speed', parlandoSpeed);
    localStorage.setItem('marginalia_tts_voice_uri', selectedTtsVoice);

    setSaving(true);
    setError(null);
    try {
      const payload: { 
        geminiApiKey?: string;
        simulateHostedMode?: boolean;
        githubClientId?: string;
        githubClientSecret?: string;
        allowedUser?: string;
        geminiModel?: string;
      } = {};
      
      if (geminiKey.trim()) {
        payload.geminiApiKey = geminiKey.trim();
      }
      if (simulateHosted !== initialSimulateHosted) {
        payload.simulateHostedMode = simulateHosted;
      }
      if (githubClientId !== initialGithubClientId) {
        payload.githubClientId = githubClientId.trim();
      }
      if (githubClientSecret.trim()) {
        payload.githubClientSecret = githubClientSecret.trim();
      }
      if (allowedUser !== initialAllowedUser) {
        payload.allowedUser = allowedUser.trim();
      }
      if (geminiModel !== initialGeminiModel) {
        payload.geminiModel = geminiModel;
      }

      if (Object.keys(payload).length > 0) {
        const res = await fetch('/api/config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || 'Failed to save configuration');
        }
      }

      onSave();
      onClose();
    } catch (err: any) {
      setError(err.message || 'An error occurred while saving.');
    } finally {
      setSaving(false);
    }
  };

  const isDirty = 
    geminiKey.trim().length > 0 ||
    simulateHosted !== initialSimulateHosted ||
    githubClientId !== initialGithubClientId ||
    githubClientSecret.trim().length > 0 ||
    allowedUser !== initialAllowedUser ||
    geminiModel !== initialGeminiModel ||
    ttsEngine !== (localStorage.getItem('marginalia_tts_engine') || 'parlando') ||
    parlandoVoice !== (localStorage.getItem('marginalia_parlando_voice') || 'en-US-ChristopherNeural') ||
    parlandoPacing !== (localStorage.getItem('marginalia_parlando_pacing') || 'normal') ||
    parlandoSpeed !== (localStorage.getItem('marginalia_parlando_speed') || '1.0') ||
    selectedTtsVoice !== (localStorage.getItem('marginalia_tts_voice_uri') || '');

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content settings-modal" style={{ maxWidth: '640px' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Application Settings</h2>
          <button className="btn-close" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            
            {/* Gemini API Key */}
            <div className="form-group">
              <label htmlFor="geminiKey">Gemini API Key</label>
              <div className="input-with-button">
                <input
                  id="geminiKey"
                  type={showKey ? 'text' : 'password'}
                  placeholder={isConfigured ? "••••••••••••••••" : "Enter Google Gemini API Key"}
                  value={geminiKey}
                  onChange={(e) => setGeminiKey(e.target.value)}
                />
                <button
                  type="button"
                  className="input-icon-btn"
                  onClick={() => setShowKey(!showKey)}
                  title={showKey ? 'Hide key' : 'Show key'}
                >
                  {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              <p className="help-text">
                Required for AI-assisted structural editing, inline line-editing feedback, and semantic expansions.
              </p>
            </div>

            {/* Model Selection */}
            <div className="form-group">
              <label htmlFor="geminiModel">AI Feedback Model</label>
              <select
                id="geminiModel"
                value={geminiModel}
                onChange={(e) => setGeminiModel(e.target.value)}
              >
                {availableModels.map((model) => (
                  <option key={model.name} value={model.name}>
                    {model.displayName}
                  </option>
                ))}
              </select>
              <p className="help-text">
                Select the Google Gemini model to use for generating suggestions.
              </p>
            </div>

            {/* TTS Engine & Voice Configuration */}
            <div className="form-group" style={{ borderTop: '1px solid var(--border-color)', paddingTop: '16px', marginTop: '16px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600 }}>
                <Volume2 size={16} /> Read Aloud & Audiobook Voice (TTS)
              </label>

              <div style={{ display: 'flex', gap: '12px', marginTop: '8px', marginBottom: '12px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '0.9rem' }}>
                  <input
                    type="radio"
                    name="tts_engine"
                    value="parlando"
                    checked={ttsEngine === 'parlando'}
                    onChange={() => setTtsEngine('parlando')}
                  />
                  <span>🎭 <strong>Parlando</strong> (Neural Speech Studio)</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '0.9rem' }}>
                  <input
                    type="radio"
                    name="tts_engine"
                    value="browser"
                    checked={ttsEngine === 'browser'}
                    onChange={() => setTtsEngine('browser')}
                  />
                  <span>🌐 <strong>Browser Voice</strong> (Local / Fast)</span>
                </label>
              </div>

              {ttsEngine === 'parlando' ? (
                <div style={{ background: 'var(--bg-secondary)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '8px' }}>
                    <div>
                      <label htmlFor="parlandoVoice" style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Neural Voice</label>
                      <select
                        id="parlandoVoice"
                        value={parlandoVoice}
                        onChange={(e) => setParlandoVoice(e.target.value)}
                        style={{ marginTop: '4px' }}
                      >
                        <optgroup label="Google Gemini Neural Voices">
                          <option value="Fenrir">Fenrir (Gemini / Deep Male)</option>
                          <option value="Puck">Puck (Gemini / Energetic Male)</option>
                          <option value="Charon">Charon (Gemini / Authoritative Male)</option>
                          <option value="Aoede">Aoede (Gemini / Warm Female)</option>
                          <option value="Kore">Kore (Gemini / Soft Female)</option>
                        </optgroup>
                        <optgroup label="Microsoft Neural Voices">
                          <option value="en-US-ChristopherNeural">Christopher (US - Deep / Dramatic)</option>
                          <option value="en-US-GuyNeural">Guy (US - Narrative / Crisp)</option>
                          <option value="en-US-JennyNeural">Jenny (US - Expressive / Clear)</option>
                          <option value="en-GB-RyanNeural">Ryan (UK - Atmospheric / Fiction)</option>
                          <option value="en-GB-SoniaNeural">Sonia (UK - Classical Prose)</option>
                          <option value="en-US-AriaNeural">Aria (US - Balanced / Modern)</option>
                        </optgroup>
                      </select>
                    </div>

                    <div>
                      <label htmlFor="parlandoPacing" style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Pacing Preset</label>
                      <select
                        id="parlandoPacing"
                        value={parlandoPacing}
                        onChange={(e) => setParlandoPacing(e.target.value)}
                        style={{ marginTop: '4px' }}
                      >
                        <option value="normal">Normal (Standard cadence)</option>
                        <option value="brisk">Brisk (Fast proofreading)</option>
                        <option value="dramatic">Dramatic (Extended punctuation pauses)</option>
                        <option value="cinematic">Cinematic (Atmospheric pauses)</option>
                        <option value="contemplative">Contemplative (Slow recitation)</option>
                      </select>
                    </div>

                    <div style={{ gridColumn: 'span 2' }}>
                      <label htmlFor="parlandoSpeed" style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Speech Playback Speed ({parlandoSpeed}x)</label>
                      <select
                        id="parlandoSpeed"
                        value={parlandoSpeed}
                        onChange={(e) => setParlandoSpeed(e.target.value)}
                        style={{ marginTop: '4px' }}
                      >
                        <option value="0.75">0.75x — Deliberate</option>
                        <option value="1.0">1.0x — Normal</option>
                        <option value="1.25">1.25x — Fast</option>
                        <option value="1.5">1.5x — Quick Proof</option>
                      </select>
                    </div>
                  </div>

                  <p className="help-text" style={{ margin: 0 }}>
                    Parlando uses zero-crossing crossfading DSP and semantic dialogue isolation for human-like narrative cadence.
                  </p>
                </div>
              ) : (
                <div className="form-group" style={{ margin: 0 }}>
                  <select
                    id="ttsVoice"
                    value={selectedTtsVoice}
                    onChange={(e) => setSelectedTtsVoice(e.target.value)}
                  >
                    <option value="">Auto-select Highest Quality Natural Voice</option>
                    {ttsVoices.map((v) => (
                      <option key={v.voiceURI} value={v.voiceURI}>
                        {v.name} ({v.lang})
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* Hosted & Auth Settings */}
            <div className="form-group checkbox-group" style={{ borderTop: '1px solid var(--border-color)', paddingTop: '16px', marginTop: '16px' }}>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={simulateHosted}
                  onChange={(e) => setSimulateHosted(e.target.checked)}
                />
                <span>Simulate Hosted (Remote) Mode</span>
              </label>
              <p className="help-text">
                Forces the app to require login and runs VFS Sandboxed workspace directories on localhost.
              </p>
            </div>

            {simulateHosted && (
              <div className="oauth-settings-block">
                <div className="form-group">
                  <label htmlFor="githubClientId">GitHub Client ID</label>
                  <input
                    id="githubClientId"
                    type="text"
                    placeholder="Enter GitHub OAuth Client ID"
                    value={githubClientId}
                    onChange={(e) => setGithubClientId(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="githubClientSecret">GitHub Client Secret</label>
                  <div className="input-with-button">
                    <input
                      id="githubClientSecret"
                      type={showSecret ? 'text' : 'password'}
                      placeholder={hasGithubSecret ? "••••••••••••••••" : "Enter GitHub OAuth Client Secret"}
                      value={githubClientSecret}
                      onChange={(e) => setGithubClientSecret(e.target.value)}
                    />
                    <button
                      type="button"
                      className="input-icon-btn"
                      onClick={() => setShowSecret(!showSecret)}
                      title={showSecret ? 'Hide secret' : 'Show secret'}
                    >
                      {showSecret ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                <div className="form-group">
                  <label htmlFor="allowedUser">Allowed GitHub Username</label>
                  <input
                    id="allowedUser"
                    type="text"
                    placeholder="e.g. your-github-handle"
                    value={allowedUser}
                    onChange={(e) => setAllowedUser(e.target.value)}
                  />
                  <p className="help-text">
                    Restricts login access only to this GitHub user handle (leave blank to allow any user to sign in).
                  </p>
                </div>
              </div>
            )}

            {isConfigured !== null && (
              <div className={`status-badge ${isConfigured ? 'success' : 'warning'}`}>
                {isConfigured ? (
                  <>
                    <Check size={16} />
                    <span>Gemini API Key is configured on server</span>
                  </>
                ) : (
                  <>
                    <AlertCircle size={16} />
                    <span>Gemini API Key is not configured</span>
                  </>
                )}
              </div>
            )}

            {error && <div className="error-message">{error}</div>}

            <div className="form-actions" style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              {onOpenAbout && (
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => {
                    onClose();
                    onOpenAbout();
                  }}
                >
                  About
                </button>
              )}
              {isAdmin && onOpenAdmin && (
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => {
                    onClose();
                    onOpenAdmin();
                  }}
                  style={{ display: 'flex', alignItems: 'center', gap: '4px' }}
                >
                  <Activity size={14} /> Admin Monitor
                </button>
              )}
              <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
                <button type="button" className="btn-secondary" onClick={onClose}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary" disabled={saving || !isDirty}>
                  {saving ? 'Saving...' : 'Save Settings'}
                </button>
              </div>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
