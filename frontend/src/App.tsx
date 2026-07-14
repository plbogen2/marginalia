import { useState, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { Editor } from './components/Editor';
import { Preview } from './components/Preview';
import { GitBar } from './components/GitBar';
import './App.css';

function App() {
  const [files, setFiles] = useState<string[]>([]);
  const [activeFile, setActiveFile] = useState<string | null>(null);
  const [editorValue, setEditorValue] = useState('');
  const [originalContent, setOriginalContent] = useState('');
  const [gitStatus, setGitStatus] = useState('');
  const [gitBranch, setGitBranch] = useState('');
  const [loading, setLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [previewOpen, setPreviewOpen] = useState(true);

  const fetchFiles = async () => {
    try {
      const res = await fetch('/api/files');
      const data = await res.json();
      setFiles(data);
    } catch (err) {
      console.error('Failed to fetch files:', err);
    }
  };

  const fetchGitStatus = async () => {
    try {
      const res = await fetch('/api/git/status');
      const data = await res.json();
      setGitStatus(data.status);
    } catch (err) {
      console.error('Failed to fetch git status:', err);
    }
  };

  const fetchGitBranch = async () => {
    try {
      const res = await fetch('/api/git/branch');
      const data = await res.json();
      setGitBranch(data.branch);
    } catch (err) {
      console.error('Failed to fetch git branch:', err);
    }
  };

  useEffect(() => {
    fetchFiles();
    fetchGitStatus();
    fetchGitBranch();
  }, []);

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

  return (
    <div className="app-container">
      <GitBar
        status={gitStatus}
        branch={gitBranch}
        onCommit={handleCommit}
        onPush={handlePush}
        onPull={handlePull}
        onRefresh={handleRefresh}
        loading={loading}
      />
      <div className="main-layout">
        {sidebarOpen && (
          <Sidebar
            files={files}
            activeFile={activeFile}
            onSelectFile={setActiveFile}
            onCreateFile={handleCreateFile}
          />
        )}
        <div className="workspace">
          <div className="workspace-toolbar">
            <button onClick={() => setSidebarOpen(!sidebarOpen)}>
              {sidebarOpen ? 'Hide Sidebar' : 'Show Sidebar'}
            </button>
            <button onClick={() => setPreviewOpen(!previewOpen)}>
              {previewOpen ? 'Hide Preview' : 'Show Preview'}
            </button>
            {loading && <span className="loading-indicator">Loading...</span>}
          </div>
          <div className="panels-container">
            <Editor
              value={editorValue}
              onChange={setEditorValue}
              activeFile={activeFile}
            />
            {previewOpen && activeFile && (
              <Preview markdown={editorValue} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
