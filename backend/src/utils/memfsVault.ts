import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { getStorageDir } from '../config.js';

export function getVaultDir(): string {
  const baseStorage = getStorageDir();
  const rootDir = path.dirname(baseStorage);
  return path.join(rootDir, 'vaults');
}

export function getVaultFilePath(username: string): string {
  return path.join(getVaultDir(), `${username}.vault`);
}

function deriveKey(secretKey: string, username: string): Buffer {
  return crypto.scryptSync(secretKey, `marginalia_salt_${username}`, 32);
}

export interface EncryptedVaultPayload {
  iv: string;
  authTag: string;
  data: string;
}

export function encryptPayload(dataBuffer: Buffer, key: Buffer): EncryptedVaultPayload {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(dataBuffer), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return {
    iv: iv.toString('hex'),
    authTag: authTag.toString('hex'),
    data: encrypted.toString('hex'),
  };
}

export function decryptPayload(payload: EncryptedVaultPayload, key: Buffer): Buffer {
  const iv = Buffer.from(payload.iv, 'hex');
  const authTag = Buffer.from(payload.authTag, 'hex');
  const encryptedData = Buffer.from(payload.data, 'hex');

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(encryptedData), decipher.final()]);
}

// In-Memory Virtual File Map: Map<username, Map<relativePath, string>>
const inMemoryVaultStore = new Map<string, Map<string, string>>();

export async function saveUserVaultToDisk(username: string, secretKey: string): Promise<void> {
  const userMap = inMemoryVaultStore.get(username);
  if (!userMap) {
    return;
  }

  const vaultDir = getVaultDir();
  await fs.mkdir(vaultDir, { recursive: true });

  const serialized = JSON.stringify(Object.fromEntries(userMap));
  const key = deriveKey(secretKey, username);
  const encryptedPayload = encryptPayload(Buffer.from(serialized, 'utf-8'), key);

  const vaultFile = getVaultFilePath(username);
  await fs.writeFile(vaultFile, JSON.stringify(encryptedPayload), 'utf-8');
}

export async function loadUserVaultFromDisk(username: string, secretKey: string): Promise<Map<string, string>> {
  if (inMemoryVaultStore.has(username)) {
    return inMemoryVaultStore.get(username)!;
  }

  const vaultFile = getVaultFilePath(username);
  const userMap = new Map<string, string>();

  try {
    const fileContent = await fs.readFile(vaultFile, 'utf-8');
    const payload: EncryptedVaultPayload = JSON.parse(fileContent);
    const key = deriveKey(secretKey, username);
    const decryptedBuffer = decryptPayload(payload, key);
    const parsedObj = JSON.parse(decryptedBuffer.toString('utf-8'));

    for (const [k, v] of Object.entries(parsedObj)) {
      userMap.set(k, v as string);
    }
  } catch (err) {
    // New user or vault does not exist yet
  }

  inMemoryVaultStore.set(username, userMap);
  return userMap;
}

export function getInMemoryFile(username: string, filePath: string): string | null {
  const userMap = inMemoryVaultStore.get(username);
  if (!userMap) {
    return null;
  }
  return userMap.get(filePath) ?? null;
}

export function setInMemoryFile(username: string, filePath: string, content: string): void {
  let userMap = inMemoryVaultStore.get(username);
  if (!userMap) {
    userMap = new Map<string, string>();
    inMemoryVaultStore.set(username, userMap);
  }
  userMap.set(filePath, content);
}

export function removeInMemoryUser(username: string): void {
  inMemoryVaultStore.delete(username);
}

export async function ingestDirectoryToVaultAndWipe(username: string, secretKey: string, dirPath: string): Promise<void> {
  let userMap = inMemoryVaultStore.get(username);
  if (!userMap) {
    userMap = new Map<string, string>();
    inMemoryVaultStore.set(username, userMap);
  }

  async function walkDir(currentDir: string, baseDir: string) {
    let entries: any[] = [];
    try {
      entries = await fs.readdir(currentDir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      const relPath = path.relative(baseDir, fullPath);
      if (entry.isDirectory()) {
        await walkDir(fullPath, baseDir);
      } else {
        try {
          const content = await fs.readFile(fullPath, 'utf-8');
          userMap!.set(relPath, content);
        } catch {
          // ignore non-text files
        }
      }
    }
  }

  try {
    await walkDir(dirPath, dirPath);
    await saveUserVaultToDisk(username, secretKey);
    await fs.rm(dirPath, { recursive: true, force: true });
  } catch (err) {
    console.warn(`Failed to ingest and wipe directory ${dirPath}:`, err);
  }
}
