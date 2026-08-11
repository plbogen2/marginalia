import { useState, useEffect, useRef, useCallback } from 'react';
import { Sidebar } from './components/Sidebar';
import { Editor } from './components/Editor';
import { Preview } from './components/Preview';
import { GitBar } from './components/GitBar';
import { WorkspaceManager } from './components/WorkspaceManager';
import './App.scss';
import { resolveRelativePath } from './utils/pathResolver';
import { SettingsModal } from './components/SettingsModal';
import { MarkdownGuideModal } from './components/MarkdownGuideModal';
import { GitDiffModal } from './components/GitDiffModal';
import { AboutModal } from './components/AboutModal';
import { AiPanel, type Persona } from './components/AiPanel';
import { ChevronRight, Eye, EyeOff, Sparkles, Loader2, Mic, MicOff, Volume2, VolumeX } from 'lucide-react';
import { formatMarkdown } from './utils/markdownLinter';

function App() {
  const [files, setFiles] = useState<string[]>([]);
  const [sidebarWidth, setSidebarWidth] = useState(250);
  const isResizing = useRef(false);

  const startResizing = useCallback((mouseDownEvent: React.MouseEvent) => {
    mouseDownEvent.preventDefault();
    isResizing.current = true;
  }, []);

  const stopResizing = useCallback(() => {
    isResizing.current = false;
  }, []);

  const resize = useCallback((mouseMoveEvent: MouseEvent) => {
    if (isResizing.current) {
      const newWidth = Math.max(150, Math.min(600, mouseMoveEvent.clientX));
      setSidebarWidth(newWidth);
    }
  }, []);

  useEffect(() => {
    window.addEventListener('mousemove', resize);
    window.addEventListener('mouseup', stopResizing);
    return () => {
      window.removeEventListener('mousemove', resize);
      window.removeEventListener('mouseup', stopResizing);
    };
  }, [resize, stopResizing]);
  const [activeWorkspaceName, setActiveWorkspaceName] = useState<string | null>(null);
  const [activeFile, setActiveFile] = useState<string | null>(null);
  const [editorValue, setEditorValue] = useState('');
  const [originalContent, setOriginalContent] = useState('');
  const [gitStatus, setGitStatus] = useState('');
  const [gitBranch, setGitBranch] = useState('');
  const [loading, setLoading] = useState(false);
  const [checkingGrammar, setCheckingGrammar] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [previewOpen, setPreviewOpen] = useState(true);
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const [hasRemote, setHasRemote] = useState(false);
  const [gitAhead, setGitAhead] = useState(0);
  const [hasGemini, setHasGemini] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [diffOpen, setDiffOpen] = useState(false);
  const [aiPanelOpen, setAiPanelOpen] = useState(() => {
    const saved = localStorage.getItem('marginalia_ai_panel_open');
    return saved === 'true';
  });
  const [selectedPersona, setSelectedPersona] = useState<Persona>('developmental');
  const [inlineSuggestion, setInlineSuggestion] = useState<string | null>(null);
  const [inlineSuggestionLoading, setInlineSuggestionLoading] = useState(false);
  const [selectedContextFiles, setSelectedContextFiles] = useState<string[]>([]);

  useEffect(() => {
    localStorage.setItem('marginalia_ai_panel_open', String(aiPanelOpen));
  }, [aiPanelOpen]);

  const [authInfo, setAuthInfo] = useState<{ loggedIn: boolean, user: string | null, isOAuthMode: boolean } | null>(null);

  const [pageFormat, setPageFormat] = useState<'paperback' | 'hardback'>(() => {
    const saved = localStorage.getItem('marginalia_page_format');
    return (saved === 'paperback' || saved === 'hardback') ? saved : 'paperback';
  });

  useEffect(() => {
    localStorage.setItem('marginalia_page_format', pageFormat);
  }, [pageFormat]);

  const cleanText = editorValue.replace(/<!--[\s\S]*?-->/g, '');
  const wordCount = cleanText.trim() ? cleanText.trim().split(/\s+/).length : 0;
  const wordsPerPage = pageFormat === 'paperback' ? 300 : 250;
  const pageCount = Math.ceil(wordCount / wordsPerPage);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F1') {
        e.preventDefault();
        setGuideOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const fetchAuthStatus = async () => {
    try {
      const res = await fetch('/api/auth/status');
      const data = await res.json();
      setAuthInfo(data);
    } catch (err) {
      console.error('Failed to fetch auth status:', err);
    }
  };

  useEffect(() => {
    fetchAuthStatus();
  }, []);

  // Server Update Auto-Reload Detection
  useEffect(() => {
    let initialBuildTime: number | null = null;

    const checkServerVersion = async () => {
      try {
        const res = await fetch('/api/version');
        if (!res.ok) return;
        const data = await res.json();
        if (typeof data.buildTime === 'number') {
          if (initialBuildTime === null) {
            initialBuildTime = data.buildTime;
          } else if (data.buildTime !== initialBuildTime) {
            console.log('New server deployment detected. Reloading application...');
            window.location.reload();
          }
        }
      } catch (err) {
        // Ignore temporary network errors during server restart
      }
    };

    checkServerVersion();
    const interval = setInterval(checkServerVersion, 20000);
    return () => clearInterval(interval);
  }, []);

  // Voice Dictation (Speech-to-Text)
  const [isDictating, setIsDictating] = useState(false);
  const recognitionRef = useRef<any>(null);

  const toggleDictation = () => {
    if (isDictating) {
      recognitionRef.current?.stop();
      setIsDictating(false);
      return;
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert('Speech Recognition is not supported in this browser. Please use Chrome, Edge, or Safari.');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    recognition.onresult = (event: any) => {
      const lastResultIndex = event.results.length - 1;
      let transcript = event.results[lastResultIndex][0].transcript;

      // Format common voice punctuation commands
      transcript = transcript
        .replace(/\bperiod\b/gi, '.')
        .replace(/\bcomma\b/gi, ',')
        .replace(/\bquestion mark\b/gi, '?')
        .replace(/\bexclamation mark\b/gi, '!')
        .replace(/\bnew line\b/gi, '\n')
        .replace(/\bnew paragraph\b/gi, '\n\n');

      setEditorValue((prev) => {
        const needsSpace = prev.length > 0 && !prev.endsWith(' ') && !prev.endsWith('\n');
        return prev + (needsSpace ? ' ' : '') + transcript;
      });
    };

    recognition.onerror = (err: any) => {
      console.warn('Dictation error:', err);
      setIsDictating(false);
    };

    recognition.onend = () => {
      setIsDictating(false);
    };

    recognition.start();
    recognitionRef.current = recognition;
    setIsDictating(true);
  };

  // Text-to-Speech (Read Aloud)
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [cursorOffset, setCursorOffset] = useState<number>(0);
  const utteranceRef = useRef<any>(null);
  const isCancelledRef = useRef<boolean>(false);

  const stopSpeech = () => {
    isCancelledRef.current = true;
    if (utteranceRef.current) {
      utteranceRef.current.onend = null;
      utteranceRef.current.onerror = null;
      utteranceRef.current = null;
    }
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setIsSpeaking(false);
  };

  const toggleReadAloud = () => {
    if (!('speechSynthesis' in window)) {
      alert('Text-to-Speech is not supported in this browser.');
      return;
    }

    if (isSpeaking) {
      stopSpeech();
      return;
    }

    if (!editorValue || editorValue.trim().length === 0) {
      alert('Nothing to read aloud in this file.');
      return;
    }

    stopSpeech();
    isCancelledRef.current = false;

    // Start reading from current cursor position if cursor is placed inside document
    let textToRead = editorValue;
    if (cursorOffset > 0 && cursorOffset < editorValue.length) {
      const sliced = editorValue.slice(cursorOffset).trim();
      if (sliced.length > 0) {
        textToRead = sliced;
      }
    }

    // Strip markdown formatting and quotation marks so TTS voices don't read "quote" out loud
    const cleanText = textToRead
      .replace(/#+\s+/g, '')
      .replace(/[*_`~>]/g, '')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/["'“”‘’]/g, '')
      .trim();

    if (!cleanText) return;

    // Split text into sentence chunks to prevent Chrome max buffer truncation
    const sentences = cleanText.match(/[^.!?\n]+[.!?\n]+/g) || [cleanText];
    let currentIndex = 0;

    const speakNextSentence = () => {
      if (isCancelledRef.current || currentIndex >= sentences.length) {
        setIsSpeaking(false);
        utteranceRef.current = null;
        return;
      }

      const sentenceText = sentences[currentIndex].trim();
      if (!sentenceText) {
        currentIndex++;
        speakNextSentence();
        return;
      }

      const utterance = new SpeechSynthesisUtterance(sentenceText);
      utterance.rate = 1.0;
      utterance.pitch = 1.0;

      try {
        const voices = window.speechSynthesis.getVoices();
        if (voices && voices.length > 0) {
          const savedURI = localStorage.getItem('marginalia_tts_voice_uri');
          let selectedVoice: SpeechSynthesisVoice | undefined;

          if (savedURI) {
            selectedVoice = voices.find((v) => v.voiceURI === savedURI);
          }

          if (!selectedVoice) {
            selectedVoice = voices.find((v) => 
              v.lang.startsWith('en') && (
                v.name.includes('Natural') || 
                v.name.includes('Online (Natural)') ||
                v.name.includes('Enhanced') || 
                v.name.includes('Premium') ||
                v.name.includes('Google')
              )
            ) || voices.find((v) => v.lang.startsWith('en'));
          }

          if (selectedVoice) {
            utterance.voice = selectedVoice;
          }
        }
      } catch (e) {
        console.warn('Failed to assign voice:', e);
      }

      utterance.onend = () => {
        if (isCancelledRef.current) return;
        currentIndex++;
        speakNextSentence();
      };

      utterance.onerror = (err) => {
        if (isCancelledRef.current) return;
        console.error('TTS utterance error:', err);
        currentIndex++;
        if (currentIndex < sentences.length) {
          speakNextSentence();
        } else {
          setIsSpeaking(false);
          utteranceRef.current = null;
        }
      };

      // Store in ref to prevent Chrome V8 Garbage Collection from silencing speech
      utteranceRef.current = utterance;
      if ('resume' in window.speechSynthesis) {
        window.speechSynthesis.resume();
      }
      window.speechSynthesis.speak(utterance);
    };

    setIsSpeaking(true);
    speakNextSentence();
  };

  useEffect(() => {
    stopSpeech();
    setCursorOffset(0);
  }, [activeFile]);

  useEffect(() => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.getVoices();
      const handleVoicesChanged = () => {
        window.speechSynthesis.getVoices();
      };
      window.speechSynthesis.onvoiceschanged = handleVoicesChanged;
    }
  }, []);



  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      window.location.href = '/';
    } catch (err) {
      console.error('Failed to log out:', err);
      window.location.href = '/';
    }
  };

  const selectFile = (filePath: string | null) => {
    setActiveFile(filePath);
    let newUrl = '/';
    if (activeWorkspaceName) {
      newUrl += encodeURIComponent(activeWorkspaceName) + '/';
    }
    if (filePath) {
      newUrl += filePath.split('/').map(encodeURIComponent).join('/');
    }

    const currentPath = decodeURIComponent(window.location.pathname.slice(1));
    const targetPath = (activeWorkspaceName ? activeWorkspaceName + '/' : '') + (filePath || '');
    if (currentPath !== targetPath) {
      window.history.pushState(null, '', newUrl);
    }
  };

  const handleNavigateLink = (href: string) => {
    if (!activeFile) return;
    const resolved = resolveRelativePath(activeFile, href);
    if (files.includes(resolved)) {
      selectFile(resolved);
    } else {
      console.warn(`File not found in workspace: ${resolved}`);
      alert(`Linked file not found: ${resolved}`);
    }
  };

  const handleApplyChange = (original: string, replacement: string): boolean => {
    if (!editorValue.includes(original)) {
      return false;
    }
    const updated = editorValue.replace(original, replacement);
    setEditorValue(updated);
    
    if (activeFile) {
      fetch('/api/file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: activeFile, content: updated })
      }).then(res => {
        if (res.ok) {
          setOriginalContent(updated);
          fetchGitStatus();
        } else {
          console.error('Failed to auto-save change application to disk');
        }
      }).catch(err => {
        console.error('Error auto-saving change application:', err);
      });
    }
    return true;
  };

  const triggerInlineSuggestion = async () => {
    if (!activeFile || inlineSuggestionLoading) return;
    setInlineSuggestionLoading(true);
    setInlineSuggestion(null);
    try {
      const payload: { path: string; persona: string; contextFiles?: string[] } = {
        path: activeFile,
        persona: 'write-with-me'
      };
      if (selectedContextFiles.length > 0) {
        payload.contextFiles = selectedContextFiles;
      }
      
      const res = await fetch('/api/ai/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to get suggestion');
      
      const feedback = data.feedback || '';
      const cleanFeedback = feedback.replace(/<thinking>[\s\S]*?<\/thinking>/gi, '').trim();
      setInlineSuggestion(cleanFeedback);
    } catch (err) {
      console.error(err);
      alert('Failed to get suggestion: ' + (err as Error).message);
    } finally {
      setInlineSuggestionLoading(false);
    }
  };

  const dismissInlineSuggestion = () => {
    setInlineSuggestion(null);
  };

  const handleFormatDocument = () => {
    const formatted = formatMarkdown(editorValue);
    if (formatted !== editorValue) {
      setEditorValue(formatted);
      if (activeFile) {
        fetch('/api/file', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: activeFile, content: formatted })
        }).then(res => {
          if (res.ok) {
            setOriginalContent(formatted);
            fetchGitStatus();
          } else {
            console.error('Failed to auto-save formatted text to disk');
          }
        }).catch(err => {
          console.error('Error auto-saving formatted text:', err);
        });
      }
    }
  };

  const fetchFiles = async () => {
    try {
      const res = await fetch('/api/files');
      let data;
      try {
        data = await res.json();
      } catch (e) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }
      if (!res.ok) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      if (Array.isArray(data)) {
        setFiles(data);
      } else {
        throw new Error('Received invalid files data');
      }
    } catch (err) {
      console.error('Failed to fetch files:', err);
      setFiles([]);
    }
  };

  const fetchGitStatus = async () => {
    try {
      const res = await fetch('/api/git/status');
      let data;
      try {
        data = await res.json();
      } catch (e) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }
      if (!res.ok) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      setGitStatus(data.status || '');
      setHasRemote(!!data.hasRemote);
      setGitAhead(data.ahead || 0);
      setHasGemini(!!data.hasGemini);
    } catch (err) {
      console.error('Failed to fetch git status:', err);
      setGitStatus('');
      setHasRemote(false);
      setGitAhead(0);
      setHasGemini(false);
    }
  };

  const fetchGitBranch = async () => {
    try {
      const res = await fetch('/api/git/branch');
      let data;
      try {
        data = await res.json();
      } catch (e) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }
      if (!res.ok) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      setGitBranch(data.branch || '');
    } catch (err) {
      console.error('Failed to fetch git branch:', err);
      setGitBranch('unknown');
    }
  };

  const loadDefaultWorkspace = async () => {
    const res = await fetch('/api/workspaces');
    const data = await res.json();
    if (data.activeName) {
      setActiveWorkspaceName(data.activeName);
      window.history.replaceState(null, '', `/${encodeURIComponent(data.activeName)}/`);
      await fetchFiles();
      await fetchGitStatus();
      await fetchGitBranch();
      setActiveFile(null);
    }
  };

  const initWorkspaceAndLoad = async () => {
    setLoading(true);
    try {
      const pathSegments = window.location.pathname.split('/').filter(Boolean);
      let workspaceName = '';
      let filePath: string | null = null;

      if (pathSegments.length >= 1) {
        workspaceName = decodeURIComponent(pathSegments[0]);
        if (pathSegments.length >= 2) {
          filePath = pathSegments.slice(1).map(decodeURIComponent).join('/');
        }
      }

      if (workspaceName) {
        const res = await fetch('/api/workspaces/select-by-name', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: workspaceName })
        });
        
        if (res.ok) {
          const data = await res.json();
          setActiveWorkspaceName(data.name);
          await fetchFiles();
          await fetchGitStatus();
          await fetchGitBranch();
          if (filePath) {
            setActiveFile(filePath);
          }
        } else {
          console.warn(`Workspace not found: ${workspaceName}, falling back to default`);
          await loadDefaultWorkspace();
        }
      } else {
        await loadDefaultWorkspace();
      }
    } catch (err) {
      console.error('Initialization failed:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (authInfo && authInfo.loggedIn) {
      initWorkspaceAndLoad();
    }
  }, [authInfo]);

  useEffect(() => {
    const handlePopState = async () => {
      const fullPath = decodeURIComponent(window.location.pathname.slice(1));
      const parts = fullPath.split('/');
      if (parts.length >= 1) {
        const wsName = parts[0];
        const filePath = parts.slice(1).join('/');
        
        if (wsName !== activeWorkspaceName) {
          setLoading(true);
          try {
            const res = await fetch('/api/workspaces/select-by-name', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ name: wsName })
            });
            if (res.ok) {
              const data = await res.json();
              setActiveWorkspaceName(data.name);
              await fetchFiles();
              await fetchGitStatus();
              await fetchGitBranch();
              setActiveFile(filePath || null);
            }
          } catch (err) {
            console.error(err);
          } finally {
            setLoading(false);
          }
        } else {
          setActiveFile(filePath || null);
        }
      } else {
        setActiveFile(null);
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [activeWorkspaceName]);

  useEffect(() => {
    if (!activeFile) {
      setEditorValue('');
      setOriginalContent('');
      return;
    }

    const loadFile = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/file?path=${encodeURIComponent(activeFile)}`);
        const data = await res.json();
        setEditorValue(data.content);
        setOriginalContent(data.content);
      } catch (err) {
        console.error('Failed to load file:', err);
      } finally {
        setLoading(false);
      }
    };

    loadFile();
  }, [activeFile]);

  // Auto-save logic (1s debounce)
  useEffect(() => {
    if (!activeFile || editorValue === originalContent) return;

    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        await fetch('/api/file', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: activeFile, content: editorValue })
        });
        setOriginalContent(editorValue);
        await fetchGitStatus();
      } catch (err) {
        console.error('Failed to save file:', err);
      } finally {
        setLoading(false);
      }
    }, 1000);

    return () => clearTimeout(timer);
  }, [editorValue, activeFile, originalContent]);

  // Synchronized scroll logic between CodeMirror and HTML Preview
  useEffect(() => {
    if (!activeFile || !previewOpen) return;

    const timer = setTimeout(() => {
      const editorScrollEl = document.querySelector('.editor-cm-wrapper .cm-scroller');
      const previewScrollEl = document.querySelector('.preview-content');

      if (!editorScrollEl || !previewScrollEl) return;

      let isSyncingEditorScroll = false;
      let isSyncingPreviewScroll = false;

      const handleEditorScroll = () => {
        if (isSyncingPreviewScroll) {
          isSyncingPreviewScroll = false;
          return;
        }
        isSyncingEditorScroll = true;
        const percentage = editorScrollEl.scrollTop / (editorScrollEl.scrollHeight - editorScrollEl.clientHeight);
        previewScrollEl.scrollTop = percentage * (previewScrollEl.scrollHeight - previewScrollEl.clientHeight);
      };

      const handlePreviewScroll = () => {
        if (isSyncingEditorScroll) {
          isSyncingEditorScroll = false;
          return;
        }
        isSyncingPreviewScroll = true;
        const percentage = previewScrollEl.scrollTop / (previewScrollEl.scrollHeight - previewScrollEl.clientHeight);
        editorScrollEl.scrollTop = percentage * (editorScrollEl.scrollHeight - editorScrollEl.clientHeight);
      };

      editorScrollEl.addEventListener('scroll', handleEditorScroll);
      previewScrollEl.addEventListener('scroll', handlePreviewScroll);

      return () => {
        editorScrollEl.removeEventListener('scroll', handleEditorScroll);
        previewScrollEl.removeEventListener('scroll', handlePreviewScroll);
      };
    }, 100);

    return () => clearTimeout(timer);
  }, [activeFile, previewOpen]);

  const handleCreateFile = async (path: string) => {
    setLoading(true);
    try {
      await fetch('/api/file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path, content: '# ' + path.replace('.md', '') + '\n\nStart writing here...' })
      });
      await fetchFiles();
      setActiveFile(path);
      await fetchGitStatus();
    } catch (err) {
      console.error('Failed to create file:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteFile = async (path: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/file?path=${encodeURIComponent(path)}`, {
        method: 'DELETE'
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to delete file');
      }
      await fetchFiles();
      if (activeFile === path) {
        setActiveFile(null);
        setEditorValue('');
        setOriginalContent('');
      }
      await fetchGitStatus();
    } catch (err) {
      console.error('Failed to delete file:', err);
      alert(`Delete failed: ${(err as Error).message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleCommit = async (message: string) => {
    setLoading(true);
    try {
      const res = await fetch('/api/git/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message })
      });
      const data = await res.json();
      alert(`Committed: ${data.result}`);
      await fetchGitStatus();
    } catch (err) {
      console.error('Failed to commit:', err);
      alert(`Commit failed: ${(err as Error).message}`);
    } finally {
      setLoading(false);
    }
  };

  const handlePush = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/git/push', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Push failed');
      }
      alert("Successfully pushed changes to GitHub.");
      await fetchGitStatus();
    } catch (err) {
      console.error('Failed to push:', err);
      let msg = (err as Error).message;
      if (msg.includes('rejected') || msg.includes('fetch first')) {
        msg = 'The remote contains changes that you do not have locally. Please pull first.';
      }
      alert(`Push failed: ${msg}`);
    } finally {
      setLoading(false);
    }
  };

  const handlePull = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/git/pull', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Pull failed');
      }
      alert("Successfully pulled changes from GitHub.");
      await fetchFiles();
      await fetchGitStatus();
      if (activeFile) {
        const activeRes = await fetch(`/api/file?path=${encodeURIComponent(activeFile)}`);
        const activeData = await activeRes.json();
        setEditorValue(activeData.content);
        setOriginalContent(activeData.content);
      }
    } catch (err) {
      console.error('Failed to pull:', err);
      let msg = (err as Error).message;
      if (msg.includes('unstaged changes') || msg.includes('locally modified files')) {
        msg = 'You have unstaged changes that would be overwritten by pull. Please commit or stash them first.';
      }
      alert(`Pull failed: ${msg}`);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = () => {
    fetchFiles();
    fetchGitStatus();
    fetchGitBranch();
  };

  if (!authInfo) {
    return <div className="app-loading">Loading...</div>;
  }

  if (authInfo.isOAuthMode && !authInfo.loggedIn) {
    return (
      <div className="login-container">
        <div className="login-box">
          <h1>Marginalia</h1>
          <p>A distraction-free markdown book editor and writing environment.</p>
          <a href="/api/auth/login" className="github-login-btn">
            <span>Log in with GitHub</span>
          </a>
          <div className="privacy-notice-box">
            <span className="privacy-icon">🔒</span>
            <p>
              <strong>Hosted Demo Privacy Notice:</strong> Repositories checked out on this public demo instance are stored on the host server disk. For 100% data privacy with unreleased book manuscripts, run Marginalia locally on your own machine (<code>./run.sh</code>).
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-container">
      <GitBar
        status={gitStatus}
        branch={gitBranch}
        onCommit={handleCommit}
        onPush={handlePush}
        onPull={handlePull}
        onRefresh={handleRefresh}
        onSwitchWorkspace={() => setWorkspaceOpen(true)}
        hasRemote={hasRemote}
        loading={loading}
        ahead={gitAhead}
        hasGemini={hasGemini}
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenAbout={() => setAboutOpen(true)}
        authInfo={authInfo}
        onLogout={handleLogout}
        onShowDiff={() => setDiffOpen(true)}
      />
      <div className="main-layout">
        {!sidebarOpen && (
          <div className="collapsed-sidebar-bar" onClick={() => setSidebarOpen(true)} title="Expand Sidebar">
            <ChevronRight size={12} />
          </div>
        )}
        {sidebarOpen && (
          <>
            <Sidebar
              files={files}
              activeFile={activeFile}
              onSelectFile={selectFile}
              onCreateFile={handleCreateFile}
              onDeleteFile={handleDeleteFile}
              width={sidebarWidth}
              onCollapse={() => setSidebarOpen(false)}
            />
            <div className="sidebar-resizer" onMouseDown={startResizing} />
          </>
        )}
        <div className="workspace">
          {activeFile && (
            <div className="workspace-file-header">
              <span className="file-path">{activeFile}</span>
              <div className="stats">
                {checkingGrammar && (
                  <div className="grammar-checking-status" title="Running grammar and spell check...">
                    <Loader2 size={12} className="spinner" />
                    <span>Checking...</span>
                  </div>
                )}
                <span>{wordCount} words</span>
                <span>~{pageCount} pages</span>
                <select
                  value={pageFormat}
                  onChange={(e) => setPageFormat(e.target.value as 'paperback' | 'hardback')}
                  className="format-select"
                  title="Page count estimation format"
                >
                  <option value="paperback">Paperback</option>
                  <option value="hardback">Hardback</option>
                </select>
                <button
                  type="button"
                  className={`dictation-btn ${isDictating ? 'active dictating' : ''}`}
                  onClick={toggleDictation}
                  title={isDictating ? "Stop Voice Dictation" : "Start Voice Dictation"}
                >
                  {isDictating ? <MicOff size={14} /> : <Mic size={14} />}
                </button>
                <button
                  type="button"
                  className={`read-aloud-btn ${isSpeaking ? 'active speaking' : ''}`}
                  onClick={toggleReadAloud}
                  title={isSpeaking ? "Stop Read Aloud" : "Read Chapter Aloud (TTS)"}
                >
                  {isSpeaking ? <VolumeX size={14} /> : <Volume2 size={14} />}
                </button>
                <button
                  type="button"
                  className="format-doc-btn"
                  onClick={handleFormatDocument}
                  title="Auto-format trailing spaces and clean up Markdown style warnings"
                >
                  Format
                </button>
                <button
                  type="button"
                  className={`preview-toggle-btn ${previewOpen ? 'active' : ''}`}
                  onClick={() => setPreviewOpen(!previewOpen)}
                  title={previewOpen ? "Hide Markdown Preview" : "Show Markdown Preview"}
                >
                  {previewOpen ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
                {hasGemini && (
                  <button
                    type="button"
                    className={`ai-toggle-btn ${aiPanelOpen ? 'active' : ''}`}
                    onClick={() => setAiPanelOpen(!aiPanelOpen)}
                    title={aiPanelOpen ? "Hide AI Editor Panel" : "Show AI Editor Panel"}
                  >
                    <Sparkles size={14} />
                  </button>
                )}
              </div>
            </div>
          )}
          <div className="panels-container">
            <Editor
              value={editorValue}
              onChange={setEditorValue}
              activeFile={activeFile}
              onCheckStatusChange={setCheckingGrammar}
              onCursorChange={setCursorOffset}
              writeWithMeActive={selectedPersona === 'write-with-me'}
              inlineSuggestion={inlineSuggestion}
              inlineSuggestionLoading={inlineSuggestionLoading}
              onTriggerSuggestion={triggerInlineSuggestion}
              onDismissSuggestion={dismissInlineSuggestion}
            />
            {previewOpen && activeFile && (
              <Preview markdown={editorValue} onNavigateLink={handleNavigateLink} />
            )}
            {aiPanelOpen && activeFile && hasGemini && (
              <AiPanel 
                activeFile={activeFile} 
                editorValue={editorValue}
                files={files}
                onApplyChange={handleApplyChange}
                selectedPersona={selectedPersona}
                onPersonaChange={setSelectedPersona}
                selectedContextFiles={selectedContextFiles}
                onSelectedContextFilesChange={setSelectedContextFiles}
              />
            )}
          </div>
        </div>
      </div>
      {workspaceOpen && (
        <WorkspaceManager
          onClose={() => setWorkspaceOpen(false)}
          authInfo={authInfo}
          onWorkspaceChanged={(newName) => {
            setActiveWorkspaceName(newName);
            setActiveFile(null);
            setEditorValue('');
            setOriginalContent('');
            const targetUrl = newName ? `/${encodeURIComponent(newName)}/` : '/';
            window.history.pushState(null, '', targetUrl);
            handleRefresh();
          }}
        />
      )}
      {settingsOpen && (
        <SettingsModal
          onClose={() => setSettingsOpen(false)}
          onSave={() => {
            fetchGitStatus();
          }}
          onOpenAbout={() => setAboutOpen(true)}
        />
      )}
      {guideOpen && (
        <MarkdownGuideModal
          onClose={() => setGuideOpen(false)}
        />
      )}
      {aboutOpen && (
        <AboutModal
          onClose={() => setAboutOpen(false)}
        />
      )}
      {diffOpen && (
        <GitDiffModal
          onClose={() => setDiffOpen(false)}
          gitStatus={gitStatus}
          onRefreshStatus={handleRefresh}
          onCommit={handleCommit}
          hasGemini={hasGemini}
        />
      )}
    </div>
  );
}

export default App;
