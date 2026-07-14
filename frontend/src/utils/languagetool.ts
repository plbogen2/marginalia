export interface LTMatch {
  message: string;
  shortMessage: string;
  offset: number;
  length: number;
  replacements: { value: string }[];
  rule: {
    id: string;
    issueType: string;
  };
}

export const checkGrammar = async (text: string): Promise<LTMatch[]> => {
  if (!text || text.trim().length === 0) {
    return [];
  }

  try {
    const res = await fetch('/api/languagetool/check', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ text })
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
