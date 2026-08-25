import { useState, useEffect, lazy, Suspense } from 'react';
import { Sidebar } from './components/Sidebar';
import { Editor } from './components/Editor';
import { Preview } from './components/Preview';
import { GitBar } from './components/GitBar';
import { TtsPlayerBar } from './components/TtsPlayerBar';
import './App.scss';

import { useAuth } from './hooks/useAuth';
import { useSidebarResize } from './hooks/useSidebarResize';
import { useWorkspace } from './hooks/useWorkspace';
import { useGit } from './hooks/useGit';
import { useEditorSession } from './hooks/useEditorSession';
import { useAiCoWriter } from './hooks/useAiCoWriter';
import { useAudio } from './hooks/useAudio';
import { useScrollSync } from './hooks/useScrollSync';

import { ChevronRight, Eye, EyeOff, Sparkles, Loader2, Mic, MicOff, Volume2, VolumeX, Pen, PenOff } from 'lucide-react';

// Lazy-loaded secondary modals and panels to enable code-splitting
const WorkspaceManager = lazy(() => import('./components/WorkspaceManager').then(m => ({ default: m.WorkspaceManager })));
const SettingsModal = lazy(() => import('./components/SettingsModal').then(m => ({ default: m.SettingsModal })));
const AdminDashboardModal = lazy(() => import('./components/AdminDashboardModal').then(m => ({ default: m.AdminDashboardModal })));
const MarkdownGuideModal = lazy(() => import('./components/MarkdownGuideModal').then(m => ({ default: m.MarkdownGuideModal })));
const AboutModal = lazy(() => import('./components/AboutModal').then(m => ({ default: m.AboutModal })));
const GitDiffModal = lazy(() => import('./components/GitDiffModal').then(m => ({ default: m.GitDiffModal })));
const AiPanel = lazy(() => import('./components/AiPanel').then(m => ({ default: m.AiPanel })));

