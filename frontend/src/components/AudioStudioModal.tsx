import React, { useState, useEffect, useMemo } from 'react';
import { 
  X, 
  Users, 
  Download, 
  Sparkles, 
  Square, 
  CheckSquare, 
  MinusSquare,
  ChevronDown, 
  ChevronRight, 
  Folder, 
  FolderOpen,
  Plus,
  Trash2,
  Volume2,
  FileText,
  Layers,
  Loader2,
  GitMerge,
  Scissors,
  Check,
  Play
} from 'lucide-react';
import { buildFileTree, type FileNode } from '../utils/treeBuilder';

interface CharacterCast {
  name: string;
  gender: 'male' | 'female' | 'neutral';
  language: string;
  voice: string;
  dialogueCount?: number;
  sampleLines?: string[];
}

interface AudioStudioModalProps {
  isOpen: boolean;
  onClose: () => void;
  files: string[];
  activeFile: string | null;
  hasGeminiKey: boolean;
}

const CANONICAL_GEMINI_VOICES = [
  { name: 'Puck', desc: 'Upbeat', gender: 'male', accent: 'en-US' },
  { name: 'Charon', desc: 'Informative', gender: 'male', accent: 'en-US' },
  { name: 'Kore', desc: 'Firm', gender: 'female', accent: 'en-US' },
  { name: 'Fenrir', desc: 'Excitable', gender: 'male', accent: 'en-US' },
  { name: 'Aoede', desc: 'Breezy', gender: 'female', accent: 'en-US' },
  { name: 'Leda', desc: 'Youthful', gender: 'female', accent: 'en-US' },
  { name: 'Orus', desc: 'Firm', gender: 'male', accent: 'en-US' },
  { name: 'Zephyr', desc: 'Bright', gender: 'neutral', accent: 'en-US' },
  { name: 'Callirrhoe', desc: 'Easy-going', gender: 'female', accent: 'en-US' },
  { name: 'Autonoe', desc: 'Bright', gender: 'female', accent: 'en-US' },
  { name: 'Enceladus', desc: 'Breathy', gender: 'male', accent: 'en-US' },
  { name: 'Iapetus', desc: 'Clear', gender: 'male', accent: 'en-US' },
  { name: 'Umbriel', desc: 'Easy-going', gender: 'male', accent: 'en-US' },
  { name: 'Algieba', desc: 'Smooth', gender: 'neutral', accent: 'en-US' },
  { name: 'Despina', desc: 'Smooth', gender: 'female', accent: 'en-US' },
  { name: 'Erinome', desc: 'Clear', gender: 'female', accent: 'en-US' },
  { name: 'Algenib', desc: 'Gravelly', gender: 'male', accent: 'en-US' },
  { name: 'Rasalgethi', desc: 'Informative', gender: 'male', accent: 'en-US' },
  { name: 'Laomedeia', desc: 'Upbeat', gender: 'female', accent: 'en-US' },
  { name: 'Achernar', desc: 'Soft', gender: 'neutral', accent: 'en-US' },
  { name: 'Alnilam', desc: 'Firm', gender: 'male', accent: 'en-US' },
  { name: 'Schedar', desc: 'Even', gender: 'neutral', accent: 'en-US' },
  { name: 'Gacrux', desc: 'Mature', gender: 'male', accent: 'en-US' },
  { name: 'Pulcherrima', desc: 'Forward', gender: 'female', accent: 'en-US' },
  { name: 'Achird', desc: 'Friendly', gender: 'male', accent: 'en-US' },
  { name: 'Zubenelgenubi', desc: 'Casual', gender: 'male', accent: 'en-US' },
  { name: 'Vindemiatrix', desc: 'Gentle', gender: 'female', accent: 'en-US' },
  { name: 'Sadachbia', desc: 'Lively', gender: 'neutral', accent: 'en-US' },
  { name: 'Sadaltager', desc: 'Knowledgeable', gender: 'male', accent: 'en-US' },
  { name: 'Sulafat', desc: 'Warm', gender: 'neutral', accent: 'en-US' },
];

