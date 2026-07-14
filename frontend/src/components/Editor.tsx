import React from 'react';

interface EditorProps {
  value: string;
  onChange: (val: string) => void;
  activeFile: string | null;
}

export const Editor: React.FC<EditorProps> = ({ value, onChange, activeFile }) => {
  const wordCount = value.trim() ? value.trim().split(/\s+/).length : 0;
  const charCount = value.length;

  if (!activeFile) {
    return (
      <div className="editor-empty">
        <p>Select a file from the sidebar or create a new one to start writing.</p>
      </div>
    );
  }

  return (
    <div className="editor-container">
      <div className="editor-header">
        <span className="file-path">{activeFile}</span>
        <div className="stats">
          <span>{wordCount} words</span>
          <span>{charCount} chars</span>
        </div>
      </div>
      <textarea
        className="editor-textarea"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Start writing..."
        autoFocus
      />
    </div>
  );
};
