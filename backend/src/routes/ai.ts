import { Router, Response } from 'express';
import fs from 'fs/promises';
import path from 'path';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { db, recordTokenUsage } from '../db.js';
import { AuthenticatedRequest } from '../middleware/auth.js';
import { getTargetDir } from '../config.js';
import { isPathSafe } from '../utils/pathSafety.js';

export const aiRouter = Router();

async function getMarkdownFilesRecursively(dir: string, targetDir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const fullPath = path.resolve(dir, entry.name);
    if (!isPathSafe(fullPath, targetDir)) continue;
    if (entry.isDirectory()) {
      files.push(...(await getMarkdownFilesRecursively(fullPath, targetDir)));
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      files.push(fullPath);
    }
  }
  return files;
}

aiRouter.post('/api/ai/analyze', async (req: AuthenticatedRequest, res: Response) => {
  const { path: filePath, persona, message, history, contextFiles, selectedText } = req.body as { 
    path: string; 
    persona: string;
    message?: string;
    history?: { role: 'user' | 'model', content: string }[];
    contextFiles?: string[];
    selectedText?: string;
  };
  if (!filePath || !persona) {
    return res.status(400).json({ error: 'Missing path or persona parameter' });
  }

  try {
    const targetDir = getTargetDir(req);
    const safePath = path.resolve(targetDir, filePath);
    if (!isPathSafe(safePath, targetDir)) {
      return res.status(403).json({ error: 'Access denied' });
    }

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

    if (!apiKey) {
      return res.status(400).json({ error: 'GEMINI_API_KEY is not configured on the server.' });
    }

    let modelName = 'gemini-1.5-flash';
    try {
      const modelKey = req.user ? `gemini_model:${req.user}` : 'gemini_model';
      let row = db.prepare("SELECT value FROM settings WHERE key = ?;").get(modelKey) as { value: string } | undefined;
      if ((!row || !row.value) && req.user) {
        row = db.prepare("SELECT value FROM settings WHERE key = 'gemini_model';").get() as { value: string } | undefined;
      }
      if (row && row.value) {
        modelName = row.value;
      }
    } catch {
      // ignore
    }

    const cleanModelName = modelName.replace(/^models\//, '');

    let systemInstruction = '';
    switch (persona) {
      case 'developmental':
        systemInstruction = 'You are a professional Developmental (or Structural) Editor. Analyze the chapter draft. Focus on big-picture elements like structural pacing, character arcs, plot progression, narrative tension, and general concept. Provide constructive feedback, highlighting what works and listing specific suggestions for structural revision. If additional background context files are provided, use them to check plot continuity and arc pacing, but focus your core feedback critique report on the primary draft.';
        break;
      case 'line':
        systemInstruction = 'You are a professional Line Editor. Analyze the chapter draft. Focus on sentence-level and paragraph-level polishing, style, tone, clarity, flow, vocabulary choices, and sentence variety. Highlight weak phrasing, passive voice, run-on sentences, or tonal inconsistencies, and suggest clear revisions.';
        break;
      case 'copy':
        systemInstruction = 'You are a professional Copy Editor. Analyze the chapter draft. Focus on technical accuracy, grammar, punctuation, spelling, syntax errors, and stylistic consistency. Call out specific grammatical errors and provide clear corrections.';
        break;
      case 'proofreader':
        systemInstruction = 'You are a professional Proofreader. Analyze the chapter draft. Perform a final pass on the text, checking for remaining typos, formatting bugs, missing punctuation, double spaces, and minor slip-ups. List the errors found and how to fix them.';
        break;
      case 'write-with-me':
        systemInstruction = 'You are a collaborative co-writing partner. Analyze the chapter draft so far. Engage in a dialogue with the writer. Do NOT write the text for them. Instead, analyze what has been written (including any inline comments they wrote to you) and suggest what the next sentence or detail should focus on, or ask a guiding question. Keep your response conversational, friendly, and brief (1-2 sentences). If additional context files (outlines, beatsheets, worldbuilding) are provided, use them to keep the story aligned.';
        break;
      default:
        return res.status(400).json({ error: `Invalid editor persona: ${persona}` });
    }

    systemInstruction += `

Format your response exactly like this:
1. Always start your response with a thinking block containing your step-by-step reasoning process (analyze pacing, tone, style, typos, etc.). Use this format:
<thinking>
[Detail your thinking process here]
</thinking>

2. Below the thinking block, write your final reader-facing markdown feedback review report.

3. If you suggest specific text edits, always provide them as separate search/replace blocks at the end of your response. Format each search/replace block precisely as:
<<<<
[Original lines from the chapter text that you want to replace]
====
[New replacement lines]
>>>>

Ensure the text in the original block matches the chapter draft EXACTLY, word-for-word, including punctuation and newlines. If you are not recommending text changes, do not write these blocks.

CRITICAL CONSTRAINT: You must only propose text replacements (using search/replace blocks) for the primary chapter draft you are reviewing. NEVER suggest edits targeting the background context files. You do not have permission to suggest modifications to context files.`;

    if (selectedText) {
      systemInstruction += `\n\nCRITICAL CONTEXT: The writer has highlighted/selected the following text in the chapter draft: "${selectedText}". Focus your feedback, suggestions, or replies on this selected text.`;
    }

    const fileContent = await fs.readFile(safePath, 'utf-8');
    const cleanContent = persona === 'write-with-me' ? fileContent : fileContent.replace(/<!--[\s\S]*?-->/g, '');
    if (!cleanContent.trim()) {
      return res.json({ feedback: 'This file is empty. Write some text before calling the AI Editor!' });
    }

    let contextString = '';
    if (contextFiles && contextFiles.length > 0) {
      contextString = '\n\nHere is additional context from other files in the workspace to assist your analysis:\n';
      for (const cFile of contextFiles) {
        const cSafePath = path.resolve(targetDir, cFile);
        if (!isPathSafe(cSafePath, targetDir)) {
          return res.status(403).json({ error: `Access denied for context file: ${cFile}` });
        }
        try {
          const stat = await fs.stat(cSafePath);
          if (stat.isDirectory()) {
            const allFiles = await getMarkdownFilesRecursively(cSafePath, targetDir);
            for (const subFile of allFiles) {
              const subContent = await fs.readFile(subFile, 'utf-8');
              const cleanSub = persona === 'write-with-me' ? subContent : subContent.replace(/<!--[\s\S]*?-->/g, '');
              if (cleanSub.trim().length > 0) {
                const relativePath = path.relative(targetDir, subFile);
                contextString += `\n--- Context File: ${relativePath} ---\n${cleanSub}\n`;
              }
            }
          } else {
            const cContent = await fs.readFile(cSafePath, 'utf-8');
            const cleanCContent = persona === 'write-with-me' ? cContent : cContent.replace(/<!--[\s\S]*?-->/g, '');
            if (cleanCContent.trim().length > 0) {
              contextString += `\n--- Context File: ${cFile} ---\n${cleanCContent}\n`;
            }
          }
        } catch (e) {
          console.warn(`Could not read context path ${cFile}`, e);
        }
      }
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    if (history && history.length > 0) {
      const model = genAI.getGenerativeModel({ 
        model: cleanModelName,
        systemInstruction: systemInstruction + `\n\n--- CURRENT CHAPTER DRAFT ---\n${cleanContent}\n${contextString}`
      });
      const formattedHistory = history.map(h => ({
        role: h.role === 'user' ? 'user' : 'model',
        parts: [{ text: h.content }]
      }));
      const chat = model.startChat({ history: formattedHistory });
      const result = await chat.sendMessage(message || 'Suggest next');
      res.json({ feedback: result.response.text() });
    } else {
      const model = genAI.getGenerativeModel({ 
        model: cleanModelName,
        systemInstruction: systemInstruction
      });
      const prompt = `Please analyze this chapter draft:\n\n${cleanContent}${contextString}`;
      const result = await model.generateContent(prompt);
      res.json({ feedback: result.response.text() });
    }
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

aiRouter.get('/api/ai/cache', async (req: AuthenticatedRequest, res: Response) => {
  const { path: filePath, persona } = req.query as { path?: string; persona?: string };
  if (!filePath || !persona) {
    return res.status(400).json({ error: 'Missing path or persona parameter' });
  }

  try {
    const workspaceName = path.basename(getTargetDir(req));
    const row = db.prepare(`
      SELECT messages_json FROM ai_feedback_cache 
      WHERE workspace_name = ? AND file_path = ? AND persona = ?;
    `).get(workspaceName, filePath, persona) as { messages_json: string } | undefined;

    if (row && row.messages_json) {
      return res.json({ messages: JSON.parse(row.messages_json) });
    }
    return res.json({ messages: [] });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

aiRouter.post('/api/ai/cache', async (req: AuthenticatedRequest, res: Response) => {
  const { path: filePath, persona, messages } = req.body as { 
    path: string; 
    persona: string; 
    messages: any[] 
  };
  if (!filePath || !persona || !messages) {
    return res.status(400).json({ error: 'Missing path, persona, or messages parameter' });
  }

  try {
    const workspaceName = path.basename(getTargetDir(req));
    db.prepare(`
      INSERT OR REPLACE INTO ai_feedback_cache (workspace_name, file_path, persona, messages_json, updated_at)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP);
    `).run(workspaceName, filePath, persona, JSON.stringify(messages));
    
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

aiRouter.get('/api/gemini/models', async (req: AuthenticatedRequest, res: Response) => {
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

  if (!apiKey) {
    return res.json([
      { name: 'models/gemini-1.5-flash', displayName: 'Gemini 1.5 Flash' },
      { name: 'models/gemini-1.5-pro', displayName: 'Gemini 1.5 Pro' },
      { name: 'models/gemini-2.0-flash', displayName: 'Gemini 2.0 Flash' },
      { name: 'models/gemini-2.5-flash', displayName: 'Gemini 2.5 Flash' },
      { name: 'models/gemini-3.5-flash', displayName: 'Gemini 3.5 Flash' },
      { name: 'models/gemini-3.5-pro', displayName: 'Gemini 3.5 Pro' },
      { name: 'models/gemini-flash-latest', displayName: 'Gemini Flash Latest' },
      { name: 'models/gemini-pro-latest', displayName: 'Gemini Pro Latest' }
    ]);
  }

  try {
    const url = 'https://generativelanguage.googleapis.com/v1beta/models';
    const response = await fetch(url, {
      headers: {
        'x-goog-api-key': apiKey
      }
    });
    if (!response.ok) {
      throw new Error(`Google API returned status ${response.status}`);
    }
    const data = await response.json();
    const models = (data.models || [])
      .filter((m: any) => {
        const isSupported = m.supportedGenerationMethods?.includes('generateContent');
        const name = m.name || '';
        const stage = m.modelStage || '';

        // Exclude only officially legacy and deprecated models
        if (stage === 'LEGACY' || stage === 'DEPRECATED') {
          return false;
        }

        // Exclude non-text/embedding/image/veo/audio models
        if (
          name.includes('embedding') ||
          name.includes('imagen') ||
          name.includes('veo') ||
          name.includes('lyria') ||
          name.includes('robotics') ||
          name.includes('aqa') ||
          name.includes('banana') ||
          name.includes('nano') ||
          name.includes('gemma')
        ) {
          return false;
        }

        const isGeminiText = /gemini/i.test(name);
        return isSupported && isGeminiText;
      })
      .map((m: any) => ({
        name: m.name,
        displayName: m.displayName || m.name.replace('models/', '')
      }));
    res.json(models);
  } catch (err) {
    console.warn('Failed to fetch from live Gemini API, returning fallback list:', err);
    res.json([
      { name: 'models/gemini-1.5-flash', displayName: 'Gemini 1.5 Flash' },
      { name: 'models/gemini-1.5-pro', displayName: 'Gemini 1.5 Pro' },
      { name: 'models/gemini-2.0-flash', displayName: 'Gemini 2.0 Flash' },
      { name: 'models/gemini-2.5-flash', displayName: 'Gemini 2.5 Flash' },
      { name: 'models/gemini-3.5-flash', displayName: 'Gemini 3.5 Flash' },
      { name: 'models/gemini-3.5-pro', displayName: 'Gemini 3.5 Pro' },
      { name: 'models/gemini-flash-latest', displayName: 'Gemini Flash Latest' },
      { name: 'models/gemini-pro-latest', displayName: 'Gemini Pro Latest' }
    ]);
  }
});
