import React, { useState, useEffect } from 'react';
import { X, Sparkles } from 'lucide-react';
import { marked } from 'marked';

interface AiPanelProps {
  activeFile: string | null;
  onClose: () => void;
}

type Persona = 'developmental' | 'line' | 'copy' | 'proofreader';

interface PersonaInfo {
  id: Persona;
  title: string;
  focus: string;
  description: string;
}

const PERSONAS: PersonaInfo[] = [
  {
    id: 'developmental',
    title: 'Developmental',
    focus: 'Plot, pacing, arcs, concepts',
    description: 'Evaluates structural elements like plot flow, character arcs, storytelling gaps, and narrative tension.'
  },
  {
    id: 'line',
    title: 'Line Editor',
    focus: 'Style, tone, sentence flow',
    description: 'Polishes sentence variety, readability, phrasing strength, tone, and paragraph transitions.'
  },
  {
    id: 'copy',
    title: 'Copy Editor',
    focus: 'Technical grammar, spelling',
    description: 'Fixes punctuation slip-ups, syntax rules, spelling errors, and style guide consistency.'
  },
  {
    id: 'proofreader',
    title: 'Proofreader',
    focus: 'Typos, final passes, spaces',
    description: 'Locates missing commas, formatting typos, duplicate words, or minor layout bugs.'
  }
];

export const AiPanel: React.FC<AiPanelProps> = ({ activeFile, onClose }) => {
  const [selectedPersona, setSelectedPersona] = useState<Persona>('developmental');
  const [feedback, setFeedback] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [renderedHtml, setRenderedHtml] = useState('');

  // Re-render feedback when it changes
  useEffect(() => {
    if (feedback) {
      const renderMarkdown = async () => {
        const html = await marked(feedback);
        setRenderedHtml(html);
      };
      renderMarkdown();
    } else {
      setRenderedHtml('');
    }
  }, [feedback]);

  // Clear feedback when active file changes
  useEffect(() => {
    setFeedback('');
    setError(null);
  }, [activeFile]);

  const handleAnalyze = async () => {
    if (!activeFile) return;
    setLoading(true);
    setError(null);
    setFeedback('');
    try {
      const res = await fetch('/api/ai/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: activeFile,
          persona: selectedPersona
        })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to complete AI analysis');
      }
      setFeedback(data.feedback || '');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const activePersonaInfo = PERSONAS.find(p => p.id === selectedPersona)!;

  return (
    <div className="ai-panel-container">
      <div className="ai-panel-header">
        <div className="ai-title">
          <Sparkles size={14} className="sparkle-icon" />
          <span>AI Editor</span>
        </div>
        <button className="close-btn" onClick={onClose} title="Hide AI Panel">
          <X size={14} />
        </button>
      </div>

      <div className="ai-panel-body">
        {!activeFile ? (
          <div className="ai-empty-state">
            Open a file from the sidebar to analyze it with the AI Editor.
          </div>
        ) : (
          <>
            <div className="persona-selector-section">
              <label>Select Editor Persona:</label>
              <div className="persona-buttons-grid">
                {PERSONAS.map((persona) => (
                  <button
                    key={persona.id}
                    type="button"
                    onClick={() => setSelectedPersona(persona.id)}
                    className={`persona-btn ${selectedPersona === persona.id ? 'active' : ''}`}
                  >
                    {persona.title}
                  </button>
                ))}
              </div>
              <div className="persona-description-box">
                <span className="persona-focus-pill">Focus: {activePersonaInfo.focus}</span>
                <p className="persona-desc-text">{activePersonaInfo.description}</p>
              </div>
            </div>

            <button
              onClick={handleAnalyze}
              disabled={loading}
              className="analyze-btn"
            >
              {loading ? 'Analyzing Draft...' : 'Analyze Chapter'}
            </button>

            {error && <div className="ai-error-box">{error}</div>}

            <div className="ai-results-pane">
              {loading ? (
                <div className="ai-loading-overlay">
                  <div className="loading-spinner spin"></div>
                  <span>Invoking {activePersonaInfo.title} Editor critique...</span>
                </div>
              ) : renderedHtml ? (
                <div
                  className="ai-feedback-content markdown-body"
                  dangerouslySetInnerHTML={{ __html: renderedHtml }}
                />
              ) : (
                <div className="ai-feedback-placeholder">
                  Click <strong>Analyze Chapter</strong> to run structural AI analysis on your draft.
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};
