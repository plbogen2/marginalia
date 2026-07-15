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
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchConfigStatus = async () => {
    try {
      const res = await fetch('/api/config');
      const data = await res.json();
      setIsConfigured(data.hasGemini);
    } catch (err) {
      console.error('Failed to load configuration status:', err);
    }
  };

  useEffect(() => {
    fetchConfigStatus();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!geminiKey.trim()) return;

    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ geminiApiKey: geminiKey.trim() })
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to save settings');
      }
      setGeminiKey('');
      await fetchConfigStatus();
      onSave();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

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
                placeholder="Enter Gemini API Key"
                value={geminiKey}
                onChange={(e) => setGeminiKey(e.target.value)}
                required
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
            <button type="submit" className="btn-primary" disabled={saving || !geminiKey.trim()}>
              {saving ? 'Saving...' : 'Save Settings'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
