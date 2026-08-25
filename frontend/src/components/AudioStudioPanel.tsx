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
  Play, 
  Search,
  Save,
  Check
} from 'lucide-react';
import { buildFileTree, type FileNode } from '../utils/treeBuilder';

export interface CharacterCast {
  name: string;
  gender: 'male' | 'female' | 'neutral';
  language: string;
  voice: string;
  dialogueCount?: number;
  sampleLines?: string[];
}

export interface AudioStudioPanelProps {
  files: string[];
  activeFile: string | null;
  hasGeminiKey: boolean;
  onClose: () => void;
  onLocateText?: (text: string) => void;
  onSelectFile?: (path: string) => void;
}

export const CANONICAL_GEMINI_VOICES = [
  { name: 'Fenrir', desc: 'Deep, cinematic studio narrator (Male)', gender: 'male', accent: 'en-US' },
  { name: 'Puck', desc: 'Crisp, sarcastic / deadpan (Male - Chris Parnell / Cyril Figgis)', gender: 'male', accent: 'en-US' },
  { name: 'Charon', desc: 'Deep, resonant / theatrical (Male)', gender: 'male', accent: 'en-GB' },
  { name: 'Iapetus', desc: 'Low-register cyberpunk drawl (Male - Keanu Reeves / Silverhand)', gender: 'male', accent: 'en-US' },
  { name: 'Orus', desc: 'Firm, bureaucratic American (Male)', gender: 'male', accent: 'en-US' },
  { name: 'Rasalgethi', desc: 'Dry, raspy, cynical deadpan (Male)', gender: 'male', accent: 'en-US' },
  { name: 'Enceladus', desc: 'Warm, rich, trustworthy (Male)', gender: 'male', accent: 'en-US' },
  { name: 'Umbriel', desc: 'Laid-back, conversational (Male)', gender: 'male', accent: 'en-US' },
  { name: 'Gacrux', desc: 'Gruff, working-class American (Male)', gender: 'male', accent: 'en-US' },
  { name: 'Achird', desc: 'Light, dry, deadpan American (Male)', gender: 'male', accent: 'en-US' },
  { name: 'Callirrhoe', desc: 'Expressive, melodic Asian-English (Female)', gender: 'female', accent: 'en-SG' },
  { name: 'Aoede', desc: 'Warm, lyrical, emotive storytelling (Female)', gender: 'female', accent: 'en-US' },
  { name: 'Leda', desc: 'Razor-sharp, street-smart samurai (Female - Molly Millions)', gender: 'female', accent: 'en-US' },
  { name: 'Kore', desc: 'Cool, confident, focused delivery (Female)', gender: 'female', accent: 'en-US' },
  { name: 'Autonoe', desc: 'Brisk, sharp, analytical (Female)', gender: 'female', accent: 'en-US' },
  { name: 'Despina', desc: 'Gentle, clear, melodic (Female)', gender: 'female', accent: 'en-US' },
  { name: 'Laomedeia', desc: 'Aristocratic, precise British (Female)', gender: 'female', accent: 'en-GB' },
  { name: 'Zephyr', desc: 'Bright, energetic, upbeat (Male/Neutral)', gender: 'neutral', accent: 'en-US' },
];

export const LANGUAGE_ACCENTS = [
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
  onSelectFile?: (path: string) => void;
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
  onSelectFile,
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
          style={{ paddingLeft: `${depth * 12 + 4}px` }}
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
            {isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          </button>
          
          <button 
            type="button" 
            className="tree-checkbox-btn"
            onClick={handleDirCheckboxClick}
            title={isAllSelected ? "Deselect directory" : "Select all in directory"}
          >
            {isAllSelected ? (
              <CheckSquare size={13} className="checkbox-icon checked" />
            ) : isSomeSelected ? (
              <MinusSquare size={13} className="checkbox-icon indeterminate" />
            ) : (
              <Square size={13} className="checkbox-icon" />
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
                onSelectFile={onSelectFile}
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
      style={{ paddingLeft: `${depth * 12 + 20}px` }}
      onClick={() => {
        onToggleFile(node.path);
        onSelectFile?.(node.path);
      }}
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
          <CheckSquare size={13} className="checkbox-icon checked" />
        ) : (
          <Square size={13} className="checkbox-icon" />
        )}
      </button>

      <FileText size={13} className="file-icon" />
      <span className="tree-node-name file-name">{node.name}</span>
      {isActive && <span className="active-tag">Active</span>}
    </div>
  );
};

