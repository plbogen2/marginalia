import crypto from 'crypto';

export interface SessionData {
  username: string;
  accessToken?: string;
}

export function createSessionToken(username: string, secret: string, accessToken?: string): string {
  const expires = Date.now() + 30 * 24 * 60 * 60 * 1000; // 30 days
  const data = JSON.stringify({ username, expires, accessToken });
  const base64Data = Buffer.from(data).toString('base64');
  const signature = crypto.createHmac('sha256', secret).update(base64Data).digest('base64');
  return `${base64Data}.${signature}`;
}

export function verifySessionToken(token: string, secret: string): SessionData | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [base64Data, signature] = parts;
  
  const expectedSignature = crypto.createHmac('sha256', secret).update(base64Data).digest('base64');
  if (signature !== expectedSignature) return null;

  try {
    const dataStr = Buffer.from(base64Data, 'base64').toString('utf-8');
    const parsed = JSON.parse(dataStr) as { username: string, expires: number, accessToken?: string };
    if (Date.now() > parsed.expires) return null;
    return { username: parsed.username, accessToken: parsed.accessToken };
  } catch (err) {
    return null;
  }
}
