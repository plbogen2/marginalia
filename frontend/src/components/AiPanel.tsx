import React, { useState, useEffect, useRef } from 'react';
import { Send, ChevronDown, ChevronRight, Check, AlertCircle } from 'lucide-react';
import { marked } from 'marked';

interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  content: string; // display markdown content
  rawContent: string; // original raw string
  thinking?: string;
  suggestions: {
    id: string;
    original: string;
    replacement: string;
    applied: boolean;
  }[];
}

interface AiPanelProps {
  activeFile: string | null;
  editorValue: string;
  onApplyChange: (original: string, replacement: string) => boolean;
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

export const AiPanel: React.FC<AiPanelProps> = ({ activeFile, editorValue, onApplyChange }) => {
  const [selectedPersona, setSelectedPersona] = useState<Persona>('developmental');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Track open states for thinking boxes
  const [openThinkingIds, setOpenThinkingIds] = useState<Record<string, boolean>>({});

  const chatEndRef = useRef<HTMLDivElement>(null);

  // Auto scroll to bottom when messages list updates
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  // Clear messages list when changing active files
  useEffect(() => {
    setMessages([]);
    setError(null);
  }, [activeFile]);

  const parseMessage = (rawText: string, msgId: string): ChatMessage => {
    let displayContent = rawText;
    let thinking: string | undefined;

    // 1. Extract thinking tag content
    const thinkingMatch = displayContent.match(/<thinking>([\s\S]*?)<\/thinking>/i);
    if (thinkingMatch) {
      thinking = thinkingMatch[1].trim();
      displayContent = displayContent.replace(/<thinking>[\s\S]*?<\/thinking>/gi, '').trim();
    }

    // 2. Extract search/replace diff blocks
    const suggestions: ChatMessage['suggestions'] = [];
    const blockRegex = /<<<<\n([\s\S]*?)\n====\n([\s\S]*?)\n>>>>/g;
    let match;
    let index = 0;
    while ((match = blockRegex.exec(displayContent)) !== null) {
      suggestions.push({
        id: `${msgId}-suggest-${index++}`,
        original: match[1],
        replacement: match[2],
        applied: false
      });
    }

    // Strip suggestions from display markdown
    displayContent = displayContent.replace(/<<<<\n[\s\S]*?\n====\n[\s\S]*?\n>>>>/g, '').trim();

    return {
      id: msgId,
      role: 'model',
      content: displayContent,
      rawContent: rawText,
      thinking,
      suggestions
    };
  };

  const handleAnalyze = async () => {
    if (!activeFile) return;
    setLoading(true);
    setError(null);
    setMessages([]);
    
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
        throw new Error(data.error || 'Failed to analyze draft');
      }

      const parsed = parseMessage(data.feedback || '', 'msg-initial');
      setMessages([parsed]);
      if (parsed.thinking) {
        setOpenThinkingIds(prev => ({ ...prev, [parsed.id]: true }));
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleSendFollowUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim() || !activeFile || loading) return;

    const userMessageText = inputValue.trim();
    setInputValue('');
    setError(null);

    // Save prompt to state locally immediately
    const userMsg: ChatMessage = {
      id: `msg-user-${Date.now()}`,
      role: 'user',
      content: userMessageText,
      rawContent: userMessageText,
      suggestions: []
    };

    const nextHistory = [...messages, userMsg];
    setMessages(nextHistory);
    setLoading(true);

    try {
      const payloadHistory = nextHistory.map(m => ({
        role: m.role,
        content: m.rawContent
      }));

      const res = await fetch('/api/ai/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: activeFile,
          persona: selectedPersona,
          message: userMessageText,
          history: payloadHistory.slice(0, -1) // Excluding the last prompt we just appended
        })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to get follow-up reply');
      }