const LANGUAGE_ACCENTS = [
  { code: 'en-US', label: 'English (United States)' },
  { code: 'en-GB', label: 'English (Great Britain)' },
  { code: 'en-SG', label: 'English (Singapore / Asian Cadence)' },
  { code: 'en-AU', label: 'English (Australia)' },
  { code: 'ja-JP', label: 'Japanese / Tokyo Cadence' },
  { code: 'fr-FR', label: 'French (France)' },
  { code: 'de-DE', label: 'German (Germany)' },
  { code: 'es-ES', label: 'Spanish (Spain / LatAm)' },
  { code: 'it-IT', label: 'Italian (Italy)' },
];

function getDescendantFilePaths(node: FileNode): string[] {
  if (!node.isDirectory) {
    return node.path.endsWith('.md') ? [node.path] : [];
  }
  let list: string[] = [];
  if (node.children) {
    for (const child of node.children) {
      list = list.concat(getDescendantFilePaths(child));
    }
  }
  return list;
}

interface TreeItemProps {
  node: FileNode;
  selectedFiles: string[];
  onToggleFile: (path: string) => void;
  onToggleDirectory: (paths: string[], selectAll: boolean) => void;
  expandedDirs: Set<string>;
  onToggleExpand: (path: string) => void;
  depth: number;
  activeFile: string | null;
}

