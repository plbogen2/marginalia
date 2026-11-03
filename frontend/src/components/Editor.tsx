import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import CodeMirror, { EditorView, keymap } from '@uiw/react-codemirror';
import { history, historyKeymap, defaultKeymap } from '@codemirror/commands';
import { showPanel } from '@codemirror/view';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { autocompletion, type CompletionContext, type CompletionResult } from '@codemirror/autocomplete';
import { linter, type Diagnostic, forEachDiagnostic, setDiagnostics, setDiagnosticsEffect } from '@codemirror/lint';
import { checkGrammar } from '../utils/languagetool';
import { lintMarkdown } from '../utils/markdownLinter';
import { Copy, Scissors, Clipboard, EyeOff } from 'lucide-react';

import { type ChatMessage } from '../utils/aiParser';
import type { GlossaryTerm } from '../hooks/useGlossary';

interface EditorProps {
  value: string;
  onChange: (val: string) => void;
  activeFile: string | null;
  locateText?: { text: string; timestamp: number } | null;
  onCheckStatusChange?: (checking: boolean) => void;
  onCursorChange?: (offset: number) => void;
  onSelectionChange?: (selectedText: string | null) => void;
  writeWithMeActive?: boolean;
  writeWithMeMessages?: ChatMessage[];
  writeWithMeLoading?: boolean;
  onTriggerSuggestion?: (userMessage?: string) => void;
  onDismissSuggestion?: () => void;
  glossaryTerms?: GlossaryTerm[];
  enableGlossaryAutocomplete?: boolean;
}

const markdownStyleLinter = linter(async (view) => {
  const text = view.state.doc.toString();
  return await lintMarkdown(text);
});

