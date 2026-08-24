import { Router, Response } from 'express';
import { db, recordEvent } from '../db.js';
import { AuthenticatedRequest } from '../middleware/auth.js';

export const ttsRouter = Router();

const PARLANDO_URL = process.env.PARLANDO_URL || 'http://localhost:8765';

ttsRouter.get('/api/tts/voices', async (req: AuthenticatedRequest, res: Response) => {
  let apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    try {
      const key = req.user ? `gemini_api_key:${req.user}` : 'gemini_api_key';
      const row = db.prepare("SELECT value FROM settings WHERE key = ?;").get(key) as { value: string } | undefined;
      if (row && row.value) {
        apiKey = row.value;
      } else if (req.user) {
        const globalRow = db.prepare("SELECT value FROM settings WHERE key = 'gemini_api_key';").get() as { value: string } | undefined;
        if (globalRow && globalRow.value) {
          apiKey = globalRow.value;
        }
      }
    } catch {
      // ignore
    }
  }

  try {
    const response = await fetch(`${PARLANDO_URL}/api/voices`);
    if (!response.ok) throw new Error('Parlando API unavailable');
    const data = await response.json();
    res.json({ ...data, has_gemini_key: !!apiKey, available: true });
  } catch {
    res.json({
      voices: [
        'Fenrir',
        'Puck',
        'Charon',
        'Aoede',
        'Kore',
        'en-US-ChristopherNeural',
        'en-US-GuyNeural',
        'en-US-JennyNeural',
        'en-US-AriaNeural',
        'en-GB-RyanNeural',
        'en-GB-SoniaNeural',
      ],
      profiles: ['cyberpunk_noir', 'space_opera', 'classic_fiction'],
      pacing: ['normal', 'brisk', 'dramatic', 'cinematic', 'contemplative'],
      has_gemini_key: !!apiKey,
      available: false,
    });
  }
});

ttsRouter.post('/api/tts/synthesize', async (req: AuthenticatedRequest, res: Response) => {
  const { text, voice, pacing, speed, backend } = req.body;
  if (!text || typeof text !== 'string') {
    return res.status(400).json({ error: 'Missing text content' });
  }

  // Resolve user-configured or environment Gemini API key
  let apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    try {
      const key = req.user ? `gemini_api_key:${req.user}` : 'gemini_api_key';
      const row = db.prepare("SELECT value FROM settings WHERE key = ?;").get(key) as { value: string } | undefined;
      if (row && row.value) {
        apiKey = row.value;
      } else if (req.user) {
        const globalRow = db.prepare("SELECT value FROM settings WHERE key = 'gemini_api_key';").get() as { value: string } | undefined;
        if (globalRow && globalRow.value) {
          apiKey = globalRow.value;
        }
      }
    } catch {
      // ignore
    }
  }

  const selectedBackend = backend || (apiKey ? 'gemini' : 'edge');
  const defaultVoice = selectedBackend === 'gemini' ? 'Fenrir' : 'en-US-ChristopherNeural';

  try {
    recordEvent(req.user, 'synthesize', 'tts_narration', { length: text.length, voice, pacing, backend: selectedBackend });
    let response = await fetch(`${PARLANDO_URL}/api/preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        voice: voice || defaultVoice,
        pacing: pacing || 'normal',
        speed: speed || 1.0,
        backend: selectedBackend,
        gemini_api_key: apiKey || undefined,
        api_key: apiKey || undefined,
      }),
    });

    // Fallback to edge engine if Gemini synthesis encounters an issue
    if (!response.ok && selectedBackend === 'gemini') {
      const geminiToEdgeMap: Record<string, string> = {
        'Fenrir': 'en-US-ChristopherNeural',
        'Puck': 'en-US-GuyNeural',
        'Charon': 'en-GB-RyanNeural',
        'Aoede': 'en-US-JennyNeural',
        'Kore': 'en-US-AriaNeural',
        'Leda': 'en-GB-SoniaNeural',
        'Oran': 'en-US-EricNeural',
        'Zephyr': 'en-US-RogerNeural',
      };
      const fallbackVoice = geminiToEdgeMap[voice] || 'en-US-ChristopherNeural';
      console.warn(`Gemini TTS synthesis failed, falling back to EdgeTTS (${fallbackVoice})...`);
      response = await fetch(`${PARLANDO_URL}/api/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          voice: fallbackVoice,
          pacing: pacing || 'normal',
          speed: speed || 1.0,
          backend: 'edge',
        }),
      });
    }

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Parlando error: ${errText}`);
    }

    const data = await response.json();
    res.json(data);
  } catch (err) {
    console.error('Parlando synthesis failed:', err);
    res.status(500).json({ error: (err as Error).message });
  }
});