const StudioTreeItem: React.FC<TreeItemProps> = ({
  node,
  selectedFiles,
  onToggleFile,
  onToggleDirectory,
  expandedDirs,
  onToggleExpand,
  depth,
  activeFile,
}) => {
  const isExpanded = expandedDirs.has(node.path);

  if (node.isDirectory) {
    const childFilePaths = getDescendantFilePaths(node);
    if (childFilePaths.length === 0) return null;

    const selectedChildCount = childFilePaths.filter(p => selectedFiles.includes(p)).length;
    const isAllSelected = selectedChildCount === childFilePaths.length;
    const isSomeSelected = selectedChildCount > 0 && selectedChildCount < childFilePaths.length;

    const handleDirCheckboxClick = (e: React.MouseEvent) => {
      e.stopPropagation();
      onToggleDirectory(childFilePaths, !isAllSelected);
    };

    return (
      <div className="studio-tree-folder">
        <div 
          className="studio-tree-row dir-row"
          style={{ paddingLeft: `${depth * 14 + 6}px` }}
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
          
          <button 
            type="button" 
            className="tree-checkbox-btn"
            onClick={handleDirCheckboxClick}
            title={isAllSelected ? "Deselect directory" : "Select all in directory"}
          >
            {isAllSelected ? (
              <CheckSquare size={14} className="checkbox-icon checked" />
            ) : isSomeSelected ? (
              <MinusSquare size={14} className="checkbox-icon indeterminate" />
            ) : (
              <Square size={14} className="checkbox-icon" />
            )}
          </button>

          {isExpanded ? <FolderOpen size={14} className="folder-icon open" /> : <Folder size={14} className="folder-icon" />}
          <span className="tree-node-name dir-name">{node.name}</span>
          <span className="dir-count-badge">{selectedChildCount}/{childFilePaths.length}</span>
        </div>

        {isExpanded && node.children && (
          <div className="studio-tree-children">
            {node.children.map(child => (
              <StudioTreeItem
                key={child.path}
                node={child}
                selectedFiles={selectedFiles}
                onToggleFile={onToggleFile}
                onToggleDirectory={onToggleDirectory}
                expandedDirs={expandedDirs}
                onToggleExpand={onToggleExpand}
                depth={depth + 1}
                activeFile={activeFile}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  if (!node.path.endsWith('.md')) return null;
  const isSelected = selectedFiles.includes(node.path);
  const isActive = node.path === activeFile;

  return (
    <div 
      className={`studio-tree-row file-row ${isSelected ? 'selected' : ''} ${isActive ? 'active-editor-file' : ''}`}
      style={{ paddingLeft: `${depth * 14 + 24}px` }}
      onClick={() => onToggleFile(node.path)}
    >
      <button 
        type="button" 
        className="tree-checkbox-btn"
        onClick={(e) => {
          e.stopPropagation();
          onToggleFile(node.path);
        }}
      >
        {isSelected ? (
          <CheckSquare size={14} className="checkbox-icon checked" />
        ) : (
          <Square size={14} className="checkbox-icon" />
        )}
      </button>

      <FileText size={14} className="file-icon" />
      <span className="tree-node-name file-name">{node.name}</span>
      {isActive && <span className="active-tag">Active</span>}
    </div>
  );
};

export const AudioStudioModal: React.FC<AudioStudioModalProps> = ({
  isOpen,
  onClose,
  files,
  activeFile,
  hasGeminiKey,
}) => {
  const [activeTab, setActiveTab] = useState<'cast' | 'export'>('cast');
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set());
  const [cast, setCast] = useState<Record<string, CharacterCast>>({});
  const [narratorVoice, setNarratorVoice] = useState('Fenrir');
  const [isExtracting, setIsExtracting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isAuditioning, setIsAuditioning] = useState<string | null>(null);
  const [auditionAudio, setAuditionAudio] = useState<HTMLAudioElement | null>(null);

  // Combine / Merge & Split UI state
  const [mergingSourceChar, setMergingSourceChar] = useState<string | null>(null);
  const [mergeTargetChar, setMergeTargetChar] = useState<string>('');
  const [splittingChar, setSplittingChar] = useState<string | null>(null);
  const [splitNewName, setSplitNewName] = useState<string>('');

  // Export parameters
  const [exportTitle, setExportTitle] = useState('Audiobook Master');
  const [exportAuthor, setExportAuthor] = useState('Marginalia Author');
  const [exportFormat, setExportFormat] = useState<'mp3' | 'm4b'>('mp3');
  const [exportPacing, setExportPacing] = useState('dramatic');
  const [exportSpeed, setExportSpeed] = useState(1.0);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const fileTree = useMemo(() => {
    return buildFileTree(files.filter(f => f.endsWith('.md')));
  }, [files]);

  useEffect(() => {
    if (isOpen) {
      if (activeFile && files.includes(activeFile)) {
        setSelectedFiles([activeFile]);
      } else {
        setSelectedFiles(files.filter(f => f.endsWith('.md')));
      }

      const allDirs = new Set<string>();
      const gatherDirs = (nodes: FileNode[]) => {
        for (const n of nodes) {
          if (n.isDirectory) {
            allDirs.add(n.path);
            if (n.children) gatherDirs(n.children);
          }
        }
      };
      gatherDirs(fileTree);
      setExpandedDirs(allDirs);

      loadSavedCast();
    }
    return () => {
      if (auditionAudio) {
        auditionAudio.pause();
      }
    };
  }, [isOpen, activeFile, files, fileTree]);

  const loadSavedCast = async () => {
    try {
      const res = await fetch('/api/tts/cast');
      if (res.ok) {
        const data = await res.json();
        if (data.cast && Object.keys(data.cast).length > 0) {
          setCast(data.cast);
        }
      }
    } catch {
      // ignore
    }
  };

  const handleToggleExpand = (path: string) => {
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

  const handleToggleFile = (path: string) => {
    setSelectedFiles(prev => 
      prev.includes(path) ? prev.filter(f => f !== path) : [...prev, path]
    );
  };

  const handleToggleDirectory = (dirPaths: string[], selectAll: boolean) => {
    setSelectedFiles(prev => {
      if (selectAll) {
        const set = new Set([...prev, ...dirPaths]);
        return Array.from(set);
      } else {
        return prev.filter(f => !dirPaths.includes(f));
      }
    });
  };

  const handleSelectAllFiles = () => {
    setSelectedFiles(files.filter(f => f.endsWith('.md')));
  };

  const handleClearAllFiles = () => {
    setSelectedFiles([]);
  };

  const handleExtractCharacters = async () => {
    if (selectedFiles.length === 0) {
      setStatusMessage('Please select at least one file from the tree.');
      return;
    }
    setIsExtracting(true);
    setStatusMessage(`Scanning ${selectedFiles.length} file(s) across directory tree...`);
    try {
      const res = await fetch('/api/tts/extract-characters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files: selectedFiles }),
      });
      if (!res.ok) {
        const err = await res.text();
        throw new Error(err);
      }
      const data = await res.json();
      const newCast: Record<string, CharacterCast> = { ...cast };
      for (const char of data.characters) {
        if (!newCast[char.name]) {
          newCast[char.name] = {
            name: char.name,
            gender: char.gender || 'neutral',
            language: char.suggestedLanguage || 'en-US',
            voice: char.suggestedVoice || (char.gender === 'female' ? 'Callirrhoe' : 'Iapetus'),
            dialogueCount: char.dialogueCount,
            sampleLines: char.sampleLines,
          };
        } else {
          newCast[char.name].dialogueCount = char.dialogueCount;
          newCast[char.name].sampleLines = char.sampleLines;
        }
      }
      setCast(newCast);
      setStatusMessage(`Extracted ${data.characters.length} character(s) across ${data.totalFilesScanned} selected file(s)!`);
    } catch (err) {
      setStatusMessage(`Extraction error: ${(err as Error).message}`);
    } finally {
      setIsExtracting(false);
    }
  };

  const handleSaveCast = async () => {
    try {
      const res = await fetch('/api/tts/cast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cast }),
      });
      if (res.ok) {
        setStatusMessage('Cast settings saved successfully.');
        setTimeout(() => setStatusMessage(null), 3000);
      }
    } catch (err) {
      setStatusMessage(`Failed to save cast: ${(err as Error).message}`);
    }
  };

  const handleUpdateCharacter = (name: string, updates: Partial<CharacterCast>) => {
    setCast(prev => ({
      ...prev,
      [name]: { ...prev[name], ...updates }
    }));
  };

  const handleRemoveCharacter = (name: string) => {
    setCast(prev => {
      const next = { ...prev };
      delete next[name];
      return next;
    });
  };

  const handleAddCharacter = () => {
    const defaultName = `Character_${Object.keys(cast).length + 1}`;
    setCast(prev => ({
      ...prev,
      [defaultName]: {
        name: defaultName,
        gender: 'neutral',
        language: 'en-US',
        voice: 'Puck',
        dialogueCount: 0,
        sampleLines: [],
      }
    }));
  };

  // Combine / Merge Characters
  const handleExecuteMerge = (sourceName: string, targetName: string) => {
    if (!sourceName || !targetName || sourceName === targetName) return;
    setCast(prev => {
      const source = prev[sourceName];
      const target = prev[targetName];
      if (!source || !target) return prev;

      const combinedSamples = Array.from(new Set([...(target.sampleLines || []), ...(source.sampleLines || [])])).slice(0, 5);
      const combinedCount = (target.dialogueCount || 0) + (source.dialogueCount || 0);

      const next = { ...prev };
      next[targetName] = {
        ...target,
        dialogueCount: combinedCount,
        sampleLines: combinedSamples,
      };
      delete next[sourceName];
      return next;
    });
    setMergingSourceChar(null);
    setMergeTargetChar('');
    setStatusMessage(`Merged "${sourceName}" into "${targetName}".`);
  };

  // Split Character
  const handleExecuteSplit = (sourceName: string, newCharName: string) => {
    const cleanName = newCharName.trim();
    if (!cleanName || cleanName === sourceName) return;
    setCast(prev => {
      const source = prev[sourceName];
      if (!source) return prev;

      const halfCount = Math.max(1, Math.floor((source.dialogueCount || 2) / 2));
      const sourceSamples = source.sampleLines || [];
      const splitSample = sourceSamples.length > 1 ? sourceSamples.slice(1) : sourceSamples;
      const remainingSample = sourceSamples.length > 1 ? [sourceSamples[0]] : sourceSamples;

      const next = { ...prev };
      next[sourceName] = {
        ...source,
        dialogueCount: Math.max(1, (source.dialogueCount || 2) - halfCount),
        sampleLines: remainingSample,
      };
      next[cleanName] = {
        name: cleanName,
        gender: source.gender,
        language: source.language,
        voice: source.voice === 'Fenrir' ? 'Iapetus' : 'Puck',
        dialogueCount: halfCount,
        sampleLines: splitSample,
      };
      return next;
    });
    setSplittingChar(null);
    setSplitNewName('');
    setStatusMessage(`Split "${sourceName}" into new character "${cleanName}".`);
  };

  // Play Sample using Voice & Accent
  const handleAuditionVoice = async (charName: string, voiceName: string, sampleText?: string) => {
    if (auditionAudio) {
      auditionAudio.pause();
      setAuditionAudio(null);
    }
    if (isAuditioning === charName) {
      setIsAuditioning(null);
      return;
    }

    setIsAuditioning(charName);
    const textToSpeak = sampleText || `Hello, my name is ${charName}. I am speaking with Google Gemini neural voice synthesis.`;
    
    try {
      const res = await fetch('/api/tts/synthesize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: textToSpeak,
          voice: voiceName,
          backend: hasGeminiKey ? 'gemini' : 'edge',
        }),
      });
      if (!res.ok) throw new Error('Audition synthesis failed');
      const data = await res.json();
      if (data.audio_base64) {
        const audio = new Audio(data.audio_base64);
        setAuditionAudio(audio);
        audio.onended = () => setIsAuditioning(null);
        audio.play();
      }
    } catch (err) {
      setStatusMessage(`Audition error: ${(err as Error).message}`);
      setIsAuditioning(null);
    }
  };

  const handleExportAudio = async () => {
    if (selectedFiles.length === 0) {
      setStatusMessage('Please select at least one file from the tree to export.');
      return;
    }
    setIsExporting(true);
    setStatusMessage(`Synthesizing and mastering audio across ${selectedFiles.length} file(s)...`);

    try {
      const res = await fetch('/api/tts/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          files: selectedFiles,
          title: exportTitle,
          author: exportAuthor,
          voice: narratorVoice,
          cast,
          pacing: exportPacing,
          speed: exportSpeed,
          backend: hasGeminiKey ? 'gemini' : 'edge',
          format: exportFormat,
        }),
      });

      if (!res.ok) {
        const err = await res.text();
        throw new Error(err);
      }

      const blob = await res.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = `${exportTitle.replace(/[^a-zA-Z0-9_\-]/g, '_')}.${exportFormat}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(downloadUrl);

      setStatusMessage('Export complete! Download started.');
    } catch (err) {
      setStatusMessage(`Export failed: ${(err as Error).message}`);
    } finally {
      setIsExporting(false);
    }
  };

  if (!isOpen) return null;

  const characterList = Object.values(cast);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content audio-studio-modal" onClick={e => e.stopPropagation()}>
        {/* Modal Header */}
        <div className="modal-header">
          <div className="modal-title-with-icon">
            <Layers size={18} className="modal-header-icon" />
            <h2>Audio Studio & Voice Casting</h2>
            {hasGeminiKey && (
              <span className="gemini-tag">Gemini 24kHz HD</span>
            )}
          </div>
          <button className="close-btn" onClick={onClose} title="Close">
            <X size={18} />
          </button>
        </div>

        {/* Tab Header */}
        <div className="settings-tabs">
          <button 
            className={`settings-tab-btn ${activeTab === 'cast' ? 'active' : ''}`}
            onClick={() => setActiveTab('cast')}
          >
            <Users size={14} />
            <span>Character Casting ({characterList.length})</span>
          </button>
          <button 
            className={`settings-tab-btn ${activeTab === 'export' ? 'active' : ''}`}
            onClick={() => setActiveTab('export')}
          >
            <Download size={14} />
            <span>Export Audio ({selectedFiles.length} files)</span>
          </button>
        </div>

        {/* Status Notification Banner */}
        {statusMessage && (
          <div className="studio-notification-banner">
            <span>{statusMessage}</span>
          </div>
        )}

        <div className="modal-body-content">
          {/* Hierarchical Directory & File Tree Selector */}
          <div className="tree-selector-container">
            <div className="tree-selector-header">
              <span className="tree-title">
                Manuscript Tree Selection ({selectedFiles.length} / {files.filter(f => f.endsWith('.md')).length} files)
              </span>
              <div className="tree-actions">
                <button type="button" className="action-link-btn" onClick={handleSelectAllFiles}>Select All</button>
                <span className="divider">|</span>
                <button type="button" className="action-link-btn" onClick={handleClearAllFiles}>Clear</button>
              </div>
            </div>

            <div className="tree-scroll-pane">
              {fileTree.map(node => (
                <StudioTreeItem
                  key={node.path}
                  node={node}
                  selectedFiles={selectedFiles}
                  onToggleFile={handleToggleFile}
                  onToggleDirectory={handleToggleDirectory}
                  expandedDirs={expandedDirs}
                  onToggleExpand={handleToggleExpand}
                  depth={0}
                  activeFile={activeFile}
                />
              ))}
            </div>
          </div>

          {/* TAB 1: Character Voice & Language Casting */}
          {activeTab === 'cast' && (
            <div className="studio-tab-pane">
              <div className="cast-toolbar">
                <div className="form-group-inline">
                  <label>Narrator Voice:</label>
                  <select 
                    value={narratorVoice} 
                    onChange={e => setNarratorVoice(e.target.value)}
                    className="modal-select narrator-select"
                  >
                    {CANONICAL_GEMINI_VOICES.map(v => (
                      <option key={v.name} value={v.name}>
                        {v.name} — {v.desc}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="toolbar-buttons">
                  <button 
                    type="button" 
                    className="btn-secondary"
                    onClick={handleAddCharacter}
                  >
                    <Plus size={14} />
                    <span>Add Character</span>
                  </button>
                  <button 
                    type="button" 
                    className="btn-primary"
                    onClick={handleExtractCharacters}
                    disabled={isExtracting || selectedFiles.length === 0}
                  >
                    {isExtracting ? <Loader2 size={14} className="spin" /> : <Sparkles size={14} />}
                    <span>{isExtracting ? 'Extracting...' : 'Extract From Tree'}</span>
                  </button>
                </div>
              </div>

              {/* Character Cards List */}
              <div className="character-grid-list">
                {characterList.length === 0 ? (
                  <div className="empty-state-card">
                    <Users size={28} className="empty-icon" />
                    <p className="empty-title">No characters extracted yet.</p>
                    <span className="empty-desc">
                      Select chapters in the directory tree above and click <strong>"Extract From Tree"</strong> to auto-detect speakers, or click <strong>"Add Character"</strong>.
                    </span>
                  </div>
                ) : (
                  characterList.map(char => {
                    const isMergingThis = mergingSourceChar === char.name;
                    const isSplittingThis = splittingChar === char.name;

                    return (
                      <div key={char.name} className="character-entry-card">
                        <div className="char-card-header">
                          <input 
                            type="text" 
                            className="char-name-field"
                            value={char.name}
                            onChange={e => handleUpdateCharacter(char.name, { name: e.target.value })}
                          />
                          <div className="char-meta-actions">
                            {char.dialogueCount !== undefined && char.dialogueCount > 0 && (
                              <span className="badge-count">{char.dialogueCount} lines</span>
                            )}
                            
                            {/* Merge / Combine Button */}
                            <button
                              className={`tool-action-btn ${isMergingThis ? 'active' : ''}`}
                              onClick={() => {
                                setMergingSourceChar(isMergingThis ? null : char.name);
                                setSplittingChar(null);
                              }}
                              title="Combine / Merge into another character"
                            >
                              <GitMerge size={13} />
                              <span>Combine</span>
                            </button>

                            {/* Split Button */}
                            <button
                              className={`tool-action-btn ${isSplittingThis ? 'active' : ''}`}
                              onClick={() => {
                                setSplittingChar(isSplittingThis ? null : char.name);
                                setMergingSourceChar(null);
                                setSplitNewName(`${char.name}_2`);
                              }}
                              title="Split character when extraction grouped lines together"
                            >
                              <Scissors size={13} />
                              <span>Split</span>
                            </button>

                            <button 
                              className="icon-btn-delete"
                              onClick={() => handleRemoveCharacter(char.name)}
                              title="Remove character"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </div>

                        {/* Inline Merge Panel */}
                        {isMergingThis && (
                          <div className="inline-action-panel merge-panel">
                            <span className="panel-hint">Merge <strong>"{char.name}"</strong> into:</span>
                            <select 
                              value={mergeTargetChar}
                              onChange={e => setMergeTargetChar(e.target.value)}
                              className="modal-select merge-select"
                            >
                              <option value="">Select target character...</option>
                              {characterList.filter(c => c.name !== char.name).map(c => (
                                <option key={c.name} value={c.name}>{c.name} ({c.dialogueCount || 0} lines)</option>
                              ))}
                            </select>
                            <button 
                              type="button" 
                              className="btn-primary-sm"
                              disabled={!mergeTargetChar}
                              onClick={() => handleExecuteMerge(char.name, mergeTargetChar)}
                            >
                              <Check size={12} />
                              <span>Confirm Merge</span>
                            </button>
                            <button 
                              type="button" 
                              className="btn-secondary-sm"
                              onClick={() => setMergingSourceChar(null)}
                            >
                              Cancel
                            </button>
                          </div>
                        )}

                        {/* Inline Split Panel */}
                        {isSplittingThis && (
                          <div className="inline-action-panel split-panel">
                            <span className="panel-hint">Create new split character from <strong>"{char.name}"</strong>:</span>
                            <input 
                              type="text" 
                              className="modal-input split-input"
                              value={splitNewName}
                              onChange={e => setSplitNewName(e.target.value)}
                              placeholder="New character name..."
                            />
                            <button 
                              type="button" 
                              className="btn-primary-sm"
                              disabled={!splitNewName.trim()}
                              onClick={() => handleExecuteSplit(char.name, splitNewName)}
                            >
                              <Check size={12} />
                              <span>Confirm Split</span>
                            </button>
                            <button 
                              type="button" 
                              className="btn-secondary-sm"
                              onClick={() => setSplittingChar(null)}
                            >
                              Cancel
                            </button>
                          </div>
                        )}

                        <div className="char-card-fields">
                          {/* Gender */}
                          <div className="field-unit">
                            <label>Gender</label>
                            <select 
                              value={char.gender}
                              onChange={e => handleUpdateCharacter(char.name, { gender: e.target.value as any })}
                              className="modal-select"
                            >
                              <option value="male">Male</option>
                              <option value="female">Female</option>
                              <option value="neutral">Neutral</option>
                            </select>
                          </div>

                          {/* Language / Accent */}
                          <div className="field-unit">
                            <label>Language / Accent</label>
                            <select 
                              value={char.language}
                              onChange={e => handleUpdateCharacter(char.name, { language: e.target.value })}
                              className="modal-select"
                            >
                              {LANGUAGE_ACCENTS.map(l => (
                                <option key={l.code} value={l.code}>{l.label}</option>
                              ))}
                            </select>
                          </div>

                          {/* Voice */}
                          <div className="field-unit voice-field">
                            <label>Assigned Voice</label>
                            <select 
                              value={char.voice}
                              onChange={e => handleUpdateCharacter(char.name, { voice: e.target.value })}
                              className="modal-select"
                            >
                              {CANONICAL_GEMINI_VOICES.map(v => (
                                <option key={v.name} value={v.name}>
                                  {v.name} ({v.desc})
                                </option>
                              ))}
                            </select>
                          </div>

                          {/* Audition / Play Sample */}
                          <div className="field-unit audition-field">
                            <label>&nbsp;</label>
                            <button 
                              type="button" 
                              className={`btn-audition ${isAuditioning === char.name ? 'playing' : ''}`}
                              onClick={() => handleAuditionVoice(char.name, char.voice, char.sampleLines?.[0])}
                              title="Play sample line using assigned voice"
                            >
                              {isAuditioning === char.name ? <Square size={12} /> : <Volume2 size={12} />}
                              <span>{isAuditioning === char.name ? 'Stop' : 'Play Sample'}</span>
                            </button>
                          </div>
                        </div>

                        {char.sampleLines && char.sampleLines.length > 0 && (
                          <div 
                            className="char-sample-quote" 
                            title="Click to play this exact sample quote"
                            onClick={() => handleAuditionVoice(char.name, char.voice, char.sampleLines![0])}
                          >
                            <Play size={10} className="quote-play-icon" />
                            <span>"{char.sampleLines[0]}"</span>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>

              {characterList.length > 0 && (
                <div className="pane-footer-save">
                  <button type="button" className="btn-primary" onClick={handleSaveCast}>
                    Save Cast Settings
                  </button>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: Audio Export Master */}
          {activeTab === 'export' && (
            <div className="studio-tab-pane">
              <div className="export-panel-card">
                <h3>Master Audio Export</h3>
                
                <div className="form-grid-two-col">
                  <div className="form-group">
                    <label>Title</label>
                    <input 
                      type="text" 
                      className="modal-input"
                      value={exportTitle}
                      onChange={e => setExportTitle(e.target.value)}
                      placeholder="Audiobook Title"
                    />
                  </div>

                  <div className="form-group">
                    <label>Author / Narrator</label>
                    <input 
                      type="text" 
                      className="modal-input"
                      value={exportAuthor}
                      onChange={e => setExportAuthor(e.target.value)}
                      placeholder="Author Name"
                    />
                  </div>

                  <div className="form-group">
                    <label>Audio Format</label>
                    <div className="format-button-group">
                      <button 
                        type="button" 
                        className={`format-choice-btn ${exportFormat === 'mp3' ? 'active' : ''}`}
                        onClick={() => setExportFormat('mp3')}
                      >
                        MP3 Master (192 kbps)
                      </button>
                      <button 
                        type="button" 
                        className={`format-choice-btn ${exportFormat === 'm4b' ? 'active' : ''}`}
                        onClick={() => setExportFormat('m4b')}
                      >
                        M4B Audiobook (AAC)
                      </button>
                    </div>
                  </div>

                  <div className="form-group">
                    <label>Pacing Profile</label>
                    <select 
                      value={exportPacing}
                      onChange={e => setExportPacing(e.target.value)}
                      className="modal-select"
                    >
                      <option value="normal">Normal (Conversational)</option>
                      <option value="dramatic">Dramatic (Cinematic pauses)</option>
                      <option value="cinematic">Cinematic (Atmospheric pauses)</option>
                      <option value="brisk">Brisk (Fast-paced)</option>
                      <option value="contemplative">Contemplative (Deliberate pauses)</option>
                    </select>
                  </div>

                  <div className="form-group full-width-group">
                    <label>Playback Speed: {exportSpeed}x</label>
                    <input 
                      type="range" 
                      min={0.75} 
                      max={1.75} 
                      step={0.05}
                      value={exportSpeed}
                      onChange={e => setExportSpeed(parseFloat(e.target.value))}
                      className="modal-range-slider"
                    />
                  </div>
                </div>

                <div className="export-status-summary">
                  <div className="summary-stat">
                    <span className="stat-label">Selected Files:</span>
                    <span className="stat-value">{selectedFiles.length} file(s) in tree</span>
                  </div>
                  <div className="summary-stat">
                    <span className="stat-label">Neural Engine:</span>
                    <span className="stat-value">{hasGeminiKey ? 'Google Gemini 24kHz HD' : 'Microsoft Neural EdgeTTS'}</span>
                  </div>
                  <div className="summary-stat">
                    <span className="stat-label">Attributed Cast:</span>
                    <span className="stat-value">{characterList.length} character voice(s)</span>
                  </div>
                </div>

                <div className="export-submit-row">
                  <button 
                    type="button" 
                    className="btn-primary export-main-btn"
                    onClick={handleExportAudio}
                    disabled={isExporting || selectedFiles.length === 0}
                  >
                    {isExporting ? <Loader2 size={15} className="spin" /> : <Download size={15} />}
                    <span>{isExporting ? 'Synthesizing Audio Master...' : `Export & Download ${exportFormat.toUpperCase()}`}</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
