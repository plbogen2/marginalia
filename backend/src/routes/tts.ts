import { Router, Response } from 'express';
import fs from 'fs/promises';
import path from 'path';
import { db, recordEvent } from '../db.js';
import { AuthenticatedRequest } from '../middleware/auth.js';
import { getTargetDir } from '../config.js';
import { isPathSafe } from '../utils/pathSafety.js';

export const ttsRouter = Router();

const PARLANDO_URL = process.env.PARLANDO_URL || 'http://localhost:8765';

function resolveGeminiApiKey(req: AuthenticatedRequest): string | undefined {
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
  return apiKey;
}

ttsRouter.get('/api/tts/voices', async (req: AuthenticatedRequest, res: Response) => {
  const apiKey = resolveGeminiApiKey(req);
  try {
    const response = await fetch(`${PARLANDO_URL}/api/voices`);
    if (!response.ok) throw new Error('Parlando API unavailable');
    const data = await response.json();
    res.json({ ...data, has_gemini_key: !!apiKey, available: true });
  } catch {
    res.json({
      voices: [
        'Fenrir', 'Puck', 'Charon', 'Aoede', 'Kore', 'Leda', 'Orus', 'Zephyr',
        'Callirrhoe', 'Autonoe', 'Enceladus', 'Iapetus', 'Umbriel', 'Algieba',
        'Despina', 'Erinome', 'Algenib', 'Rasalgethi', 'Laomedeia', 'Achernar',
        'Alnilam', 'Schedar', 'Gacrux', 'Pulcherrima', 'Achird', 'Zubenelgenubi',
        'Vindemiatrix', 'Sadachbia', 'Sadaltager', 'Sulafat',
        'en-US-ChristopherNeural', 'en-US-GuyNeural', 'en-US-JennyNeural', 'en-US-AriaNeural',
        'en-GB-RyanNeural', 'en-GB-SoniaNeural', 'en-SG-LunaNeural', 'en-AU-NatashaNeural',
      ],
      profiles: ['cyberpunk_noir', 'space_opera', 'classic_fiction'],
      pacing: ['normal', 'brisk', 'dramatic', 'cinematic', 'contemplative'],
      has_gemini_key: !!apiKey,
      available: false,
    });
  }
});

