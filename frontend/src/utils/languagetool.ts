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
    const params = new URLSearchParams();
    params.append('text', text);
    params.append('language', 'en-US');

    const res = await fetch('https://api.languagetool.org/v2/check', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json'
      },
      body: params
    });

    if (!res.ok) {
      throw new Error(`LanguageTool API returned status ${res.status}`);
    }

    const data = await res.json();
    return data.matches || [];
  } catch (err) {
    console.error('LanguageTool check failed:', err);
    return [];
  }
};
