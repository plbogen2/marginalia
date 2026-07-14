import React, { useState } from 'react';
import { FileText, Plus, Trash2 } from 'lucide-react';

interface SidebarProps {
  files: string[];
  activeFile: string | null;
  onSelectFile: (path: string) => void;
  onCreateFile: (path: string) => void;
  onDeleteFile: (path: string) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  files,
  activeFile,
  onSelectFile,
  onCreateFile,
  onDeleteFile
}) => {
  const [newFileName, setNewFileName] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFileName.trim()) return;
    // Ensure it ends with .md
    let name = newFileName.trim();
    if (!name.endsWith('.md')) {
      name += '.md';
    }
    onCreateFile(name);
    setNewFileName('');
    setIsCreating(false);
  };

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <h3>Chapters</h3>
        <button onClick={() => setIsCreating(!isCreating)} title="New File">
          <Plus size={16} />
        </button>
      </div>

      {isCreating && (
        <form onSubmit={handleSubmit} className="new-file-form">
          <input
            type="text"
            placeholder="filename.md"
            value={newFileName}
            onChange={(e) => setNewFileName(e.target.value)}
            autoFocus
            required
          />
          <button type="submit">Create</button>
        </form>
      )}

      <ul className="file-list">
        {files.map((file) => {
          const isActive = file === activeFile;
          return (
            <li
              key={file}
              className={`file-item ${isActive ? 'active' : ''}`}
              onClick={() => onSelectFile(file)}
            >
              <FileText size={16} />
              <span className="file-name">{file}</span>
              <button
                className="delete-file-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  if (confirm(`Are you sure you want to delete ${file}?`)) {
                    onDeleteFile(file);
                  }
                }}
                title="Delete File"
              >
                <Trash2 size={14} />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
};
