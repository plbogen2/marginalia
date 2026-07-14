import React, { useState, useEffect, useRef } from 'react';
import CodeMirror, { EditorView } from '@uiw/react-codemirror';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { linter, type Diagnostic, forEachDiagnostic, setDiagnostics } from '@codemirror/lint';
import { checkGrammar } from '../utils/languagetool';
import { Copy, Scissors, Clipboard, EyeOff } from 'lucide-react';

interface EditorProps {
  value: string;
  onChange: (val: string) => void;
  activeFile: string | null;
}

const grammarLinter = linter(async (view) => {
  const text = view.state.doc.toString();
  const matches = await checkGrammar(text);

  const diagnostics: Diagnostic[] = matches.map((match) => {
    let severity: 'error' | 'warning' | 'info' = 'warning';
    const isSpelling = match.rule.issueType === 'misspelling';

    if (isSpelling) {
      severity = 'error';
    } else if (match.rule.issueType === 'style') {
      severity = 'info';
    }

    const actions = match.replacements.slice(0, 3).map((rep) => ({
      name: `Replace with "${rep.value}"`,
      apply: (view: any, from: number, to: number) => {
        view.dispatch({
          changes: { from, to, insert: rep.value }
        });
      }
    }));

    if (isSpelling) {
      const misspelledWord = text.slice(match.offset, match.offset + match.length);
      actions.push({
        name: `Ignore globally`,
        apply: (view: any) => {
          fetch('/api/dictionary/add', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ word: misspelledWord, scope: 'global' })
          });
          const remaining: any[] = [];
          forEachDiagnostic(view.state, (d: any) => {
            const word = view.state.doc.sliceString(d.from, d.to);
            if (word.toLowerCase() !== misspelledWord.toLowerCase()) {
              remaining.push(d);
            }
          });
          view.dispatch(setDiagnostics(view.state, remaining));
          view.focus();
        }
      } as any);
      actions.push({
        name: `Ignore in workspace`,
        apply: (view: any) => {
          fetch('/api/dictionary/add', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ word: misspelledWord, scope: 'workspace' })
          });
          const remaining: any[] = [];
          forEachDiagnostic(view.state, (d: any) => {
            const word = view.state.doc.sliceString(d.from, d.to);
            if (word.toLowerCase() !== misspelledWord.toLowerCase()) {
              remaining.push(d);
            }
          });
          view.dispatch(setDiagnostics(view.state, remaining));
          view.focus();
        }
      } as any);
    }

    return {
      from: match.offset,
      to: match.offset + match.length,
      severity,
      message: match.message,
      actions
    };
  });

  return diagnostics;
}, {
  delay: 1500
});

export const Editor: React.FC<EditorProps> = ({ value, onChange, activeFile }) => {
  const wordCount = value.trim() ? value.trim().split(/\s+/).length : 0;
  const charCount = value.length;

  const editorRef = useRef<any>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, word: string | null } | null>(null);

  useEffect(() => {
    const handleGlobalClick = () => {
      setContextMenu(null);
    };
    window.addEventListener('click', handleGlobalClick);
    return () => {
      window.removeEventListener('click', handleGlobalClick);
    };
  }, []);

  const handleContextMenu = (e: React.MouseEvent) => {
    const view = editorRef.current;
    if (!view) return;

    e.preventDefault();

    const pos = view.posAtCoords({ x: e.clientX, y: e.clientY });
    let spellingErrorWord: string | null = null;

    if (pos !== null) {
      forEachDiagnostic(view.state, (d: any) => {
        if (pos >= d.from && pos <= d.to) {
          const word = view.state.doc.sliceString(d.from, d.to);
          spellingErrorWord = word;
        }
      });
    }

    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      word: spellingErrorWord
    });
  };

  const handleCopy = () => {
    const view = editorRef.current;
    if (!view) return;
    const { from, to } = view.state.selection.main;
    const text = view.state.sliceDoc(from, to);
    navigator.clipboard.writeText(text);
    setContextMenu(null);
  };

  const handleCut = () => {
    const view = editorRef.current;
    if (!view) return;
    const { from, to } = view.state.selection.main;
    const text = view.state.sliceDoc(from, to);
    navigator.clipboard.writeText(text);
    view.dispatch({
      changes: { from, to, insert: '' },
      selection: { anchor: from }
    });
    setContextMenu(null);
  };

  const handlePaste = async () => {
    const view = editorRef.current;
    if (!view) return;
    try {
      const text = await navigator.clipboard.readText();
      const { from, to } = view.state.selection.main;
      view.dispatch({
        changes: { from, to, insert: text },
        selection: { anchor: from + text.length }
      });
    } catch (err) {
      console.error('Failed to read clipboard:', err);
    }
    setContextMenu(null);
  };

  const handleIgnoreWord = (scope: 'global' | 'workspace') => {
    if (!contextMenu?.word) return;
    const wordToIgnore = contextMenu.word;
    const view = editorRef.current;
    if (!view) return;

    fetch('/api/dictionary/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ word: wordToIgnore, scope })
    });

    const remaining: any[] = [];
    forEachDiagnostic(view.state, (d: any) => {
      const word = view.state.doc.sliceString(d.from, d.to);
      if (word.toLowerCase() !== wordToIgnore.toLowerCase()) {
        remaining.push(d);
      }
    });
    view.dispatch(setDiagnostics(view.state, remaining));
    view.focus();
    setContextMenu(null);
  };

  if (!activeFile) {
    return (
      <div className="editor-empty">
        <p>Select a file from the sidebar or create a new one to start writing.</p>
      </div>
    );
  }

  const isSelectionEmpty = editorRef.current
    ? editorRef.current.state.selection.main.empty
    : true;

  return (
    <div className="editor-container">
      <div className="editor-header">
        <span className="file-path">{activeFile}</span>
        <div className="stats">
          <span>{wordCount} words</span>
          <span>{charCount} chars</span>
        </div>
      </div>
      <div className="editor-cm-wrapper" onContextMenu={handleContextMenu}>
        <CodeMirror
          onCreateEditor={(view) => {
            editorRef.current = view;
          }}
          className="editor-cm-container"
          value={value}
          height="100%"
          extensions={[
            markdown({ base: markdownLanguage }),
            EditorView.lineWrapping,
            grammarLinter
          ]}
          onChange={(val) => onChange(val)}
          theme="dark"
          basicSetup={{
            lineNumbers: false,
            foldGutter: false,
            highlightActiveLine: false
          }}
        />

        {contextMenu && (
          <div
            className="editor-context-menu"
            style={{ top: contextMenu.y, left: contextMenu.x }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={handleCut}
              disabled={isSelectionEmpty}
              className="context-menu-item"
            >
              <Scissors size={14} />
              <span>Cut</span>
            </button>
            <button
              onClick={handleCopy}
              disabled={isSelectionEmpty}
              className="context-menu-item"
            >
              <Copy size={14} />
              <span>Copy</span>
            </button>
            <button onClick={handlePaste} className="context-menu-item">
              <Clipboard size={14} />
              <span>Paste</span>
            </button>

            {contextMenu.word && (
              <>
                <div className="context-menu-separator" />
                <button
                  onClick={() => handleIgnoreWord('workspace')}
                  className="context-menu-item"
                >
                  <EyeOff size={14} />
                  <span>Ignore in Workspace ("{contextMenu.word}")</span>
                </button>
                <button
                  onClick={() => handleIgnoreWord('global')}
                  className="context-menu-item"
                >
                  <EyeOff size={14} />
                  <span>Ignore Globally ("{contextMenu.word}")</span>
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
