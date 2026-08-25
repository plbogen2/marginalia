import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
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
  Check,
  Wand2
} from 'lucide-react';
import { buildFileTree, type FileNode } from '../utils/treeBuilder';

export interface CharacterCast {
  name: string;
  gender: 'male' | 'female' | 'neutral';
  language: string;
  voice: string;
  dialogueCount?: number;
  sampleLines?: string[];
  description?: string;
  stylePrompt?: string;
  sourceFile?: string;
}

export interface AudioStudioPanelProps {
  files: string[];
  activeFile: string | null;
  hasGeminiKey: boolean;
  onClose: () => void;
  onLocateText?: (text: string, filePath?: string) => void;
  onSelectFile?: (path: string) => void;
}

export const CANONICAL_GEMINI_VOICES = [
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

export const CANONICAL_FEMALE_VOICES = ['Kore', 'Aoede', 'Leda', 'Callirrhoe', 'Autonoe', 'Despina', 'Erinome', 'Laomedeia', 'Pulcherrima', 'Vindemiatrix'];
export const CANONICAL_MALE_VOICES = ['Algenib', 'Charon', 'Fenrir', 'Puck', 'Orus', 'Enceladus', 'Iapetus', 'Umbriel', 'Rasalgethi', 'Alnilam', 'Gacrux', 'Achird', 'Zubenelgenubi', 'Sadaltager'];
export const CANONICAL_NEUTRAL_VOICES = ['Zephyr', 'Algieba', 'Achernar', 'Schedar', 'Sadachbia', 'Sulafat'];

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

          {isExpanded ? <FolderOpen size={15} className="folder-icon open" /> : <Folder size={15} className="folder-icon" />}
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
      style={{ paddingLeft: `${depth * 14 + 22}px` }}
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

interface CharacterCardItemProps {
  char: CharacterCast;
  allCharacters: CharacterCast[];
  isMergingThis: boolean;
  isSplittingThis: boolean;
  mergeTargetChar: string;
  splitNewName: string;
  isAuditioning: string | null;
  onAuditionVoice: (charName: string, voiceName: string, sampleText?: string, stylePrompt?: string) => void;
  onUpdateCharacter: (name: string, updates: Partial<CharacterCast>) => void;
  onRenameCharacter: (oldName: string, newName: string) => void;
  onRemoveCharacter: (name: string) => void;
  onSetMergingSourceChar: (name: string | null) => void;
  onSetMergeTargetChar: (name: string) => void;
  onExecuteMerge: (source: string, target: string) => void;
  onSetSplittingChar: (name: string | null) => void;
  onSetSplitNewName: (name: string) => void;
  onExecuteSplit: (source: string, newName: string) => void;
  onLocateText?: (text: string, filePath?: string) => void;
}

const CharacterCardItem: React.FC<CharacterCardItemProps> = ({
  char,
  allCharacters,
  isMergingThis,
  isSplittingThis,
  mergeTargetChar,
  splitNewName,
  isAuditioning,
  onAuditionVoice,
  onUpdateCharacter,
  onRenameCharacter,
  onRemoveCharacter,
  onSetMergingSourceChar,
  onSetMergeTargetChar,
  onExecuteMerge,
  onSetSplittingChar,
  onSetSplitNewName,
  onExecuteSplit,
  onLocateText,
}) => {
  const [nameDraft, setNameDraft] = useState(char.name);
  const [descDraft, setDescDraft] = useState(char.description || '');
  const [styleDraft, setStyleDraft] = useState(char.stylePrompt || '');
  const [isRefining, setIsRefining] = useState(false);

  useEffect(() => {
    setNameDraft(char.name);
  }, [char.name]);

  useEffect(() => {
    setDescDraft(char.description || '');
  }, [char.description]);

  useEffect(() => {
    setStyleDraft(char.stylePrompt || '');
  }, [char.stylePrompt]);

  const handleCommitName = () => {
    const trimmed = nameDraft.trim();
    if (!trimmed) {
      setNameDraft(char.name);
      return;
    }
    if (trimmed !== char.name) {
      onRenameCharacter(char.name, trimmed);
    }
  };

  const handleCommitDesc = () => {
    const trimmed = descDraft.trim();
    if (trimmed !== (char.description || '')) {
      onUpdateCharacter(char.name, { description: trimmed });
    }
  };

  const handleCommitStyle = () => {
    const trimmed = styleDraft.trim();
    if (trimmed !== (char.stylePrompt || '')) {
      onUpdateCharacter(char.name, { stylePrompt: trimmed });
    }
  };

  const handleAiRefine = async () => {
    setIsRefining(true);
    try {
      const otherVoices = allCharacters.filter(c => c.name !== char.name).map(c => c.voice);
      const res = await fetch('/api/tts/refine-character', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: char.name,
          samples: (char.sampleLines || []).slice(0, 5),
          currentDescription: descDraft,
          currentStylePrompt: styleDraft,
          usedVoices: otherVoices,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.description) {
          setDescDraft(data.description);
          if (data.stylePrompt) setStyleDraft(data.stylePrompt);
          onUpdateCharacter(char.name, {
            description: data.description,
            stylePrompt: data.stylePrompt || styleDraft,
            gender: data.gender || char.gender,
            voice: data.suggestedVoice || char.voice,
          });
        }
      }
    } catch (err) {
      console.warn('AI Refine failed:', err);
    } finally {
      setIsRefining(false);
    }
  };

  const uniqueQuotes = useMemo(() => {
    const lines = char.sampleLines || [];
    return Array.from(new Set(lines.map(l => l.trim()).filter(Boolean)));
  }, [char.sampleLines]);

  const isIntroAuditioning = isAuditioning === `${char.name}_intro`;
  const voiceObj = CANONICAL_GEMINI_VOICES.find(v => v.name === char.voice);

  return (
    <div className="char-card">
      <div className="char-header">
        <div className="char-name-container">
          <input
            type="text"
            className="char-name-input"
            value={nameDraft}
            onChange={e => setNameDraft(e.target.value)}
            onBlur={handleCommitName}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                (e.target as HTMLInputElement).blur();
              } else if (e.key === 'Escape') {
                setNameDraft(char.name);
                (e.target as HTMLInputElement).blur();
              }
            }}
            placeholder="Character Name"
            title="Click to rename character (press Enter or click away to save)"
          />
          {char.dialogueCount !== undefined && char.dialogueCount > 0 && (
            <span className="dialogue-pill" title={`${char.dialogueCount} lines detected`}>
              {char.dialogueCount} {char.dialogueCount === 1 ? 'line' : 'lines'}
            </span>
          )}
          {char.gender && (
            <span className={`gender-tag ${char.gender}`} title={`Gender: ${char.gender}`}>
              {char.gender}
            </span>
          )}
        </div>

        <div className="char-header-buttons">
          <button
            type="button"
            className={`tool-pill-btn ${isMergingThis ? 'active' : ''}`}
            onClick={() => onSetMergingSourceChar(isMergingThis ? null : char.name)}
            title="Merge this character into another"
          >
            <GitMerge size={12} />
            <span>Merge</span>
          </button>
          <button
            type="button"
            className={`tool-pill-btn ${isSplittingThis ? 'active' : ''}`}
            onClick={() => onSetSplittingChar(isSplittingThis ? null : char.name)}
            title="Split character lines into a new character"
          >
            <Scissors size={12} />
            <span>Split</span>
          </button>
          <button
            type="button"
            className="delete-char-btn"
            onClick={() => onRemoveCharacter(char.name)}
            title="Remove character from cast"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {/* Inline Merge Box */}
      {isMergingThis && (
        <div className="inline-action-box">
          <div className="box-title">
            <GitMerge size={13} />
            <span>Merge "{char.name}" into:</span>
          </div>
          <div className="box-inputs">
            <select
              className="box-select"
              value={mergeTargetChar}
              onChange={e => onSetMergeTargetChar(e.target.value)}
            >
              <option value="">-- Select Target Character --</option>
              {allCharacters
                .filter(c => c.name !== char.name)
                .map(c => (
                  <option key={c.name} value={c.name}>
                    {c.name} ({c.voice})
                  </option>
                ))}
            </select>
            <button
              type="button"
              className="box-confirm-btn"
              disabled={!mergeTargetChar}
              onClick={() => onExecuteMerge(char.name, mergeTargetChar)}
            >
              <Check size={12} />
              <span>Confirm</span>
            </button>
            <button
              type="button"
              className="box-cancel-btn"
              onClick={() => {
                onSetMergingSourceChar(null);
                onSetMergeTargetChar('');
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Inline Split Box */}
      {isSplittingThis && (
        <div className="inline-action-box">
          <div className="box-title">
            <Scissors size={13} />
            <span>Split lines from "{char.name}":</span>
          </div>
          <div className="box-inputs">
            <input
              type="text"
              className="box-text-input"
              placeholder="New character name..."
              value={splitNewName}
              onChange={e => onSetSplitNewName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && splitNewName.trim()) {
                  onExecuteSplit(char.name, splitNewName.trim());
                }
              }}
            />
            <button
              type="button"
              className="box-confirm-btn"
              disabled={!splitNewName.trim()}
              onClick={() => onExecuteSplit(char.name, splitNewName.trim())}
            >
              <Check size={12} />
              <span>Create Split</span>
            </button>
            <button
              type="button"
              className="box-cancel-btn"
              onClick={() => {
                onSetSplittingChar(null);
                onSetSplitNewName('');
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Persona & Vocal Acting Direction */}
      <div className="char-persona-section">
        <div className="persona-header">
          <span className="persona-heading">Persona & Acting Direction</span>
          <button
            type="button"
            className="ai-refine-btn"
            onClick={handleAiRefine}
            disabled={isRefining}
            title="Use Gemini to infer character persona and neural acting style from dialogue quotes"
          >
            {isRefining ? <Loader2 size={12} className="spin" /> : <Sparkles size={12} />}
            <span>{isRefining ? 'Refining...' : 'AI Refine'}</span>
          </button>
        </div>
        <div className="persona-field">
          <label className="field-lbl">Persona & Role:</label>
          <input
            type="text"
            className="persona-input"
            value={descDraft}
            onChange={e => setDescDraft(e.target.value)}
            onBlur={handleCommitDesc}
            onKeyDown={e => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            placeholder="e.g. Cynical console cowboy or grumpy street fixer"
          />
        </div>
        <div className="persona-field">
          <label className="field-lbl">Vocal Style & Delivery Prompt:</label>
          <input
            type="text"
            className="persona-input style-prompt-input"
            value={styleDraft}
            onChange={e => setStyleDraft(e.target.value)}
            onBlur={handleCommitStyle}
            onKeyDown={e => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            placeholder="e.g. In an aggressive, thick New York Brooklyn accent, fast-paced:"
          />
        </div>
      </div>

      {/* Voice and Gender selection */}
      <div className="char-voice-row">
        <div className="select-col">
          <div className="col-header-row">
            <span className="sub-lbl">Assigned Voice:</span>
            {voiceObj && <span className="voice-timbre-badge">{voiceObj.desc}</span>}
          </div>
          <select
            className="char-select"
            value={char.voice}
            onChange={e => onUpdateCharacter(char.name, { voice: e.target.value })}
          >
            {CANONICAL_GEMINI_VOICES.map(v => (
              <option key={v.name} value={v.name}>
                {v.name} — {v.desc} ({v.gender})
              </option>
            ))}
          </select>
        </div>

        <div className="select-col">
          <span className="sub-lbl">Accent / Language:</span>
          <select
            className="char-select"
            value={char.language || 'en-US'}
            onChange={e => onUpdateCharacter(char.name, { language: e.target.value })}
          >
            {LANGUAGE_ACCENTS.map(l => (
              <option key={l.code} value={l.code}>
                {l.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Audition Button */}
      <div className="audition-sample-row">
        <button
          type="button"
          className="audition-btn"
          onClick={() => onAuditionVoice(char.name, char.voice, undefined, styleDraft)}
          title="Audition character voice"
        >
          {isIntroAuditioning ? <Loader2 size={13} className="spin" /> : <Play size={13} />}
          <span>{isIntroAuditioning ? 'Playing Sample...' : `Audition ${char.voice} (${voiceObj?.desc || 'Neural'})`}</span>
        </button>
      </div>

      {/* Deduplicated and scrollable quotes section */}
      {uniqueQuotes.length > 0 && (
        <div className="char-quotes-section">
          <div className="quotes-heading">
            <span>Dialogue Lines ({uniqueQuotes.length})</span>
            <span className="locate-tip">Click line to jump in editor</span>
          </div>
          <div className="quotes-list">
            {uniqueQuotes.map((quote, idx) => {
              const isQuoteAuditioning = isAuditioning === `${char.name}_${quote.slice(0, 15)}`;
              return (
                <div
                  key={idx}
                  className="quote-entry"
                  onClick={() => onLocateText?.(quote, char.sourceFile)}
                  title="Click to jump to this quote in editor"
                >
                  <button
                    type="button"
                    className="quote-play-btn"
                    onClick={e => {
                      e.stopPropagation();
                      onAuditionVoice(char.name, char.voice, quote, styleDraft);
                    }}
                    title="Play voice reading this line"
                  >
                    {isQuoteAuditioning ? (
                      <Loader2 size={13} className="spin active-play" />
                    ) : (
                      <Volume2 size={13} />
                    )}
                  </button>
                  <span className="quote-text">"{quote}"</span>
                  <button
                    type="button"
                    className="quote-locate-btn"
                    onClick={e => {
                      e.stopPropagation();
                      onLocateText?.(quote, char.sourceFile);
                    }}
                    title="Locate line in editor"
                  >
                    <Search size={13} />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
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
  const [panelWidth, setPanelWidth] = useState<number>(() => {
    const saved = localStorage.getItem('marginalia_audio_studio_width');
    return saved ? Math.max(360, Math.min(850, parseInt(saved, 10))) : 460;
  });
  const [isResizing, setIsResizing] = useState(false);

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
  const [lastSavedTime, setLastSavedTime] = useState<string | null>(null);

  const isInitialLoad = useRef(true);

  // Resizing logic
  useEffect(() => {
    if (!isResizing) return;
    const handleMouseMove = (e: MouseEvent) => {
      const newWidth = Math.max(360, Math.min(850, window.innerWidth - e.clientX));
      setPanelWidth(newWidth);
    };
    const handleMouseUp = () => {
      setIsResizing(false);
      localStorage.setItem('marginalia_audio_studio_width', String(panelWidth));
    };
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, panelWidth]);

  const markdownFiles = useMemo(() => {
    return files.filter(f => f.toLowerCase().endsWith('.md') || f.toLowerCase().endsWith('.markdown'));
  }, [files]);

  const fileTree = useMemo(() => {
    return buildFileTree(markdownFiles);
  }, [markdownFiles]);

  useEffect(() => {
    loadSavedCast();

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

    return () => {
      if (auditionAudio) {
        auditionAudio.pause();
      }
    };
  }, [fileTree]);

  const loadSavedCast = async () => {
    try {
      const res = await fetch('/api/tts/cast');
      if (res.ok) {
        const data = await res.json();
        if (data.cast && Object.keys(data.cast).length > 0) {
          setCast(data.cast);
        }
        if (Array.isArray(data.selectedFiles) && data.selectedFiles.length > 0) {
          setSelectedFiles(data.selectedFiles);
        } else if (markdownFiles.length > 0) {
          setSelectedFiles(markdownFiles);
        }
        if (data.narratorVoice) setNarratorVoice(data.narratorVoice);
        if (data.exportTitle) setExportTitle(data.exportTitle);
        if (data.exportAuthor) setExportAuthor(data.exportAuthor);
        if (data.exportFormat) setExportFormat(data.exportFormat);
        if (data.exportPacing) setExportPacing(data.exportPacing);
        if (data.exportSpeed) setExportSpeed(data.exportSpeed);
        setLastSavedTime('Loaded from .marginalia/casting.json');
      }
    } catch {
      // ignore
    } finally {
      setTimeout(() => {
        isInitialLoad.current = false;
      }, 500);
    }
  };

  const persistSettings = useCallback(async (currentCast: Record<string, CharacterCast>, currentFiles: string[], narrator: string) => {
    setIsSavingCast(true);
    try {
      const res = await fetch('/api/tts/cast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cast: currentCast,
          selectedFiles: currentFiles,
          narratorVoice: narrator,
          exportTitle,
          exportAuthor,
          exportFormat,
          exportPacing,
          exportSpeed,
        }),
      });
      if (res.ok) {
        const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        setLastSavedTime(`Saved to .marginalia/casting.json (${timeStr})`);
      }
    } catch (err) {
      console.warn('Auto-save cast failed:', err);
    } finally {
      setIsSavingCast(false);
    }
  }, [exportTitle, exportAuthor, exportFormat, exportPacing, exportSpeed]);

  // Debounced auto-save effect
  useEffect(() => {
    if (isInitialLoad.current) return;
    const timer = setTimeout(() => {
      persistSettings(cast, selectedFiles, narratorVoice);
    }, 1000);
    return () => clearTimeout(timer);
  }, [cast, selectedFiles, narratorVoice, exportTitle, exportAuthor, exportFormat, exportPacing, exportSpeed, persistSettings]);

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
    setStatusMessage(`Scanning ${selectedFiles.length} file(s) for speaking characters...`);
    try {
      const res = await fetch('/api/tts/extract-characters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files: selectedFiles, narratorVoice }),
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
            voice: char.suggestedVoice || 'Puck',
            dialogueCount: char.dialogueCount,
            sampleLines: char.sampleLines,
            description: char.description,
            stylePrompt: char.stylePrompt,
            sourceFile: char.sourceFile,
          };
        } else {
          newCast[char.name].dialogueCount = char.dialogueCount;
          newCast[char.name].sampleLines = char.sampleLines;
          if (char.description && !newCast[char.name].description) newCast[char.name].description = char.description;
          if (char.stylePrompt && !newCast[char.name].stylePrompt) newCast[char.name].stylePrompt = char.stylePrompt;
          if (char.sourceFile) newCast[char.name].sourceFile = char.sourceFile;
        }
      }
      setCast(newCast);
      persistSettings(newCast, selectedFiles, narratorVoice);
      setStatusMessage(`Extracted ${data.characters.length} character(s) from ${data.totalFilesScanned} file(s)!`);
      setActiveTab('cast');
    } catch (err) {
      setStatusMessage(`Extraction error: ${(err as Error).message}`);
    } finally {
      setIsExtracting(false);
    }
  };

  const handleAutoAssignVoices = () => {
    const used = new Set<string>([narratorVoice]);
    const updatedCast: Record<string, CharacterCast> = { ...cast };
    const charList = Object.values(updatedCast).sort((a, b) => (b.dialogueCount || 0) - (a.dialogueCount || 0));

    for (const c of charList) {
      const pool = c.gender === 'female' ? CANONICAL_FEMALE_VOICES : (c.gender === 'male' ? CANONICAL_MALE_VOICES : CANONICAL_NEUTRAL_VOICES);
      let voice = pool.find(v => !used.has(v));
      if (!voice) voice = CANONICAL_NEUTRAL_VOICES.find(v => !used.has(v));
      if (!voice) voice = [...CANONICAL_MALE_VOICES, ...CANONICAL_FEMALE_VOICES, ...CANONICAL_NEUTRAL_VOICES].find(v => !used.has(v)) || pool[0];
      updatedCast[c.name] = { ...c, voice };
      used.add(voice);
    }

    setCast(updatedCast);
    persistSettings(updatedCast, selectedFiles, narratorVoice);
    setStatusMessage('Auto-assigned distinct, non-colliding voices across all characters.');
  };

  const handleSaveCast = () => {
    persistSettings(cast, selectedFiles, narratorVoice);
    setStatusMessage('Saved casting configuration to .marginalia/casting.json.');
    setTimeout(() => setStatusMessage(null), 3000);
  };

  const handleUpdateCharacter = (name: string, updates: Partial<CharacterCast>) => {
    setCast(prev => ({
      ...prev,
      [name]: { ...prev[name], ...updates }
    }));
  };

  const handleRenameCharacter = (oldName: string, newName: string) => {
    const trimmed = newName.trim();
    if (!trimmed || trimmed === oldName) return;
    setCast(prev => {
      if (!prev[oldName]) return prev;
      const charData = prev[oldName];
      const next = { ...prev };
      delete next[oldName];
      next[trimmed] = {
        ...charData,
        name: trimmed,
      };
      return next;
    });
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

      const combinedSamples = Array.from(new Set([...(target.sampleLines || []), ...(source.sampleLines || [])]));
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

  const handleAuditionVoice = async (charName: string, voiceName: string, sampleText?: string, stylePrompt?: string) => {
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
    const promptToSend = stylePrompt || cast[charName]?.stylePrompt;
    
    try {
      const res = await fetch('/api/tts/synthesize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: textToSpeak,
          voice: voiceName,
          backend: hasGeminiKey ? 'gemini' : 'edge',
          stylePrompt: promptToSend,
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
    <div 
      className={`audio-studio-panel ${isResizing ? 'resizing' : ''}`}
      style={{ width: `${panelWidth}px` }}
    >
      {/* Draggable Resizer Handle on the Left Border */}
      <div 
        className="audio-studio-resizer" 
        onMouseDown={() => setIsResizing(true)}
        title="Drag to resize Audio Studio panel width"
      />

      {/* Panel Header */}
      <div className="studio-panel-header">
        <div className="header-left">
          <Layers size={18} className="panel-icon" />
          <span className="panel-title">Audio Studio</span>
          {hasGeminiKey ? (
            <span className="gemini-pill" title="Google Gemini 24kHz Studio HD Engine">HD</span>
          ) : (
            <span className="edge-pill" title="Microsoft Neural EdgeTTS Engine">Edge</span>
          )}
        </div>
        <div className="header-actions">
          {lastSavedTime && (
            <span className="save-status-indicator" title={lastSavedTime}>
              <Check size={12} className="saved-icon" />
              <span>Synced</span>
            </span>
          )}
          <button type="button" className="close-panel-btn" onClick={onClose} title="Close Studio Sidebar">
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="studio-panel-nav">
        <button 
          className={`nav-tab-btn ${activeTab === 'cast' ? 'active' : ''}`}
          onClick={() => setActiveTab('cast')}
        >
          <Users size={14} />
          <span>Cast ({allCharacters.length})</span>
        </button>
        <button 
          className={`nav-tab-btn ${activeTab === 'files' ? 'active' : ''}`}
          onClick={() => setActiveTab('files')}
        >
          <Folder size={14} />
          <span>Files ({selectedFiles.length})</span>
        </button>
        <button 
          className={`nav-tab-btn ${activeTab === 'export' ? 'active' : ''}`}
          onClick={() => setActiveTab('export')}
        >
          <Download size={14} />
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
                        {isSel ? <CheckSquare size={13} className="chip-check" /> : <Square size={13} className="chip-check" />}
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
                      {v.name} — {v.desc} ({v.gender})
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
                  {isExtracting ? <Loader2 size={14} className="spin" /> : <Sparkles size={14} />}
                  <span>{isExtracting ? 'Extracting...' : 'Extract Cast'}</span>
                </button>
                <button 
                  type="button" 
                  className="quick-btn"
                  onClick={handleAutoAssignVoices}
                  disabled={allCharacters.length === 0}
                  title="Auto-assign unique, distinct voices across all characters to avoid collisions"
                >
                  <Wand2 size={13} />
                  <span>Auto-Voice</span>
                </button>
                <button 
                  type="button" 
                  className="quick-btn"
                  onClick={handleAddCharacter}
                  title="Add custom character"
                >
                  <Plus size={14} />
                  <span>Add</span>
                </button>
                <button 
                  type="button" 
                  className="quick-btn"
                  onClick={handleSaveCast}
                  disabled={isSavingCast}
                  title="Save character voice assignments"
                >
                  <Save size={14} />
                  <span>Save</span>
                </button>
              </div>

              {/* Dialogue Search / Quick Filter */}
              <div className="dialogue-search-box">
                <Search size={14} className="search-icon" />
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
                  <Users size={28} className="empty-icon" />
                  <p className="empty-title">
                    {allCharacters.length === 0 ? 'No characters extracted yet' : 'No matching characters found'}
                  </p>
                  <p className="empty-sub">
                    {allCharacters.length === 0 ? (
                      <>Select chapter files in the <strong>Files</strong> tab and click <strong>Extract Cast</strong> to auto-detect speakers.</>
                    ) : (
                      'Try clearing the search filter.'
                    )}
                  </p>
                </div>
              ) : (
                filteredCharacters.map(char => (
                  <CharacterCardItem
                    key={char.name}
                    char={char}
                    allCharacters={allCharacters}
                    isMergingThis={mergingSourceChar === char.name}
                    isSplittingThis={splittingChar === char.name}
                    mergeTargetChar={mergeTargetChar}
                    splitNewName={splitNewName}
                    isAuditioning={isAuditioning}
                    onAuditionVoice={handleAuditionVoice}
                    onUpdateCharacter={handleUpdateCharacter}
                    onRenameCharacter={handleRenameCharacter}
                    onRemoveCharacter={handleRemoveCharacter}
                    onSetMergingSourceChar={setMergingSourceChar}
                    onSetMergeTargetChar={setMergeTargetChar}
                    onExecuteMerge={handleExecuteMerge}
                    onSetSplittingChar={setSplittingChar}
                    onSetSplitNewName={setSplitNewName}
                    onExecuteSplit={handleExecuteSplit}
                    onLocateText={onLocateText}
                  />
                ))
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
                  <FileText size={28} className="empty-icon" />
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
                {isExtracting ? <Loader2 size={14} className="spin" /> : <Sparkles size={14} />}
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
                  {isExporting ? <Loader2 size={15} className="spin" /> : <Download size={15} />}
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
