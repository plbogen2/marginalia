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
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchConfigStatus = async () => {
    try {
      const res = await fetch('/api/config');
      const data = await res.json();
      setIsConfigured(data.hasGemini);
      setSimulateHosted(!!data.simulateHostedMode);
      setInitialSimulateHosted(!!data.simulateHostedMode);
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
      const payload: { geminiApiKey?: string, simulateHostedMode?: boolean } = {};
      if (geminiKey.trim()) {
        payload.geminiApiKey = geminiKey.trim();
      }
      if (simulateHosted !== initialSimulateHosted) {
        payload.simulateHostedMode = simulateHosted;
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
      setGeminiKey('');
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

  const isDirty = geminiKey.trim() !== '' || simulateHosted !== initialSimulateHosted;

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
        </form>
      </div>
    </div>
  );
};
