import React, { useState, useEffect } from 'react';
import { X, FolderOpen, Download, History, Folder } from 'lucide-react';
import { DirectoryPicker } from './DirectoryPicker';

interface Workspace {
  path: string;
  name: string;
  last_opened: number;
}

interface WorkspaceManagerProps {
  onClose: () => void;
  onWorkspaceChanged: () => void;
}

export const WorkspaceManager: React.FC<WorkspaceManagerProps> = ({
  onClose,
  onWorkspaceChanged
}) => {
  const [active, setActive] = useState('');
  const [recents, setRecents] = useState<Workspace[]>([]);
  const [localPath, setLocalPath] = useState('');
  const [cloneUrl, setCloneUrl] = useState('');
  const [clonePath, setClonePath] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerTarget, setPickerTarget] = useState<'local' | 'clone' | null>(null);

  const fetchWorkspaces = async () => {
    try {
      const res = await fetch('/api/workspaces');
      const data = await res.json();
      setActive(data.active);
      setRecents(data.recents || []);
    } catch (err) {
      console.error('Failed to fetch workspaces:', err);
    }
  };

  useEffect(() => {
    fetchWorkspaces();
  }, []);

  useEffect(() => {
    if (!cloneUrl) return;
    const match = cloneUrl.match(/\/([^/]+?)(?:\.git)?$/);
    if (match && match[1]) {
      const repoName = match[1];
      if (active) {
        const parentDir = active.substring(0, active.lastIndexOf('/'));
        if (parentDir) {
          setClonePath(`${parentDir}/${repoName}`);
        }
      } else {
        setClonePath(`~/github/${repoName}`);
      }
    }
  }, [cloneUrl, active]);

  const handleSelect = async (path: string) => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/workspaces/select', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path })
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to select workspace');
      }
      onWorkspaceChanged();
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenLocal = (e: React.FormEvent) => {
    e.preventDefault();
    if (!localPath.trim()) return;
    handleSelect(localPath.trim());
  };

  const handleClone = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cloneUrl.trim() || !clonePath.trim()) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/workspaces/clone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: cloneUrl.trim(), path: clonePath.trim() })
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to clone repository');
      }
      onWorkspaceChanged();
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenPicker = (target: 'local' | 'clone') => {
    setPickerTarget(target);
    setPickerOpen(true);
  };

  const handlePickerSelect = (selectedPath: string) => {
    if (pickerTarget === 'local') {
      setLocalPath(selectedPath);
    } else if (pickerTarget === 'clone') {
      setClonePath(selectedPath);
    }
    setPickerOpen(false);
    setPickerTarget(null);
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content workspace-manager">
        <div className="modal-header">
          <h2>Workspace Manager</h2>
          <button onClick={onClose} className="close-btn" title="Close">
            <X size={18} />
          </button>
        </div>

        {error && <div className="error-message">{error}</div>}

        <div className="modal-body">
          {/* Active Workspace */}
          <div className="section active-workspace">
            <h3>Active Workspace</h3>
            <div className="active-path">
              <Folder size={16} />
              <span>{active || 'None'}</span>
            </div>
          </div>

          {/* Recent Workspaces */}
          {recents.length > 0 && (
            <div className="section recent-workspaces">
              <h3>
                <History size={14} /> Recents
              </h3>
              <div className="recents-list">
                {recents.map((w) => (
                  <button
                    key={w.path}
                    onClick={() => handleSelect(w.path)}
                    disabled={loading || w.path === active}
                    className={`recent-item ${w.path === active ? 'active' : ''}`}
                  >
                    <span className="name">{w.name}</span>
                    <span className="path">{w.path}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Open Local */}
          <div className="section open-local">
            <h3>
              <FolderOpen size={14} /> Open Local Git Folder
            </h3>
            <form onSubmit={handleOpenLocal} className="form-row">
              <div className="input-with-browse">
                <input
                  type="text"
                  placeholder="/absolute/path/to/git/repo"
                  value={localPath}
                  onChange={(e) => setLocalPath(e.target.value)}
                  disabled={loading}
                  required
                />
                <button 
                  type="button" 
                  onClick={() => handleOpenPicker('local')}
                  disabled={loading}
                  className="browse-btn"
                  title="Browse folders"
                >
                  <FolderOpen size={16} />
                </button>
              </div>
              <button type="submit" disabled={loading}>Open</button>
            </form>
          </div>

          {/* Clone Remote */}
          <div className="section clone-remote">
            <h3>
              <Download size={14} /> Clone Repository
            </h3>
            <form onSubmit={handleClone} className="clone-form">
              <input
                type="text"
                placeholder="Git Repository URL (SSH URL recommended)"
                value={cloneUrl}
                onChange={(e) => setCloneUrl(e.target.value)}
                disabled={loading}
                required
              />
              <div className="input-with-browse">
                <input
                  type="text"
                  placeholder="Local Path to clone into"
                  value={clonePath}
                  onChange={(e) => setClonePath(e.target.value)}
                  disabled={loading}
                  required
                />
                <button 
                  type="button" 
                  onClick={() => handleOpenPicker('clone')}
                  disabled={loading}
                  className="browse-btn"
                  title="Browse folders"
                >
                  <FolderOpen size={16} />
                </button>
              </div>
              <button type="submit" disabled={loading}>
                {loading ? 'Cloning...' : 'Clone & Open'}
              </button>
            </form>
          </div>
        </div>
      </div>
      {pickerOpen && (
        <DirectoryPicker
          onSelect={handlePickerSelect}
          onCancel={() => setPickerOpen(false)}
          initialPath={pickerTarget === 'local' ? localPath : clonePath}
        />
      )}
    </div>
  );
};
