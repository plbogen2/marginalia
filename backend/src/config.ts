import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const TARGET_DIR = process.env.TARGET_DIR || path.resolve(__dirname, '../../');
export const IGNORED_DIRS = ['.git', 'node_modules', 'backend', 'frontend', 'dist'];
