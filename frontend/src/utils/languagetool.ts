export interface LTMatch {
  message: string;
  shortMessage: string;
  offset: number;
  length: number;
  sentence: string;
  replacements: { value: string }[];
  rule: {
    id: string;
    issueType: string;
    description?: string;
  };
}

export const checkGrammar = async (text: string, filePath?: string | null): Promise<LTMatch[]> => {
  if (!text || text.trim().length === 0) {
    return [];
  }

  try {
    const res = await fetch('/api/languagetool/check', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ text, filePath })
    });

    if (!res.ok) {
      throw new Error(`Spellcheck proxy returned status ${res.status}`);
    }

    const data = await res.json();
    return data.matches || [];
  } catch (err) {
    console.error('Spellcheck failed:', err);
    return [];
  }
};
