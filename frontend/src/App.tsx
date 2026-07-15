import { useState, useEffect, useRef, useCallback } from 'react';
import { Sidebar } from './components/Sidebar';
import { Editor } from './components/Editor';
import { Preview } from './components/Preview';
import { GitBar } from './components/GitBar';
import { WorkspaceManager } from './components/WorkspaceManager';
import './App.css';
import { resolveRelativePath } from './utils/pathResolver';
import { ArrowLeft, ArrowRight, Settings, LogOut } from 'lucide-react';
import { SettingsModal } from './components/SettingsModal';

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
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [previewOpen, setPreviewOpen] = useState(true);
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const [hasRemote, setHasRemote] = useState(false);
  const [gitAhead, setGitAhead] = useState(0);
  const [hasGemini, setHasGemini] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [authInfo, setAuthInfo] = useState<{ loggedIn: boolean, user: string | null, isOAuthMode: boolean } | null>(null);

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

  const handleLogout = async () => {
    try {
      const res = await fetch('/api/auth/logout', { method: 'POST' });
      if (res.ok) {
        setAuthInfo({ loggedIn: false, user: null, isOAuthMode: true });
        setActiveFile(null);
        setEditorValue('');
      }
    } catch (err) {
      console.error('Failed to log out:', err);
    }
  };

  const selectFile = (filePath: string | null) => {
    setActiveFile(filePath);
    let newUrl = window.location.origin + '/';
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

  const fetchFiles = async () => {
    try {
      const res = await fetch('/api/files');
      if (!res.ok) throw new Error('Failed to fetch files');
      const data = await res.json();
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
      if (!res.ok) throw new Error('Failed to fetch git status');
      const data = await res.json();
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
      if (!res.ok) throw new Error('Failed to fetch git branch');
      const data = await res.json();
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
      alert(`Pushed: ${data.result}`);
      await fetchGitStatus();
    } catch (err) {
      console.error('Failed to push:', err);
      alert(`Push failed: ${(err as Error).message}`);
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
      alert(`Pulled: ${data.result}`);
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
      alert(`Pull failed: ${(err as Error).message}`);
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
      />
      <div className="main-layout">
        {sidebarOpen && (
          <>
            <Sidebar
              files={files}
              activeFile={activeFile}
              onSelectFile={selectFile}
              onCreateFile={handleCreateFile}
              onDeleteFile={handleDeleteFile}
              width={sidebarWidth}
            />
            <div className="sidebar-resizer" onMouseDown={startResizing} />
          </>
        )}
        <div className="workspace">
          <div className="workspace-toolbar">
            <div className="nav-buttons">
              <button onClick={() => window.history.back()} title="Go Back">
                <ArrowLeft size={14} />
              </button>
              <button onClick={() => window.history.forward()} title="Go Forward">
                <ArrowRight size={14} />
              </button>
            </div>
            <button onClick={() => setSidebarOpen(!sidebarOpen)}>
              {sidebarOpen ? 'Hide Sidebar' : 'Show Sidebar'}
            </button>
            <button onClick={() => setPreviewOpen(!previewOpen)}>
              {previewOpen ? 'Hide Preview' : 'Show Preview'}
            </button>
            <button onClick={() => setSettingsOpen(true)} title="Settings" className="settings-btn">
              <Settings size={14} />
            </button>
            {authInfo.isOAuthMode && authInfo.loggedIn && (
              <div className="auth-toolbar-section">
                <span className="user-badge">Logged in as {authInfo.user}</span>
                <button onClick={handleLogout} title="Log Out" className="logout-btn">
                  <LogOut size={14} />
                </button>
              </div>
            )}
            {loading && <span className="loading-indicator">Loading...</span>}
          </div>
          <div className="panels-container">
            <Editor
              value={editorValue}
              onChange={setEditorValue}
              activeFile={activeFile}
            />
            {previewOpen && activeFile && (
              <Preview markdown={editorValue} onNavigateLink={handleNavigateLink} />
            )}
          </div>
        </div>
      </div>
      {workspaceOpen && (
        <WorkspaceManager
          onClose={() => setWorkspaceOpen(false)}
          onWorkspaceChanged={(newName) => {
            setActiveWorkspaceName(newName);
            setActiveFile(null);
            setEditorValue('');
            setOriginalContent('');
            window.history.pushState(null, '', `/${encodeURIComponent(newName)}/`);
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
        />
      )}
    </div>
  );
}

export default App;