      const modelId = `msg-model-${Date.now()}`;
      const parsed = parseMessage(data.feedback || '', modelId);
      setMessages(prev => [...prev, parsed]);
      if (parsed.thinking) {
        setOpenThinkingIds(prev => ({ ...prev, [parsed.id]: true }));
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const toggleThinking = (msgId: string) => {
    setOpenThinkingIds(prev => ({
      ...prev,
      [msgId]: !prev[msgId]
    }));
  };

  const handleApplySingleSuggestion = (msgId: string, suggestionId: string, original: string, replacement: string) => {
    const success = onApplyChange(original, replacement);
    if (success) {
      setMessages(prevMessages => 
        prevMessages.map(msg => {
          if (msg.id === msgId) {
            return {
              ...msg,
              suggestions: msg.suggestions.map(s => 
                s.id === suggestionId ? { ...s, applied: true } : s
              )
            };
          }
          return msg;
        })
      );
    } else {
      alert('Could not apply suggestion. The target original text was modified or not found in the editor.');
    }
  };

  const activePersonaInfo = PERSONAS.find(p => p.id === selectedPersona)!;

  return (
    <div className="ai-panel-container">
      <div className="ai-panel-body">
        {messages.length === 0 ? (
          <div className="ai-setup-pane">
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
              disabled={loading || !activeFile}
              className="analyze-btn"
            >
              {loading ? 'Analyzing Draft...' : 'Analyze Chapter'}
            </button>
            
            {error && <div className="ai-error-box">{error}</div>}
          </div>
        ) : (
          <div className="chat-interface">
            <div className="chat-history-scroll">
              <div className="active-editor-banner">
                <span>Active Editor: {activePersonaInfo.title}</span>
                <button 
                  className="reset-session-btn" 
                  onClick={() => setMessages([])}
                  title="Switch persona or re-analyze"
                >
                  Reset
                </button>
              </div>

              {messages.map((msg) => {
                const isUser = msg.role === 'user';
                return (
                  <div key={msg.id} className={`chat-bubble-row ${isUser ? 'user-row' : 'model-row'}`}>
                    <div className="chat-bubble">
                      {/* Render thinking process wrapper */}
                      {!isUser && msg.thinking && (
                        <div className="thinking-wrapper">
                          <button 
                            type="button" 
                            className="thinking-toggle-header"
                            onClick={() => toggleThinking(msg.id)}
                          >
                            {openThinkingIds[msg.id] ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                            <span>Thinking Process</span>
                          </button>
                          {openThinkingIds[msg.id] && (
                            <pre className="thinking-content-text">{msg.thinking}</pre>
                          )}
                        </div>
                      )}

                      {/* Render message body markdown */}
                      <div 
                        className="message-markdown markdown-body"
                        dangerouslySetInnerHTML={{ __html: marked.parse(msg.content) as string }}
                      />

                      {/* Render suggestion changes cards */}
                      {!isUser && msg.suggestions.length > 0 && (
                        <div className="suggestions-list">
                          <div className="suggestions-list-header">Suggested Changes:</div>
                          {msg.suggestions.map((s) => {
                            const inDraft = editorValue.includes(s.original);
                            return (
                              <div key={s.id} className="suggestion-card">
                                <div className="suggestion-diff-block">
                                  <div className="diff-original">
                                    <span className="diff-label">Original:</span>
                                    <pre>{s.original}</pre>
                                  </div>
                                  <div className="diff-replacement">
                                    <span className="diff-label">Proposed:</span>
                                    <pre>{s.replacement}</pre>
                                  </div>
                                </div>
                                <div className="suggestion-card-actions">
                                  {s.applied ? (
                                    <span className="applied-tag">
                                      <Check size={12} /> Applied
                                    </span>
                                  ) : (
                                    <button
                                      type="button"
                                      disabled={!inDraft}
                                      onClick={() => handleApplySingleSuggestion(msg.id, s.id, s.original, s.replacement)}
                                      className="apply-change-btn"
                                    >
                                      Apply Change
                                    </button>
                                  )}
                                  {!inDraft && !s.applied && (
                                    <span className="warning-tag" title="The original text block could not be located inside the active draft. It might have been modified.">
                                      <AlertCircle size={12} /> Not found in draft
                                    </span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}

              {loading && (
                <div className="chat-bubble-row model-row">
                  <div className="chat-bubble loading-bubble">
                    <div className="loading-spinner spin"></div>
                    <span>Gemini is composing critique...</span>
                  </div>
                </div>
              )}

              {error && <div className="ai-error-box">{error}</div>}
              
              <div ref={chatEndRef} />
            </div>

            <form onSubmit={handleSendFollowUp} className="chat-input-footer">
              <input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder="Ask follow-up questions or request revisions..."
                disabled={loading}
              />
              <button type="submit" disabled={loading || !inputValue.trim()} className="send-msg-btn">
                <Send size={14} />
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
};
