import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/** Minimal .env loader; real environment variables win over the file. */
export function loadEnvFile(path = resolve(process.cwd(), '.env')): void {
  for (const candidate of [path, resolve(process.cwd(), '../../.env')]) {
    if (!existsSync(candidate)) continue;
    for (const line of readFileSync(candidate, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*(#.*)?$/);
      if (!m) continue;
      const value = m[2].replace(/^(['"])(.*)\1$/, '$2');
      if (process.env[m[1]] === undefined && value !== '') process.env[m[1]] = value;
    }
    return;
  }
}

/** Gemini model used for voice-note extraction when GEMINI_MODEL is unset. */
export const DEFAULT_GEMINI_MODEL = 'gemini-3.8-flash';

export interface ServerConfig {
  port: number;
  databasePath: string;
  dashboardPin: string;
  pinIsPlaceholder: boolean;
  geminiApiKey?: string;
  geminiModel: string;
  telegramToken?: string;
  publicUrl?: string;
}

export function readConfig(): ServerConfig {
  const pin = process.env.DASHBOARD_PIN;
  return {
    port: Number(process.env.PORT ?? 3000),
    databasePath: process.env.DATABASE_PATH ?? './data/aman.db',
    dashboardPin: pin || 'demo',
    pinIsPlaceholder: !pin,
    geminiApiKey: process.env.GEMINI_API_KEY || undefined,
    geminiModel: process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL,
    telegramToken: process.env.TELEGRAM_BOT_TOKEN || undefined,
    publicUrl: process.env.PUBLIC_URL || undefined,
  };
}
