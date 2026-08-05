import React, { useState, useEffect } from 'react';
import { X, Eye, EyeOff, Check, AlertCircle } from 'lucide-react';

interface SettingsModalProps {
  onClose: () => void;
  onSave: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ onClose, onSave }) => {
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

  const [ttsVoices, setTtsVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedTtsVoice, setSelectedTtsVoice] = useState<string>(() => {
    return localStorage.getItem('marginalia_tts_voice_uri') || '';
  });
  const [initialTtsVoice, setInitialTtsVoice] = useState<string>(() => {
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

  const handleVoiceChange = (uri: string) => {
    setSelectedTtsVoice(uri);
  };

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
      if (geminiModel !== initialGeminiModel) {
        payload.geminiModel = geminiModel;
      }
      if (simulateHosted !== initialSimulateHosted) {
        payload.simulateHostedMode = simulateHosted;
      }
      if (githubClientId.trim() !== initialGithubClientId) {
        payload.githubClientId = githubClientId.trim();
      }
      if (githubClientSecret.trim()) {
        payload.githubClientSecret = githubClientSecret.trim();
      }
      if (allowedUser.trim() !== initialAllowedUser) {
        payload.allowedUser = allowedUser.trim();
      }

      const res = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to save settings');
      }
      localStorage.setItem('marginalia_tts_voice_uri', selectedTtsVoice);
      setInitialTtsVoice(selectedTtsVoice);

      setGeminiKey('');
      setGithubClientSecret('');
      await fetchConfigStatus();
      onSave();
      
      if (simulateHosted !== initialSimulateHosted) {
        window.location.reload();
      } else {
        onClose();
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const isDirty = 
    geminiKey.trim() !== '' || 
    geminiModel !== initialGeminiModel ||
    selectedTtsVoice !== initialTtsVoice ||
    simulateHosted !== initialSimulateHosted ||
    githubClientId.trim() !== initialGithubClientId ||
    githubClientSecret.trim() !== '' ||
    allowedUser.trim() !== initialAllowedUser;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Settings</h3>
          <button className="close-btn" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="settings-form">
          <div className="modal-body">
            <div className="form-group">
              <label htmlFor="geminiKey">Gemini API Key</label>
              <div className="input-with-button">
                <input
                  id="geminiKey"
                  type={showKey ? 'text' : 'password'}
                  placeholder={isConfigured ? "••••••••••••••••" : "Enter Gemini API Key"}
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
                Providing a Gemini Key enables automatic git commit message summaries.
              </p>
            </div>

            <div className="form-group">
              <label htmlFor="geminiModel">Gemini Model</label>
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

            {ttsVoices.length > 0 && (() => {
              const isNaturalVoice = (v: SpeechSynthesisVoice) => {
                const name = v.name.toLowerCase();
                return (
                  name.includes('natural') ||
                  name.includes('google') ||
                  name.includes('enhanced') ||
                  name.includes('premium') ||
                  name.includes('neural') ||
                  name.includes('online')
                );
              };

              const naturalEnglish = ttsVoices
                .filter((v) => v.lang.toLowerCase().startsWith('en') && isNaturalVoice(v))
                .sort((a, b) => a.name.localeCompare(b.name));

              const standardEnglish = ttsVoices
                .filter((v) => v.lang.toLowerCase().startsWith('en') && !isNaturalVoice(v))
                .sort((a, b) => a.name.localeCompare(b.name));

              const naturalOther = ttsVoices
                .filter((v) => !v.lang.toLowerCase().startsWith('en') && isNaturalVoice(v))
                .sort((a, b) => a.lang.localeCompare(b.lang) || a.name.localeCompare(b.name));

              const standardOther = ttsVoices
                .filter((v) => !v.lang.toLowerCase().startsWith('en') && !isNaturalVoice(v))
                .sort((a, b) => a.lang.localeCompare(b.lang) || a.name.localeCompare(b.name));

              return (
                <div className="form-group">
                  <label htmlFor="ttsVoice">Read Aloud Voice (TTS)</label>
                  <select
                    id="ttsVoice"
                    value={selectedTtsVoice}
                    onChange={(e) => handleVoiceChange(e.target.value)}
                  >
                    <option value="">Auto-select Highest Quality Natural / Neural Voice</option>
                    {naturalEnglish.length > 0 && (
                      <optgroup label="✨ English — Natural & Neural Voices">
                        {naturalEnglish.map((voice) => (
                          <option key={voice.voiceURI} value={voice.voiceURI}>
                            {voice.name} ({voice.lang}) ✨
                          </option>
                        ))}
                      </optgroup>
                    )}
                    {standardEnglish.length > 0 && (
                      <optgroup label="English — Standard Voices">
                        {standardEnglish.map((voice) => (
                          <option key={voice.voiceURI} value={voice.voiceURI}>
                            {voice.name} ({voice.lang})
                          </option>
                        ))}
                      </optgroup>
                    )}
                    {naturalOther.length > 0 && (
                      <optgroup label="✨ International — Natural & Neural Voices">
                        {naturalOther.map((voice) => (
                          <option key={voice.voiceURI} value={voice.voiceURI}>
                            {voice.name} ({voice.lang}) ✨
                          </option>
                        ))}
                      </optgroup>
                    )}
                    {standardOther.length > 0 && (
                      <optgroup label="International — Standard Voices">
                        {standardOther.map((voice) => (
                          <option key={voice.voiceURI} value={voice.voiceURI}>
                            {voice.name} ({voice.lang})
                          </option>
                        ))}
                      </optgroup>
                    )}
                  </select>
                  <p className="help-text">
                    Select your preferred voice for manuscript audio proofreading.
                  </p>
                </div>
              );
            })()}

            <div className="form-group checkbox-group">
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

            <div className="form-actions">
              <button type="button" className="btn-secondary" onClick={onClose}>
                Cancel
              </button>
              <button type="submit" className="btn-primary" disabled={saving || !isDirty}>
                {saving ? 'Saving...' : 'Save Settings'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