const WriteWithMePanelInner: React.FC<{
  messages: ChatMessage[];
  loading: boolean;
  onSendMessage?: (msg: string) => void;
  onClose?: () => void;
}> = ({ messages, loading, onSendMessage, onClose }) => {
  const [input, setInput] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || loading) return;
    onSendMessage?.(input.trim());
    setInput('');
  };

  const displayMessages = messages.filter(m => m.role === 'user' || m.role === 'model');

  return (
    <div className="write-with-me-inner">
      <div className="panel-header">
        <span className="panel-title">Co-Writer Mode</span>
        <button type="button" className="close-btn" onClick={onClose} title="Exit Co-Writer Mode">
          ✕
        </button>
      </div>
      
      <div className="messages-list">
        {displayMessages.length === 0 ? (
          <div className="empty-message">Type a message or start writing to get feedback.</div>
        ) : (
          displayMessages.map((msg) => (
            <div key={msg.id} className={`message-row ${msg.role}`}>
              <div className="message-bubble">
                <span className="sender">{msg.role === 'model' ? 'Co-Writer' : 'You'}: </span>
                <span className="content">{msg.content}</span>
              </div>
            </div>
          ))
        )}
        {loading && (
          <div className="message-row model loading">
            <div className="message-bubble">
              <span>Co-Writer is thinking...</span>
            </div>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      <form onSubmit={handleSubmit} className="input-row">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Respond to the co-writer..."
          disabled={loading}
        />
        <button type="submit" disabled={loading || !input.trim()}>
          Send
        </button>
      </form>
    </div>
  );
};

export const Editor: React.FC<EditorProps> = ({ 
  value, 
  onChange, 
  activeFile, 
  locateText,
  onCheckStatusChange, 
  onCursorChange, 
  onSelectionChange,
  writeWithMeActive = false,
  writeWithMeMessages = [],
  writeWithMeLoading = false,
  onTriggerSuggestion,
  onDismissSuggestion,
  glossaryTerms = [],
  enableGlossaryAutocomplete = true
}) => {
  const [panelContainer] = useState(() => document.createElement("div"));

  const glossaryCompletionExtension = useMemo(() => {
    if (enableGlossaryAutocomplete === false || !glossaryTerms || glossaryTerms.length === 0) {
      return [];
    }

    const glossarySource = (context: CompletionContext): CompletionResult | null => {
      const word = context.matchBefore(/[\p{L}\p{N}'-]+/u);
      if (!word || (word.from === word.to && !context.explicit)) {
        return null;
      }
      const query = word.text.toLowerCase();
      if (query.length < 2 && !context.explicit) {
        return null;
      }

      const matches = glossaryTerms.filter(item =>
        item.normalized.startsWith(query) ||
        item.normalized.includes(query) ||
        item.term.toLowerCase().startsWith(query)
      ).slice(0, 25);

      if (matches.length === 0) return null;

      return {
        from: word.from,
        options: matches.map(item => ({
          label: item.term,
          type: 'keyword',
          detail: item.definition ? (item.definition.length > 50 ? item.definition.slice(0, 47) + '...' : item.definition) : undefined,
          info: item.definition ? `${item.term}\n\n${item.definition}\n\n[Source: ${item.file}]` : `Source: ${item.file}`,
          boost: item.term.toLowerCase().startsWith(query) ? 2 : 1
        }))
      };
    };

    return autocompletion({
      override: [glossarySource],
      defaultKeymap: true,
      activateOnTyping: true
    });
  }, [glossaryTerms, enableGlossaryAutocomplete]);

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

            actions.push({
              name: `Replace all with "${rep.value}"`,
              apply: (view: any) => {
                const matchedText = text.slice(match.offset, match.offset + match.length);
                const docText = view.state.doc.toString();
                const changes: { from: number; to: number; insert: string }[] = [];
                let pos = 0;
                while ((pos = docText.indexOf(matchedText, pos)) !== -1) {
                  changes.push({
                    from: pos,
                    to: pos + matchedText.length,
                    insert: rep.value
                  });
                  pos += matchedText.length;
                }
                if (changes.length > 0) {
                  view.dispatch({ changes });
                }
              }
            });
          });

          if (isSpelling) {
            const rawWord = text.slice(match.offset, match.offset + match.length);
            const cleanToken = rawWord.trim().replace(/^['"“‘—\-]+|['"”’—\-]+$/g, '');
            const targetWord = cleanToken || rawWord.trim();

            actions.push({
              name: `Ignore in workspace ("${targetWord}")`,
              apply: async (view: any) => {
                try {
                  await fetch('/api/dictionary/add', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ word: targetWord, scope: 'workspace' })
                  });
                } catch (e) {
                  console.error('Failed to ignore in workspace:', e);
                }
                const norm = targetWord.toLowerCase();
                const remaining: any[] = [];
                forEachDiagnostic(view.state, (d: any) => {
                  const w = view.state.doc.sliceString(d.from, d.to).trim().toLowerCase();
                  const clean = w.replace(/^['"“‘—\-]+|['"”’—\-]+$/g, '');
                  if (clean !== norm && !clean.startsWith(norm + "'") && !clean.startsWith(norm + "’")) {
                    remaining.push(d);
                  }
                });
                view.dispatch(setDiagnostics(view.state, remaining));
                view.focus();
              }
            } as any);
            actions.push({
              name: `Ignore globally ("${targetWord}")`,
              apply: async (view: any) => {
                try {
                  await fetch('/api/dictionary/add', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ word: targetWord, scope: 'global' })
                  });
                } catch (e) {
                  console.error('Failed to ignore globally:', e);
                }
                const norm = targetWord.toLowerCase();
                const remaining: any[] = [];
                forEachDiagnostic(view.state, (d: any) => {
                  const w = view.state.doc.sliceString(d.from, d.to).trim().toLowerCase();
                  const clean = w.replace(/^['"“‘—\-]+|['"”’—\-]+$/g, '');
                  if (clean !== norm && !clean.startsWith(norm + "'") && !clean.startsWith(norm + "’")) {
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
  const writeWithMeExtension = useMemo(() => {
    if (writeWithMeActive) {
      return showPanel.of((_view) => {
        panelContainer.className = "cm-write-with-me-panel";
        return { dom: panelContainer, top: true };
      });
    }
    return [];
  }, [writeWithMeActive, panelContainer]);

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

  useEffect(() => {
    if (!locateText?.text || !editorRef.current) return;
    const view = editorRef.current;
    const docText = view.state.doc.toString();
    const rawTarget = locateText.text.trim();
    if (!rawTarget) return;

    // Search directly, or stripped of surrounding smart/straight quotes
    let idx = docText.indexOf(rawTarget);
    let matchedLength = rawTarget.length;

    if (idx === -1) {
      const cleanTarget = rawTarget.replace(/^["'“‘]+|["'”’]+$/g, '').trim();
      if (cleanTarget) {
        idx = docText.indexOf(cleanTarget);
        matchedLength = cleanTarget.length;
      }
    }

    // Try case-insensitive fallback if exact match wasn't found
    if (idx === -1) {
      const lowerDoc = docText.toLowerCase();
      const lowerTarget = rawTarget.toLowerCase();
      idx = lowerDoc.indexOf(lowerTarget);
      if (idx === -1) {
        const cleanLower = rawTarget.replace(/^["'“‘]+|["'”’]+$/g, '').trim().toLowerCase();
        if (cleanLower) {
          idx = lowerDoc.indexOf(cleanLower);
          matchedLength = cleanLower.length;
        }
      }
    }

    if (idx !== -1) {
      try {
        view.dispatch({
          selection: { anchor: idx, head: idx + matchedLength },
          effects: EditorView.scrollIntoView(idx, { y: 'center' }),
          scrollIntoView: true
        });
        view.focus();
      } catch (err) {
        console.error('Failed to jump to quote in editor:', err);
      }
    }
  }, [locateText]);

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
          suggestions = d.actions;
          range = { from: d.from, to: d.to };

          const docSlice = view.state.doc.sliceString(d.from, d.to).trim();
          const cleanToken = docSlice.replace(/^['"“‘—\-]+|['"”’—\-]+$/g, '');
          if (!/\s/.test(cleanToken) && cleanToken.length > 0) {
            spellingErrorWord = cleanToken;
          }
        }
      });

      // If no diagnostic gave a clean single word, extract the hovered word token at pos
      if (!spellingErrorWord) {
        const line = view.state.doc.lineAt(pos);
        const lineText = line.text;
        const col = pos - line.from;
        const beforeMatch = lineText.slice(0, col).match(/[a-zA-Z0-9_\u00C0-\u024F\u1E00-\u1EFF'-]+$/);
        const afterMatch = lineText.slice(col).match(/^[a-zA-Z0-9_\u00C0-\u024F\u1E00-\u1EFF'-]+/);
        const wordAtPos = (beforeMatch ? beforeMatch[0] : '') + (afterMatch ? afterMatch[0] : '');
        const cleanWord = wordAtPos.replace(/^['"“‘—\-]+|['"”’—\-]+$/g, '');
        if (cleanWord.length > 0 && !/\s/.test(cleanWord)) {
          spellingErrorWord = cleanWord;
        }
      }
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

  const handleIgnoreWord = async (scope: 'global' | 'workspace') => {
    if (!contextMenu?.word) return;
    const wordToIgnore = contextMenu.word.trim();
    const view = editorRef.current;
    if (!view) return;

    setContextMenu(null);

    try {
      await fetch('/api/dictionary/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ word: wordToIgnore, scope })
      });
    } catch (err) {
      console.error('Failed to add ignored word:', err);
    }

    const norm = wordToIgnore.toLowerCase();
    const remaining: any[] = [];
    forEachDiagnostic(view.state, (d: any) => {
      const word = view.state.doc.sliceString(d.from, d.to).trim().toLowerCase();
      const clean = word.replace(/^['"“‘—\-]+|['"”’—\-]+$/g, '');
      if (clean !== norm && !clean.startsWith(norm + "'") && !clean.startsWith(norm + "’")) {
        remaining.push(d);
      }
    });
    view.dispatch(setDiagnostics(view.state, remaining));
    view.focus();
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
      {writeWithMeActive && createPortal(
        <WriteWithMePanelInner
          messages={writeWithMeMessages}
          loading={writeWithMeLoading}
          onSendMessage={onTriggerSuggestion}
          onClose={onDismissSuggestion}
        />,
        panelContainer
      )}
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
            EditorView.contentAttributes.of({
              spellcheck: 'false',
              autocorrect: 'off',
              autocapitalize: 'off'
            }),
            grammarLinter,
            markdownStyleLinter,
            ...(Array.isArray(glossaryCompletionExtension) ? glossaryCompletionExtension : [glossaryCompletionExtension]),
            writeWithMeExtension,
            EditorView.updateListener.of((update) => {
              if (update.selectionSet || update.docChanged) {
                onCursorChange?.(update.state.selection.main.head);
                const selection = update.state.selection.main;
                if (!selection.empty) {
                  const selectedText = update.state.doc.sliceString(selection.from, selection.to);
                  onSelectionChange?.(selectedText);
                } else {
                  onSelectionChange?.(null);
                }
              }
              if (update.docChanged && writeWithMeActive) {
                update.changes.iterChanges((_fromA, _toA, fromB, _toB, text) => {
                  const inserted = text.toString();
                  const endsWithSentence = /[.!?]\s+$/.test(inserted);
                  let typedSpaceAfterPunctuation = false;
                  if (inserted === ' ' || inserted === '\n' || inserted === '\r\n') {
                    if (fromB > 0) {
                      const prevChar = update.state.doc.sliceString(fromB - 1, fromB);
                      typedSpaceAfterPunctuation = ['.', '?', '!'].includes(prevChar);
                    }
                  }
                  if (endsWithSentence || typedSpaceAfterPunctuation) {
                    onTriggerSuggestion?.();
                  }
                });
              }
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
            }),
            history(),
            keymap.of([...historyKeymap, ...defaultKeymap])
          ]}
          onChange={(val) => onChange(val)}
          theme="dark"
          basicSetup={false}
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
