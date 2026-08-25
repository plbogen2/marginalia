import React, { useState, useEffect } from 'react';
import { 
  X, 
  Users, 
  Download, 
  Sparkles, 
  Square, 
  Loader2, 
  CheckSquare, 
  Square as UncheckedSquare,
  Plus,
  Trash2,
  Volume2,
  FileText,
  Layers
} from 'lucide-react';

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
  { name: 'Fenrir', desc: 'Deep, cinematic studio narrator (Male)', gender: 'male', accent: 'en-US' },
  { name: 'Puck', desc: 'Crisp, sarcastic / playful (Male - Chris Parnell / Cyril Figgis)', gender: 'male', accent: 'en-US' },
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

export const AudioStudioModal: React.FC<AudioStudioModalProps> = ({
  isOpen,
  onClose,
  files,
  activeFile,
  hasGeminiKey,
}) => {
  const [activeTab, setActiveTab] = useState<'cast' | 'export'>('cast');
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const [cast, setCast] = useState<Record<string, CharacterCast>>({});
  const [narratorVoice, setNarratorVoice] = useState('Fenrir');
  const [isExtracting, setIsExtracting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isAuditioning, setIsAuditioning] = useState<string | null>(null);
  const [auditionAudio, setAuditionAudio] = useState<HTMLAudioElement | null>(null);
  
  // Export parameters
  const [exportTitle, setExportTitle] = useState('Audiobook Master');
  const [exportAuthor, setExportAuthor] = useState('Marginalia Author');
  const [exportFormat, setExportFormat] = useState<'mp3' | 'm4b'>('mp3');
  const [exportPacing, setExportPacing] = useState('dramatic');
  const [exportSpeed, setExportSpeed] = useState(1.0);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      if (activeFile && files.includes(activeFile)) {
        setSelectedFiles([activeFile]);
      } else {
        setSelectedFiles(files.filter(f => f.endsWith('.md')));
      }
      loadSavedCast();
    }
    return () => {
      if (auditionAudio) {
        auditionAudio.pause();
      }
    };
  }, [isOpen, activeFile, files]);

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

  const handleToggleFile = (path: string) => {
    setSelectedFiles(prev => 
      prev.includes(path) ? prev.filter(f => f !== path) : [...prev, path]
    );
  };

  const handleSelectAllFiles = () => {
    setSelectedFiles(files.filter(f => f.endsWith('.md')));
  };

  const handleClearAllFiles = () => {
    setSelectedFiles([]);
  };

  const handleExtractCharacters = async () => {
    if (selectedFiles.length === 0) {
      setStatusMessage('Please select at least one file to extract characters from.');
      return;
    }
    setIsExtracting(true);
    setStatusMessage(`Scanning ${selectedFiles.length} file(s) for speaking characters...`);
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
      setStatusMessage(`Successfully extracted ${data.characters.length} character(s) across ${data.totalFilesScanned} file(s)!`);
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
        setStatusMessage('Cast settings saved successfully!');
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
    const textToSpeak = sampleText || `Hello, my name is ${charName}. I am speaking with Google Gemini studio neural audio.`;
    
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
      setStatusMessage('Please select at least one file to export.');
      return;
    }
    setIsExporting(true);
    setStatusMessage(`Synthesizing and mastering audio across ${selectedFiles.length} file(s)... This may take 30-60 seconds.`);

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

      setStatusMessage('Export complete! Your master audio file has downloaded.');
    } catch (err) {
      setStatusMessage(`Export failed: ${(err as Error).message}`);
    } finally {
      setIsExporting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content audio-studio-modal" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="modal-header">
          <div className="modal-title-group">
            <Layers size={18} className="modal-icon-cyan" />
            <h2>Audio Studio & Voice Casting</h2>
            {hasGeminiKey && (
              <span className="gemini-hd-badge">✦ Gemini 24kHz Studio HD</span>
            )}
          </div>
          <button className="close-btn" onClick={onClose} title="Close">
            <X size={18} />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="studio-tabs">
          <button 
            className={`studio-tab-btn ${activeTab === 'cast' ? 'active' : ''}`}
            onClick={() => setActiveTab('cast')}
          >
            <Users size={15} />
            <span>Character Casting ({Object.keys(cast).length})</span>
          </button>
          <button 
            className={`studio-tab-btn ${activeTab === 'export' ? 'active' : ''}`}
            onClick={() => setActiveTab('export')}
          >
            <Download size={15} />
            <span>Export Master ({selectedFiles.length} files)</span>
          </button>
        </div>

        {/* Status Notification Banner */}
        {statusMessage && (
          <div className="studio-status-banner">
            <span>{statusMessage}</span>
          </div>
        )}

        <div className="studio-modal-body">
          {/* Top Multi-File Selection Bar */}
          <div className="multi-file-selector-box">
            <div className="selector-header">
              <div className="selector-title">
                <FileText size={14} />
                <span>Selected Manuscript Files ({selectedFiles.length} / {files.filter(f => f.endsWith('.md')).length})</span>
              </div>
              <div className="selector-actions">
                <button type="button" className="text-btn" onClick={handleSelectAllFiles}>Select All</button>
                <span className="divider">|</span>
                <button type="button" className="text-btn" onClick={handleClearAllFiles}>Clear</button>
              </div>
            </div>

            <div className="files-chip-grid">
              {files.filter(f => f.endsWith('.md')).map(f => {
                const isSelected = selectedFiles.includes(f);
                return (
                  <div 
                    key={f} 
                    className={`file-chip ${isSelected ? 'selected' : ''}`}
                    onClick={() => handleToggleFile(f)}
                  >
                    {isSelected ? <CheckSquare size={13} className="chip-icon check" /> : <UncheckedSquare size={13} className="chip-icon" />}
                    <span className="chip-label">{f}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* TAB 1: Character Voice & Language Casting */}
          {activeTab === 'cast' && (
            <div className="cast-tab-content">
              <div className="cast-action-bar">
                <div className="narrator-select-group">
                  <label>Primary Narrator Voice:</label>
                  <select 
                    value={narratorVoice} 
                    onChange={e => setNarratorVoice(e.target.value)}
                    className="studio-select"
                  >
                    {CANONICAL_GEMINI_VOICES.map(v => (
                      <option key={v.name} value={v.name}>
                        {v.name} — {v.desc}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="cast-btn-group">
                  <button 
                    type="button" 
                    className="studio-btn secondary"
                    onClick={handleAddCharacter}
                  >
                    <Plus size={14} />
                    <span>Add Character</span>
                  </button>
                  <button 
                    type="button" 
                    className="studio-btn primary"
                    onClick={handleExtractCharacters}
                    disabled={isExtracting || selectedFiles.length === 0}
                  >
                    {isExtracting ? <Loader2 size={14} className="spin" /> : <Sparkles size={14} />}
                    <span>{isExtracting ? 'Scanning...' : 'Extract From Selected Files'}</span>
                  </button>
                </div>
              </div>

              {/* Character List Grid */}
              <div className="character-cards-container">
                {Object.keys(cast).length === 0 ? (
                  <div className="empty-cast-notice">
                    <Users size={32} />
                    <p>No characters extracted yet.</p>
                    <span>Click <strong>"Extract From Selected Files"</strong> to automatically detect speakers across your selected chapters, or click <strong>"Add Character"</strong> to define custom casting.</span>
                  </div>
                ) : (
                  Object.values(cast).map(char => (
                    <div key={char.name} className="character-cast-card">
                      <div className="card-top-row">
                        <input 
                          type="text" 
                          className="char-name-input"
                          value={char.name}
                          onChange={e => handleUpdateCharacter(char.name, { name: e.target.value })}
                        />
                        <div className="card-badges">
                          {char.dialogueCount !== undefined && char.dialogueCount > 0 && (
                            <span className="line-count-badge">{char.dialogueCount} dialogue lines</span>
                          )}
                          <button 
                            className="remove-char-btn"
                            onClick={() => handleRemoveCharacter(char.name)}
                            title="Remove Character"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>

                      <div className="card-controls-row">
                        {/* Gender */}
                        <div className="control-group">
                          <label>Gender</label>
                          <select 
                            value={char.gender}
                            onChange={e => handleUpdateCharacter(char.name, { gender: e.target.value as any })}
                            className="studio-select"
                          >
                            <option value="male">Male</option>
                            <option value="female">Female</option>
                            <option value="neutral">Neutral</option>
                          </select>
                        </div>

                        {/* Language / Accent */}
                        <div className="control-group">
                          <label>Language / Accent</label>
                          <select 
                            value={char.language}
                            onChange={e => handleUpdateCharacter(char.name, { language: e.target.value })}
                            className="studio-select"
                          >
                            {LANGUAGE_ACCENTS.map(l => (
                              <option key={l.code} value={l.code}>{l.label}</option>
                            ))}
                          </select>
                        </div>

                        {/* Voice */}
                        <div className="control-group voice-group">
                          <label>Assigned Voice</label>
                          <select 
                            value={char.voice}
                            onChange={e => handleUpdateCharacter(char.name, { voice: e.target.value })}
                            className="studio-select"
                          >
                            {CANONICAL_GEMINI_VOICES.map(v => (
                              <option key={v.name} value={v.name}>
                                {v.name} ({v.desc})
                              </option>
                            ))}
                          </select>
                        </div>

                        {/* Audition Button */}
                        <div className="control-group audition-group">
                          <label>&nbsp;</label>
                          <button 
                            type="button" 
                            className={`audition-btn ${isAuditioning === char.name ? 'active' : ''}`}
                            onClick={() => handleAuditionVoice(char.name, char.voice, char.sampleLines?.[0])}
                            title="Audition Sample Voice"
                          >
                            {isAuditioning === char.name ? <Square size={13} /> : <Volume2 size={13} />}
                            <span>{isAuditioning === char.name ? 'Stop' : 'Audition'}</span>
                          </button>
                        </div>
                      </div>

                      {/* Sample line preview */}
                      {char.sampleLines && char.sampleLines.length > 0 && (
                        <div className="sample-dialogue-snippet" title={char.sampleLines[0]}>
                          "{char.sampleLines[0]}"
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>

              {Object.keys(cast).length > 0 && (
                <div className="cast-footer-save">
                  <button type="button" className="studio-btn primary" onClick={handleSaveCast}>
                    Save Cast & Apply to Document
                  </button>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: Audio Export Master */}
          {activeTab === 'export' && (
            <div className="export-tab-content">
              <div className="export-settings-card">
                <h3>Master Export Configuration</h3>
                
                <div className="export-form-grid">
                  <div className="form-field">
                    <label>Audiobook / Master Title</label>
                    <input 
                      type="text" 
                      className="studio-input"
                      value={exportTitle}
                      onChange={e => setExportTitle(e.target.value)}
                      placeholder="e.g. Neuromancer - Chapters 1 & 2"
                    />
                  </div>

                  <div className="form-field">
                    <label>Author / Artist</label>
                    <input 
                      type="text" 
                      className="studio-input"
                      value={exportAuthor}
                      onChange={e => setExportAuthor(e.target.value)}
                      placeholder="e.g. William Gibson"
                    />
                  </div>

                  <div className="form-field">
                    <label>Container Format</label>
                    <div className="format-toggle-group">
                      <button 
                        type="button" 
                        className={`toggle-btn ${exportFormat === 'mp3' ? 'active' : ''}`}
                        onClick={() => setExportFormat('mp3')}
                      >
                        MP3 Master (192 kbps)
                      </button>
                      <button 
                        type="button" 
                        className={`toggle-btn ${exportFormat === 'm4b' ? 'active' : ''}`}
                        onClick={() => setExportFormat('m4b')}
                      >
                        M4B Audiobook (AAC / Chaptered)
                      </button>
                    </div>
                  </div>

                  <div className="form-field">
                    <label>Pacing Profile Preset</label>
                    <select 
                      value={exportPacing}
                      onChange={e => setExportPacing(e.target.value)}
                      className="studio-select"
                    >
                      <option value="normal">Normal (Natural conversational pacing)</option>
                      <option value="dramatic">Dramatic (Deep cinematic pauses & rich delivery)</option>
                      <option value="cinematic">Cinematic (Atmospheric sci-fi / noir pauses)</option>
                      <option value="brisk">Brisk (Fast-paced narration for non-fiction)</option>
                      <option value="contemplative">Contemplative (Meditative, deliberate pauses)</option>
                    </select>
                  </div>

                  <div className="form-field full-width">
                    <label>Playback Speed Multiplier: {exportSpeed}x</label>
                    <input 
                      type="range" 
                      min={0.75} 
                      max={1.75} 
                      step={0.05}
                      value={exportSpeed}
                      onChange={e => setExportSpeed(parseFloat(e.target.value))}
                      className="speed-slider"
                    />
                  </div>
                </div>

                <div className="export-summary-box">
                  <div className="summary-item">
                    <span className="lbl">Files Included:</span>
                    <span className="val">{selectedFiles.length} chapter file(s)</span>
                  </div>
                  <div className="summary-item">
                    <span className="lbl">Engine:</span>
                    <span className="val">{hasGeminiKey ? 'Google Gemini 24kHz Studio HD' : 'Microsoft Neural EdgeTTS'}</span>
                  </div>
                  <div className="summary-item">
                    <span className="lbl">Attributed Cast:</span>
                    <span className="val">{Object.keys(cast).length} distinct character voice(s)</span>
                  </div>
                </div>

                <div className="export-action-row">
                  <button 
                    type="button" 
                    className="studio-btn primary large-btn"
                    onClick={handleExportAudio}
                    disabled={isExporting || selectedFiles.length === 0}
                  >
                    {isExporting ? <Loader2 size={16} className="spin" /> : <Download size={16} />}
                    <span>{isExporting ? 'Synthesizing & Mastering...' : `Export & Download ${exportFormat.toUpperCase()}`}</span>
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
