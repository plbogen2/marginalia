import crypto from 'crypto';

export function createSessionToken(username: string, secret: string): string {
  const expires = Date.now() + 30 * 24 * 60 * 60 * 1000; // 30 days
  const data = JSON.stringify({ username, expires });
  const base64Data = Buffer.from(data).toString('base64');
  const signature = crypto.createHmac('sha256', secret).update(base64Data).digest('base64');
  return `${base64Data}.${signature}`;
}

export function verifySessionToken(token: string, secret: string): string | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [base64Data, signature] = parts;
  
  const expectedSignature = crypto.createHmac('sha256', secret).update(base64Data).digest('base64');
  if (signature !== expectedSignature) return null;

  try {
    const dataStr = Buffer.from(base64Data, 'base64').toString('utf-8');
    const { username, expires } = JSON.parse(dataStr) as { username: string, expires: number };
    if (Date.now() > expires) return null;
    return username;
  } catch (err) {
    return null;
  }
}
