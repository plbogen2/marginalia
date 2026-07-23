import React, { useState, useEffect, useRef, useMemo } from 'react';
import CodeMirror, { EditorView } from '@uiw/react-codemirror';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { linter, type Diagnostic, forEachDiagnostic, setDiagnostics, setDiagnosticsEffect } from '@codemirror/lint';
import { checkGrammar } from '../utils/languagetool';
import { lintMarkdown } from '../utils/markdownLinter';
import { Copy, Scissors, Clipboard, EyeOff } from 'lucide-react';

interface EditorProps {
  value: string;
  onChange: (val: string) => void;
  activeFile: string | null;
  onCheckStatusChange?: (checking: boolean) => void;
}



const markdownStyleLinter = linter(async (view) => {
  const text = view.state.doc.toString();
  return await lintMarkdown(text);
});

export const Editor: React.FC<EditorProps> = ({ value, onChange, activeFile, onCheckStatusChange }) => {
  const grammarLinter = useMemo(() => {
    return linter(async (view) => {
      onCheckStatusChange?.(true);
      try {
        const text = view.state.doc.toString();
        const matches = await checkGrammar(text, activeFile);

        const diagnostics: Diagnostic[] = matches.map((match) => {
          let severity: 'error' | 'warning' | 'info' = 'warning';
          const isSpelling = match.rule.issueType === 'misspelling';

          if (isSpelling) {
            severity = 'error';
          } else if (match.rule.issueType === 'style') {
            severity = 'info';
          }

          const actions: { name: string; apply: (view: any, from: number, to: number) => void }[] = [];

          match.replacements.slice(0, 3).forEach((rep) => {
            actions.push({
              name: `Replace with "${rep.value}"`,
              apply: (view: any, from: number, to: number) => {
                view.dispatch({
                  changes: { from, to, insert: rep.value }
                });
              }
            });

            if (isSpelling) {
              actions.push({
                name: `Replace all with "${rep.value}"`,
                apply: (view: any) => {
                  const misspelledWord = text.slice(match.offset, match.offset + match.length);
                  const docText = view.state.doc.toString();
                  const changes: { from: number; to: number; insert: string }[] = [];
                  let pos = 0;
                  while ((pos = docText.indexOf(misspelledWord, pos)) !== -1) {
                    changes.push({
                      from: pos,
                      to: pos + misspelledWord.length,
                      insert: rep.value
                    });
                    pos += misspelledWord.length;
                  }
                  if (changes.length > 0) {
                    view.dispatch({ changes });
                  }
                }
              });
            }
          });

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
          } else {
            const ruleId = match.rule.id;
            const ruleDesc = match.rule.description || ruleId;

            actions.push({
              name: `Ignore this instance`,
              apply: (view: any) => {
                if (activeFile) {
                  fetch('/api/grammar/ignore-instance', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ruleId, sentence: match.sentence, filePath: activeFile })
                  });
                }
                const remaining: any[] = [];
                forEachDiagnostic(view.state, (d: any) => {
                  if (!(d.ruleId === ruleId && d.from === match.offset)) {
                    remaining.push(d);
                  }
                });
                view.dispatch(setDiagnostics(view.state, remaining));
                view.focus();
              }
            });

            actions.push({
              name: `Ignore rule in workspace: ${ruleDesc}`,
              apply: (view: any) => {
                fetch('/api/grammar/ignore', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ ruleId, scope: 'workspace' })
                });
                const remaining: any[] = [];
                forEachDiagnostic(view.state, (d: any) => {
                  if (d.ruleId !== ruleId) {
                    remaining.push(d);
                  }
                });
                view.dispatch(setDiagnostics(view.state, remaining));
                view.focus();
              }
            });

            actions.push({
              name: `Ignore rule globally: ${ruleDesc}`,
              apply: (view: any) => {
                fetch('/api/grammar/ignore', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ ruleId, scope: 'global' })
                });
                const remaining: any[] = [];
                forEachDiagnostic(view.state, (d: any) => {
                  if (d.ruleId !== ruleId) {
                    remaining.push(d);
                  }
                });
                view.dispatch(setDiagnostics(view.state, remaining));
                view.focus();
              }
            });
          }

          const diag: Diagnostic = {
            from: match.offset,
            to: match.offset + match.length,
            severity,
            message: match.message,
            actions
          };
          (diag as any).ruleId = match.rule.id;
          (diag as any).sentence = match.sentence;
          return diag;
        });

        return diagnostics;
      } finally {
        onCheckStatusChange?.(false);
      }
    }, {
      delay: 1500
    });
  }, [activeFile, onCheckStatusChange]);
  const editorRef = useRef<any>(null);
  const [diagnostics, setDiagnosticsList] = useState<{ line: number; severity: string }[]>([]);
  const [totalLines, setTotalLines] = useState<number>(1);

  const scrollToLine = (lineNumber: number) => {
    const view = editorRef.current;
    if (!view) return;
    try {
      const line = view.state.doc.line(lineNumber);
      view.dispatch({
        effects: EditorView.scrollIntoView(line.from, { y: 'center' }),
        selection: { anchor: line.from }
      });
      view.focus();
    } catch (e) {
      console.error('Failed to scroll to line:', e);
    }
  };

  const handleGutterClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clickY = e.clientY - rect.top;
    const pct = clickY / rect.height;
    const targetLine = Math.max(1, Math.min(totalLines, Math.round(pct * totalLines)));
    scrollToLine(targetLine);
  };

  const [contextMenu, setContextMenu] = useState<{ 
    x: number; 
    y: number; 
    word: string | null;
    suggestions?: { name: string; apply: (view: any, from: number, to: number) => void }[];
    range?: { from: number; to: number };
  } | null>(null);

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
    let suggestions: any[] | undefined;
    let range: { from: number; to: number } | undefined;

    if (pos !== null) {
      forEachDiagnostic(view.state, (d: any) => {
        if (pos >= d.from && pos <= d.to) {
          const word = view.state.doc.sliceString(d.from, d.to);
          spellingErrorWord = word;
          suggestions = d.actions;
          range = { from: d.from, to: d.to };
        }
      });
    }

    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      word: spellingErrorWord,
      suggestions,
      range
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

  const dedupedDiagnostics = React.useMemo(() => {
    const map: { [line: number]: { line: number; severity: string } } = {};
    const severityPriority: { [key: string]: number } = { error: 3, warning: 2, info: 1 };

    diagnostics.forEach((d) => {
      const existing = map[d.line];
      if (!existing) {
        map[d.line] = d;
      } else {
        const currentPriority = severityPriority[d.severity] || 0;
        const existingPriority = severityPriority[existing.severity] || 0;
        if (currentPriority > existingPriority) {
          map[d.line] = d;
        }
      }
    });

    return Object.values(map);
  }, [diagnostics]);

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
      <div className="editor-cm-wrapper" onContextMenu={handleContextMenu}>
        <CodeMirror
          onCreateEditor={(view) => {
            editorRef.current = view;
            setTotalLines(view.state.doc.lines);
          }}
          className="editor-cm-container"
          value={value}
          height="100%"
          extensions={[
            markdown({ base: markdownLanguage }),
            EditorView.lineWrapping,
            grammarLinter,
            markdownStyleLinter,
            EditorView.updateListener.of((update) => {
              const hasDiagEffect = update.transactions.some(tr => tr.effects.some(e => e.is(setDiagnosticsEffect)));
              const linesChanged = update.state.doc.lines !== update.startState.doc.lines;

              if (hasDiagEffect || linesChanged) {
                const list: { line: number; severity: string }[] = [];
                forEachDiagnostic(update.state, (d) => {
                  try {
                    const line = update.state.doc.lineAt(d.from);
                    list.push({
                      line: line.number,
                      severity: d.severity
                    });
                  } catch (e) {
                    // ignore
                  }
                });
                setDiagnosticsList(list);
                setTotalLines(update.state.doc.lines);
              }
            })
          ]}
          onChange={(val) => onChange(val)}
          theme="dark"
          basicSetup={{
            lineNumbers: false,
            foldGutter: false,
            highlightActiveLine: false
          }}
        />

        {dedupedDiagnostics.length > 0 && (
          <div className="editor-minimap-gutter" onClick={handleGutterClick}>
            {dedupedDiagnostics.map((d, index) => {
              const topPct = ((d.line - 1) / Math.max(1, totalLines)) * 100;
              return (
                <div
                  key={index}
                  className={`minimap-tick ${d.severity}`}
                  style={{ top: `${topPct}%` }}
                  onClick={(e) => {
                    e.stopPropagation();
                    scrollToLine(d.line);
                  }}
                  title={`Go to ${d.severity} on line ${d.line}`}
                />
              );
            })}
          </div>
        )}

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
                {contextMenu.suggestions && contextMenu.suggestions.map((s, idx) => (
                  <button
                    key={idx}
                    className="context-menu-item suggestion-item"
                    onClick={() => {
                      const view = editorRef.current;
                      if (view && contextMenu.range) {
                        s.apply(view, contextMenu.range.from, contextMenu.range.to);
                        setContextMenu(null);
                      }
                    }}
                  >
                    <span>{s.name}</span>
                  </button>
                ))}
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
