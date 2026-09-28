import { useState, useEffect, useCallback, useRef } from 'react';
import { formatMarkdown } from '../utils/markdownLinter';

interface UseEditorSessionProps {
  fetchFiles: () => Promise<void>;
  fetchGitStatus: () => Promise<void>;
}

export function useEditorSession({ fetchFiles, fetchGitStatus }: UseEditorSessionProps) {
  const [activeFile, setActiveFile] = useState<string | null>(null);
  const [editorValue, setEditorValue] = useState('');
  const [originalContent, setOriginalContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [checkingGrammar, setCheckingGrammar] = useState(false);

  const fetchFilesRef = useRef(fetchFiles);
  fetchFilesRef.current = fetchFiles;

  const fetchGitStatusRef = useRef(fetchGitStatus);
  fetchGitStatusRef.current = fetchGitStatus;

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

  // Load file content when activeFile changes (checking localStorage buffer first for recovery)
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
        const serverText = data.content ?? '';

        // Check if there is an unsaved local draft in localStorage
        const storageKey = `marginalia_draft_${activeFile}`;
        const cachedDraft = localStorage.getItem(storageKey);

        if (cachedDraft && cachedDraft !== serverText) {
          console.info(`[Editor] Restored unsaved draft for ${activeFile} from localStorage`);
          setEditorValue(cachedDraft);
        } else {
          setEditorValue(serverText);
        }
        setOriginalContent(serverText);
      } catch (err) {
        console.error('Failed to load file:', err);
      } finally {
        setLoading(false);
      }
    };

    loadFile();
  }, [activeFile]);

  // Synchronous localStorage mirroring whenever editorValue changes
  useEffect(() => {
    if (!activeFile) return;
    const storageKey = `marginalia_draft_${activeFile}`;
    if (editorValue !== originalContent) {
      localStorage.setItem(storageKey, editorValue);
    } else {
      localStorage.removeItem(storageKey);
    }
  }, [activeFile, editorValue, originalContent]);

  // Auto-save logic (1s debounce to server)
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
        localStorage.removeItem(`marginalia_draft_${activeFile}`);
        if (fetchGitStatusRef.current) {
          await fetchGitStatusRef.current();
        }
      } catch (err) {
        console.error('Failed to save file:', err);
      } finally {
        setLoading(false);
      }
    }, 1000);

    return () => clearTimeout(timer);
  }, [editorValue, activeFile, originalContent]);

  // Synchronous flush function to save buffer to server immediately
  const flushDraftToServer = useCallback(async (): Promise<void> => {
    if (!activeFile || editorValue === originalContent) return;
    try {
      await fetch('/api/file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: activeFile, content: editorValue })
      });
      setOriginalContent(editorValue);
      localStorage.removeItem(`marginalia_draft_${activeFile}`);
      if (fetchGitStatusRef.current) {
        await fetchGitStatusRef.current();
      }
    } catch (err) {
      console.error('Failed to flush draft to server:', err);
    }
  }, [activeFile, editorValue, originalContent]);

  // Flush buffer on browser beforeunload or visibility change
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (activeFile && editorValue !== originalContent) {
        localStorage.setItem(`marginalia_draft_${activeFile}`, editorValue);
        try {
          const payload = JSON.stringify({ path: activeFile, content: editorValue });
          navigator.sendBeacon('/api/file', new Blob([payload], { type: 'application/json' }));
        } catch {
          // sendBeacon fallback
        }
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [activeFile, editorValue, originalContent]);

  const handleCreateFile = useCallback(async (path: string) => {
    setLoading(true);
    try {
      await fetch('/api/file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path, content: '# ' + path.replace('.md', '') + '\n\nStart writing here...' })
      });
      if (fetchFilesRef.current) {
        await fetchFilesRef.current();
      }
      setActiveFile(path);
      if (fetchGitStatusRef.current) {
        await fetchGitStatusRef.current();
      }
    } catch (err) {
      console.error('Failed to create file:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleDeleteFile = useCallback(async (path: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/file?path=${encodeURIComponent(path)}`, {
        method: 'DELETE'
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to delete file');
      }
      if (fetchFilesRef.current) {
        await fetchFilesRef.current();
      }
      if (activeFile === path) {
        setActiveFile(null);
        setEditorValue('');
        setOriginalContent('');
      }
      if (fetchGitStatusRef.current) {
        await fetchGitStatusRef.current();
      }
    } catch (err) {
      console.error('Failed to delete file:', err);
      alert(`Delete failed: ${(err as Error).message}`);
    } finally {
      setLoading(false);
    }
  }, [activeFile]);

  const handleApplyChange = useCallback((original: string, replacement: string): boolean => {
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
          if (fetchGitStatusRef.current) {
            fetchGitStatusRef.current();
          }
        } else {
          console.error('Failed to auto-save change application to disk');
        }
      }).catch(err => {
        console.error('Error auto-saving change application:', err);
      });
    }
    return true;
  }, [activeFile, editorValue]);

  const handleFormatDocument = useCallback(() => {
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
            if (fetchGitStatusRef.current) {
              fetchGitStatusRef.current();
            }
          } else {
            console.error('Failed to auto-save formatted text to disk');
          }
        }).catch(err => {
          console.error('Error auto-saving formatted text:', err);
        });
      }
    }
  }, [activeFile, editorValue]);

  return {
    activeFile,
    setActiveFile,
    editorValue,
    setEditorValue,
    originalContent,
    setOriginalContent,
    loading,
    setLoading,
    checkingGrammar,
    setCheckingGrammar,
    pageFormat,
    setPageFormat,
    wordCount,
    pageCount,
    flushDraftToServer,
    handleCreateFile,
    handleDeleteFile,
    handleApplyChange,
    handleFormatDocument
  };
}
