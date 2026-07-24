import React, { useState, useEffect } from 'react';
import { X, FolderOpen, Download, History, Folder, GitBranch, Search, Lock, Globe, RefreshCw } from 'lucide-react';
import { DirectoryPicker } from './DirectoryPicker';

interface Workspace {
  path: string;
  name: string;
  last_opened: number;
}

interface GitHubRepo {
  name: string;
  full_name: string;
  clone_url: string;
  ssh_url: string;
  html_url: string;
  description: string | null;
  is_private: boolean;
}

interface WorkspaceManagerProps {
  onClose: () => void;
  onWorkspaceChanged: (name: string) => void;
  authInfo?: { loggedIn: boolean; user: string | null; isOAuthMode: boolean } | null;
}

export const WorkspaceManager: React.FC<WorkspaceManagerProps> = ({
  onClose,
  onWorkspaceChanged,
  authInfo
}) => {
  const [active, setActive] = useState('');
  const [recents, setRecents] = useState<Workspace[]>([]);
  const [localPath, setLocalPath] = useState('');
  const [cloneUrl, setCloneUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);

  // GitHub Repos State
  const [repos, setRepos] = useState<GitHubRepo[]>([]);
  const [repoFilter, setRepoFilter] = useState('');
  const [fetchingRepos, setFetchingRepos] = useState(false);

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

  const fetchRepos = async () => {
    setFetchingRepos(true);
    try {
      const res = await fetch('/api/github/repos');
      if (res.ok) {
        const data = await res.json();
        setRepos(data.repos || []);
      }
    } catch (err) {
      console.error('Failed to fetch GitHub repos:', err);
    } finally {
      setFetchingRepos(false);
    }
  };

  useEffect(() => {
    fetchWorkspaces();
    fetchRepos();
  }, []);

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
      const data = await res.json() as { name: string };
      onWorkspaceChanged(data.name);
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

  const handleCloneUrl = async (urlToClone: string) => {
    if (!urlToClone.trim()) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/workspaces/clone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: urlToClone.trim() })
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to clone repository');
      }
      const data = await res.json() as { name: string };
      onWorkspaceChanged(data.name);
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleFormClone = (e: React.FormEvent) => {
    e.preventDefault();
    handleCloneUrl(cloneUrl);
  };

  const handlePickerSelect = (selectedPath: string) => {
    setLocalPath(selectedPath);
    setPickerOpen(false);
  };

  const filteredRepos = repos.filter(r => 
    r.name.toLowerCase().includes(repoFilter.toLowerCase()) || 
    (r.description && r.description.toLowerCase().includes(repoFilter.toLowerCase()))
  );

  const isServerHosted = !!authInfo?.isOAuthMode;

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

          {/* GitHub Repositories Browser */}
          <div className="section github-repos">
            <div className="section-header">
              <h3>
                <GitBranch size={14} /> Browse GitHub Repositories
              </h3>
              <button 
                type="button" 
                onClick={fetchRepos} 
                className="icon-btn refresh-btn" 
                title="Refresh Repositories"
                disabled={fetchingRepos}
              >
                <RefreshCw size={14} className={fetchingRepos ? 'spin' : ''} />
              </button>
            </div>

            <div className="repo-search-bar">
              <Search size={14} className="search-icon" />
              <input
                type="text"
                placeholder="Filter repositories..."
                value={repoFilter}
                onChange={(e) => setRepoFilter(e.target.value)}
              />
            </div>

            {fetchingRepos ? (
              <div className="loading-state">Loading repositories...</div>
            ) : filteredRepos.length > 0 ? (
              <div className="repos-list">
                {filteredRepos.map((repo) => (
                  <div key={repo.full_name} className="repo-card">
                    <div className="repo-info">
                      <div className="repo-title">
                        {repo.is_private ? <Lock size={12} className="private-icon" /> : <Globe size={12} className="public-icon" />}
                        <span className="repo-name">{repo.name}</span>
                      </div>
                      {repo.description && <p className="repo-desc">{repo.description}</p>}
                    </div>
                    <button
                      type="button"
                      className="clone-repo-btn"
                      onClick={() => handleCloneUrl(repo.clone_url || repo.ssh_url)}
                      disabled={loading}
                    >
                      <Download size={14} /> Clone & Open
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-state">No repositories found. Paste a URL below to clone.</div>
            )}
          </div>

          {/* Clone Remote via URL */}
          <div className="section clone-remote">
            <h3>
              <Download size={14} /> Clone Repository via URL
            </h3>
            <form onSubmit={handleFormClone} className="clone-form-inline">
              <input
                type="text"
                placeholder="Git Repository URL (https://github.com/user/repo or SSH)"
                value={cloneUrl}
                onChange={(e) => setCloneUrl(e.target.value)}
                disabled={loading}
                required
              />
              <button type="submit" disabled={loading || !cloneUrl.trim()}>
                {loading ? 'Cloning...' : 'Clone & Open'}
              </button>
            </form>
          </div>

          {/* Open Local Git Folder (Only in Local Mode, hidden in Hosted/Server Mode) */}
          {!isServerHosted && (
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
                    onClick={() => setPickerOpen(true)}
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
          )}
        </div>
      </div>
      {pickerOpen && (
        <DirectoryPicker
          onSelect={handlePickerSelect}
          onCancel={() => setPickerOpen(false)}
          initialPath={localPath}
        />
      )}
    </div>
  );
};
