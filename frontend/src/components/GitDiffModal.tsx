import React, { useEffect, useState, useMemo } from 'react';
import { X, RefreshCw, FileText, GitCommit, Sparkles, AlertTriangle, Check } from 'lucide-react';
import { SideBySideDiff } from './SideBySideDiff';
import { parseConflictMarkers, resolveConflictsInContent, type ResolutionChoice } from '../utils/conflictParser';

interface GitDiffModalProps {
  onClose: () => void;
  gitStatus: string;
  onRefreshStatus: () => void;
  onCommit: (message: string) => Promise<void>;
  hasGemini: boolean;
  inConflict?: boolean;
  conflictedFiles?: string[];
  onAbortMerge?: () => Promise<void>;
  onResolveFile?: (filePath: string, resolvedContent?: string) => Promise<void>;
}

interface ModifiedFile {
  status: string; // 'M', 'A', 'D', '??', 'UU', 'AA', etc.
  path: string;
  isConflicted: boolean;
}

export const GitDiffModal: React.FC<GitDiffModalProps> = ({
  onClose,
  gitStatus,
  onRefreshStatus,
  onCommit,
  hasGemini,
  inConflict = false,
  conflictedFiles = [],
  onAbortMerge,
  onResolveFile,
}) => {
  const [selectedFile, setSelectedFile] = useState<ModifiedFile | null>(null);
  const [oldText, setOldText] = useState('');
  const [newText, setNewText] = useState('');
  const [diskContent, setDiskContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [commitMessage, setCommitMessage] = useState('');
  const [committing, setCommitting] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Resolution state for 3-way conflict resolver
  const [resolutions, setResolutions] = useState<Record<string, ResolutionChoice>>({});
  const [resolving, setResolving] = useState(false);
  const [aborting, setAborting] = useState(false);

  // Parse porcelain status
  const files: ModifiedFile[] = useMemo(() => {
    return gitStatus
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line) => {
        const match = line.match(/^([MADRC?!\s]+)\s+(.+)$/);
        if (match) {
          const status = match[1].trim();
          const path = match[2].trim();
          const isConflicted =
            conflictedFiles.includes(path) ||
            ['UU', 'AA', 'UD', 'DU', 'DD', 'AU', 'UA'].includes(status);
          return {
            status,
            path,
            isConflicted,
          };
        }
        return null;
      })
      .filter((item): item is ModifiedFile => item !== null);
  }, [gitStatus, conflictedFiles]);

  // Select first file on load or prioritize conflicted file
  useEffect(() => {
    if (files.length > 0) {
      if (!selectedFile || !files.some((f) => f.path === selectedFile.path)) {
        const firstConflict = files.find((f) => f.isConflicted);
        setSelectedFile(firstConflict || files[0]);
      }
    } else {
      setSelectedFile(null);
    }
  }, [files]);

  // Fetch versions of the selected file
  useEffect(() => {
    if (!selectedFile) {
      setOldText('');
      setNewText('');
      setDiskContent('');
      setResolutions({});
      return;
    }

    const loadContents = async () => {
      setLoading(true);
      setError(null);
      setResolutions({});
      try {
        let original = '';
        let modified = '';
        let disk = '';

        if (selectedFile.isConflicted) {
          // 3-way conflict:
          // Ours: stage:2 (Current / Local)
          // Theirs: stage:3 (Incoming / Remote)
          // Working copy: disk content containing conflict markers
          try {
            const [oursRes, theirsRes, diskRes] = await Promise.all([
              fetch(`/api/file?path=${encodeURIComponent(selectedFile.path)}&version=stage:2`),
              fetch(`/api/file?path=${encodeURIComponent(selectedFile.path)}&version=stage:3`),
              fetch(`/api/file?path=${encodeURIComponent(selectedFile.path)}`),
            ]);

            if (oursRes.ok) {
              const oursData = await oursRes.json();
              original = oursData.content || '';
            }
            if (theirsRes.ok) {
              const theirsData = await theirsRes.json();
              modified = theirsData.content || '';
            }
            if (diskRes.ok) {
              const diskData = await diskRes.json();
              disk = diskData.content || '';
            }
          } catch (e) {
            console.warn('Failed to load conflict versions', e);
          }
        } else {
          // Standard 2-way diff:
          // 1. Fetch Original from Git HEAD (unless untracked/added)
          if (selectedFile.status !== '??' && selectedFile.status !== 'A') {
            try {
              const res = await fetch(
                `/api/file?path=${encodeURIComponent(selectedFile.path)}&version=HEAD`
              );
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
                disk = modified;
              }
            } catch (e) {
              console.warn('Failed to load modified version', e);
            }
          }
        }

        setOldText(original);
        setNewText(modified);
        setDiskContent(disk);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    };

    loadContents();
  }, [selectedFile]);

  // Conflict blocks from disk text
  const conflictParseResult = useMemo(() => {
    return parseConflictMarkers(diskContent);
  }, [diskContent]);

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

  const handleAbort = async () => {
    if (!onAbortMerge) return;
    if (window.confirm('Are you sure you want to abort the merge? Uncommitted merge changes will be discarded.')) {
      setAborting(true);
      try {
        await onAbortMerge();
        onClose();
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setAborting(false);
      }
    }
  };

  const handleAcceptAllOurs = async () => {
    if (!selectedFile || !onResolveFile) return;
    setResolving(true);
    setError(null);
    try {
      await onResolveFile(selectedFile.path, oldText);
      onRefreshStatus();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setResolving(false);
    }
  };

  const handleAcceptAllTheirs = async () => {
    if (!selectedFile || !onResolveFile) return;
    setResolving(true);
    setError(null);
    try {
      await onResolveFile(selectedFile.path, newText);
      onRefreshStatus();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setResolving(false);
    }
  };

  const handleApplyResolution = async () => {
    if (!selectedFile || !onResolveFile) return;
    setResolving(true);
    setError(null);
    try {
      let resolvedText: string | undefined;
      if (conflictParseResult.hasConflicts) {
        resolvedText = resolveConflictsInContent(diskContent, resolutions);
      } else {
        resolvedText = diskContent;
      }
      await onResolveFile(selectedFile.path, resolvedText);
      onRefreshStatus();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setResolving(false);
    }
  };

  const setChoiceForBlock = (blockId: string, choice: ResolutionChoice) => {
    setResolutions((prev) => ({
      ...prev,
      [blockId]: choice,
    }));
  };

  const hasAnyConflicts = inConflict || files.some((f) => f.isConflicted);
  const unresolvedCount = files.filter((f) => f.isConflicted).length;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content sbs-diff-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-header-title">
            <h3>{hasAnyConflicts ? 'Git Merge Conflict Resolver' : 'Git Changes File Diff'}</h3>
            {hasAnyConflicts && (
              <span className="conflict-header-pill">
                <AlertTriangle size={14} /> Merge in Progress
              </span>
            )}
          </div>
          <div className="modal-header-actions">
            {hasAnyConflicts && onAbortMerge && (
              <button
                type="button"
                className="abort-merge-btn"
                onClick={handleAbort}
                disabled={aborting}
                title="Abort current merge and restore clean baseline"
              >
                {aborting ? 'Aborting...' : 'Abort Merge'}
              </button>
            )}
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
                <h4>{hasAnyConflicts ? 'Files with Conflicts & Changes' : 'Modified Files'}</h4>
                <div className="diff-files-list">
                  {files.map((file) => (
                    <button
                      key={file.path}
                      onClick={() => setSelectedFile(file)}
                      className={`diff-file-item ${selectedFile?.path === file.path ? 'active' : ''} ${
                        file.isConflicted ? 'conflicted' : ''
                      }`}
                    >
                      <span
                        className={`diff-status-label status-${file.status
                          .toLowerCase()
                          .replace('?', 'u')}`}
                      >
                        {file.status}
                      </span>
                      <span className="diff-file-path" title={file.path}>
                        {file.path.split('/').pop()}
                      </span>
                      {file.isConflicted && (
                        <AlertTriangle size={12} className="conflict-badge-icon" />
                      )}
                    </button>
                  ))}
                </div>
              </div>

              <div className="diff-viewer-main">
                {loading ? (
                  <div className="diff-loading">Loading file contents...</div>
                ) : error ? (
                  <div className="error-message">{error}</div>
                ) : selectedFile ? (
                  <div className="sbs-diff-wrapper">
                    <div className="diff-filename-header">
                      <div className="header-left">
                        <FileText size={14} />
                        <span>{selectedFile.path}</span>
                        {selectedFile.isConflicted && (
                          <span className="conflict-tag">Conflicted</span>
                        )}
                      </div>
                      {selectedFile.isConflicted && onResolveFile && (
                        <div className="conflict-action-buttons">
                          <button
                            type="button"
                            className="accept-ours-btn"
                            onClick={handleAcceptAllOurs}
                            disabled={resolving}
                            title="Accept local version for entire file"
                          >
                            Accept All Ours
                          </button>
                          <button
                            type="button"
                            className="accept-theirs-btn"
                            onClick={handleAcceptAllTheirs}
                            disabled={resolving}
                            title="Accept incoming remote version for entire file"
                          >
                            Accept All Theirs
                          </button>
                          <button
                            type="button"
                            className="resolve-file-btn"
                            onClick={handleApplyResolution}
                            disabled={resolving}
                            title="Apply resolutions and mark this file as resolved in Git"
                          >
                            <Check size={14} />
                            <span>{resolving ? 'Resolving...' : 'Mark as Resolved'}</span>
                          </button>
                        </div>
                      )}
                    </div>

                    {selectedFile.isConflicted && conflictParseResult.hasConflicts ? (
                      <div className="conflict-resolver-view">
                        <div className="conflict-blocks-list">
                          <div className="conflict-instructions">
                            <span>
                              Select which version to keep for each conflict block, then click{' '}
                              <strong>Mark as Resolved</strong>.
                            </span>
                          </div>
                          {conflictParseResult.blocks.map((block, idx) => {
                            const choice = resolutions[block.id] || 'current';
                            return (
                              <div key={block.id} className="conflict-block-card">
                                <div className="block-header">
                                  <span className="block-label">
                                    Conflict #{idx + 1}
                                  </span>
                                  <div className="block-controls">
                                    <button
                                      type="button"
                                      className={`choice-btn ${
                                        choice === 'current' ? 'active-choice current' : ''
                                      }`}
                                      onClick={() => setChoiceForBlock(block.id, 'current')}
                                    >
                                      Keep Current (Ours)
                                    </button>
                                    <button
                                      type="button"
                                      className={`choice-btn ${
                                        choice === 'incoming' ? 'active-choice incoming' : ''
                                      }`}
                                      onClick={() => setChoiceForBlock(block.id, 'incoming')}
                                    >
                                      Keep Incoming (Theirs)
                                    </button>
                                    <button
                                      type="button"
                                      className={`choice-btn ${
                                        choice === 'both' ? 'active-choice both' : ''
                                      }`}
                                      onClick={() => setChoiceForBlock(block.id, 'both')}
                                    >
                                      Keep Both
                                    </button>
                                  </div>
                                </div>
                                <div className="block-diff-columns">
                                  <div
                                    className={`diff-col col-current ${
                                      choice === 'current' || choice === 'both' ? 'selected' : ''
                                    }`}
                                  >
                                    <div className="col-header">Current (Local / HEAD)</div>
                                    <pre className="col-content">
                                      {block.currentText || <em>(empty)</em>}
                                    </pre>
                                  </div>
                                  <div
                                    className={`diff-col col-incoming ${
                                      choice === 'incoming' || choice === 'both' ? 'selected' : ''
                                    }`}
                                  >
                                    <div className="col-header">Incoming (Remote)</div>
                                    <pre className="col-content">
                                      {block.incomingText || <em>(empty)</em>}
                                    </pre>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ) : (
                      <SideBySideDiff
                        oldText={oldText}
                        newText={newText}
                        leftHeader={selectedFile.isConflicted ? 'Current (Ours)' : 'Original'}
                        rightHeader={selectedFile.isConflicted ? 'Incoming (Theirs)' : 'Modified'}
                      />
                    )}
                  </div>
                ) : (
                  <div className="diff-empty">Select a file to view its diff.</div>
                )}
              </div>
            </>
          )}
        </div>

        {hasAnyConflicts ? (
          <div className="diff-modal-merge-footer">
            {unresolvedCount > 0 ? (
              <div className="merge-status-pending">
                <AlertTriangle size={16} />
                <span>
                  Merge in progress: <strong>{unresolvedCount} file{unresolvedCount > 1 ? 's' : ''}</strong> still conflicted. Resolve files to complete merge.
                </span>
                {onAbortMerge && (
                  <button
                    type="button"
                    className="abort-merge-btn-footer"
                    onClick={handleAbort}
                    disabled={aborting}
                  >
                    {aborting ? 'Aborting...' : 'Abort Merge'}
                  </button>
                )}
              </div>
            ) : (
              <form onSubmit={handleSubmitCommit} className="diff-modal-commit-form merge-ready-form">
                <input
                  type="text"
                  placeholder="Merge commit message..."
                  value={commitMessage || "Merge remote-tracking branch 'origin/main'"}
                  onChange={(e) => setCommitMessage(e.target.value)}
                  required
                  disabled={committing || generating}
                />
                <button type="submit" className="complete-merge-btn" disabled={committing || generating}>
                  <Check size={16} />
                  <span>{committing ? 'Completing Merge...' : 'Complete & Commit Merge'}</span>
                </button>
              </form>
            )}
          </div>
        ) : files.length > 0 ? (
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
        ) : null}
      </div>
    </div>
  );
};