function App() {
  // Authentication & Server Lifecycle
  const { authInfo, handleLogout } = useAuth();

  // Layout & Resizing
  const { sidebarWidth, startResizing } = useSidebarResize(250);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [previewOpen, setPreviewOpen] = useState(true);

  // Modal Visibility State
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [diffOpen, setDiffOpen] = useState(false);

  // Editor Session & Document Lifecycle
  const editorSession = useEditorSession({
    fetchFiles: async () => {
      await workspace.fetchFiles();
    },
    fetchGitStatus: async () => {
      await git.fetchGitStatus();
    }
  });

  const {
    activeFile,
    setActiveFile,
    editorValue,
    setEditorValue,
    setOriginalContent,
    loading,
    checkingGrammar,
    setCheckingGrammar,
    pageFormat,
    setPageFormat,
    wordCount,
    pageCount,
    handleCreateFile,
    handleDeleteFile,
    handleApplyChange,
    handleFormatDocument
  } = editorSession;

  // Workspace & File Navigation
  const workspace = useWorkspace({
    authInfo,
    activeFile,
    setActiveFile,
    setLoading: editorSession.setLoading,
    onWorkspaceOrFilesRefreshed: async () => {
      await git.fetchGitStatus();
      await git.fetchGitBranch();
    }
  });

  const {
    files,
    fetchFiles,
    setActiveWorkspaceName,
    selectFile,
    handleNavigateLink
  } = workspace;

  // Git VCS State & Actions
  const git = useGit({
    setLoading: editorSession.setLoading,
    fetchFiles,
    activeFile,
    setEditorValue,
    setOriginalContent
  });

  const {
    gitStatus,
    gitBranch,
    hasRemote,
    gitAhead,
    hasGemini,
    fetchGitStatus,
    handleRefresh,
    handleCommit,
    handlePush,
    handlePull
  } = git;

  // AI Co-Writer & Editorial Assistant
  const {
    aiPanelOpen,
    setAiPanelOpen,
    selectedPersona,
    setSelectedPersona,
    writeWithMeLoading,
    writeWithMeActive,
    setWriteWithMeActive,
    writeWithMeMessages,
    selectedContextFiles,
    setSelectedContextFiles,
    selectedText,
    setSelectedText,
    triggerInlineSuggestion,
    deactivateWriteWithMe
  } = useAiCoWriter({ activeFile });

  // Audio (Dictation & Text-to-Speech)
  const {
    isDictating,
    toggleDictation,
    isSpeaking,
    isPaused,
    isTtsLoading,
    currentChunkIndex,
    totalChunks,
    currentChunkText,
    playbackSpeed,
    setCursorOffset,
    toggleReadAloud,
    togglePause,
    skipNext,
    skipPrevious,
    skipForwardSeconds,
    skipBackwardSeconds,
    seekToChunk,
    setPlaybackSpeed,
    stopSpeech
  } = useAudio({
    editorValue,
    setEditorValue,
    selectedText,
    activeFile
  });

  // Bidirectional scroll sync
  useScrollSync(activeFile, previewOpen);

  // F1 Help Shortcut
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
        onOpenAdmin={() => setAdminOpen(true)}
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
                  className={`read-aloud-btn ${isSpeaking ? 'active speaking' : ''} ${isTtsLoading ? 'loading' : ''}`}
                  onClick={toggleReadAloud}
                  title={
                    isTtsLoading
                      ? "Synthesizing neural speech with Parlando... Click to cancel"
                      : isSpeaking
                      ? "Stop Read Aloud"
                      : "Read Chapter Aloud (TTS)"
                  }
                >
                  {isTtsLoading ? (
                    <Loader2 size={14} className="spin-icon" />
                  ) : isSpeaking ? (
                    <VolumeX size={14} />
                  ) : (
                    <Volume2 size={14} />
                  )}
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
                  <>
                    <button
                      type="button"
                      className={`write-with-me-btn ${writeWithMeActive ? 'active' : ''}`}
                      onClick={() => setWriteWithMeActive(!writeWithMeActive)}
                      title={writeWithMeActive ? "Exit Co-Writer Mode" : "Start Co-Writer Mode"}
                    >
                      {writeWithMeActive ? <PenOff size={14} /> : <Pen size={14} />}
                    </button>
                    <button
                      type="button"
                      className={`ai-toggle-btn ${aiPanelOpen ? 'active' : ''}`}
                      onClick={() => setAiPanelOpen(!aiPanelOpen)}
                      title={aiPanelOpen ? "Hide AI Editor Panel" : "Show AI Editor Panel"}
                    >
                      <Sparkles size={14} />
                    </button>
                  </>
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
              onSelectionChange={setSelectedText}
              writeWithMeActive={writeWithMeActive}
              writeWithMeMessages={writeWithMeMessages}
              writeWithMeLoading={writeWithMeLoading}
              onTriggerSuggestion={triggerInlineSuggestion}
              onDismissSuggestion={deactivateWriteWithMe}
            />
            {previewOpen && activeFile && (
              <Preview markdown={editorValue} onNavigateLink={handleNavigateLink} />
            )}
            {aiPanelOpen && activeFile && hasGemini && (
              <Suspense fallback={<div className="ai-panel-loading">Loading AI Assistant...</div>}>
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
              </Suspense>
            )}
          </div>
          <TtsPlayerBar
            isSpeaking={isSpeaking}
            isPaused={isPaused}
            isTtsLoading={isTtsLoading}
            currentChunkIndex={currentChunkIndex}
            totalChunks={totalChunks}
            currentChunkText={currentChunkText}
            playbackSpeed={playbackSpeed}
            activeFile={activeFile}
            onTogglePause={togglePause}
            onSkipNext={skipNext}
            onSkipPrevious={skipPrevious}
            onSkipForward={skipForwardSeconds}
            onSkipBackward={skipBackwardSeconds}
            onSeekToChunk={seekToChunk}
            onChangeSpeed={setPlaybackSpeed}
            onStop={stopSpeech}
          />
        </div>
      </div>
      <Suspense fallback={null}>
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
            onOpenAdmin={() => setAdminOpen(true)}
            isAdmin={authInfo?.isAdmin}
          />
        )}
        {adminOpen && (
          <AdminDashboardModal
            onClose={() => setAdminOpen(false)}
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
      </Suspense>
    </div>
  );
}

export default App;