// GET saved cast settings
ttsRouter.get('/api/tts/cast', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const key = req.user ? `tts_cast:${req.user}` : 'tts_cast';
    const row = db.prepare("SELECT value FROM settings WHERE key = ?;").get(key) as { value: string } | undefined;
    if (row && row.value) {
      return res.json({ cast: JSON.parse(row.value) });
    }
    res.json({ cast: {} });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// POST save cast settings
ttsRouter.post('/api/tts/cast', async (req: AuthenticatedRequest, res: Response) => {
  const { cast } = req.body;
  if (!cast || typeof cast !== 'object') {
    return res.status(400).json({ error: 'Missing cast payload' });
  }
  try {
    const key = req.user ? `tts_cast:${req.user}` : 'tts_cast';
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?);").run(key, JSON.stringify(cast));
    recordEvent(req.user, 'save', 'tts_cast', { characterCount: Object.keys(cast).length });
    res.json({ success: true, cast });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// Extract characters across single or multiple files
ttsRouter.post('/api/tts/extract-characters', async (req: AuthenticatedRequest, res: Response) => {
  const { files, text } = req.body;
  const targetDir = getTargetDir(req);

  let combinedText = '';
  const filesScanned: string[] = [];

  if (Array.isArray(files) && files.length > 0) {
    for (const relPath of files) {
      try {
        const fullPath = path.resolve(targetDir, relPath);
        if (isPathSafe(fullPath, targetDir)) {
          const content = await fs.readFile(fullPath, 'utf-8');
          combinedText += `\n\n# Chapter: ${path.basename(relPath, '.md')}\n\n` + content;
          filesScanned.push(relPath);
        }
      } catch (err) {
        console.warn(`Could not read file ${relPath} for character extraction:`, err);
      }
    }
  } else if (text && typeof text === 'string') {
    combinedText = text;
    filesScanned.push('Active Editor');
  }

  if (!combinedText.trim()) {
    return res.status(400).json({ error: 'No text or valid files provided for extraction' });
  }

  try {
    const dialogueRegex = /(?:“([^”]+)”|"([^"]+)")/g;
    const tagRegex = /(?:([A-Z][a-zA-Z\s]{1,24})\s+(?:said|asked|shouted|whispered|rasped|muttered|cried|replied|growled|snapped|laughed|murmured))|(?:(?:said|asked|shouted|whispered|rasped|muttered|cried|replied|growled|snapped|laughed|murmured)\s+([A-Z][a-zA-Z\s]{1,24}))/g;

    const charStats: Record<string, { count: number; samples: string[]; gender: 'male' | 'female' | 'neutral'; language: string; voice: string }> = {};

    const femaleMarkers = ['she', 'her', 'woman', 'girl', 'lady', 'miss', 'mrs', 'ms', 'linda', 'molly', 'aria', 'jenny', 'sonia', 'claire', 'elena'];
    const maleMarkers = ['he', 'him', 'his', 'man', 'boy', 'guy', 'sir', 'mr', 'case', 'clerk', 'wage', 'armitage', 'peter', 'john', 'brian'];

    const lines = combinedText.split('\n');
    for (const line of lines) {
      const dMatches = [...line.matchAll(dialogueRegex)];
      if (dMatches.length > 0) {
        let speakerName = 'Unknown';
        const tagMatches = [...line.matchAll(tagRegex)];
        if (tagMatches.length > 0) {
          const rawName = (tagMatches[0][1] || tagMatches[0][2] || '').trim();
          if (rawName && !['He', 'She', 'They', 'It', 'The', 'A', 'An', 'One', 'Two', 'Chapter', 'Section'].includes(rawName)) {
            speakerName = rawName;
          }
        }

        if (speakerName !== 'Unknown') {
          if (!charStats[speakerName]) {
            const lowerName = speakerName.toLowerCase();
            const isFemale = femaleMarkers.some(m => lowerName.includes(m) || line.toLowerCase().includes(` ${m} `));
            const isMale = maleMarkers.some(m => lowerName.includes(m) || line.toLowerCase().includes(` ${m} `));
            const gender: 'male' | 'female' | 'neutral' = isFemale ? 'female' : isMale ? 'male' : 'neutral';
            
            let defaultVoice = 'Fenrir';
            if (gender === 'male') defaultVoice = 'Iapetus';
            if (gender === 'female') defaultVoice = 'Callirrhoe';

            charStats[speakerName] = {
              count: 0,
              samples: [],
              gender,
              language: 'en-US',
              voice: defaultVoice,
            };
          }
          charStats[speakerName].count += 1;
          const quote = dMatches[0][1] || dMatches[0][2];
          if (quote && charStats[speakerName].samples.length < 3) {
            charStats[speakerName].samples.push(quote);
          }
        }
      }
    }

    const characters = Object.entries(charStats).map(([name, data]) => ({
      name,
      dialogueCount: data.count,
      sampleLines: data.samples,
      gender: data.gender,
      suggestedLanguage: data.language,
      suggestedVoice: data.voice,
    })).sort((a, b) => b.dialogueCount - a.dialogueCount);

    res.json({
      characters,
      totalFilesScanned: filesScanned.length,
      filesScanned,
      totalCharacters: characters.length,
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// Synthesize single preview or chunk
ttsRouter.post('/api/tts/synthesize', async (req: AuthenticatedRequest, res: Response) => {
  const { text, voice, pacing, speed, backend, characters, cast, dialogue_voice, model } = req.body;
  if (!text || typeof text !== 'string') {
    return res.status(400).json({ error: 'Missing text content' });
  }

  const apiKey = resolveGeminiApiKey(req);
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
        characters: characters || undefined,
        cast: cast || undefined,
        dialogue_voice: dialogue_voice || undefined,
        model: model || undefined,
      }),
    });

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

// Full Master MP3 / M4B Export across single or multiple files
ttsRouter.post('/api/tts/export', async (req: AuthenticatedRequest, res: Response) => {
  const { files, text, title, author, voice, cast, pacing, speed, backend, format } = req.body;
  const targetDir = getTargetDir(req);

  let combinedText = '';
  let exportTitle = title || 'Audiobook Master';

  if (Array.isArray(files) && files.length > 0) {
    for (const relPath of files) {
      try {
        const fullPath = path.resolve(targetDir, relPath);
        if (isPathSafe(fullPath, targetDir)) {
          const content = await fs.readFile(fullPath, 'utf-8');
          const cleanName = path.basename(relPath, '.md').replace(/^[0-9]+[_\-\s]*/, '');
          combinedText += `\n\n# Chapter: ${cleanName}\n\n` + content;
        }
      } catch (err) {
        console.warn(`Could not read file ${relPath} for export:`, err);
      }
    }
    if (!title && files.length === 1) {
      exportTitle = path.basename(files[0], '.md');
    }
  } else if (text && typeof text === 'string') {
    combinedText = text;
  }

  if (!combinedText.trim()) {
    return res.status(400).json({ error: 'No manuscript text or valid files provided for export' });
  }

  const apiKey = resolveGeminiApiKey(req);
  const selectedBackend = backend || (apiKey ? 'gemini' : 'edge');
  const selectedVoice = voice || (selectedBackend === 'gemini' ? 'Fenrir' : 'en-US-ChristopherNeural');
  const exportFormat = format === 'm4b' ? 'm4b' : 'mp3';

  try {
    recordEvent(req.user, 'export', 'tts_audiobook', {
      filesCount: files?.length || 1,
      title: exportTitle,
      backend: selectedBackend,
      format: exportFormat,
    });

    const initResp = await fetch(`${PARLANDO_URL}/api/synthesize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: combinedText,
        title: exportTitle,
        author: author || 'Marginalia Studio',
        voice: selectedVoice,
        cast: cast || undefined,
        pacing: pacing || 'normal',
        speed: speed || 1.0,
        backend: selectedBackend,
        gemini_api_key: apiKey || undefined,
        api_key: apiKey || undefined,
        format: exportFormat,
      }),
    });

    if (!initResp.ok) {
      const err = await initResp.text();
      throw new Error(`Parlando synthesis initiation failed: ${err}`);
    }

    const { job_id } = await initResp.json();

    let completedAudioPath: string | null = null;
    for (let i = 0; i < 60; i++) {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      const pollResp = await fetch(`${PARLANDO_URL}/api/job/${job_id}`);
      if (pollResp.ok) {
        const job = await pollResp.json();
        if (job.state === 'COMPLETE' && job.audio_path) {
          completedAudioPath = job.audio_path;
          break;
        } else if (job.state === 'ERROR') {
          throw new Error(job.error || 'Parlando render error');
        }
      }
    }

    if (!completedAudioPath || !await fs.stat(completedAudioPath).catch(() => null)) {
      throw new Error('Audiobook rendering timed out or audio file was not found.');
    }

    const fileBuffer = await fs.readFile(completedAudioPath);
    const safeFilename = `${exportTitle.replace(/[^a-zA-Z0-9_\-]/g, '_')}.${exportFormat}`;

    res.setHeader('Content-Type', exportFormat === 'm4b' ? 'audio/mp4' : 'audio/mpeg');
    res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"`);
    res.setHeader('Content-Length', fileBuffer.length);
    res.send(fileBuffer);
  } catch (err) {
    console.error('Audiobook export failed:', err);
    res.status(500).json({ error: (err as Error).message });
  }
});

