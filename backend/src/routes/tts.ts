import { Router, Response } from 'express';
import fs from 'fs/promises';
import path from 'path';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { db, recordEvent } from '../db.js';
import { AuthenticatedRequest } from '../middleware/auth.js';
import { getTargetDir } from '../config.js';
import { isPathSafe } from '../utils/pathSafety.js';
import {
  resolveGeminiApiKey,
  CANONICAL_FEMALE_VOICES,
  CANONICAL_MALE_VOICES,
  CANONICAL_NEUTRAL_VOICES,
  CANONICAL_GEMINI_VOICES,
} from '../utils/gemini.js';

export const ttsRouter = Router();

const PARLANDO_URL = process.env.PARLANDO_URL || 'http://localhost:8765';

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

// GET saved cast settings from .marginalia/casting.json in repo, falling back to DB
ttsRouter.get('/api/tts/cast', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const targetDir = getTargetDir(req);
    const repoCastingPath = path.join(targetDir, '.marginalia', 'casting.json');
    
    try {
      const fileContent = await fs.readFile(repoCastingPath, 'utf-8');
      if (fileContent.trim()) {
        const parsed = JSON.parse(fileContent);
        // Handle both wrapper schema and raw cast object
        if (parsed.cast && typeof parsed.cast === 'object') {
          return res.json({
            cast: parsed.cast,
            selectedFiles: parsed.selectedFiles || [],
            narratorVoice: parsed.narratorVoice || 'Fenrir',
            exportTitle: parsed.exportTitle || 'Audiobook Master',
            exportAuthor: parsed.exportAuthor || 'Marginalia Author',
            exportFormat: parsed.exportFormat || 'mp3',
            exportPacing: parsed.exportPacing || 'dramatic',
            exportSpeed: parsed.exportSpeed || 1.0,
            source: 'repo',
            path: '.marginalia/casting.json',
          });
        }
        return res.json({ cast: parsed, source: 'repo', path: '.marginalia/casting.json' });
      }
    } catch {
      // file does not exist or invalid, try DB fallback
    }

    const key = req.user ? `tts_cast:${req.user}` : 'tts_cast';
    const row = db.prepare("SELECT value FROM settings WHERE key = ?;").get(key) as { value: string } | undefined;
    if (row && row.value) {
      const parsed = JSON.parse(row.value);
      if (parsed.cast && typeof parsed.cast === 'object') {
        return res.json({ ...parsed, source: 'db' });
      }
      return res.json({ cast: parsed, source: 'db' });
    }
    res.json({ cast: {}, source: 'empty' });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// POST save cast settings to .marginalia/casting.json in repo and cache in DB
ttsRouter.post('/api/tts/cast', async (req: AuthenticatedRequest, res: Response) => {
  const { cast, selectedFiles, narratorVoice, exportTitle, exportAuthor, exportFormat, exportPacing, exportSpeed } = req.body;
  if (!cast || typeof cast !== 'object') {
    return res.status(400).json({ error: 'Missing cast payload' });
  }
  try {
    const targetDir = getTargetDir(req);
    const marginaliaDir = path.join(targetDir, '.marginalia');
    const repoCastingPath = path.join(marginaliaDir, 'casting.json');

    const fullPayload = {
      cast,
      selectedFiles: selectedFiles || [],
      narratorVoice: narratorVoice || 'Fenrir',
      exportTitle: exportTitle || 'Audiobook Master',
      exportAuthor: exportAuthor || 'Marginalia Author',
      exportFormat: exportFormat || 'mp3',
      exportPacing: exportPacing || 'dramatic',
      exportSpeed: exportSpeed || 1.0,
      savedAt: new Date().toISOString(),
    };

    await fs.mkdir(marginaliaDir, { recursive: true });
    await fs.writeFile(repoCastingPath, JSON.stringify(fullPayload, null, 2), 'utf-8');

    const key = req.user ? `tts_cast:${req.user}` : 'tts_cast';
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?);").run(key, JSON.stringify(fullPayload));
    recordEvent(req.user, 'save', 'tts_cast', { characterCount: Object.keys(cast).length, path: '.marginalia/casting.json' });
    res.json({ success: true, ...fullPayload, path: '.marginalia/casting.json' });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// POST Refine single character persona and vocal prompt using Gemini
ttsRouter.post('/api/tts/refine-character', async (req: AuthenticatedRequest, res: Response) => {
  const { name, samples, context, currentDescription, currentStylePrompt, usedVoices } = req.body;
  if (!name) {
    return res.status(400).json({ error: 'Missing character name' });
  }

  const apiKey = resolveGeminiApiKey(req);
  if (!apiKey) {
    return res.status(400).json({ error: 'Gemini API key required for AI persona refinement' });
  }

  try {
    const ai = new GoogleGenerativeAI(apiKey);
    const model = ai.getGenerativeModel({ model: 'gemini-1.5-flash' });

    const prompt = `You are an expert dramaturg and voice casting director.
Analyze the following character and their dialogue samples to generate an evocative character description and a tailored vocal delivery direction for neural voice synthesis.

Character Name: "${name}"
Current Description: "${currentDescription || 'None'}"
Current Vocal Direction: "${currentStylePrompt || 'None'}"
Dialogue Quotes:
${(samples || []).map((s: string) => `- "${s}"`).join('\n') || 'None provided'}
Surrounding Context:
${context || 'None provided'}

Available Gemini Base Voices:
Puck (Upbeat), Charon (Informative), Kore (Firm), Fenrir (Excitable), Aoede (Breezy), Leda (Youthful), Orus (Firm), Zephyr (Bright), Callirrhoe (Easy-going), Autonoe (Bright), Enceladus (Breathy), Iapetus (Clear), Umbriel (Easy-going), Algieba (Smooth), Despina (Smooth), Erinome (Clear), Algenib (Gravelly), Rasalgethi (Informative), Laomedeia (Upbeat), Achernar (Soft), Alnilam (Firm), Schedar (Even), Gacrux (Mature), Pulcherrima (Forward), Achird (Friendly), Zubenelgenubi (Casual), Vindemiatrix (Gentle), Sadachbia (Lively), Sadaltager (Knowledgeable), Sulafat (Warm).

${Array.isArray(usedVoices) && usedVoices.length > 0 ? `Voices already assigned to other cast members (try to pick a DIFFERENT distinct voice if possible): ${usedVoices.join(', ')}` : ''}

Provide:
1. "description": Concise character background, age, and personality summary (1-2 sentences).
2. "stylePrompt": Expressive vocal style, accent, tempo, and emotion prompt (e.g. "In an aggressive, fast-paced New York Brooklyn accent, sounding irritable:" or "In a weary, low-register cyberpunk drawl, speaking slowly and cynically:").
3. "gender": "male" | "female" | "neutral"
4. "suggestedVoice": The best matching distinctive base voice from the list above.

Respond with ONLY a JSON object:
{
  "description": "...",
  "stylePrompt": "...",
  "gender": "male|female|neutral",
  "suggestedVoice": "..."
}`;

    const result = await model.generateContent(prompt);
    const responseText = result.response.text();
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return res.json(parsed);
    }
    res.json({
      description: currentDescription || `Character in manuscript: ${name}`,
      stylePrompt: currentStylePrompt || `In the distinct voice of ${name}:`,
      gender: 'neutral',
      suggestedVoice: 'Puck',
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// POST extract characters from selected markdown files
ttsRouter.post('/api/tts/extract-characters', async (req: AuthenticatedRequest, res: Response) => {
  const { files, text, narratorVoice } = req.body;
  const targetDir = getTargetDir(req);

  const fileEntries: Array<{ path: string; content: string }> = [];

  if (Array.isArray(files) && files.length > 0) {
    for (const relPath of files) {
      try {
        const fullPath = path.resolve(targetDir, relPath);
        if (isPathSafe(fullPath, targetDir)) {
          const content = await fs.readFile(fullPath, 'utf-8');
          if (content.trim()) {
            fileEntries.push({ path: relPath, content });
          }
        }
      } catch (err) {
        console.warn(`Could not read file ${relPath} for character extraction:`, err);
      }
    }
  } else if (text && typeof text === 'string' && text.trim()) {
    fileEntries.push({ path: 'Active Editor', content: text });
  }

  if (fileEntries.length === 0) {
    return res.status(400).json({ error: 'No valid manuscript text or files found for extraction' });
  }

  const apiKey = resolveGeminiApiKey(req);
  const selectedNarrator = narratorVoice || 'Fenrir';

  // 1. Direct LLM Extraction (High Fidelity & Clean Deduplication)
  if (apiKey) {
    try {
      const ai = new GoogleGenerativeAI(apiKey);
      const model = ai.getGenerativeModel({ model: 'gemini-1.5-flash' });

      // Combine excerpts from scanned files (up to ~30k chars for fast, accurate entity extraction)
      let combinedSample = '';
      for (const fe of fileEntries) {
        const truncated = fe.content.slice(0, 15000);
        combinedSample += `\n\n=== Chapter File: ${fe.path} ===\n\n${truncated}`;
        if (combinedSample.length > 45000) break;
      }

      const extractionPrompt = `You are a professional voice casting director and narrative dramaturg for audiobooks.
Read the following manuscript excerpt(s) and extract the canonical list of speaking characters who speak dialogue lines.

CRITICAL INSTRUCTIONS:
1. Do NOT extract sentence fragments, pronouns, narrator descriptions, or multiple duplicates for the same character.
2. Group all dialogue quotes for a character under their SINGLE canonical name (e.g. "Case", "Molly", "Armitage", "Ratz", "Julius Deane", "Linda Lee").
3. Assign a UNIQUE, DISTINCT base voice to each character from the list of 30 available voices below. Do NOT assign the same voice to multiple characters.
4. Do NOT assign the narrator voice ("${selectedNarrator}") to any character.

Available Gemini Base Voices (30 Total):
- Female: Kore (Firm), Aoede (Breezy), Leda (Youthful), Callirrhoe (Easy-going), Autonoe (Bright), Despina (Smooth), Erinome (Clear), Laomedeia (Upbeat), Pulcherrima (Forward), Vindemiatrix (Gentle)
- Male: Puck (Upbeat), Charon (Informative), Fenrir (Excitable), Orus (Firm), Enceladus (Breathy), Iapetus (Clear), Umbriel (Easy-going), Algenib (Gravelly), Rasalgethi (Informative), Alnilam (Firm), Gacrux (Mature), Achird (Friendly), Zubenelgenubi (Casual), Sadaltager (Knowledgeable)
- Neutral: Zephyr (Bright), Algieba (Smooth), Achernar (Soft), Schedar (Even), Sadachbia (Lively), Sulafat (Warm)

Manuscript Text:
${combinedSample}

Return ONLY a valid JSON array of character objects:
[
  {
    "name": "Canonical Character Name",
    "gender": "male" | "female" | "neutral",
    "description": "1-2 sentence personality, role, and attitude summary",
    "stylePrompt": "Evocative acting direction (e.g., 'In an aggressive, thick New York Brooklyn accent, fast-paced and irritable:')",
    "suggestedVoice": "Unique matching voice from list above",
    "sampleLines": ["Verbatim quote from text 1", "Verbatim quote 2"],
    "sourceFile": "${fileEntries[0].path}"
  }
]`;

      const aiResult = await model.generateContent(extractionPrompt);
      const aiText = aiResult.response.text();
      const jsonMatch = aiText.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]) as Array<{
          name: string;
          gender: 'male' | 'female' | 'neutral';
          description: string;
          stylePrompt: string;
          suggestedVoice: string;
          sampleLines: string[];
          sourceFile?: string;
        }>;

        if (Array.isArray(parsed) && parsed.length > 0) {
          // Collision avoidance enforcement
          const usedVoices = new Set<string>([selectedNarrator]);
          const characters = parsed.map((char) => {
            let voice = char.suggestedVoice;
            if (!voice || usedVoices.has(voice)) {
              const pool = char.gender === 'female' ? CANONICAL_FEMALE_VOICES : (char.gender === 'male' ? CANONICAL_MALE_VOICES : CANONICAL_NEUTRAL_VOICES);
              voice = pool.find(v => !usedVoices.has(v)) || CANONICAL_NEUTRAL_VOICES.find(v => !usedVoices.has(v)) || [...CANONICAL_MALE_VOICES, ...CANONICAL_FEMALE_VOICES, ...CANONICAL_NEUTRAL_VOICES].find(v => !usedVoices.has(v)) || pool[0];
            }
            usedVoices.add(voice);

            return {
              name: char.name.trim(),
              gender: char.gender || 'neutral',
              language: 'en-US',
              voice,
              dialogueCount: char.sampleLines ? char.sampleLines.length : 1,
              sampleLines: char.sampleLines || [],
              sourceFile: char.sourceFile || fileEntries[0].path,
              description: char.description || `Character: ${char.name}`,
              stylePrompt: char.stylePrompt || `In the distinct voice of ${char.name}:`,
            };
          });

          return res.json({
            characters,
            totalFilesScanned: fileEntries.length,
            filesScanned: fileEntries.map(f => f.path),
            totalCharacters: characters.length,
          });
        }
      }
    } catch (aiErr) {
      console.warn('Gemini character extraction failed, falling back to clean rule-based parser:', aiErr);
    }
  }

  // 2. Clean Rule-based Deduplicated Fallback
  const NON_NAMES = new Set([
    'He', 'She', 'They', 'It', 'The', 'A', 'An', 'One', 'Two', 'Chapter', 'Section',
    'Someone', 'Nobody', 'Everyone', 'Suddenly', 'Then', 'After', 'Before', 'While',
    'When', 'There', 'Here', 'What', 'Why', 'How', 'Where', 'Who', 'Whispered',
    'Muttered', 'Said', 'Asked', 'Replied', 'Shouted', 'Cried', 'Voice', 'Man', 'Woman'
  ]);

  const charMap = new Map<string, { count: number; samples: Set<string>; sourceFile: string; gender: 'male' | 'female' | 'neutral' }>();
  const dialogueRegex = /(?:“([^”]+)”|"([^"]+)")/g;
  const verbRegex = /\b(?:said|asked|replied|muttered|whispered|growled|snapped|murmured|cried|shouted|laughed|rasped)\b/i;
  const nameRegex = /\b([A-Z][a-z]+(?:\s[A-Z][a-z]+)?)\b/;

  const femaleKeywords = ['she', 'her', 'woman', 'girl', 'lady', 'miss', 'mrs', 'ms', 'linda', 'molly', 'aria', 'jenny', 'sonia', 'claire', 'elena'];
  const maleKeywords = ['he', 'him', 'his', 'man', 'boy', 'guy', 'sir', 'mr', 'case', 'clerk', 'wage', 'armitage', 'peter', 'john', 'brian'];

  for (const fe of fileEntries) {
    const lines = fe.content.split('\n');
    for (const line of lines) {
      const dMatches = [...line.matchAll(dialogueRegex)];
      if (dMatches.length > 0 && verbRegex.test(line)) {
        const nameMatch = line.match(nameRegex);
        if (nameMatch) {
          const rawName = nameMatch[1].trim();
          if (!NON_NAMES.has(rawName) && rawName.length >= 3) {
            const canonicalName = rawName.replace(/^The\s+/i, '');
            if (!charMap.has(canonicalName)) {
              const lowerLine = line.toLowerCase();
              const isFemale = femaleKeywords.some(w => lowerLine.includes(w));
              const isMale = maleKeywords.some(w => lowerLine.includes(w));
              charMap.set(canonicalName, {
                count: 0,
                samples: new Set(),
                sourceFile: fe.path,
                gender: isFemale ? 'female' : (isMale ? 'male' : 'neutral'),
              });
            }
            const record = charMap.get(canonicalName)!;
            record.count += 1;
            for (const dm of dMatches) {
              const quote = (dm[1] || dm[2] || '').trim();
              if (quote) record.samples.add(quote);
            }
          }
        }
      }
    }
  }

  const usedVoices = new Set<string>([selectedNarrator]);
  const sorted = Array.from(charMap.entries())
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 20);

  const fallbackCharacters = sorted.map(([name, data]) => {
    const pool = data.gender === 'female' ? CANONICAL_FEMALE_VOICES : (data.gender === 'male' ? CANONICAL_MALE_VOICES : CANONICAL_NEUTRAL_VOICES);
    let voice = pool.find(v => !usedVoices.has(v));
    if (!voice) voice = CANONICAL_NEUTRAL_VOICES.find(v => !usedVoices.has(v));
    if (!voice) voice = [...CANONICAL_MALE_VOICES, ...CANONICAL_FEMALE_VOICES, ...CANONICAL_NEUTRAL_VOICES].find(v => !usedVoices.has(v)) || pool[0];
    usedVoices.add(voice);

    return {
      name,
      gender: data.gender,
      language: 'en-US',
      voice,
      dialogueCount: data.count,
      sampleLines: Array.from(data.samples).slice(0, 10),
      sourceFile: data.sourceFile,
      description: `Character: ${name}`,
      stylePrompt: `In an expressive ${data.gender === 'female' ? 'female' : (data.gender === 'male' ? 'male' : 'neutral')} voice:`,
    };
  });

  res.json({
    characters: fallbackCharacters,
    totalFilesScanned: fileEntries.length,
    filesScanned: fileEntries.map(f => f.path),
    totalCharacters: fallbackCharacters.length,
  });
});

// Synthesize single preview or chunk
ttsRouter.post('/api/tts/synthesize', async (req: AuthenticatedRequest, res: Response) => {
  const { text, voice, pacing, speed, backend, characters, cast, dialogue_voice, model, stylePrompt } = req.body;
  if (!text || typeof text !== 'string') {
    return res.status(400).json({ error: 'Missing text content' });
  }

  const apiKey = resolveGeminiApiKey(req);
  const selectedBackend = backend || (apiKey ? 'gemini' : 'edge');
  const defaultVoice = selectedBackend === 'gemini' ? 'Fenrir' : 'en-US-ChristopherNeural';

  let textToSynthesize = text;
  if (selectedBackend === 'gemini' && stylePrompt && typeof stylePrompt === 'string' && stylePrompt.trim()) {
    const cleanQuote = text.replace(/^["'“](.*)["'”]$/s, '$1').trim();
    textToSynthesize = `${stylePrompt.trim()}\n"${cleanQuote}"`;
  }

  try {
    recordEvent(req.user, 'synthesize', 'tts_narration', { length: text.length, voice, pacing, backend: selectedBackend });
    let response = await fetch(`${PARLANDO_URL}/api/preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: textToSynthesize,
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

