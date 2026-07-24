import { appendFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

const logDir = join(__dirname, '../../logs');
if (!existsSync(logDir)) mkdirSync(logDir, { recursive: true });

export function logError(context: string, err: any) {
  const timestamp = new Date().toISOString();
  const stack = err?.stack || (err instanceof Error ? err.stack : '');
  const message = err?.message || String(err);
  const line = [
    `=== ${timestamp} [${context}] ===`,
    `Message: ${message}`,
    stack ? `Stack: ${stack}` : '',
    '---',
  ].filter(Boolean).join('\n') + '\n';
  appendFileSync(join(logDir, 'error.log'), line);
}
