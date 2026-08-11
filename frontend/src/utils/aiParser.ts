export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  content: string; // display markdown content
  rawContent: string; // original raw string
  thinking?: string;
  suggestions: {
    id: string;
    original: string;
    replacement: string;
    applied: boolean;
  }[];
}

export const parseMessage = (rawText: string, msgId: string): ChatMessage => {
  let displayContent = rawText;
  let thinking: string | undefined;

  // 1. Extract thinking tag content
  const thinkingMatch = displayContent.match(/<thinking>([\s\S]*?)<\/thinking>/i);
  if (thinkingMatch) {
    thinking = thinkingMatch[1].trim();
    displayContent = displayContent.replace(/<thinking>[\s\S]*?<\/thinking>/gi, '').trim();
  }

  // 2. Extract search/replace diff blocks
  const suggestions: ChatMessage['suggestions'] = [];
  const blockRegex = /<<<<\n([\s\S]*?)\n====\n([\s\S]*?)\n>>>>/g;
  let match;
  let index = 0;
  while ((match = blockRegex.exec(displayContent)) !== null) {
    suggestions.push({
      id: `${msgId}-suggest-${index++}`,
      original: match[1],
      replacement: match[2],
      applied: false
    });
  }

  // Strip suggestions from display markdown
  displayContent = displayContent.replace(/<<<<\n[\s\S]*?\n====\n[\s\S]*?\n>>>>/g, '').trim();

  return {
    id: msgId,
    role: 'model',
    content: displayContent,
    rawContent: rawText,
    thinking,
    suggestions
  };
};
