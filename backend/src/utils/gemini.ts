import { AuthenticatedRequest } from '../middleware/auth.js';
import { db } from '../db.js';

export const CANONICAL_GEMINI_VOICES = [
  { name: 'Puck', desc: 'Upbeat', gender: 'male' as const, accent: 'en-US' },
  { name: 'Charon', desc: 'Informative', gender: 'male' as const, accent: 'en-US' },
  { name: 'Kore', desc: 'Firm', gender: 'female' as const, accent: 'en-US' },
  { name: 'Fenrir', desc: 'Excitable', gender: 'male' as const, accent: 'en-US' },
  { name: 'Aoede', desc: 'Breezy', gender: 'female' as const, accent: 'en-US' },
  { name: 'Leda', desc: 'Youthful', gender: 'female' as const, accent: 'en-US' },
  { name: 'Orus', desc: 'Firm', gender: 'male' as const, accent: 'en-US' },
  { name: 'Zephyr', desc: 'Bright', gender: 'neutral' as const, accent: 'en-US' },
  { name: 'Callirrhoe', desc: 'Easy-going', gender: 'female' as const, accent: 'en-US' },
  { name: 'Autonoe', desc: 'Bright', gender: 'female' as const, accent: 'en-US' },
  { name: 'Enceladus', desc: 'Breathy', gender: 'male' as const, accent: 'en-US' },
  { name: 'Iapetus', desc: 'Clear', gender: 'male' as const, accent: 'en-US' },
  { name: 'Umbriel', desc: 'Easy-going', gender: 'male' as const, accent: 'en-US' },
  { name: 'Algieba', desc: 'Smooth', gender: 'neutral' as const, accent: 'en-US' },
  { name: 'Despina', desc: 'Smooth', gender: 'female' as const, accent: 'en-US' },
  { name: 'Erinome', desc: 'Clear', gender: 'female' as const, accent: 'en-US' },
  { name: 'Algenib', desc: 'Gravelly', gender: 'male' as const, accent: 'en-US' },
  { name: 'Rasalgethi', desc: 'Informative', gender: 'male' as const, accent: 'en-US' },
  { name: 'Laomedeia', desc: 'Upbeat', gender: 'female' as const, accent: 'en-US' },
  { name: 'Achernar', desc: 'Soft', gender: 'neutral' as const, accent: 'en-US' },
  { name: 'Alnilam', desc: 'Firm', gender: 'male' as const, accent: 'en-US' },
  { name: 'Schedar', desc: 'Even', gender: 'neutral' as const, accent: 'en-US' },
  { name: 'Gacrux', desc: 'Mature', gender: 'male' as const, accent: 'en-US' },
  { name: 'Pulcherrima', desc: 'Forward', gender: 'female' as const, accent: 'en-US' },
  { name: 'Achird', desc: 'Friendly', gender: 'male' as const, accent: 'en-US' },
  { name: 'Zubenelgenubi', desc: 'Casual', gender: 'male' as const, accent: 'en-US' },
  { name: 'Vindemiatrix', desc: 'Gentle', gender: 'female' as const, accent: 'en-US' },
  { name: 'Sadachbia', desc: 'Lively', gender: 'neutral' as const, accent: 'en-US' },
  { name: 'Sadaltager', desc: 'Knowledgeable', gender: 'male' as const, accent: 'en-US' },
  { name: 'Sulafat', desc: 'Warm', gender: 'neutral' as const, accent: 'en-US' },
];

export const CANONICAL_FEMALE_VOICES = ['Kore', 'Aoede', 'Leda', 'Callirrhoe', 'Autonoe', 'Despina', 'Erinome', 'Laomedeia', 'Pulcherrima', 'Vindemiatrix'];
export const CANONICAL_MALE_VOICES = ['Algenib', 'Charon', 'Fenrir', 'Puck', 'Orus', 'Enceladus', 'Iapetus', 'Umbriel', 'Rasalgethi', 'Alnilam', 'Gacrux', 'Achird', 'Zubenelgenubi', 'Sadaltager'];
export const CANONICAL_NEUTRAL_VOICES = ['Zephyr', 'Algieba', 'Achernar', 'Schedar', 'Sadachbia', 'Sulafat'];

export function resolveGeminiApiKey(req: AuthenticatedRequest): string | undefined {
  let apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    try {
      const key = req.user ? `gemini_api_key:${req.user}` : 'gemini_api_key';
      const row = db.prepare('SELECT value FROM settings WHERE key = ?;').get(key) as { value: string } | undefined;
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

export function resolveGeminiModelName(req: AuthenticatedRequest, defaultModel = 'gemini-1.5-flash'): string {
  let modelName = defaultModel;
  try {
    const modelKey = req.user ? `gemini_model:${req.user}` : 'gemini_model';
    let row = db.prepare('SELECT value FROM settings WHERE key = ?;').get(modelKey) as { value: string } | undefined;
    if ((!row || !row.value) && req.user) {
      row = db.prepare("SELECT value FROM settings WHERE key = 'gemini_model';").get() as { value: string } | undefined;
    }
    if (row && row.value) {
      modelName = row.value;
    }
  } catch {
    // ignore
  }
  return modelName.replace(/^models\//, '');
}
