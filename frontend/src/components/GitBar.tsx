import React, { useState } from 'react';
import { Download, Upload, GitCommit, RefreshCw, GitBranch } from 'lucide-react';

interface GitBarProps {
  status: string;
  branch: string;
  onCommit: (message: string) => Promise<void>;
  onPush: () => Promise<void>;
  onPull: () => Promise<void>;
  onRefresh: () => void;
  loading: boolean;
}

export const GitBar: React.FC<GitBarProps> = ({
  status,
  branch,
  onCommit,
  onPush,
  onPull,
  onRefresh,
  loading
}) => {
  const [message, setMessage] = useState('');

  const handleCommit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;
    await onCommit(message);
    setMessage('');
  };

  const hasChanges = status.length > 0;

  return (
    <div className="git-bar">
      <div className="git-info">
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
          disabled={!hasChanges || loading}
          required
        />
        <button type="submit" disabled={!hasChanges || loading} title="Commit">
          <GitCommit size={16} />
          <span>Commit</span>
        </button>
        <button type="button" onClick={onPush} disabled={loading} title="Push to GitHub">
          <Upload size={16} />
          <span>Push</span>
        </button>
        <button type="button" onClick={onPull} disabled={loading} title="Pull from GitHub">
          <Download size={16} />
          <span>Pull</span>
        </button>
      </form>
    </div>
  );
};
