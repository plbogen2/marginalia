import React, { useState, useEffect } from 'react';
import { X, Eye, EyeOff, Check, AlertCircle, Volume2, Activity, BookA, BookOpen, Plus, Sparkles, Search, RefreshCw, Loader2, FileText } from 'lucide-react';

interface SettingsModalProps {
  onClose: () => void;
  onSave: () => void;
  onOpenAbout?: () => void;
  onOpenAdmin?: () => void;
  isAdmin?: boolean;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ onClose, onSave, onOpenAbout, onOpenAdmin, isAdmin }) => {
  const [geminiKey, setGeminiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [isConfigured, setIsConfigured] = useState<boolean | null>(null);
  const [simulateHosted, setSimulateHosted] = useState(false);
  const [initialSimulateHosted, setInitialSimulateHosted] = useState(false);

  const [geminiModel, setGeminiModel] = useState('');
  const [initialGeminiModel, setInitialGeminiModel] = useState('');
  const [availableModels, setAvailableModels] = useState<{ name: string, displayName: string }[]>([]);

  const [githubClientId, setGithubClientId] = useState('');
  const [initialGithubClientId, setInitialGithubClientId] = useState('');
  const [githubClientSecret, setGithubClientSecret] = useState('');
  const [hasGithubSecret, setHasGithubSecret] = useState<boolean | null>(null);
  const [showSecret, setShowSecret] = useState(false);
  
  const [allowedUser, setAllowedUser] = useState('');
  const [initialAllowedUser, setInitialAllowedUser] = useState('');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // TTS Engine & Settings
  const [ttsEngine, setTtsEngine] = useState<'parlando' | 'browser'>(() => {
    return (localStorage.getItem('marginalia_tts_engine') as 'parlando' | 'browser') || 'parlando';
  });
  const [parlandoVoice, setParlandoVoice] = useState<string>(() => {
    return localStorage.getItem('marginalia_parlando_voice') || 'Fenrir';
  });
  const [parlandoDialogueMode, setParlandoDialogueMode] = useState<'auto' | 'single'>(() => {
    return (localStorage.getItem('marginalia_parlando_dialogue_mode') as 'auto' | 'single') || 'auto';
  });
  const [parlandoDialogueVoice, setParlandoDialogueVoice] = useState<string>(() => {
    return localStorage.getItem('marginalia_parlando_dialogue_voice') || '';
  });
  const [parlandoPacing, setParlandoPacing] = useState<string>(() => {
    return localStorage.getItem('marginalia_parlando_pacing') || 'normal';
  });
  const [parlandoSpeed, setParlandoSpeed] = useState<string>(() => {
    return localStorage.getItem('marginalia_parlando_speed') || '1.0';
  });

  const [ttsVoices, setTtsVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedTtsVoice, setSelectedTtsVoice] = useState<string>(() => {
    return localStorage.getItem('marginalia_tts_voice_uri') || '';
  });

  useEffect(() => {
    if (!('speechSynthesis' in window)) return;
    const loadVoices = () => {
      const voices = window.speechSynthesis.getVoices();
      setTtsVoices(voices);
    };
    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
  }, []);

  const fetchConfigStatus = async () => {
    try {
      const res = await fetch('/api/config');
      const data = await res.json();
      setIsConfigured(data.hasGemini);
      setSimulateHosted(!!data.simulateHostedMode);
      setInitialSimulateHosted(!!data.simulateHostedMode);

      setGithubClientId(data.githubClientId || '');
      setInitialGithubClientId(data.githubClientId || '');
      setHasGithubSecret(!!data.hasGithubSecret);
      setAllowedUser(data.allowedUser || '');
      setInitialAllowedUser(data.allowedUser || '');

      setGeminiModel(data.geminiModel || 'gemini-1.5-flash');
      setInitialGeminiModel(data.geminiModel || 'gemini-1.5-flash');

      try {
        const modelsRes = await fetch('/api/gemini/models');
        if (modelsRes.ok) {
          const modelsData = await modelsRes.json();
          setAvailableModels(modelsData);
        }
      } catch (e) {
        console.warn('Failed to load models list', e);
      }
    } catch (err) {
      console.error('Failed to load configuration status:', err);
    }
  };

  // Dictionary Management State
  const [dictScope, setDictScope] = useState<'workspace' | 'global'>('workspace');
  const [workspaceWords, setWorkspaceWords] = useState<string[]>([]);
  const [globalWords, setGlobalWords] = useState<string[]>([]);
  const [newWordsInput, setNewWordsInput] = useState('');
  const [dictFilter, setDictFilter] = useState('');
  const [loadingDict, setLoadingDict] = useState(false);
  const [scanningLore, setScanningLore] = useState(false);
  const [scannedCandidates, setScannedCandidates] = useState<string[]>([]);
  const [selectedCandidates, setSelectedCandidates] = useState<Set<string>>(new Set());
  const [dictMsg, setDictMsg] = useState<{ text: string, type: 'success' | 'error' } | null>(null);

  const fetchDictionary = async () => {
    setLoadingDict(true);
    try {
      const res = await fetch('/api/dictionary');
      if (res.ok) {
        const data = await res.json();
        setWorkspaceWords(data.workspace || []);
        setGlobalWords(data.global || []);
      }
    } catch (err) {
      console.error('Failed to load dictionary:', err);
    } finally {
      setLoadingDict(false);
    }
  };

  // Glossary Management State
  const [glossaryConfig, setGlossaryConfig] = useState<{
    paths: string[];
    autoDetect: boolean;
    enableSpellcheck: boolean;
    enableAutocomplete: boolean;
  }>({
    paths: [],
    autoDetect: true,
    enableSpellcheck: true,
    enableAutocomplete: true
  });
  const [glossaryTerms, setGlossaryTerms] = useState<{
    term: string;
    definition?: string;
    category?: string;
    file: string;
  }[]>([]);
  const [glossaryRepoSlug, setGlossaryRepoSlug] = useState<string>('');
  const [glossaryResolvedFiles, setGlossaryResolvedFiles] = useState<string[]>([]);
  const [glossaryAvailableFiles, setGlossaryAvailableFiles] = useState<string[]>([]);
  const [loadingGlossary, setLoadingGlossary] = useState(false);
  const [glossaryFilter, setGlossaryFilter] = useState('');
  const [newGlossaryPath, setNewGlossaryPath] = useState('');
  const [glossaryMsg, setGlossaryMsg] = useState<{ text: string, type: 'success' | 'error' } | null>(null);

  const fetchGlossary = async () => {
    setLoadingGlossary(true);
    try {
      const res = await fetch('/api/glossary');
      if (res.ok) {
        const data = await res.json();
        setGlossaryConfig(data.config || {
          paths: [],
          autoDetect: true,
          enableSpellcheck: true,
          enableAutocomplete: true
        });
        setGlossaryRepoSlug(data.repoSlug || '');
        setGlossaryTerms(data.terms || []);
        setGlossaryResolvedFiles(data.resolvedFiles || []);
        setGlossaryAvailableFiles(data.availableFiles || []);
      }
    } catch (err) {
      console.error('Failed to load glossary:', err);
    } finally {
      setLoadingGlossary(false);
    }
  };

  const handleSaveGlossaryConfig = async (updated: Partial<typeof glossaryConfig>) => {
    setLoadingGlossary(true);
    setGlossaryMsg(null);
    try {
      const res = await fetch('/api/glossary/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated)
      });
      if (res.ok) {
        const data = await res.json();
        setGlossaryConfig(data.config);
        setGlossaryRepoSlug(data.repoSlug || '');
        setGlossaryTerms(data.terms || []);
        setGlossaryResolvedFiles(data.resolvedFiles || []);
        setGlossaryAvailableFiles(data.availableFiles || []);
        setGlossaryMsg({ text: `Glossary updated: ${data.terms?.length || 0} terms loaded`, type: 'success' });
      } else {
        const errData = await res.json();
        setGlossaryMsg({ text: errData.error || 'Failed to update glossary', type: 'error' });
      }
    } catch (err) {
      setGlossaryMsg({ text: (err as Error).message, type: 'error' });
    } finally {
      setLoadingGlossary(false);
    }
  };

  const handleAddGlossaryPath = async (pathToAdd: string) => {
    const trimmed = pathToAdd.trim();
    if (!trimmed) return;
    if (glossaryConfig.paths.includes(trimmed)) return;
    const updatedPaths = [...glossaryConfig.paths, trimmed];
    await handleSaveGlossaryConfig({ paths: updatedPaths });
    setNewGlossaryPath('');
  };

  const handleRemoveGlossaryPath = async (pathToRemove: string) => {
    const updatedPaths = glossaryConfig.paths.filter(p => p !== pathToRemove);
    await handleSaveGlossaryConfig({ paths: updatedPaths });
  };

  useEffect(() => {
    fetchConfigStatus();
    fetchDictionary();
    fetchGlossary();
  }, []);

  const handleAddWords = async () => {
    if (!newWordsInput.trim()) return;
    const rawList = newWordsInput.split(/[\n,;]+/).map(w => w.trim()).filter(Boolean);
    if (rawList.length === 0) return;

    try {
      const res = await fetch('/api/dictionary/bulk-add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ words: rawList, scope: dictScope })
      });
      if (res.ok) {
        const data = await res.json();
        setNewWordsInput('');
        setDictMsg({ text: `Added ${data.addedCount} word(s) to ${dictScope} dictionary.`, type: 'success' });
        setTimeout(() => setDictMsg(null), 4000);
        await fetchDictionary();
      }
    } catch (e: any) {
      setDictMsg({ text: e.message || 'Failed to add words.', type: 'error' });
    }
  };

  const handleRemoveWord = async (word: string) => {
    try {
      const res = await fetch('/api/dictionary/remove', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ word, scope: dictScope })
      });
      if (res.ok) {
        await fetchDictionary();
      }
    } catch (e) {
      console.error('Failed to remove word:', e);
    }
  };

  const handleScanLore = async () => {
    setScanningLore(true);
    setDictMsg(null);
    try {
      const res = await fetch('/api/dictionary/scan-lore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ autoAdd: false })
      });
      if (res.ok) {
        const data = await res.json();
        const existing = new Set([...workspaceWords, ...globalWords].map(w => w.toLowerCase()));
        const unadded = (data.words || []).filter((w: string) => !existing.has(w.toLowerCase()));
        setScannedCandidates(unadded);
        setSelectedCandidates(new Set(unadded));
        if (unadded.length === 0) {
          setDictMsg({ text: 'All discovered in-world terms are already in your dictionary!', type: 'success' });
          setTimeout(() => setDictMsg(null), 4000);
        }
      }
    } catch (e: any) {
      setDictMsg({ text: e.message || 'Failed to scan workspace.', type: 'error' });
    } finally {
      setScanningLore(false);
    }
  };

  const handleImportCandidates = async () => {
    const list = Array.from(selectedCandidates);
    if (list.length === 0) return;

    try {
      const res = await fetch('/api/dictionary/bulk-add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ words: list, scope: dictScope })
      });
      if (res.ok) {
        const data = await res.json();
        setDictMsg({ text: `Imported ${data.addedCount} in-world terms to ${dictScope} dictionary!`, type: 'success' });
        setTimeout(() => setDictMsg(null), 4000);
        setScannedCandidates([]);
        setSelectedCandidates(new Set());
        await fetchDictionary();
      }
    } catch (e: any) {
      setDictMsg({ text: e.message || 'Failed to import words.', type: 'error' });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Save TTS Preferences
    localStorage.setItem('marginalia_tts_engine', ttsEngine);
    localStorage.setItem('marginalia_parlando_voice', parlandoVoice);
    localStorage.setItem('marginalia_parlando_dialogue_mode', parlandoDialogueMode);
    localStorage.setItem('marginalia_parlando_dialogue_voice', parlandoDialogueVoice);
    localStorage.setItem('marginalia_parlando_pacing', parlandoPacing);
    localStorage.setItem('marginalia_parlando_speed', parlandoSpeed);
    localStorage.setItem('marginalia_tts_voice_uri', selectedTtsVoice);

    setSaving(true);
    setError(null);
    try {
      const payload: { 
        geminiApiKey?: string;
        simulateHostedMode?: boolean;
        githubClientId?: string;
        githubClientSecret?: string;
        allowedUser?: string;
        geminiModel?: string;
      } = {};
      
      if (geminiKey.trim()) {
        payload.geminiApiKey = geminiKey.trim();
      }
      if (simulateHosted !== initialSimulateHosted) {
        payload.simulateHostedMode = simulateHosted;
      }
      if (githubClientId !== initialGithubClientId) {
        payload.githubClientId = githubClientId.trim();
      }
      if (githubClientSecret.trim()) {
        payload.githubClientSecret = githubClientSecret.trim();
      }
      if (allowedUser !== initialAllowedUser) {
        payload.allowedUser = allowedUser.trim();
      }
      if (geminiModel !== initialGeminiModel) {
        payload.geminiModel = geminiModel;
      }

      if (Object.keys(payload).length > 0) {
        const res = await fetch('/api/config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || 'Failed to save configuration');
        }
      }

      onSave();
      onClose();
    } catch (err: any) {
      setError(err.message || 'An error occurred while saving.');
    } finally {
      setSaving(false);
    }
  };

  const isDirty = 
    geminiKey.trim().length > 0 ||
    simulateHosted !== initialSimulateHosted ||
    githubClientId !== initialGithubClientId ||
    githubClientSecret.trim().length > 0 ||
    allowedUser !== initialAllowedUser ||
    geminiModel !== initialGeminiModel ||
    ttsEngine !== (localStorage.getItem('marginalia_tts_engine') || 'parlando') ||
    parlandoVoice !== (localStorage.getItem('marginalia_parlando_voice') || 'Fenrir') ||
    parlandoDialogueMode !== (localStorage.getItem('marginalia_parlando_dialogue_mode') || 'auto') ||
    parlandoDialogueVoice !== (localStorage.getItem('marginalia_parlando_dialogue_voice') || '') ||
    parlandoPacing !== (localStorage.getItem('marginalia_parlando_pacing') || 'normal') ||
    parlandoSpeed !== (localStorage.getItem('marginalia_parlando_speed') || '1.0') ||
    selectedTtsVoice !== (localStorage.getItem('marginalia_tts_voice_uri') || '');

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content settings-modal" style={{ maxWidth: '640px' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Application Settings</h2>
          <button className="btn-close" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            
            {/* Gemini API Key */}
            <div className="form-group">
              <label htmlFor="geminiKey">Gemini API Key</label>
              <div className="input-with-button">
                <input
                  id="geminiKey"
                  type={showKey ? 'text' : 'password'}
                  placeholder={isConfigured ? "••••••••••••••••" : "Enter Google Gemini API Key"}
                  value={geminiKey}
                  onChange={(e) => setGeminiKey(e.target.value)}
                />
                <button
                  type="button"
                  className="input-icon-btn"
                  onClick={() => setShowKey(!showKey)}
                  title={showKey ? 'Hide key' : 'Show key'}
                >
                  {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              <p className="help-text">
                Required for AI-assisted structural editing, inline line-editing feedback, and semantic expansions.
              </p>
            </div>

            {/* Model Selection */}
            <div className="form-group">
              <label htmlFor="geminiModel">AI Feedback Model</label>
              <select
                id="geminiModel"
                value={geminiModel}
                onChange={(e) => setGeminiModel(e.target.value)}
              >
                {availableModels.map((model) => (
                  <option key={model.name} value={model.name}>
                    {model.displayName}
                  </option>
                ))}
              </select>
              <p className="help-text">
                Select the Google Gemini model to use for generating suggestions.
              </p>
            </div>

            {/* TTS Engine & Voice Configuration */}
            <div className="form-group" style={{ borderTop: '1px solid var(--border-color)', paddingTop: '16px', marginTop: '16px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600 }}>
                <Volume2 size={16} /> Read Aloud & Audiobook Voice (TTS)
              </label>

              <div style={{ display: 'flex', gap: '12px', marginTop: '8px', marginBottom: '12px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '0.9rem' }}>
                  <input
                    type="radio"
                    name="tts_engine"
                    value="parlando"
                    checked={ttsEngine === 'parlando'}
                    onChange={() => setTtsEngine('parlando')}
                  />
                  <span>🎭 <strong>Parlando</strong> (Neural Speech Studio)</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '0.9rem' }}>
                  <input
                    type="radio"
                    name="tts_engine"
                    value="browser"
                    checked={ttsEngine === 'browser'}
                    onChange={() => setTtsEngine('browser')}
                  />
                  <span>🌐 <strong>Browser Voice</strong> (Local / Fast)</span>
                </label>
              </div>

              {ttsEngine === 'parlando' ? (
                <div style={{ background: 'var(--bg-secondary)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '8px' }}>
                    <div>
                      <label htmlFor="parlandoVoice" style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Primary Narrator Voice</label>
                      <select
                        id="parlandoVoice"
                        value={parlandoVoice}
                        onChange={(e) => setParlandoVoice(e.target.value)}
                        style={{ marginTop: '4px' }}
                      >
                        <optgroup label="Google Gemini Neural Voices (30 HD Studio Voices)">
                          <option value="Puck">Puck (Upbeat)</option>
                          <option value="Charon">Charon (Informative)</option>
                          <option value="Kore">Kore (Firm)</option>
                          <option value="Fenrir">Fenrir (Excitable)</option>
                          <option value="Aoede">Aoede (Breezy)</option>
                          <option value="Leda">Leda (Youthful)</option>
                          <option value="Orus">Orus (Firm)</option>
                          <option value="Zephyr">Zephyr (Bright)</option>
                          <option value="Callirrhoe">Callirrhoe (Easy-going)</option>
                          <option value="Autonoe">Autonoe (Bright)</option>
                          <option value="Enceladus">Enceladus (Breathy)</option>
                          <option value="Iapetus">Iapetus (Clear)</option>
                          <option value="Umbriel">Umbriel (Easy-going)</option>
                          <option value="Algieba">Algieba (Smooth)</option>
                          <option value="Despina">Despina (Smooth)</option>
                          <option value="Erinome">Erinome (Clear)</option>
                          <option value="Algenib">Algenib (Gravelly)</option>
                          <option value="Rasalgethi">Rasalgethi (Informative)</option>
                          <option value="Laomedeia">Laomedeia (Upbeat)</option>
                          <option value="Achernar">Achernar (Soft)</option>
                          <option value="Alnilam">Alnilam (Firm)</option>
                          <option value="Schedar">Schedar (Even)</option>
                          <option value="Gacrux">Gacrux (Mature)</option>
                          <option value="Pulcherrima">Pulcherrima (Forward)</option>
                          <option value="Achird">Achird (Friendly)</option>
                          <option value="Zubenelgenubi">Zubenelgenubi (Casual)</option>
                          <option value="Vindemiatrix">Vindemiatrix (Gentle)</option>
                          <option value="Sadachbia">Sadachbia (Lively)</option>
                          <option value="Sadaltager">Sadaltager (Knowledgeable)</option>
                          <option value="Sulafat">Sulafat (Warm)</option>
                        </optgroup>
                        <optgroup label="Microsoft Neural Voices">
                          <option value="en-US-ChristopherNeural">Christopher (US - Deep / Dramatic)</option>
                          <option value="en-US-GuyNeural">Guy (US - Narrative / Crisp)</option>
                          <option value="en-US-JennyNeural">Jenny (US - Expressive / Clear)</option>
                          <option value="en-GB-RyanNeural">Ryan (UK - Atmospheric / Fiction)</option>
                          <option value="en-GB-SoniaNeural">Sonia (UK - Classical Prose)</option>
                          <option value="en-US-AriaNeural">Aria (US - Balanced / Modern)</option>
                        </optgroup>
                      </select>
                    </div>

                    <div>
                      <label htmlFor="parlandoDialogueMode" style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Dialogue Multi-Voice Casting</label>
                      <select
                        id="parlandoDialogueMode"
                        value={parlandoDialogueMode}
                        onChange={(e) => setParlandoDialogueMode(e.target.value as 'auto' | 'single')}
                        style={{ marginTop: '4px' }}
                      >
                        <option value="auto">✨ Auto-Cast Multi-Voice (Characters get distinct voices)</option>
                        <option value="single">🎙️ Single Voice (Fixed dialogue voice)</option>
                      </select>
                    </div>

                    {parlandoDialogueMode === 'single' && (
                      <div>
                        <label htmlFor="parlandoDialogueVoice" style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Fixed Dialogue Voice</label>
                        <select
                          id="parlandoDialogueVoice"
                          value={parlandoDialogueVoice}
                          onChange={(e) => setParlandoDialogueVoice(e.target.value)}
                          style={{ marginTop: '4px' }}
                        >
                          <option value="">Same as Primary Narrator ({parlandoVoice})</option>
                          <optgroup label="Google Gemini Neural Voices">
                            <option value="Puck">Puck (Upbeat)</option>
                            <option value="Charon">Charon (Informative)</option>
                            <option value="Kore">Kore (Firm)</option>
                            <option value="Fenrir">Fenrir (Excitable)</option>
                            <option value="Aoede">Aoede (Breezy)</option>
                            <option value="Leda">Leda (Youthful)</option>
                            <option value="Orus">Orus (Firm)</option>
                            <option value="Zephyr">Zephyr (Bright)</option>
                            <option value="Callirrhoe">Callirrhoe (Easy-going)</option>
                            <option value="Autonoe">Autonoe (Bright)</option>
                            <option value="Enceladus">Enceladus (Breathy)</option>
                            <option value="Iapetus">Iapetus (Clear)</option>
                            <option value="Umbriel">Umbriel (Easy-going)</option>
                            <option value="Algieba">Algieba (Smooth)</option>
                            <option value="Despina">Despina (Smooth)</option>
                            <option value="Erinome">Erinome (Clear)</option>
                            <option value="Algenib">Algenib (Gravelly)</option>
                            <option value="Rasalgethi">Rasalgethi (Informative)</option>
                            <option value="Laomedeia">Laomedeia (Upbeat)</option>
                            <option value="Achernar">Achernar (Soft)</option>
                            <option value="Alnilam">Alnilam (Firm)</option>
                            <option value="Schedar">Schedar (Even)</option>
                            <option value="Gacrux">Gacrux (Mature)</option>
                            <option value="Pulcherrima">Pulcherrima (Forward)</option>
                            <option value="Achird">Achird (Friendly)</option>
                            <option value="Zubenelgenubi">Zubenelgenubi (Casual)</option>
                            <option value="Vindemiatrix">Vindemiatrix (Gentle)</option>
                            <option value="Sadachbia">Sadachbia (Lively)</option>
                            <option value="Sadaltager">Sadaltager (Knowledgeable)</option>
                            <option value="Sulafat">Sulafat (Warm)</option>
                          </optgroup>
                          <optgroup label="Microsoft Neural Voices">
                            <option value="en-US-GuyNeural">Guy (US - Natural / Conversational)</option>
                            <option value="en-US-JennyNeural">Jenny (US - Warm / Clear)</option>
                            <option value="en-US-AriaNeural">Aria (US - Balanced / Modern)</option>
                            <option value="en-GB-RyanNeural">Ryan (UK - Atmospheric)</option>
                            <option value="en-GB-SoniaNeural">Sonia (UK - Classical)</option>
                          </optgroup>
                        </select>
                      </div>
                    )}

                    <div>
                      <label htmlFor="parlandoPacing" style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Pacing Preset</label>
                      <select
                        id="parlandoPacing"
                        value={parlandoPacing}
                        onChange={(e) => setParlandoPacing(e.target.value)}
                        style={{ marginTop: '4px' }}
                      >
                        <option value="normal">Normal (Standard cadence)</option>
                        <option value="brisk">Brisk (Fast proofreading)</option>
                        <option value="dramatic">Dramatic (Extended punctuation pauses)</option>
                        <option value="cinematic">Cinematic (Atmospheric pauses)</option>
                        <option value="contemplative">Contemplative (Slow recitation)</option>
                      </select>
                    </div>

                    <div>
                      <label htmlFor="parlandoSpeed" style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Playback Speed ({parlandoSpeed}x)</label>
                      <select
                        id="parlandoSpeed"
                        value={parlandoSpeed}
                        onChange={(e) => setParlandoSpeed(e.target.value)}
                        style={{ marginTop: '4px' }}
                      >
                        <option value="0.75">0.75x — Deliberate</option>
                        <option value="1.0">1.0x — Normal</option>
                        <option value="1.25">1.25x — Fast</option>
                        <option value="1.5">1.5x — Quick Proof</option>
                      </select>
                    </div>
                  </div>

                  <p className="help-text" style={{ margin: 0 }}>
                    Parlando uses zero-crossing crossfading DSP and semantic dialogue isolation for human-like narrative cadence.
                  </p>
                </div>
              ) : (
                <div className="form-group" style={{ margin: 0 }}>
                  <select
                    id="ttsVoice"
                    value={selectedTtsVoice}
                    onChange={(e) => setSelectedTtsVoice(e.target.value)}
                  >
                    <option value="">Auto-select Highest Quality Natural Voice</option>
                    {ttsVoices.map((v) => (
                      <option key={v.voiceURI} value={v.voiceURI}>
                        {v.name} ({v.lang})
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* Glossary & Lore Integration Section */}
            <div className="form-group" style={{ borderTop: '1px solid var(--border-color)', paddingTop: '16px', marginTop: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600, margin: 0 }}>
                    <BookOpen size={16} /> Glossary & Lore Sources
                  </label>
                  {glossaryRepoSlug && (
                    <span style={{ fontSize: '0.75rem', padding: '2px 8px', borderRadius: '12px', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', color: 'var(--text-secondary)' }}>
                      Repo: <strong style={{ color: 'var(--text-primary)' }}>{glossaryRepoSlug}</strong>
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={fetchGlossary}
                    disabled={loadingGlossary}
                    style={{ fontSize: '0.8rem', padding: '4px 8px' }}
                    title="Refresh glossary terms"
                  >
                    <RefreshCw size={12} className={loadingGlossary ? 'spinner' : ''} />
                  </button>
                </div>
              </div>

              <p className="help-text" style={{ marginTop: 0, marginBottom: '12px' }}>
                Configure the editor to automatically pull in-world vocabulary and lore definitions directly from your glossary files. Settings are tied to your GitHub repository (stored in <code>.marginalia/glossary.json</code>).
              </p>

              {glossaryMsg && (
                <div className={`status-badge ${glossaryMsg.type === 'success' ? 'success' : 'warning'}`} style={{ marginBottom: '12px' }}>
                  <span>{glossaryMsg.text}</span>
                </div>
              )}

              {/* Glossary Options Toggles */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '14px' }}>
                <label className="checkbox-label" style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={glossaryConfig.autoDetect}
                    onChange={(e) => handleSaveGlossaryConfig({ autoDetect: e.target.checked })}
                  />
                  <span>Auto-detect lore and glossary files (<code>glossary.md</code>, <code>dramatis_personae.md</code>, <code>lore/*.md</code>)</span>
                </label>

                <label className="checkbox-label" style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={glossaryConfig.enableSpellcheck}
                    onChange={(e) => handleSaveGlossaryConfig({ enableSpellcheck: e.target.checked })}
                  />
                  <span>Whitelist glossary terms in Spell Check (automatically recognizes proper nouns, possessives, and plurals)</span>
                </label>

                <label className="checkbox-label" style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={glossaryConfig.enableAutocomplete}
                    onChange={(e) => handleSaveGlossaryConfig({ enableAutocomplete: e.target.checked })}
                  />
                  <span>Enable Glossary Autocomplete in Editor (suggests character names and lore terms as you type)</span>
                </label>
              </div>

              {/* Resolved / Active Glossary Files */}
              <div style={{ marginBottom: '12px' }}>
                <div style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '6px', color: 'var(--text-secondary)' }}>
                  Active Glossary Sources ({glossaryResolvedFiles.length}):
                </div>
                {glossaryResolvedFiles.length === 0 ? (
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                    No glossary files found or configured. Add one below or create <code>glossary.md</code> / <code>lore/dramatis_personae.md</code>.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {glossaryResolvedFiles.map((file) => (
                      <span
                        key={file}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          background: 'var(--bg-secondary)',
                          border: '1px solid var(--border-color)',
                          borderRadius: '4px',
                          padding: '2px 8px',
                          fontSize: '0.8rem'
                        }}
                      >
                        <FileText size={12} />
                        <span>{file}</span>
                        {glossaryConfig.paths.includes(file) && (
                          <button
                            type="button"
                            onClick={() => handleRemoveGlossaryPath(file)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'var(--text-secondary)' }}
                            title="Remove from custom paths"
                          >
                            <X size={12} />
                          </button>
                        )}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Add Custom Glossary Path or Quick Add from Candidates */}
              <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', alignItems: 'center' }}>
                <input
                  type="text"
                  placeholder="Specify glossary path (e.g. lore/dramatis_personae.md)..."
                  value={newGlossaryPath}
                  onChange={(e) => setNewGlossaryPath(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddGlossaryPath(newGlossaryPath);
                    }
                  }}
                  style={{ flex: 1 }}
                />
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => handleAddGlossaryPath(newGlossaryPath)}
                  disabled={!newGlossaryPath.trim()}
                  style={{ whiteSpace: 'nowrap' }}
                >
                  <Plus size={14} /> Add Path
                </button>

                {glossaryAvailableFiles.some(f => !glossaryConfig.paths.includes(f)) && (
                  <select
                    onChange={(e) => {
                      if (e.target.value) {
                        handleAddGlossaryPath(e.target.value);
                        e.target.value = '';
                      }
                    }}
                    defaultValue=""
                    style={{ maxWidth: '180px', fontSize: '0.8rem' }}
                    title="Quickly add an available workspace lore file"
                  >
                    <option value="" disabled>+ Add Discovered File...</option>
                    {glossaryAvailableFiles.filter(f => !glossaryConfig.paths.includes(f)).map(f => (
                      <option key={f} value={f}>{f}</option>
                    ))}
                  </select>
                )}
              </div>

              {/* Glossary Terms Preview */}
              {glossaryTerms.length > 0 && (
                <div style={{ background: 'var(--bg-secondary)', borderRadius: '6px', border: '1px solid var(--border-color)', padding: '10px', marginBottom: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1 }}>
                      <Search size={14} style={{ color: 'var(--text-secondary)' }} />
                      <input
                        type="text"
                        placeholder={`Search ${glossaryTerms.length} loaded glossary terms...`}
                        value={glossaryFilter}
                        onChange={(e) => setGlossaryFilter(e.target.value)}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          outline: 'none',
                          fontSize: '0.8rem',
                          width: '100%',
                          color: 'var(--text-primary)'
                        }}
                      />
                      {glossaryFilter && (
                        <button
                          type="button"
                          onClick={() => setGlossaryFilter('')}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: 0 }}
                        >
                          <X size={12} />
                        </button>
                      )}
                    </div>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap', marginLeft: '8px' }}>
                      {glossaryTerms.length} terms active
                    </span>
                  </div>

                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', maxHeight: '140px', overflowY: 'auto' }}>
                    {(() => {
                      const filtered = glossaryTerms.filter(t =>
                        !glossaryFilter.trim() ||
                        t.term.toLowerCase().includes(glossaryFilter.trim().toLowerCase()) ||
                        (t.definition && t.definition.toLowerCase().includes(glossaryFilter.trim().toLowerCase()))
                      );
                      if (filtered.length === 0) {
                        return (
                          <div style={{ padding: '8px', color: 'var(--text-secondary)', fontSize: '0.8rem', fontStyle: 'italic', width: '100%', textAlign: 'center' }}>
                            No matching glossary terms found.
                          </div>
                        );
                      }
                      return filtered.map((item) => (
                        <span
                          key={`${item.file}:${item.term}`}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            background: 'var(--bg-primary)',
                            border: '1px solid var(--border-color)',
                            borderRadius: '4px',
                            padding: '2px 6px',
                            fontSize: '0.8rem'
                          }}
                          title={item.definition ? `${item.term}: ${item.definition} [${item.file}]` : `Source: ${item.file}`}
                        >
                          <strong style={{ color: 'var(--text-primary)' }}>{item.term}</strong>
                          {item.definition && (
                            <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              — {item.definition}
                            </span>
                          )}
                        </span>
                      ));
                    })()}
                  </div>
                </div>
              )}
            </div>

            {/* Spelling & In-World Dictionary Section */}
            <div className="form-group" style={{ borderTop: '1px solid var(--border-color)', paddingTop: '16px', marginTop: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600, margin: 0 }}>
                  <BookA size={16} /> In-World Vocabulary & Spell Check Dictionary
                </label>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={handleScanLore}
                    disabled={scanningLore}
                    style={{ fontSize: '0.8rem', padding: '4px 8px', display: 'flex', alignItems: 'center', gap: '4px' }}
                    title="Scan character sheets (dramatis_personae), lore files, and outlines for in-world proper nouns"
                  >
                    {scanningLore ? <Loader2 size={12} className="spinner" /> : <Sparkles size={12} />}
                    {scanningLore ? 'Scanning...' : 'Scan Workspace Lore'}
                  </button>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={fetchDictionary}
                    disabled={loadingDict}
                    style={{ fontSize: '0.8rem', padding: '4px 8px' }}
                    title="Refresh dictionary list"
                  >
                    <RefreshCw size={12} className={loadingDict ? 'spinner' : ''} />
                  </button>
                </div>
              </div>

              <p className="help-text" style={{ marginTop: 0, marginBottom: '12px' }}>
                Words listed here are whitelisted and never flagged as spelling mistakes, including possessive variants (e.g. <em>Damir’s</em>) and compounds (e.g. <em>Lur-Sigor</em>).
              </p>

              {dictMsg && (
                <div className={`status-badge ${dictMsg.type === 'success' ? 'success' : 'warning'}`} style={{ marginBottom: '12px' }}>
                  <span>{dictMsg.text}</span>
                </div>
              )}

              {/* Scanned Candidates Review Banner */}
              {scannedCandidates.length > 0 && (
                <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--primary-color, #3b82f6)', borderRadius: '6px', padding: '12px', marginBottom: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>
                      Discovered {scannedCandidates.length} In-World Term{scannedCandidates.length > 1 ? 's' : ''} from Lore:
                    </span>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button
                        type="button"
                        className="btn-secondary"
                        style={{ fontSize: '0.75rem', padding: '2px 6px' }}
                        onClick={() => setSelectedCandidates(new Set(scannedCandidates))}
                      >
                        Select All
                      </button>
                      <button
                        type="button"
                        className="btn-secondary"
                        style={{ fontSize: '0.75rem', padding: '2px 6px' }}
                        onClick={() => setSelectedCandidates(new Set())}
                      >
                        Clear
                      </button>
                      <button
                        type="button"
                        className="btn-primary"
                        style={{ fontSize: '0.75rem', padding: '2px 8px' }}
                        onClick={handleImportCandidates}
                        disabled={selectedCandidates.size === 0}
                      >
                        Import Selected ({selectedCandidates.size})
                      </button>
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', maxHeight: '120px', overflowY: 'auto', padding: '4px' }}>
                    {scannedCandidates.map(word => (
                      <label
                        key={word}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          background: selectedCandidates.has(word) ? 'rgba(59, 130, 246, 0.15)' : 'var(--bg-primary)',
                          border: `1px solid ${selectedCandidates.has(word) ? 'var(--primary-color, #3b82f6)' : 'var(--border-color)'}`,
                          borderRadius: '4px',
                          padding: '2px 6px',
                          fontSize: '0.8rem',
                          cursor: 'pointer'
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={selectedCandidates.has(word)}
                          onChange={(e) => {
                            const next = new Set(selectedCandidates);
                            if (e.target.checked) next.add(word);
                            else next.delete(word);
                            setSelectedCandidates(next);
                          }}
                        />
                        <span>{word}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* Scope Selector Tabs */}
              <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                <button
                  type="button"
                  className={dictScope === 'workspace' ? 'btn-primary' : 'btn-secondary'}
                  style={{ fontSize: '0.8rem', padding: '4px 10px' }}
                  onClick={() => setDictScope('workspace')}
                >
                  Workspace Dictionary ({workspaceWords.length})
                </button>
                <button
                  type="button"
                  className={dictScope === 'global' ? 'btn-primary' : 'btn-secondary'}
                  style={{ fontSize: '0.8rem', padding: '4px 10px' }}
                  onClick={() => setDictScope('global')}
                >
                  Global Account Dictionary ({globalWords.length})
                </button>
              </div>

              {/* Add New Word Input */}
              <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                <input
                  type="text"
                  placeholder="Add word(s) (separate with commas or spaces)..."
                  value={newWordsInput}
                  onChange={(e) => setNewWordsInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddWords();
                    }
                  }}
                  style={{ flex: 1 }}
                />
                <button
                  type="button"
                  className="btn-primary"
                  onClick={handleAddWords}
                  disabled={!newWordsInput.trim()}
                  style={{ display: 'flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap' }}
                >
                  <Plus size={14} /> Add to {dictScope === 'workspace' ? 'Workspace' : 'Global'}
                </button>
              </div>

              {/* Word List Search & Pills */}
              <div style={{ background: 'var(--bg-secondary)', borderRadius: '6px', border: '1px solid var(--border-color)', padding: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                  <Search size={14} style={{ color: 'var(--text-secondary)' }} />
                  <input
                    type="text"
                    placeholder={`Filter ${(dictScope === 'workspace' ? workspaceWords : globalWords).length} words...`}
                    value={dictFilter}
                    onChange={(e) => setDictFilter(e.target.value)}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      outline: 'none',
                      fontSize: '0.8rem',
                      width: '100%',
                      color: 'var(--text-primary)'
                    }}
                  />
                  {dictFilter && (
                    <button
                      type="button"
                      onClick={() => setDictFilter('')}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: 0 }}
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', maxHeight: '160px', overflowY: 'auto' }}>
                  {(() => {
                    const activeWords = dictScope === 'workspace' ? workspaceWords : globalWords;
                    const filteredWords = activeWords.filter(w => !dictFilter.trim() || w.toLowerCase().includes(dictFilter.trim().toLowerCase()));
                    if (filteredWords.length === 0) {
                      return (
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontStyle: 'italic', padding: '4px' }}>
                          {activeWords.length === 0 ? `No words in ${dictScope} dictionary yet.` : 'No matching words found.'}
                        </span>
                      );
                    }
                    return filteredWords.map((word) => (
                      <span
                        key={word}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          background: 'var(--bg-primary)',
                          border: '1px solid var(--border-color)',
                          borderRadius: '4px',
                          padding: '2px 8px',
                          fontSize: '0.8rem'
                        }}
                      >
                        {word}
                        <button
                          type="button"
                          onClick={() => handleRemoveWord(word)}
                          style={{
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            padding: 0,
                            display: 'flex',
                            alignItems: 'center',
                            color: 'var(--text-secondary)'
                          }}
                          title={`Remove "${word}"`}
                        >
                          <X size={12} />
                        </button>
                      </span>
                    ));
                  })()}
                </div>
              </div>
            </div>

            {/* Hosted & Auth Settings */}
            <div className="form-group checkbox-group" style={{ borderTop: '1px solid var(--border-color)', paddingTop: '16px', marginTop: '16px' }}>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={simulateHosted}
                  onChange={(e) => setSimulateHosted(e.target.checked)}
                />
                <span>Simulate Hosted (Remote) Mode</span>
              </label>
              <p className="help-text">
                Forces the app to require login and runs VFS Sandboxed workspace directories on localhost.
              </p>
            </div>

            {simulateHosted && (
              <div className="oauth-settings-block">
                <div className="form-group">
                  <label htmlFor="githubClientId">GitHub Client ID</label>
                  <input
                    id="githubClientId"
                    type="text"
                    placeholder="Enter GitHub OAuth Client ID"
                    value={githubClientId}
                    onChange={(e) => setGithubClientId(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="githubClientSecret">GitHub Client Secret</label>
                  <div className="input-with-button">
                    <input
                      id="githubClientSecret"
                      type={showSecret ? 'text' : 'password'}
                      placeholder={hasGithubSecret ? "••••••••••••••••" : "Enter GitHub OAuth Client Secret"}
                      value={githubClientSecret}
                      onChange={(e) => setGithubClientSecret(e.target.value)}
                    />
                    <button
                      type="button"
                      className="input-icon-btn"
                      onClick={() => setShowSecret(!showSecret)}
                      title={showSecret ? 'Hide secret' : 'Show secret'}
                    >
                      {showSecret ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                <div className="form-group">
                  <label htmlFor="allowedUser">Allowed GitHub Username</label>
                  <input
                    id="allowedUser"
                    type="text"
                    placeholder="e.g. your-github-handle"
                    value={allowedUser}
                    onChange={(e) => setAllowedUser(e.target.value)}
                  />
                  <p className="help-text">
                    Restricts login access only to this GitHub user handle (leave blank to allow any user to sign in).
                  </p>
                </div>
              </div>
            )}

            {isConfigured !== null && (
              <div className={`status-badge ${isConfigured ? 'success' : 'warning'}`}>
                {isConfigured ? (
                  <>
                    <Check size={16} />
                    <span>Gemini API Key is configured on server</span>
                  </>
                ) : (
                  <>
                    <AlertCircle size={16} />
                    <span>Gemini API Key is not configured</span>
                  </>
                )}
              </div>
            )}

            {error && <div className="error-message">{error}</div>}

            <div className="form-actions" style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              {onOpenAbout && (
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => {
                    onClose();
                    onOpenAbout();
                  }}
                >
                  About
                </button>
              )}
              {isAdmin && onOpenAdmin && (
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => {
                    onClose();
                    onOpenAdmin();
                  }}
                  style={{ display: 'flex', alignItems: 'center', gap: '4px' }}
                >
                  <Activity size={14} /> Admin Monitor
                </button>
              )}
              <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
                <button type="button" className="btn-secondary" onClick={onClose}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary" disabled={saving || !isDirty}>
                  {saving ? 'Saving...' : 'Save Settings'}
                </button>
              </div>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