export const AudioStudioPanel: React.FC<AudioStudioPanelProps> = ({
  files,
  activeFile,
  hasGeminiKey,
  onClose,
  onLocateText,
  onSelectFile
}) => {
  const [activeTab, setActiveTab] = useState<'cast' | 'files' | 'export'>('cast');
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set());
  const [cast, setCast] = useState<Record<string, CharacterCast>>({});
  const [narratorVoice, setNarratorVoice] = useState('Fenrir');
  const [isExtracting, setIsExtracting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isAuditioning, setIsAuditioning] = useState<string | null>(null);
  const [auditionAudio, setAuditionAudio] = useState<HTMLAudioElement | null>(null);
  const [searchFilter, setSearchFilter] = useState('');

  // Combine / Merge & Split state
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
  const [isSavingCast, setIsSavingCast] = useState(false);

  const markdownFiles = useMemo(() => {
    return files.filter(f => f.toLowerCase().endsWith('.md') || f.toLowerCase().endsWith('.markdown'));
  }, [files]);

  const fileTree = useMemo(() => {
    return buildFileTree(markdownFiles);
  }, [markdownFiles]);

  useEffect(() => {
    if (markdownFiles.length > 0) {
      setSelectedFiles(prev => {
        const valid = prev.filter(p => markdownFiles.includes(p));
        if (valid.length > 0) return valid;
        if (activeFile && markdownFiles.includes(activeFile)) return [activeFile];
        return markdownFiles;
      });
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

    return () => {
      if (auditionAudio) {
        auditionAudio.pause();
      }
    };
  }, [activeFile, files, markdownFiles, fileTree]);

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
      setStatusMessage('Please select at least one file from the Files tab.');
      setActiveTab('files');
      return;
    }
    setIsExtracting(true);
    setStatusMessage(`Scanning ${selectedFiles.length} file(s) for character dialogue...`);
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
      setStatusMessage(`Extracted ${data.characters.length} character(s) from ${data.totalFilesScanned} file(s)!`);
      setActiveTab('cast');
    } catch (err) {
      setStatusMessage(`Extraction error: ${(err as Error).message}`);
    } finally {
      setIsExtracting(false);
    }
  };

  const handleSaveCast = async () => {
    setIsSavingCast(true);
    try {
      const res = await fetch('/api/tts/cast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cast }),
      });
      if (res.ok) {
        setStatusMessage('Cast definitions saved successfully.');
        setTimeout(() => setStatusMessage(null), 3000);
      }
    } catch (err) {
      setStatusMessage(`Failed to save cast: ${(err as Error).message}`);
    } finally {
      setIsSavingCast(false);
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

  const handleExecuteMerge = (sourceName: string, targetName: string) => {
    if (!sourceName || !targetName || sourceName === targetName) return;
    setCast(prev => {
      const source = prev[sourceName];
      const target = prev[targetName];
      if (!source || !target) return prev;

      const combinedSamples = Array.from(new Set([...(target.sampleLines || []), ...(source.sampleLines || [])])).slice(0, 6);
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

  const handleAuditionVoice = async (charName: string, voiceName: string, sampleText?: string) => {
    if (auditionAudio) {
      auditionAudio.pause();
      setAuditionAudio(null);
    }
    const auditionKey = `${charName}_${sampleText ? sampleText.slice(0, 15) : 'intro'}`;
    if (isAuditioning === auditionKey) {
      setIsAuditioning(null);
      return;
    }

    setIsAuditioning(auditionKey);
    const textToSpeak = sampleText || `Hello, my name is ${charName}. I am auditioning with Google Gemini neural voice synthesis.`;
    
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
      setStatusMessage('Please select at least one file from the Files tab to export.');
      setActiveTab('files');
      return;
    }
    setIsExporting(true);
    setStatusMessage(`Synthesizing master audio for ${selectedFiles.length} file(s)...`);

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

      setStatusMessage('Export complete! Master audio downloaded.');
    } catch (err) {
      setStatusMessage(`Export failed: ${(err as Error).message}`);
    } finally {
      setIsExporting(false);
    }
  };

  const allCharacters = Object.values(cast);
  const filteredCharacters = useMemo(() => {
    if (!searchFilter.trim()) return allCharacters;
    const q = searchFilter.toLowerCase();
    return allCharacters.filter(c => {
      const matchName = c.name.toLowerCase().includes(q);
      const matchVoice = c.voice.toLowerCase().includes(q);
      const matchSamples = (c.sampleLines || []).some(s => s.toLowerCase().includes(q));
      return matchName || matchVoice || matchSamples;
    });
  }, [allCharacters, searchFilter]);

  return (
    <div className="audio-studio-panel">
      {/* Panel Header */}
      <div className="studio-panel-header">
        <div className="header-left">
          <Layers size={16} className="panel-icon" />
          <span className="panel-title">Audio Studio</span>
          {hasGeminiKey ? (
            <span className="gemini-pill" title="Google Gemini 24kHz Studio HD Engine">HD</span>
          ) : (
            <span className="edge-pill" title="Microsoft Neural EdgeTTS Engine">Edge</span>
          )}
        </div>
        <div className="header-actions">
          <button type="button" className="close-panel-btn" onClick={onClose} title="Close Studio Sidebar">
            <X size={15} />
          </button>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="studio-panel-nav">
        <button 
          className={`nav-tab-btn ${activeTab === 'cast' ? 'active' : ''}`}
          onClick={() => setActiveTab('cast')}
        >
          <Users size={13} />
          <span>Cast ({allCharacters.length})</span>
        </button>
        <button 
          className={`nav-tab-btn ${activeTab === 'files' ? 'active' : ''}`}
          onClick={() => setActiveTab('files')}
        >
          <Folder size={13} />
          <span>Files ({selectedFiles.length})</span>
        </button>
        <button 
          className={`nav-tab-btn ${activeTab === 'export' ? 'active' : ''}`}
          onClick={() => setActiveTab('export')}
        >
          <Download size={13} />
          <span>Export</span>
        </button>
      </div>

      {/* Status Notification */}
      {statusMessage && (
        <div className="studio-status-strip">
          <span>{statusMessage}</span>
          <button type="button" onClick={() => setStatusMessage(null)} className="dismiss-btn">✕</button>
        </div>
      )}

      {/* Body Content */}
      <div className="studio-panel-body">
        {/* TAB 1: CASTING */}
        {activeTab === 'cast' && (
          <div className="cast-tab-view">
            {/* Chapter Scope Bar */}
            <div className="cast-scope-section">
              <div className="scope-header">
                <span className="scope-title">
                  Files in Scope: <strong>{selectedFiles.length}</strong> / {markdownFiles.length}
                </span>
                <div className="scope-actions">
                  <button 
                    type="button" 
                    className="scope-btn"
                    onClick={handleSelectAllFiles}
                    title="Select all markdown files in workspace"
                  >
                    Select All
                  </button>
                  {activeFile && (
                    <button 
                      type="button" 
                      className="scope-btn"
                      onClick={() => setSelectedFiles([activeFile])}
                      title="Select only the active file"
                    >
                      Active Only
                    </button>
                  )}
                  <button 
                    type="button" 
                    className="scope-btn tree-btn"
                    onClick={() => setActiveTab('files')}
                    title="Open full directory tree"
                  >
                    Tree View
                  </button>
                </div>
              </div>
              <div className="scope-chips-list">
                {markdownFiles.length === 0 ? (
                  <span className="no-files-hint">No markdown files found in workspace</span>
                ) : (
                  markdownFiles.map(f => {
                    const isSel = selectedFiles.includes(f);
                    const isAct = f === activeFile;
                    return (
                      <button
                        key={f}
                        type="button"
                        className={`scope-chip ${isSel ? 'selected' : ''} ${isAct ? 'active-file' : ''}`}
                        onClick={() => handleToggleFile(f)}
                        title={isSel ? `Click to exclude ${f}` : `Click to include ${f}`}
                      >
                        {isSel ? <CheckSquare size={11} className="chip-check" /> : <Square size={11} className="chip-check" />}
                        <span className="chip-label">{f.split('/').pop()}</span>
                        {isAct && <span className="chip-tag">Active</span>}
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            {/* Action Bar */}
            <div className="cast-action-bar">
              <div className="narrator-row">
                <span className="lbl">Narrator:</span>
                <select 
                  value={narratorVoice} 
                  onChange={e => setNarratorVoice(e.target.value)}
                  className="narrator-select"
                >
                  {CANONICAL_GEMINI_VOICES.map(v => (
                    <option key={v.name} value={v.name}>
                      {v.name} — {v.desc}
                    </option>
                  ))}
                </select>
              </div>

              <div className="quick-action-btns">
                <button 
                  type="button" 
                  className="quick-btn primary"
                  onClick={handleExtractCharacters}
                  disabled={isExtracting || selectedFiles.length === 0}
                  title="Scan selected files in tree for characters and dialogue"
                >
                  {isExtracting ? <Loader2 size={13} className="spin" /> : <Sparkles size={13} />}
                  <span>{isExtracting ? 'Scanning...' : 'Extract'}</span>
                </button>
                <button 
                  type="button" 
                  className="quick-btn"
                  onClick={handleAddCharacter}
                  title="Add custom character"
                >
                  <Plus size={13} />
                  <span>Add</span>
                </button>
                <button 
                  type="button" 
                  className="quick-btn"
                  onClick={handleSaveCast}
                  disabled={isSavingCast}
                  title="Save character voice assignments"
                >
                  <Save size={13} />
                  <span>Save</span>
                </button>
              </div>

              {/* Dialogue Search / Quick Filter */}
              <div className="dialogue-search-box">
                <Search size={13} className="search-icon" />
                <input 
                  type="text" 
                  placeholder="Filter characters or search dialogue lines..."
                  value={searchFilter}
                  onChange={e => setSearchFilter(e.target.value)}
                  className="search-input"
                />
                {searchFilter && (
                  <button type="button" className="clear-search-btn" onClick={() => setSearchFilter('')}>✕</button>
                )}
              </div>
            </div>

            {/* Character Cards List */}
            <div className="character-cards-scroll">
              {filteredCharacters.length === 0 ? (
                <div className="empty-cast-box">
                  <Users size={24} className="empty-icon" />
                  <p className="empty-title">
                    {allCharacters.length === 0 ? 'No characters extracted yet' : 'No matching characters found'}
                  </p>
                  <p className="empty-sub">
                    {allCharacters.length === 0 ? (
                      <>Select chapter files in the <strong>Files</strong> tab and click <strong>Extract</strong> to auto-detect speakers.</>
                    ) : (
                      'Try clearing the search filter.'
                    )}
                  </p>
                </div>
              ) : (
                filteredCharacters.map(char => {
                  const isMergingThis = mergingSourceChar === char.name;
                  const isSplittingThis = splittingChar === char.name;
                  const otherCharacters = allCharacters.filter(c => c.name !== char.name);

                  return (
                    <div key={char.name} className="char-card">
                      {/* Card Header */}
                      <div className="char-header">
                        <div className="char-name-container">
                          <input 
                            type="text" 
                            className="char-name-input"
                            value={char.name}
                            onChange={e => handleUpdateCharacter(char.name, { name: e.target.value })}
                            title="Edit character name"
                          />
                          {char.dialogueCount !== undefined && (
                            <span className="dialogue-pill" title={`${char.dialogueCount} spoken dialogue lines detected`}>
                              {char.dialogueCount} lines
                            </span>
                          )}
                        </div>

                        <div className="char-header-buttons">
                          <button
                            type="button"
                            className={`tool-pill-btn ${isMergingThis ? 'active' : ''}`}
                            onClick={() => {
                              setMergingSourceChar(isMergingThis ? null : char.name);
                              setSplittingChar(null);
                            }}
                            title="Combine / Merge into another character"
                          >
                            <GitMerge size={12} />
                            <span>Merge</span>
                          </button>

                          <button
                            type="button"
                            className={`tool-pill-btn ${isSplittingThis ? 'active' : ''}`}
                            onClick={() => {
                              setSplittingChar(isSplittingThis ? null : char.name);
                              setMergingSourceChar(null);
                              setSplitNewName(`${char.name}_2`);
                            }}
                            title="Split mistaken lines into separate character"
                          >
                            <Scissors size={12} />
                            <span>Split</span>
                          </button>

                          <button 
                            type="button" 
                            className="delete-char-btn"
                            onClick={() => handleRemoveCharacter(char.name)}
                            title="Remove character"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </div>

                      {/* Merge Sub-Panel */}
                      {isMergingThis && (
                        <div className="inline-action-box merge-box">
                          <div className="box-title">
                            <GitMerge size={12} />
                            <span>Merge "{char.name}" into:</span>
                          </div>
                          <div className="box-inputs">
                            <select 
                              value={mergeTargetChar}
                              onChange={e => setMergeTargetChar(e.target.value)}
                              className="box-select"
                            >
                              <option value="">-- Choose target character --</option>
                              {otherCharacters.map(c => (
                                <option key={c.name} value={c.name}>{c.name} ({c.voice})</option>
                              ))}
                            </select>
                            <button
                              type="button"
                              className="box-confirm-btn"
                              disabled={!mergeTargetChar}
                              onClick={() => handleExecuteMerge(char.name, mergeTargetChar)}
                            >
                              <Check size={12} />
                              <span>Apply Merge</span>
                            </button>
                            <button
                              type="button"
                              className="box-cancel-btn"
                              onClick={() => setMergingSourceChar(null)}
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Split Sub-Panel */}
                      {isSplittingThis && (
                        <div className="inline-action-box split-box">
                          <div className="box-title">
                            <Scissors size={12} />
                            <span>Split "{char.name}" into new character:</span>
                          </div>
                          <div className="box-inputs">
                            <input 
                              type="text" 
                              value={splitNewName}
                              onChange={e => setSplitNewName(e.target.value)}
                              placeholder="New character name"
                              className="box-text-input"
                            />
                            <button
                              type="button"
                              className="box-confirm-btn"
                              disabled={!splitNewName.trim() || splitNewName.trim() === char.name}
                              onClick={() => handleExecuteSplit(char.name, splitNewName)}
                            >
                              <Check size={12} />
                              <span>Apply Split</span>
                            </button>
                            <button
                              type="button"
                              className="box-cancel-btn"
                              onClick={() => setSplittingChar(null)}
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Voice & Accent Controls */}
                      <div className="char-voice-row">
                        <div className="select-col">
                          <span className="sub-lbl">Voice:</span>
                          <select 
                            value={char.voice}
                            onChange={e => handleUpdateCharacter(char.name, { voice: e.target.value })}
                            className="char-select"
                          >
                            {CANONICAL_GEMINI_VOICES.map(v => (
                              <option key={v.name} value={v.name}>
                                {v.name} ({v.desc.split('(')[0].trim()})
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="select-col">
                          <span className="sub-lbl">Accent / Dialect:</span>
                          <select 
                            value={char.language}
                            onChange={e => handleUpdateCharacter(char.name, { language: e.target.value })}
                            className="char-select"
                          >
                            {LANGUAGE_ACCENTS.map(l => (
                              <option key={l.code} value={l.code}>{l.label}</option>
                            ))}
                          </select>
                        </div>
                      </div>

                      {/* Audition Button */}
                      <div className="audition-sample-row">
                        <button 
                          type="button" 
                          className="audition-btn"
                          onClick={() => handleAuditionVoice(char.name, char.voice)}
                          disabled={isAuditioning !== null && isAuditioning !== `${char.name}_intro`}
                        >
                          <Volume2 size={12} className={isAuditioning === `${char.name}_intro` ? 'spin' : ''} />
                          <span>{isAuditioning === `${char.name}_intro` ? 'Auditioning Voice...' : `Audition ${char.voice}`}</span>
                        </button>
                      </div>

                      {/* Dialogue Samples & Manuscript Locator */}
                      {char.sampleLines && char.sampleLines.length > 0 && (
                        <div className="char-quotes-section">
                          <div className="quotes-heading">
                            <span>Spoken Dialogue in Manuscript:</span>
                            <span className="locate-tip">Click quote or locate icon to jump to line</span>
                          </div>
                          <div className="quotes-list">
                            {char.sampleLines.map((line, idx) => {
                              const lineAuditionKey = `${char.name}_${line.slice(0, 15)}`;
                              const isPlayingLine = isAuditioning === lineAuditionKey;

                              return (
                                <div 
                                  key={idx} 
                                  className="quote-entry"
                                  onClick={() => onLocateText?.(line)}
                                  title="Click to locate and highlight this quote in the manuscript"
                                >
                                  <button
                                    type="button"
                                    className="quote-play-btn"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleAuditionVoice(char.name, char.voice, line);
                                    }}
                                    title="Play this line with character's voice"
                                  >
                                    <Play size={10} className={isPlayingLine ? 'active-play' : ''} />
                                  </button>

                                  <span className="quote-text">"{line}"</span>

                                  <button
                                    type="button"
                                    className="quote-locate-btn"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onLocateText?.(line);
                                    }}
                                    title="Find in document"
                                  >
                                    <Search size={11} />
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* TAB 2: FILES & DIRECTORY TREE */}
        {activeTab === 'files' && (
          <div className="files-tab-view">
            <div className="files-tree-toolbar">
              <div className="tree-summary">
                <span>Selected: <strong>{selectedFiles.length}</strong> / {markdownFiles.length} files</span>
              </div>
              <div className="tree-quick-links">
                <button type="button" onClick={handleSelectAllFiles} className="quick-link">Select All</button>
                {activeFile && (
                  <>
                    <span className="sep">•</span>
                    <button type="button" onClick={() => setSelectedFiles([activeFile])} className="quick-link">Active Only</button>
                  </>
                )}
                <span className="sep">•</span>
                <button type="button" onClick={handleClearAllFiles} className="quick-link">Clear</button>
              </div>
            </div>

            <div className="files-tree-pane">
              {fileTree.length === 0 ? (
                <div className="empty-tree-box">
                  <FileText size={24} className="empty-icon" />
                  <p className="empty-title">No markdown files found</p>
                  <p className="empty-sub">Create or select a workspace with .md chapters to begin audio casting.</p>
                </div>
              ) : (
                fileTree.map(node => (
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
                    onSelectFile={onSelectFile}
                  />
                ))
              )}
            </div>

            <div className="files-tab-footer">
              <button 
                type="button" 
                className="scan-tree-btn"
                onClick={handleExtractCharacters}
                disabled={isExtracting || selectedFiles.length === 0}
              >
                {isExtracting ? <Loader2 size={13} className="spin" /> : <Sparkles size={13} />}
                <span>Scan {selectedFiles.length} File(s) for Dialogue</span>
              </button>
            </div>
          </div>
        )}

        {/* TAB 3: EXPORT MASTER */}
        {activeTab === 'export' && (
          <div className="export-tab-view">
            <div className="export-form-card">
              <div className="export-field">
                <label>Audiobook / Master Title</label>
                <input 
                  type="text" 
                  value={exportTitle}
                  onChange={e => setExportTitle(e.target.value)}
                  className="studio-text-input"
                  placeholder="Master Title"
                />
              </div>

              <div className="export-field">
                <label>Author / Narrator Name</label>
                <input 
                  type="text" 
                  value={exportAuthor}
                  onChange={e => setExportAuthor(e.target.value)}
                  className="studio-text-input"
                  placeholder="Author"
                />
              </div>

              <div className="export-field">
                <label>Container Format</label>
                <div className="format-picker">
                  <button 
                    type="button" 
                    className={`format-choice ${exportFormat === 'mp3' ? 'active' : ''}`}
                    onClick={() => setExportFormat('mp3')}
                  >
                    MP3 Master (192 kbps)
                  </button>
                  <button 
                    type="button" 
                    className={`format-choice ${exportFormat === 'm4b' ? 'active' : ''}`}
                    onClick={() => setExportFormat('m4b')}
                  >
                    M4B Audiobook (AAC)
                  </button>
                </div>
              </div>

              <div className="export-field">
                <label>Pacing Profile</label>
                <select 
                  value={exportPacing}
                  onChange={e => setExportPacing(e.target.value)}
                  className="studio-text-input"
                >
                  <option value="normal">Normal (Conversational)</option>
                  <option value="dramatic">Dramatic (Cinematic pauses)</option>
                  <option value="cinematic">Cinematic (Atmospheric pauses)</option>
                  <option value="brisk">Brisk (Fast-paced)</option>
                  <option value="contemplative">Contemplative (Deliberate pauses)</option>
                </select>
              </div>

              <div className="export-field">
                <div className="slider-label-row">
                  <label>Playback Speed Multiplier:</label>
                  <span className="speed-val">{exportSpeed}x</span>
                </div>
                <input 
                  type="range" 
                  min={0.75} 
                  max={2.0} 
                  step={0.05}
                  value={exportSpeed}
                  onChange={e => setExportSpeed(parseFloat(e.target.value))}
                  className="speed-range"
                />
              </div>

              {/* Status Summary */}
              <div className="export-specs-box">
                <div className="spec-row">
                  <span className="spec-label">Files Included:</span>
                  <span className="spec-val">{selectedFiles.length} file(s) in tree</span>
                </div>
                <div className="spec-row">
                  <span className="spec-label">Audio Engine:</span>
                  <span className="spec-val">{hasGeminiKey ? 'Google Gemini 24kHz HD' : 'Microsoft Neural EdgeTTS'}</span>
                </div>
                <div className="spec-row">
                  <span className="spec-label">Attributed Cast:</span>
                  <span className="spec-val">{allCharacters.length} character voice(s)</span>
                </div>
              </div>

              {/* Export Submit */}
              <div className="export-action-row">
                <button 
                  type="button" 
                  className="export-download-btn"
                  onClick={handleExportAudio}
                  disabled={isExporting || selectedFiles.length === 0}
                >
                  {isExporting ? <Loader2 size={14} className="spin" /> : <Download size={14} />}
                  <span>{isExporting ? 'Synthesizing & Mastering...' : `Export & Download ${exportFormat.toUpperCase()}`}</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
