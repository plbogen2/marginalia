import React, { useState, useEffect } from 'react';
import { X, Folder, ArrowUp, Check } from 'lucide-react';

interface DirectoryItem {
  name: string;
  path: string;
}

interface DirectoryPickerProps {
  onSelect: (path: string) => void;
  onCancel: () => void;
  initialPath?: string;
}

export const DirectoryPicker: React.FC<DirectoryPickerProps> = ({
  onSelect,
  onCancel,
  initialPath = ''
}) => {
  const [currentPath, setCurrentPath] = useState(initialPath);
  const [directories, setDirectories] = useState<DirectoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fetchDirs = async (path: string) => {
    setLoading(true);
    setError('');
    try {
      const url = path ? `/api/fs/list?path=${encodeURIComponent(path)}` : '/api/fs/list';
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`Failed to list directory: ${res.statusText}`);
      }
      const data = await res.json() as { path: string, directories: DirectoryItem[] };
      setCurrentPath(data.path);
      setDirectories(data.directories || []);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDirs(initialPath);
  }, [initialPath]);

  const handleNavigateDown = (path: string) => {
    fetchDirs(path);
  };

  const handleNavigateUp = () => {
    if (!currentPath || currentPath === '/') return;
    const lastSlash = currentPath.lastIndexOf('/');
    const parentPath = lastSlash === 0 ? '/' : currentPath.substring(0, lastSlash);
    fetchDirs(parentPath);
  };

  return (
    <div className="directory-picker-overlay">
      <div className="directory-picker-modal">
        <div className="directory-picker-header">
          <h3>Select Folder</h3>
          <button onClick={onCancel} className="close-btn" title="Cancel">
            <X size={18} />
          </button>
        </div>
        
        <div className="directory-picker-path-bar">
          <button 
            onClick={handleNavigateUp} 
            disabled={!currentPath || currentPath === '/' || loading}
            title="Go Up"
          >
            <ArrowUp size={16} />
          </button>
          <span className="current-path" title={currentPath}>{currentPath}</span>
        </div>

        {error && <div className="directory-picker-error">{error}</div>}

        <div className="directory-picker-content">
          {loading ? (
            <div className="directory-picker-loading">Loading folders...</div>
          ) : directories.length === 0 ? (
            <div className="directory-picker-empty">No subdirectories found.</div>
          ) : (
            <ul className="directory-list">
              {directories.map((dir) => (
                <li 
                  key={dir.path}
                  onDoubleClick={() => handleNavigateDown(dir.path)}
                  onClick={() => setCurrentPath(dir.path)} // clicking also selects it
                  className={`directory-item ${currentPath === dir.path ? 'selected' : ''}`}
                >
                  <Folder size={16} />
                  <span>{dir.name}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="directory-picker-footer">
          <button 
            onClick={onCancel} 
            className="btn-secondary"
          >
            Cancel
          </button>
          <button 
            onClick={() => onSelect(currentPath)} 
            disabled={loading}
            className="btn-primary"
          >
            <Check size={16} />
            <span>Select Folder</span>
          </button>
        </div>
      </div>
    </div>
  );
};
