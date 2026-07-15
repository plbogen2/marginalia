import React, { useEffect, useState } from 'react';
import { X, RefreshCw, FileText, GitCommit, Sparkles } from 'lucide-react';
import { SideBySideDiff } from './SideBySideDiff';

interface GitDiffModalProps {
  onClose: () => void;
  gitStatus: string;
  onRefreshStatus: () => void;
  onCommit: (message: string) => Promise<void>;
  hasGemini: boolean;
}

interface ModifiedFile {
  status: string; // 'M', 'A', 'D', '??'
  path: string;
}

export const GitDiffModal: React.FC<GitDiffModalProps> = ({ onClose, gitStatus, onRefreshStatus, onCommit, hasGemini }) => {
  const [selectedFile, setSelectedFile] = useState<ModifiedFile | null>(null);
  const [oldText, setOldText] = useState('');
  const [newText, setNewText] = useState('');
  const [loading, setLoading] = useState(false);
  const [commitMessage, setCommitMessage] = useState('');
  const [committing, setCommitting] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Parse porcelain status
  const files: ModifiedFile[] = gitStatus.split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .map(line => {
      const match = line.match(/^([MADRC?!\s]+)\s+(.+)$/);
      if (match) {
        return {
          status: match[1].trim(),
          path: match[2].trim()
        };
      }
      return null;
    })
    .filter((item): item is ModifiedFile => item !== null);

  // Select first file on load if nothing is selected yet
  useEffect(() => {
    if (files.length > 0) {
      if (!selectedFile || !files.some(f => f.path === selectedFile.path)) {
        setSelectedFile(files[0]);
      }
    } else {
      setSelectedFile(null);
    }
  }, [gitStatus]);

  // Fetch both versions of the selected file
  useEffect(() => {
    if (!selectedFile) {
      setOldText('');
      setNewText('');
      return;
    }

    const loadContents = async () => {
      setLoading(true);
      setError(null);
      try {
        let original = '';
        let modified = '';

        // 1. Fetch Original from Git HEAD (unless untracked/added)
        if (selectedFile.status !== '??' && selectedFile.status !== 'A') {
          try {
            const res = await fetch(`/api/file?path=${encodeURIComponent(selectedFile.path)}&version=HEAD`);
            if (res.ok) {
              const data = await res.json();
              original = data.content || '';
            }
          } catch (e) {
            console.warn('Failed to load HEAD version', e);
          }
        }

        // 2. Fetch Modified from Disk (unless deleted)
        if (selectedFile.status !== 'D') {
          try {
            const res = await fetch(`/api/file?path=${encodeURIComponent(selectedFile.path)}`);
            if (res.ok) {
              const data = await res.json();
              modified = data.content || '';
            }
          } catch (e) {
            console.warn('Failed to load modified version', e);
          }
        }

        setOldText(original);
        setNewText(modified);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    };

    loadContents();
  }, [selectedFile]);

  const handleSuggestMessage = async () => {
    setGenerating(true);
    try {
      const res = await fetch('/api/git/suggest-commit-message', { method: 'POST' });
      const data = await res.json();
      if (data.suggestion) {
        setCommitMessage(data.suggestion);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setGenerating(false);
    }
  };

  const handleSubmitCommit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commitMessage.trim()) return;
    setCommitting(true);
    try {
      await onCommit(commitMessage);
      setCommitMessage('');
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setCommitting(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content sbs-diff-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Git Changes File Diff</h3>
          <div className="modal-header-actions">
            <button className="refresh-btn" onClick={onRefreshStatus} title="Refresh Git Status">
              <RefreshCw size={14} />
            </button>
            <button className="close-btn" onClick={onClose} title="Close">
              <X size={16} />
            </button>
          </div>
        </div>
        
        <div className="modal-body sbs-diff-modal-body">
          {files.length === 0 ? (
            <div className="diff-empty">No uncommitted changes detected.</div>
          ) : (
            <>
              <div className="diff-files-sidebar">
                <h4>Modified Files</h4>
                <div className="diff-files-list">
                  {files.map((file) => (
                    <button
                      key={file.path}
                      onClick={() => setSelectedFile(file)}
                      className={`diff-file-item ${selectedFile?.path === file.path ? 'active' : ''}`}
                    >
                      <span className={`diff-status-label status-${file.status.toLowerCase().replace('?', 'u')}`}>
                        {file.status}
                      </span>
                      <span className="diff-file-path" title={file.path}>
                        {file.path.split('/').pop()}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="diff-viewer-main">
                {loading ? (
                  <div className="diff-loading">Loading file diff...</div>
                ) : error ? (
                  <div className="error-message">{error}</div>
                ) : selectedFile ? (
                  <div className="sbs-diff-wrapper">
                    <div className="diff-filename-header">
                      <FileText size={14} />
                      <span>{selectedFile.path}</span>
                    </div>
                    <SideBySideDiff oldText={oldText} newText={newText} />
                  </div>
                ) : (
                  <div className="diff-empty">Select a file to view its diff.</div>
                )}
              </div>
            </>
          )}
        </div>
        {files.length > 0 && (
          <form onSubmit={handleSubmitCommit} className="diff-modal-commit-form">
            <input
              type="text"
              placeholder="Commit message..."
              value={commitMessage}
              onChange={(e) => setCommitMessage(e.target.value)}
              required
              disabled={committing || generating}
            />
            {hasGemini && (
              <button
                type="button"
                className="suggest-message-btn"
                onClick={handleSuggestMessage}
                disabled={committing || generating}
                title="Suggest commit message (Gemini)"
              >
                <Sparkles size={16} className={generating ? 'spin' : ''} />
              </button>
            )}
            <button type="submit" disabled={committing || generating || !commitMessage.trim()}>
              <GitCommit size={16} />
              <span>{committing ? 'Committing...' : 'Commit Changes'}</span>
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
