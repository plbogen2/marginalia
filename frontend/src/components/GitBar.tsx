import React, { useState } from 'react';
import { Download, Upload, GitCommit, RefreshCw, GitBranch, Folder, Sparkles, ArrowLeft, ArrowRight, Settings, LogOut } from 'lucide-react';

interface GitBarProps {
  status: string;
  branch: string;
  onCommit: (message: string) => Promise<void>;
  onPush: () => Promise<void>;
  onPull: () => Promise<void>;
  onRefresh: () => void;
  onSwitchWorkspace: () => void;
  hasRemote: boolean;
  loading: boolean;
  ahead: number;
  hasGemini: boolean;
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  previewOpen: boolean;
  onTogglePreview: () => void;
  onOpenSettings: () => void;
  authInfo: { loggedIn: boolean, user: string | null, isOAuthMode: boolean } | null;
  onLogout: () => void;
}

export const GitBar: React.FC<GitBarProps> = ({
  status,
  branch,
  onCommit,
  onPush,
  onPull,
  onRefresh,
  onSwitchWorkspace,
  hasRemote,
  loading,
  ahead,
  hasGemini,
  sidebarOpen,
  onToggleSidebar,
  previewOpen,
  onTogglePreview,
  onOpenSettings,
  authInfo,
  onLogout
}) => {
  const [message, setMessage] = useState('');
  const [generating, setGenerating] = useState(false);

  const handleCommit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;
    await onCommit(message);
    setMessage('');
  };

  const handleSuggestMessage = async () => {
    setGenerating(true);
    try {
      const res = await fetch('/api/git/suggest-commit-message', {
        method: 'POST'
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Failed to generate message');
      }
      const data = await res.json();
      if (data.suggestion) {
        setMessage(data.suggestion);
      }
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setGenerating(false);
    }
  };

  const hasChanges = (status || '').length > 0;

  return (
    <div className="git-bar">
      <div className="git-info">
        <div className="nav-buttons">
          <button onClick={() => window.history.back()} title="Go Back">
            <ArrowLeft size={14} />
          </button>
          <button onClick={() => window.history.forward()} title="Go Forward">
            <ArrowRight size={14} />
          </button>
        </div>
        <button onClick={onSwitchWorkspace} disabled={loading} title="Switch Workspace">
          <Folder size={14} />
        </button>
        <GitBranch size={16} />
        <span className="branch-name">{branch || 'unknown'}</span>
        <span className={`status-badge ${hasChanges ? 'modified' : 'clean'}`}>
          {hasChanges ? 'Uncommitted Changes' : 'Clean'}
        </span>
        <button onClick={onRefresh} disabled={loading} title="Refresh Status">
          <RefreshCw size={14} className={loading ? 'spin' : ''} />
        </button>
      </div>

      <form onSubmit={handleCommit} className="git-actions">
        <input
          type="text"
          placeholder="Commit message..."
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          disabled={!hasChanges || loading || generating}
          required
        />
        {hasGemini && (
          <button
            type="button"
            className="suggest-message-btn"
            onClick={handleSuggestMessage}
            disabled={!hasChanges || loading || generating}
            title="Suggest commit message (Gemini)"
          >
            <Sparkles size={16} className={generating ? 'spin' : ''} />
          </button>
        )}
        <button type="submit" disabled={!hasChanges || loading || generating} title="Commit">
          <GitCommit size={16} />
          <span>Commit</span>
        </button>
        <button 
          type="button" 
          onClick={onPush} 
          disabled={loading || !hasRemote || ahead === 0} 
          title={
            !hasRemote 
              ? "No remote configured" 
              : ahead === 0 
                ? "Nothing to push (local commits are up-to-date with remote)" 
                : `Push ${ahead} commit(s) to GitHub`
          }
        >
          <Upload size={16} />
          <span>Push{ahead > 0 ? ` (${ahead}↑)` : ''}</span>
        </button>
        <button 
          type="button" 
          onClick={onPull} 
          disabled={loading || !hasRemote} 
          title={hasRemote ? "Pull from GitHub" : "No remote configured"}
        >
          <Download size={16} />
          <span>Pull</span>
        </button>
      </form>

      <div className="git-options">
        <button onClick={onToggleSidebar} disabled={loading}>
          {sidebarOpen ? 'Hide Sidebar' : 'Show Sidebar'}
        </button>
        <button onClick={onTogglePreview} disabled={loading}>
          {previewOpen ? 'Hide Preview' : 'Show Preview'}
        </button>
        <button onClick={onOpenSettings} title="Settings" className="settings-btn">
          <Settings size={14} />
        </button>
        {authInfo?.isOAuthMode && authInfo.loggedIn && (
          <div className="auth-toolbar-section">
            <span className="user-badge">Logged in as {authInfo.user}</span>
            <button onClick={onLogout} title="Log Out" className="logout-btn">
              <LogOut size={14} />
            </button>
          </div>
        )}
        {loading && <span className="loading-indicator">Loading...</span>}
      </div>
    </div>
  );
};
