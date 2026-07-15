import React, { useState, useEffect } from 'react';
import { FileText, Plus, Trash2, ChevronDown, ChevronRight, Folder, FolderOpen, ChevronLeft } from 'lucide-react';
import { buildFileTree, type FileNode } from '../utils/treeBuilder';

interface SidebarProps {
  files: string[];
  activeFile: string | null;
  onSelectFile: (path: string) => void;
  onCreateFile: (path: string) => void;
  onDeleteFile: (path: string) => void;
  width: number;
  onCollapse: () => void;
}

interface SidebarNodeProps {
  node: FileNode;
  activeFile: string | null;
  onSelectFile: (path: string) => void;
  onDeleteFile: (path: string) => void;
  expandedDirs: Set<string>;
  onToggleExpand: (path: string) => void;
  depth: number;
}

const SidebarNode: React.FC<SidebarNodeProps> = ({
  node,
  activeFile,
  onSelectFile,
  onDeleteFile,
  expandedDirs,
  onToggleExpand,
  depth
}) => {
  const isExpanded = expandedDirs.has(node.path);
  const isActive = node.path === activeFile;

  if (node.isDirectory) {
    return (
      <div className="tree-folder">
        <div 
          className="file-item dir-item" 
          style={{ paddingLeft: `${depth * 12 + 6}px` }}
          onClick={() => onToggleExpand(node.path)}
        >
          <button 
            type="button" 
            className="chevron-btn"
            onClick={(e) => {
              e.stopPropagation();
              onToggleExpand(node.path);
            }}
          >
            {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
          {isExpanded ? <FolderOpen size={16} /> : <Folder size={16} />}
          <span className="file-name dir-name">{node.name}</span>
          <button
            className="delete-file-btn"
            onClick={(e) => {
              e.stopPropagation();
              if (confirm(`Are you sure you want to delete this folder and all its contents: ${node.name}?`)) {
                onDeleteFile(node.path);
              }
            }}
            title="Delete Folder"
          >
            <Trash2 size={14} />
          </button>
        </div>
        {isExpanded && node.children && (
          <div className="folder-children">
            {node.children.map(child => (
              <SidebarNode
                key={child.path}
                node={child}
                activeFile={activeFile}
                onSelectFile={onSelectFile}
                onDeleteFile={onDeleteFile}
                expandedDirs={expandedDirs}
                onToggleExpand={onToggleExpand}
                depth={depth + 1}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div 
      className={`file-item ${isActive ? 'active' : ''}`}
      style={{ paddingLeft: `${depth * 12 + 24}px` }}
      onClick={() => onSelectFile(node.path)}
    >
      <FileText size={16} />
      <span className="file-name">{node.name}</span>
      <button
        className="delete-file-btn"
        onClick={(e) => {
          e.stopPropagation();
          if (confirm(`Are you sure you want to delete ${node.name}?`)) {
            onDeleteFile(node.path);
          }
        }}
        title="Delete File"
      >
        <Trash2 size={14} />
      </button>
    </div>
  );
};

export const Sidebar: React.FC<SidebarProps> = ({
  files,
  activeFile,
  onSelectFile,
  onCreateFile,
  onDeleteFile,
  width,
  onCollapse
}) => {
  const [newFileName, setNewFileName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!activeFile) return;

    const parts = activeFile.split('/');
    if (parts.length <= 1) return;

    const parentsToExpand: string[] = [];
    let current = '';
    for (let i = 0; i < parts.length - 1; i++) {
      current = current ? `${current}/${parts[i]}` : parts[i];
      parentsToExpand.push(current);
    }

    setExpandedDirs(prev => {
      const next = new Set(prev);
      let changed = false;
      for (const parent of parentsToExpand) {
        if (!next.has(parent)) {
          next.add(parent);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [activeFile]);

  const toggleExpand = (path: string) => {
    setExpandedDirs(prev => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFileName.trim()) return;
    let name = newFileName.trim();
    if (!name.endsWith('.md')) {
      name += '.md';
    }
    onCreateFile(name);
    setNewFileName('');
    setIsCreating(false);
  };

  const fileTree = buildFileTree(files);

  return (
    <div className="sidebar" style={{ width: `${width}px` }}>
      <div className="sidebar-header">
        <h3>Chapters</h3>
        <div className="sidebar-actions">
          <button onClick={() => setIsCreating(!isCreating)} title="New File">
            <Plus size={16} />
          </button>
          <button onClick={onCollapse} title="Collapse Sidebar" className="collapse-btn">
            <ChevronLeft size={16} />
          </button>
        </div>
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

      <div className="file-tree">
        {fileTree.map((node) => (
          <SidebarNode
            key={node.path}
            node={node}
            activeFile={activeFile}
            onSelectFile={onSelectFile}
            onDeleteFile={onDeleteFile}
            expandedDirs={expandedDirs}
            onToggleExpand={toggleExpand}
            depth={0}
          />
        ))}
      </div>
    </div>
  );
};
