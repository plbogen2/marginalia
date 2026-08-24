import { useState, useEffect, useCallback } from 'react';
import type { Persona } from '../components/AiPanel';
import { type ChatMessage, parseMessage } from '../utils/aiParser';

interface UseAiCoWriterProps {
  activeFile: string | null;
}

export function useAiCoWriter({ activeFile }: UseAiCoWriterProps) {
  const [aiPanelOpen, setAiPanelOpen] = useState(() => {
    const saved = localStorage.getItem('marginalia_ai_panel_open');
    return saved === 'true';
  });

  const [selectedPersona, setSelectedPersona] = useState<Persona>('developmental');
  const [writeWithMeLoading, setWriteWithMeLoading] = useState(false);
  const [writeWithMeActive, setWriteWithMeActive] = useState(false);
  const [writeWithMeMessages, setWriteWithMeMessages] = useState<ChatMessage[]>([]);
  const [selectedContextFiles, setSelectedContextFiles] = useState<string[]>([]);
  const [selectedText, setSelectedText] = useState<string | null>(null);

  useEffect(() => {
    localStorage.setItem('marginalia_ai_panel_open', String(aiPanelOpen));
  }, [aiPanelOpen]);

  const saveWriteWithMeCache = useCallback(async (msgs: ChatMessage[]) => {
    if (!activeFile) return;
    try {
      await fetch('/api/ai/cache', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: activeFile,
          persona: 'write-with-me',
          messages: msgs
        })
      });
    } catch (err) {
      console.error('Failed to save Write With Me cache:', err);
    }
  }, [activeFile]);

  const triggerInlineSuggestion = useCallback(async (userMessage?: string, historyOverride?: ChatMessage[]) => {
    if (!activeFile || writeWithMeLoading) return;
    setWriteWithMeLoading(true);
    try {
      let nextHistory = historyOverride || [...writeWithMeMessages];

      if (userMessage) {
        const userMsg: ChatMessage = {
          id: `msg-user-${Date.now()}`,
          role: 'user',
          content: userMessage,
          rawContent: userMessage,
          suggestions: []
        };
        nextHistory = [...nextHistory, userMsg];
        setWriteWithMeMessages(nextHistory);
        await saveWriteWithMeCache(nextHistory);
      }

      const payload: {
        path: string;
        persona: string;
        contextFiles?: string[];
        message?: string;
        history?: { role: 'user' | 'model'; content: string }[];
        selectedText?: string;
      } = {
        path: activeFile,
        persona: 'write-with-me'
      };

      if (selectedContextFiles.length > 0) {
        payload.contextFiles = selectedContextFiles;
      }

      if (selectedText) {
        payload.selectedText = selectedText;
      }

      if (nextHistory.length > 0) {
        payload.history = nextHistory.map(m => ({
          role: m.role,
          content: m.rawContent
        }));
        if (userMessage) {
          payload.message = userMessage;
          payload.history = payload.history.slice(0, -1);
        }
      }

      const res = await fetch('/api/ai/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to get suggestion');

      const modelId = `msg-model-${Date.now()}`;
      const parsed = parseMessage(data.feedback || '', modelId);

      const finalHistory = [...nextHistory, parsed];
      setWriteWithMeMessages(finalHistory);
      await saveWriteWithMeCache(finalHistory);
    } catch (err) {
      console.error(err);
      alert('Failed to get suggestion: ' + (err as Error).message);
    } finally {
      setWriteWithMeLoading(false);
    }
  }, [activeFile, writeWithMeLoading, writeWithMeMessages, selectedContextFiles, saveWriteWithMeCache, selectedText]);

  const loadWriteWithMeCache = useCallback(async (file: string) => {
    try {
      const res = await fetch(`/api/ai/cache?path=${encodeURIComponent(file)}&persona=write-with-me`);
      if (res.ok) {
        const data = await res.json();
        const msgs = data.messages || [];
        setWriteWithMeMessages(msgs);
        if (msgs.length === 0) {
          triggerInlineSuggestion(undefined, msgs);
        }
      }
    } catch (err) {
      console.error('Failed to load Write With Me cache:', err);
    }
  }, [triggerInlineSuggestion]);

  useEffect(() => {
    if (writeWithMeActive && activeFile) {
      loadWriteWithMeCache(activeFile);
    } else {
      setWriteWithMeMessages([]);
    }
  }, [writeWithMeActive, activeFile, loadWriteWithMeCache]);

  const deactivateWriteWithMe = useCallback(() => {
    setWriteWithMeActive(false);
  }, []);

  return {
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
  };
}
