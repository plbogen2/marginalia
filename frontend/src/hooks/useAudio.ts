import { useState, useRef, useEffect, useCallback } from 'react';

interface UseAudioProps {
  editorValue: string;
  setEditorValue: React.Dispatch<React.SetStateAction<string>>;
  selectedText: string | null;
  activeFile: string | null;
}

export function parseFrontmatterCast(text: string): Record<string, string> | undefined {
  if (!text.startsWith('---')) return undefined;
  const parts = text.split('---', 3);
  if (parts.length < 3) return undefined;
  const fm = parts[1];
  const cast: Record<string, string> = {};
  let inCastBlock = false;
  for (const line of fm.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.startsWith('cast:') || trimmed.startsWith('characters:')) {
      inCastBlock = true;
      continue;
    }
    if (inCastBlock) {
      if (/^[a-zA-Z0-9_-]+:/.test(line) && !line.startsWith(' ') && !line.startsWith('\t')) {
        inCastBlock = false;
      } else if (trimmed.includes(':')) {
        const [charName, charVoice] = trimmed.replace(/^-\s*/, '').split(':', 2);
        if (charName && charVoice) {
          cast[charName.trim()] = charVoice.trim().replace(/^["']|["']$/g, '');
        }
      }
    }
  }
  return Object.keys(cast).length > 0 ? cast : undefined;
}

export function splitIntoParagraphChunks(text: string, maxLen: number = 350): string[] {
  // Strip YAML frontmatter if reading from beginning of document
  let clean = text;
  if (clean.startsWith('---')) {
    const parts = clean.split('---', 3);
    if (parts.length >= 3) {
      clean = parts[2];
    }
  }

  // Strip markdown structural tokens while preserving dialogue quotes and contractions
  clean = clean
    .replace(/^#+\s+/gm, '')
    .replace(/[*_`~>]/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');

  const rawParagraphs = clean.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const chunks: string[] = [];

  for (let pIdx = 0; pIdx < rawParagraphs.length; pIdx++) {
    const para = rawParagraphs[pIdx];

    // Fast start optimization (Chunk 0): split first sentence so initial playback starts in <500ms
    if (chunks.length === 0) {
      const sentences = para.match(/(?:[^.!?]|[.!?](?=["'”’]\s*[a-z]))+[.!?]+["'”’]?|\S+/g) || [para];
      if (sentences.length > 1 && sentences[0].length <= 160) {
        chunks.push(sentences[0].trim());
        const restOfPara = sentences.slice(1).join(' ').trim();
        if (restOfPara.length <= maxLen) {
          chunks.push(restOfPara);
        } else {
          let current = '';
          for (let i = 1; i < sentences.length; i++) {
            const s = sentences[i];
            if ((current + ' ' + s).trim().length > maxLen && current.length > 0) {
              chunks.push(current.trim());
              current = s;
            } else {
              current = current ? `${current} ${s}` : s;
            }
          }
          if (current.trim().length > 0) chunks.push(current.trim());
        }
        continue;
      }
    }

    if (para.length <= maxLen) {
      chunks.push(para);
    } else {
      const sentences = para.match(/(?:[^.!?]|[.!?](?=["'”’]\s*[a-z]))+[.!?]+["'”’]?|\S+/g) || [para];
      let current = '';
      for (const s of sentences) {
        if ((current + ' ' + s).trim().length > maxLen && current.length > 0) {
          chunks.push(current.trim());
          current = s;
        } else {
          current = current ? `${current} ${s}` : s;
        }
      }
      if (current.trim().length > 0) {
        chunks.push(current.trim());
      }
    }
  }
  return chunks.length > 0 ? chunks : [clean];
}

export function useAudio({ editorValue, setEditorValue, selectedText, activeFile }: UseAudioProps) {
  // Voice Dictation (Speech-to-Text)
  const [isDictating, setIsDictating] = useState(false);
  const recognitionRef = useRef<any>(null);

  const toggleDictation = useCallback(() => {
    if (isDictating) {
      recognitionRef.current?.stop();
      setIsDictating(false);
      return;
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert('Speech Recognition is not supported in this browser. Please use Chrome, Edge, or Safari.');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    recognition.onresult = (event: any) => {
      const lastResultIndex = event.results.length - 1;
      let transcript = event.results[lastResultIndex][0].transcript;

      // Format common voice punctuation commands
      transcript = transcript
        .replace(/\bperiod\b/gi, '.')
        .replace(/\bcomma\b/gi, ',')
        .replace(/\bquestion mark\b/gi, '?')
        .replace(/\bexclamation mark\b/gi, '!')
        .replace(/\bnew line\b/gi, '\n')
        .replace(/\bnew paragraph\b/gi, '\n\n');

      setEditorValue((prev) => {
        const needsSpace = prev.length > 0 && !prev.endsWith(' ') && !prev.endsWith('\n');
        return prev + (needsSpace ? ' ' : '') + transcript;
      });
    };

    recognition.onerror = (err: any) => {
      console.warn('Dictation error:', err);
      setIsDictating(false);
    };

    recognition.onend = () => {
      setIsDictating(false);
    };

    recognition.start();
    recognitionRef.current = recognition;
    setIsDictating(true);
  }, [isDictating, setEditorValue]);

  // Text-to-Speech (Read Aloud) Playback State
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isTtsLoading, setIsTtsLoading] = useState(false);
  const [currentChunkIndex, setCurrentChunkIndex] = useState<number>(0);
  const [totalChunks, setTotalChunks] = useState<number>(0);
  const [currentChunkText, setCurrentChunkText] = useState<string>('');
  const [cursorOffset, setCursorOffset] = useState<number>(0);
  const [playbackSpeed, setPlaybackSpeedState] = useState<number>(() => {
    return parseFloat(localStorage.getItem('marginalia_parlando_speed') || '1.0');
  });

  const utteranceRef = useRef<any>(null);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);
  const speechSessionRef = useRef<number>(0);

  // Active session references for dynamic jumping/seeking
  const activeChunksRef = useRef<string[]>([]);
  const currentChunkIdxRef = useRef<number>(0);
  const playTargetChunkRef = useRef<((idx: number) => Promise<void>) | null>(null);
  const prefetchCacheRef = useRef<Map<number, Promise<string | null>>>(new Map());

  const stopSpeech = useCallback(() => {
    // Increment monotonic session ID to immediately invalidate all in-flight requests & callbacks
    speechSessionRef.current += 1;

    if (utteranceRef.current) {
      utteranceRef.current.onend = null;
      utteranceRef.current.onerror = null;
      utteranceRef.current = null;
    }
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    if (audioPlayerRef.current) {
      try {
        audioPlayerRef.current.pause();
        audioPlayerRef.current.onended = null;
        audioPlayerRef.current.onerror = null;
        audioPlayerRef.current.onplay = null;
        audioPlayerRef.current.onpause = null;
        audioPlayerRef.current.src = '';
        audioPlayerRef.current.load();
      } catch (e) {
        // ignore
      }
      audioPlayerRef.current = null;
    }

    prefetchCacheRef.current.clear();
    activeChunksRef.current = [];
    currentChunkIdxRef.current = 0;
    playTargetChunkRef.current = null;

    setIsSpeaking(false);
    setIsPaused(false);
    setIsTtsLoading(false);
    setCurrentChunkIndex(0);
    setTotalChunks(0);
    setCurrentChunkText('');

    if ('mediaSession' in navigator) {
      navigator.mediaSession.playbackState = 'none';
    }
  }, []);

  const pauseSpeech = useCallback(() => {
    if (audioPlayerRef.current) {
      audioPlayerRef.current.pause();
    } else if ('speechSynthesis' in window && window.speechSynthesis.speaking) {
      window.speechSynthesis.pause();
    }
    setIsPaused(true);
    if ('mediaSession' in navigator) {
      navigator.mediaSession.playbackState = 'paused';
    }
  }, []);

  const resumeSpeech = useCallback(() => {
    if (audioPlayerRef.current) {
      audioPlayerRef.current.play().catch(console.warn);
    } else if ('speechSynthesis' in window && window.speechSynthesis.paused) {
      window.speechSynthesis.resume();
    }
    setIsPaused(false);
    if ('mediaSession' in navigator) {
      navigator.mediaSession.playbackState = 'playing';
    }
  }, []);

  const togglePause = useCallback(() => {
    if (isPaused) {
      resumeSpeech();
    } else if (isSpeaking) {
      pauseSpeech();
    }
  }, [isPaused, isSpeaking, pauseSpeech, resumeSpeech]);

  const seekToChunk = useCallback((targetIdx: number) => {
    const chunks = activeChunksRef.current;
    if (targetIdx >= 0 && targetIdx < chunks.length && playTargetChunkRef.current) {
      playTargetChunkRef.current(targetIdx);
    }
  }, []);

  const skipNext = useCallback(() => {
    const chunks = activeChunksRef.current;
    const nextIdx = currentChunkIdxRef.current + 1;
    if (nextIdx < chunks.length && playTargetChunkRef.current) {
      playTargetChunkRef.current(nextIdx);
    } else {
      stopSpeech();
    }
  }, [stopSpeech]);

  const skipPrevious = useCallback(() => {
    // If currently playing chunk has elapsed > 2.5 seconds, restart current chunk from 0:00
    if (audioPlayerRef.current && audioPlayerRef.current.currentTime > 2.5) {
      audioPlayerRef.current.currentTime = 0;
      return;
    }
    const prevIdx = Math.max(0, currentChunkIdxRef.current - 1);
    if (playTargetChunkRef.current) {
      playTargetChunkRef.current(prevIdx);
    }
  }, []);

  const skipForwardSeconds = useCallback((seconds: number = 10) => {
    if (audioPlayerRef.current) {
      const audio = audioPlayerRef.current;
      if (audio.duration && audio.currentTime + seconds < audio.duration) {
        audio.currentTime += seconds;
      } else {
        skipNext();
      }
    } else {
      skipNext();
    }
  }, [skipNext]);

  const skipBackwardSeconds = useCallback((seconds: number = 10) => {
    if (audioPlayerRef.current) {
      const audio = audioPlayerRef.current;
      if (audio.currentTime - seconds > 0) {
        audio.currentTime -= seconds;
      } else {
        skipPrevious();
      }
    } else {
      skipPrevious();
    }
  }, [skipPrevious]);

  const setPlaybackSpeed = useCallback((speed: number) => {
    setPlaybackSpeedState(speed);
    localStorage.setItem('marginalia_parlando_speed', String(speed));
    if (audioPlayerRef.current) {
      audioPlayerRef.current.playbackRate = speed;
    }
  }, []);

  const fetchParlandoChunk = async (
    textChunk: string,
    voice: string,
    pacing: string,
    speed: number,
    sessionId: number,
    characters?: Record<string, any>,
    dialogueVoice?: string,
  ): Promise<string | null> => {
    if (speechSessionRef.current !== sessionId || !textChunk.trim()) return null;
    try {
      const res = await fetch('/api/tts/synthesize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: textChunk,
          voice,
          pacing,
          speed,
          characters,
          dialogue_voice: dialogueVoice
        }),
      });
      if (speechSessionRef.current !== sessionId) return null;
      if (!res.ok) throw new Error('Speech synthesis request failed');
      const data = await res.json();
      if (speechSessionRef.current !== sessionId) return null;
      return data.audio_base64 || null;
    } catch (err) {
      if (speechSessionRef.current === sessionId) {
        console.warn('Parlando chunk fetch failed:', err);
      }
      return null;
    }
  };

  const toggleReadAloud = useCallback(async () => {
    if (isSpeaking || isTtsLoading) {
      stopSpeech();
      return;
    }

    if (!editorValue || editorValue.trim().length === 0) {
      alert('Nothing to read aloud in this file.');
      return;
    }

    stopSpeech();
    const sessionId = ++speechSessionRef.current;

    // Start reading from selected text, or current cursor position, or document start
    let textToRead = editorValue;
    if (selectedText && selectedText.trim().length > 0) {
      textToRead = selectedText.trim();
    } else if (cursorOffset > 0 && cursorOffset < editorValue.length) {
      const sliced = editorValue.slice(cursorOffset).trim();
      if (sliced.length > 0) {
        textToRead = sliced;
      }
    }

    const ttsEngine = (localStorage.getItem('marginalia_tts_engine') as 'parlando' | 'browser') || 'parlando';

    if (ttsEngine === 'parlando') {
      setIsTtsLoading(true);
      try {
        const voice = localStorage.getItem('marginalia_parlando_voice') || 'Fenrir';
        const pacing = localStorage.getItem('marginalia_parlando_pacing') || 'normal';
        const speed = parseFloat(localStorage.getItem('marginalia_parlando_speed') || '1.0');
        const dialogueMode = localStorage.getItem('marginalia_parlando_dialogue_mode') || 'auto';
        const dialogueVoice = dialogueMode === 'single' ? voice : (localStorage.getItem('marginalia_parlando_dialogue_voice') || undefined);

        let customCast = parseFrontmatterCast(editorValue);
        if (!customCast) {
          try {
            const savedCast = localStorage.getItem('marginalia_parlando_cast');
            if (savedCast) {
              customCast = JSON.parse(savedCast);
            }
          } catch {
            // ignore
          }
        }

        const chunks = splitIntoParagraphChunks(textToRead, 350);
        if (chunks.length === 0 || speechSessionRef.current !== sessionId) {
          if (speechSessionRef.current === sessionId) {
            setIsTtsLoading(false);
          }
          return;
        }

        activeChunksRef.current = chunks;
        setTotalChunks(chunks.length);
        setCurrentChunkIndex(0);
        setCurrentChunkText(chunks[0]);

        const prefetchCache = prefetchCacheRef.current;
        prefetchCache.clear();

        const ensurePrefetched = (idx: number) => {
          if (idx < chunks.length && !prefetchCache.has(idx) && speechSessionRef.current === sessionId) {
            prefetchCache.set(idx, fetchParlandoChunk(chunks[idx], voice, pacing, speed, sessionId, customCast, dialogueVoice));
          }
        };

        // Immediately prefetch initial chunk and next chunk
        ensurePrefetched(0);
        ensurePrefetched(1);

        const playTargetChunk = async (targetIdx: number) => {
          if (speechSessionRef.current !== sessionId) return;
          if (targetIdx < 0 || targetIdx >= chunks.length) {
            stopSpeech();
            return;
          }

          currentChunkIdxRef.current = targetIdx;
          setCurrentChunkIndex(targetIdx);
          setCurrentChunkText(chunks[targetIdx]);
          setIsTtsLoading(true);

          // Stop previous audio instance if still active
          if (audioPlayerRef.current) {
            try {
              audioPlayerRef.current.pause();
              audioPlayerRef.current.onended = null;
              audioPlayerRef.current.onerror = null;
              audioPlayerRef.current.onplay = null;
              audioPlayerRef.current.onpause = null;
              audioPlayerRef.current.src = '';
              audioPlayerRef.current.load();
            } catch (e) {
              // ignore
            }
            audioPlayerRef.current = null;
          }

          // Prefetch next chunk in background for gapless continuity
          ensurePrefetched(targetIdx);
          ensurePrefetched(targetIdx + 1);

          const audioPromise = prefetchCache.get(targetIdx);
          const audioData = audioPromise 
            ? await audioPromise 
            : await fetchParlandoChunk(chunks[targetIdx], voice, pacing, speed, sessionId, customCast, dialogueVoice);

          if (speechSessionRef.current !== sessionId) return;

          if (!audioData) {
            stopSpeech();
            return;
          }

          const audio = new Audio(audioData);
          audio.playbackRate = 1.0;
          audioPlayerRef.current = audio;

          audio.onplay = () => {
            if (speechSessionRef.current === sessionId) {
              setIsSpeaking(true);
              setIsPaused(false);
              setIsTtsLoading(false);
              if ('mediaSession' in navigator) {
                navigator.mediaSession.playbackState = 'playing';
              }
            }
          };

          audio.onpause = () => {
            if (speechSessionRef.current === sessionId && !audio.ended) {
              setIsPaused(true);
              if ('mediaSession' in navigator) {
                navigator.mediaSession.playbackState = 'paused';
              }
            }
          };

          audio.onended = async () => {
            if (speechSessionRef.current !== sessionId) return;
            const nextIdx = targetIdx + 1;
            if (nextIdx < chunks.length) {
              await playTargetChunk(nextIdx);
            } else {
              stopSpeech();
            }
          };

          audio.onerror = (e) => {
            if (speechSessionRef.current === sessionId) {
              console.error('Parlando audio playback error:', e);
              stopSpeech();
            }
          };

          // Update MediaSession metadata
          if ('mediaSession' in navigator) {
            try {
              navigator.mediaSession.metadata = new MediaMetadata({
                title: activeFile || 'Manuscript Chapter',
                artist: 'Parlando Neural Audio',
                album: `Chunk ${targetIdx + 1} of ${chunks.length}`,
              });
            } catch {
              // ignore
            }
          }

          setIsTtsLoading(false);
          setIsSpeaking(true);
          setIsPaused(false);
          await audio.play();
        };

        playTargetChunkRef.current = playTargetChunk;

        // Start playback with first chunk
        await playTargetChunk(0);
      } catch (err) {
        if (speechSessionRef.current === sessionId) {
          console.warn('Parlando neural speech failed, falling back to local speech:', err);
          stopSpeech();
        }
      }
      return;
    }

    if (!('speechSynthesis' in window)) {
      alert('Text-to-Speech is not supported in this browser.');
      return;
    }

    // Browser Speech Synthesis Fallback
    const cleanText = textToRead
      .replace(/#+\s+/g, '')
      .replace(/[*_`~>]/g, '')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/["'“”‘’]/g, '')
      .trim();

    if (!cleanText) return;

    const sentences = cleanText.match(/[^.!?\n]+[.!?\n]+/g) || [cleanText];
    activeChunksRef.current = sentences;
    setTotalChunks(sentences.length);
    setCurrentChunkIndex(0);
    setCurrentChunkText(sentences[0]);

    const speakSentenceAt = (idx: number) => {
      if (speechSessionRef.current !== sessionId || idx >= sentences.length || idx < 0) {
        if (speechSessionRef.current === sessionId) {
          stopSpeech();
        }
        return;
      }

      currentChunkIdxRef.current = idx;
      setCurrentChunkIndex(idx);
      setCurrentChunkText(sentences[idx]);

      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }

      const sentenceText = sentences[idx].trim();
      if (!sentenceText) {
        speakSentenceAt(idx + 1);
        return;
      }

      const utterance = new SpeechSynthesisUtterance(sentenceText);
      utterance.rate = playbackSpeed;
      utterance.pitch = 1.0;

      try {
        const voices = window.speechSynthesis.getVoices();
        if (voices && voices.length > 0) {
          const savedURI = localStorage.getItem('marginalia_tts_voice_uri');
          let selectedVoice: SpeechSynthesisVoice | undefined;

          if (savedURI) {
            selectedVoice = voices.find((v) => v.voiceURI === savedURI);
          }

          if (!selectedVoice) {
            selectedVoice = voices.find((v) =>
              v.lang.startsWith('en') && (
                v.name.includes('Natural') ||
                v.name.includes('Online (Natural)') ||
                v.name.includes('Enhanced') ||
                v.name.includes('Premium') ||
                v.name.includes('Google')
              )
            ) || voices.find((v) => v.lang.startsWith('en'));
          }

          if (selectedVoice) {
            utterance.voice = selectedVoice;
          }
        }
      } catch (e) {
        console.warn('Failed to assign voice:', e);
      }

      utterance.onend = () => {
        if (speechSessionRef.current !== sessionId) return;
        speakSentenceAt(idx + 1);
      };

      utterance.onerror = (err) => {
        if (speechSessionRef.current !== sessionId) return;
        console.error('TTS utterance error:', err);
        if (idx + 1 < sentences.length) {
          speakSentenceAt(idx + 1);
        } else {
          stopSpeech();
        }
      };

      utteranceRef.current = utterance;
      if ('resume' in window.speechSynthesis) {
        window.speechSynthesis.resume();
      }
      window.speechSynthesis.speak(utterance);
      setIsSpeaking(true);
      setIsPaused(false);
    };

    playTargetChunkRef.current = async (targetIdx: number) => {
      speakSentenceAt(targetIdx);
    };

    speakSentenceAt(0);
  }, [cursorOffset, editorValue, isSpeaking, isTtsLoading, playbackSpeed, selectedText, stopSpeech, activeFile]);

  // MediaSession Action Handlers (Hardware media keys, headphones, OS widget)
  useEffect(() => {
    if (!('mediaSession' in navigator)) return;

    try {
      navigator.mediaSession.setActionHandler('play', () => resumeSpeech());
      navigator.mediaSession.setActionHandler('pause', () => pauseSpeech());
      navigator.mediaSession.setActionHandler('previoustrack', () => skipPrevious());
      navigator.mediaSession.setActionHandler('nexttrack', () => skipNext());
      navigator.mediaSession.setActionHandler('seekbackward', () => skipBackwardSeconds(10));
      navigator.mediaSession.setActionHandler('seekforward', () => skipForwardSeconds(10));
      navigator.mediaSession.setActionHandler('stop', () => stopSpeech());
    } catch (e) {
      console.warn('MediaSession handler registration failed:', e);
    }

    return () => {
      if (!('mediaSession' in navigator)) return;
      try {
        navigator.mediaSession.setActionHandler('play', null);
        navigator.mediaSession.setActionHandler('pause', null);
        navigator.mediaSession.setActionHandler('previoustrack', null);
        navigator.mediaSession.setActionHandler('nexttrack', null);
        navigator.mediaSession.setActionHandler('seekbackward', null);
        navigator.mediaSession.setActionHandler('seekforward', null);
        navigator.mediaSession.setActionHandler('stop', null);
      } catch {
        // ignore
      }
    };
  }, [pauseSpeech, resumeSpeech, skipBackwardSeconds, skipForwardSeconds, skipNext, skipPrevious, stopSpeech]);

  // Global Keyboard Shortcuts when TTS is Active
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isSpeaking && !isPaused && !isTtsLoading) return;

      // Escape to Stop
      if (e.key === 'Escape') {
        e.preventDefault();
        stopSpeech();
        return;
      }

      // Alt+Space to Play/Pause
      if (e.altKey && e.code === 'Space') {
        e.preventDefault();
        togglePause();
        return;
      }

      // Alt+Left or Alt+J to skip back
      if (e.altKey && (e.key === 'ArrowLeft' || e.key.toLowerCase() === 'j')) {
        e.preventDefault();
        skipPrevious();
        return;
      }

      // Alt+Right or Alt+L to skip forward
      if (e.altKey && (e.key === 'ArrowRight' || e.key.toLowerCase() === 'l')) {
        e.preventDefault();
        skipNext();
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isSpeaking, isPaused, isTtsLoading, stopSpeech, togglePause, skipPrevious, skipNext]);

  useEffect(() => {
    stopSpeech();
    setCursorOffset(0);
  }, [activeFile, stopSpeech]);

  useEffect(() => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.getVoices();
      const handleVoicesChanged = () => {
        window.speechSynthesis.getVoices();
      };
      window.speechSynthesis.onvoiceschanged = handleVoicesChanged;
    }
  }, []);

  return {
    isDictating,
    toggleDictation,
    isSpeaking,
    isPaused,
    isTtsLoading,
    currentChunkIndex,
    totalChunks,
    currentChunkText,
    playbackSpeed,
    cursorOffset,
    setCursorOffset,
    toggleReadAloud,
    pauseSpeech,
    resumeSpeech,
    togglePause,
    skipNext,
    skipPrevious,
    skipForwardSeconds,
    skipBackwardSeconds,
    seekToChunk,
    setPlaybackSpeed,
    stopSpeech
  };
}
