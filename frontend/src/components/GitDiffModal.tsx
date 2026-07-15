import React, { useEffect, useState } from 'react';
import { X, RefreshCw } from 'lucide-react';

interface GitDiffModalProps {
  onClose: () => void;
}

export const GitDiffModal: React.FC<GitDiffModalProps> = ({ onClose }) => {
  const [diff, setDiff] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchDiff = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/git/diff');
      if (!res.ok) {
        throw new Error('Failed to retrieve git diff');
      }
      const data = await res.json();
      setDiff(data.diff || 'No changes detected.');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDiff();
  }, []);

  const renderDiffLines = (diffText: string) => {
    if (!diffText.trim()) return <div className="diff-empty">No changes detected.</div>;

    return diffText.split('\n').map((line, idx) => {
      let className = 'diff-line';
      if (line.startsWith('+') && !line.startsWith('+++')) {
        className += ' diff-added';
      } else if (line.startsWith('-') && !line.startsWith('---')) {
        className += ' diff-removed';
      } else if (line.startsWith('@@')) {
        className += ' diff-hunk';
      } else if (line.startsWith('diff') || line.startsWith('index') || line.startsWith('---') || line.startsWith('+++')) {
        className += ' diff-header';
      }
      return (
        <div key={idx} className={className}>
          {line}
        </div>
      );
    });
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content git-diff-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Uncommitted Git Changes Diff</h3>
          <div className="modal-header-actions">
            <button className="refresh-btn" onClick={fetchDiff} disabled={loading} title="Refresh Diff">
              <RefreshCw size={14} className={loading ? 'spin' : ''} />
            </button>
            <button className="close-btn" onClick={onClose} title="Close">
              <X size={16} />
            </button>
          </div>
        </div>
        
        <div className="modal-body">
          {error && <div className="error-message">{error}</div>}
          {loading && <div className="diff-loading">Loading uncommitted changes diff...</div>}
          {!loading && !error && (
            <pre className="git-diff-pre">
              {renderDiffLines(diff)}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
};
