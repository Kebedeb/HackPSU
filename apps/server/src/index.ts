import { fileURLToPath } from 'node:url';
import { buildApp } from './app';
import { startBot } from './bot';
import { openDb } from './db';
import { loadEnvFile, readConfig } from './env';
import { geminiExtractor } from './voice';

loadEnvFile();
const cfg = readConfig();
const db = openDb(cfg.databasePath);
const extractor = geminiExtractor(cfg.geminiApiKey, cfg.geminiModel);
const webDist = fileURLToPath(new URL('../../web/dist', import.meta.url));

const { app, emit } = buildApp({ db, dashboardPin: cfg.dashboardPin, extractor, webDist, logger: true });

if (cfg.pinIsPlaceholder) console.warn('DASHBOARD_PIN is not set; using the demo placeholder PIN "demo". This is not real authentication.');
if (!cfg.geminiApiKey) console.warn('GEMINI_API_KEY is not set; voice-note endpoints will return 503.');
if (cfg.telegramToken) startBot(cfg.telegramToken, db, extractor, emit);
else console.warn('TELEGRAM_BOT_TOKEN is not set; the Telegram bot is off.');

await app.listen({ port: cfg.port, host: '0.0.0.0' });
