import React from 'react';
import CodeMirror, { EditorView } from '@uiw/react-codemirror';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { linter, type Diagnostic, forceLinting } from '@codemirror/lint';
import { checkGrammar } from '../utils/languagetool';

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
          }).then(() => {
            forceLinting(view);
          });
        }
      } as any);
      actions.push({
        name: `Ignore in workspace`,
        apply: (view: any) => {
          fetch('/api/dictionary/add', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ word: misspelledWord, scope: 'workspace' })
          }).then(() => {
            forceLinting(view);
          });
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

  if (!activeFile) {
    return (
      <div className="editor-empty">
        <p>Select a file from the sidebar or create a new one to start writing.</p>
      </div>
    );
  }

  return (
    <div className="editor-container">
      <div className="editor-header">
        <span className="file-path">{activeFile}</span>
        <div className="stats">
          <span>{wordCount} words</span>
          <span>{charCount} chars</span>
        </div>
      </div>
      <div className="editor-cm-wrapper">
        <CodeMirror
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
      </div>
    </div>
  );
};
