import { useState, useRef, useEffect, useCallback } from 'react';

interface UseAudioProps {
  editorValue: string;
  setEditorValue: React.Dispatch<React.SetStateAction<string>>;
  selectedText: string | null;
  activeFile: string | null;
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

  // Text-to-Speech (Read Aloud)
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isTtsLoading, setIsTtsLoading] = useState(false);
  const [cursorOffset, setCursorOffset] = useState<number>(0);
  const utteranceRef = useRef<any>(null);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);
  const speechSessionRef = useRef<number>(0);

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
        audioPlayerRef.current.src = '';
        audioPlayerRef.current.load();
      } catch (e) {
        // ignore
      }
      audioPlayerRef.current = null;
    }
    setIsSpeaking(false);
    setIsTtsLoading(false);
  }, []);

  const parseFrontmatterCast = (text: string): Record<string, string> | undefined => {
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
  };

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

  const splitIntoParagraphChunks = (text: string, maxLen: number = 350): string[] => {
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
        const sentences = para.match(/[^.!?]+[.!?]+|\S+/g) || [para];
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
        const sentences = para.match(/[^.!?]+[.!?]+|\S+/g) || [para];
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

        let currentChunkIdx = 0;
        const prefetchCache = new Map<number, Promise<string | null>>();

        const ensurePrefetched = (idx: number) => {
          if (idx < chunks.length && !prefetchCache.has(idx) && speechSessionRef.current === sessionId) {
            prefetchCache.set(idx, fetchParlandoChunk(chunks[idx], voice, pacing, speed, sessionId, customCast, dialogueVoice));
          }
        };

        // Immediately kick off parallel prefetching for initial chunks
        ensurePrefetched(0);
        ensurePrefetched(1);
        ensurePrefetched(2);
        ensurePrefetched(3);

        const playChunk = async (audioData: string) => {
          if (speechSessionRef.current !== sessionId) return;

          // Stop previous audio instance if still active
          if (audioPlayerRef.current) {
            try {
              audioPlayerRef.current.pause();
              audioPlayerRef.current.onended = null;
              audioPlayerRef.current.onerror = null;
              audioPlayerRef.current.src = '';
              audioPlayerRef.current.load();
            } catch (e) {
              // ignore
            }
            audioPlayerRef.current = null;
          }

          const audio = new Audio(audioData);
          // Parlando renders speed natively in neural synthesis SSML/rate; do not double-stretch in browser
          audio.playbackRate = 1.0;
          audioPlayerRef.current = audio;

          // Aggressively prefetch a 3-chunk sliding window in the background queue
          ensurePrefetched(currentChunkIdx + 1);
          ensurePrefetched(currentChunkIdx + 2);
          ensurePrefetched(currentChunkIdx + 3);

          audio.onended = async () => {
            if (speechSessionRef.current !== sessionId) return;
            currentChunkIdx++;
            if (currentChunkIdx < chunks.length) {
              ensurePrefetched(currentChunkIdx);
              ensurePrefetched(currentChunkIdx + 1);
              ensurePrefetched(currentChunkIdx + 2);
              ensurePrefetched(currentChunkIdx + 3);
              const nextPromise = prefetchCache.get(currentChunkIdx);
              const nextAudio = nextPromise ? await nextPromise : await fetchParlandoChunk(chunks[currentChunkIdx], voice, pacing, speed, sessionId, customCast, dialogueVoice);
              prefetchCache.delete(currentChunkIdx);
              if (nextAudio && speechSessionRef.current === sessionId) {
                await playChunk(nextAudio);
              } else {
                stopSpeech();
              }
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

          if (speechSessionRef.current === sessionId) {
            setIsTtsLoading(false);
            setIsSpeaking(true);
            await audio.play();
          }
        };

        // Await first chunk (already requested in parallel) for instant start
        const firstAudioPromise = prefetchCache.get(0);
        const firstAudio = firstAudioPromise ? await firstAudioPromise : await fetchParlandoChunk(chunks[0], voice, pacing, speed, sessionId, customCast, dialogueVoice);
        prefetchCache.delete(0);
        if (firstAudio && speechSessionRef.current === sessionId) {
          await playChunk(firstAudio);
        } else if (speechSessionRef.current === sessionId) {
          stopSpeech();
        }
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

    // Strip markdown formatting and quotation marks so TTS voices don't read "quote" out loud
    const cleanText = textToRead
      .replace(/#+\s+/g, '')
      .replace(/[*_`~>]/g, '')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/["'“”‘’]/g, '')
      .trim();

    if (!cleanText) return;

    // Split text into sentence chunks to prevent Chrome max buffer truncation
    const sentences = cleanText.match(/[^.!?\n]+[.!?\n]+/g) || [cleanText];
    let currentIndex = 0;

    const speakNextSentence = () => {
      if (speechSessionRef.current !== sessionId || currentIndex >= sentences.length) {
        if (speechSessionRef.current === sessionId) {
          setIsSpeaking(false);
          utteranceRef.current = null;
        }
        return;
      }

      const sentenceText = sentences[currentIndex].trim();
      if (!sentenceText) {
        currentIndex++;
        speakNextSentence();
        return;
      }

      const utterance = new SpeechSynthesisUtterance(sentenceText);
      utterance.rate = 1.0;
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
        currentIndex++;
        speakNextSentence();
      };

      utterance.onerror = (err) => {
        if (speechSessionRef.current !== sessionId) return;
        console.error('TTS utterance error:', err);
        currentIndex++;
        if (currentIndex < sentences.length) {
          speakNextSentence();
        } else {
          setIsSpeaking(false);
          utteranceRef.current = null;
        }
      };

      utteranceRef.current = utterance;
      if ('resume' in window.speechSynthesis) {
        window.speechSynthesis.resume();
      }
      window.speechSynthesis.speak(utterance);
    };

    setIsSpeaking(true);
    speakNextSentence();
  }, [cursorOffset, editorValue, isSpeaking, isTtsLoading, selectedText, stopSpeech]);

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
    isTtsLoading,
    cursorOffset,
    setCursorOffset,
    toggleReadAloud,
    stopSpeech
  };
}
