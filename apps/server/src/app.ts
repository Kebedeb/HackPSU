import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, isAbsolute, join, normalize, relative, resolve, sep } from 'node:path';
import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import { evaluate } from '@aman/protocol';
import {
  CasePatchSchema,
  CaseStatusSchema,
  CaseSubmissionSchema,
  type CaseEvent,
  type CaseRecord,
} from '@aman/types';
import { getCase, getClinic, listCases, listClinics, saveCase, saveClinic, type DB } from './db';
import { pickClinic } from './routing';
import {
  applyFollowup,
  buildVoiceCase,
  FollowupAnswerSchema,
  nextFollowup,
  VoiceUnavailableError,
  type Extractor,
} from './voice';

export interface AppOptions {
  db: DB;
  dashboardPin: string;
  extractor: Extractor;
  webDist?: string;
  logger?: boolean;
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.txt': 'text/plain; charset=utf-8',
};

export function buildApp(opts: AppOptions) {
  const app = Fastify({ logger: opts.logger ?? false, bodyLimit: 15 * 1024 * 1024 });
  const { db } = opts;
  const listeners = new Set<(e: CaseEvent) => void>();
  const emit = (e: CaseEvent) => listeners.forEach((l) => l(e));

  app.addContentTypeParser(/^(audio\/.*|application\/octet-stream)$/, { parseAs: 'buffer' }, (_req, body, done) => done(null, body));

  const requirePin = async (req: FastifyRequest, reply: FastifyReply) => {
    const q = req.query as Record<string, string | undefined>;
    const pin = (req.headers['x-dashboard-pin'] as string | undefined) ?? q.pin;
    if (pin !== opts.dashboardPin) return reply.code(401).send({ error: 'Dashboard PIN required (demo placeholder, not real authentication).' });
  };

  const store = (c: CaseRecord, type: CaseEvent['type']) => {
    saveCase(db, c);
    emit({ type, case: c });
    return c;
  };

  app.get('/api/health', async () => ({ ok: true }));

  // Open so the offline field app can sync without a PIN. The decision is always recomputed here.
  app.post('/api/cases', async (req, reply) => {
    const parsed = CaseSubmissionSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid case', issues: parsed.error.issues });
    const s = parsed.data;
    const existing = getCase(db, s.id);
    const d = evaluate(
      { patient: s.patient, symptoms: s.symptoms, breathRatePerMin: s.breathRatePerMin },
      undefined,
      s.audio?.score,
    );
    const record: CaseRecord = {
      id: s.id,
      createdAt: existing?.createdAt ?? s.createdAt,
      source: s.source,
      language: s.language,
      patient: s.patient,
      symptoms: s.symptoms,
      breathRatePerMin: s.breathRatePerMin,
      ...(s.audio ? { audio: { ...s.audio, experimental: true as const } } : {}),
      decision: { outcome: d.outcome, reasonKeys: d.reasonKeys, protocolVersion: d.protocolVersion, audioEscalated: d.audioEscalated },
      summary: s.summary,
      missingFields: d.missingFields,
      needsHumanReview: d.needsHumanReview,
      status: existing?.status ?? 'new',
      ...(existing?.clinicId ? { clinicId: existing.clinicId } : {}),
      ...(existing?.routingNote ? { routingNote: existing.routingNote } : {}),
      ...(s.location ? { location: s.location } : {}),
    };
    store(record, 'case_upserted');
    return reply.code(existing ? 200 : 201).send(record);
  });

  app.get('/api/cases', { preHandler: requirePin }, async (req, reply) => {
    const q = req.query as Record<string, string | undefined>;
    if (q.status !== undefined) {
      const st = CaseStatusSchema.safeParse(q.status);
      if (!st.success) return reply.code(400).send({ error: 'Unknown status' });
      return listCases(db, st.data);
    }
    return listCases(db);
  });

  app.get('/api/cases/:id', { preHandler: requirePin }, async (req, reply) => {
    const c = getCase(db, (req.params as { id: string }).id);
    return c ?? reply.code(404).send({ error: 'Not found' });
  });

  app.patch('/api/cases/:id', { preHandler: requirePin }, async (req, reply) => {
    const c = getCase(db, (req.params as { id: string }).id);
    if (!c) return reply.code(404).send({ error: 'Not found' });
    const parsed = CasePatchSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid update', issues: parsed.error.issues });
    const next: CaseRecord = { ...c };
    if (parsed.data.status) next.status = parsed.data.status;
    if (parsed.data.clinicId !== undefined) {
      if (parsed.data.clinicId === null) {
        delete next.clinicId;
        delete next.routingNote;
      } else {
        if (!getClinic(db, parsed.data.clinicId)) return reply.code(400).send({ error: 'Unknown clinic' });
        next.clinicId = parsed.data.clinicId;
        next.routingNote = 'Assigned manually by clinic staff.';
      }
    }
    return store(next, 'case_updated');
  });

  app.post('/api/cases/:id/route', { preHandler: requirePin }, async (req, reply) => {
    const c = getCase(db, (req.params as { id: string }).id);
    if (!c) return reply.code(404).send({ error: 'Not found' });
    const choice = pickClinic(c, listClinics(db));
    if (!choice) return reply.code(409).send({ error: 'No clinic has capacity' });
    saveClinic(db, { ...choice.clinic, capacityRemaining: choice.clinic.capacityRemaining - 1 });
    return store({ ...c, clinicId: choice.clinic.id, routingNote: choice.note }, 'case_updated');
  });

  app.get('/api/clinics', { preHandler: requirePin }, async () => listClinics(db));

  app.get('/api/stream', { preHandler: requirePin }, (req, reply) => {
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    reply.raw.write(': connected\n\n');
    const send = (e: CaseEvent) => reply.raw.write(`event: ${e.type}\ndata: ${JSON.stringify(e.case)}\n\n`);
    listeners.add(send);
    const beat = setInterval(() => reply.raw.write(': ping\n\n'), 25000);
    req.raw.on('close', () => {
      clearInterval(beat);
      listeners.delete(send);
    });
    reply.hijack();
  });

  app.post('/api/voice-intake', { preHandler: requirePin }, async (req, reply) => {
    const body = req.body;
    if (!Buffer.isBuffer(body) || body.length === 0) return reply.code(400).send({ error: 'Send the audio file as the raw request body with an audio/* content type.' });
    try {
      const extraction = await opts.extractor(body, (req.headers['content-type'] ?? 'audio/ogg').split(';')[0]);
      const c = store(buildVoiceCase(extraction), 'case_upserted');
      return reply.code(201).send({ case: c, extraction, nextQuestion: nextFollowup(c) });
    } catch (err) {
      if (err instanceof VoiceUnavailableError) return reply.code(503).send({ error: err.message });
      req.log.error(err);
      return reply.code(502).send({ error: 'Voice-note extraction failed. Ask the family to contact a health worker.' });
    }
  });

  app.post('/api/voice-intake/:id/answer', { preHandler: requirePin }, async (req, reply) => {
    const c = getCase(db, (req.params as { id: string }).id);
    if (!c || c.source !== 'voice_note') return reply.code(404).send({ error: 'Voice case not found' });
    const parsed = FollowupAnswerSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid answer', issues: parsed.error.issues });
    try {
      const next = store(applyFollowup(c, parsed.data.field, parsed.data.value), 'case_updated');
      return { case: next, nextQuestion: nextFollowup(next) };
    } catch (err) {
      return reply.code(400).send({ error: (err as Error).message });
    }
  });

  if (opts.webDist && existsSync(opts.webDist)) {
    const root = resolve(opts.webDist);
    const index = join(root, 'index.html');
    app.get('/*', async (req, reply) => {
      let urlPath: string;
      try {
        urlPath = decodeURIComponent((req.params as { '*': string })['*'] ?? '');
      } catch {
        return reply.code(400).send({ error: 'Bad request path' });
      }
      const file = normalize(join(root, urlPath));
      // relative() climbs out with '..' (or is absolute on another drive) when file is outside root.
      const rel = relative(root, file);
      if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
        return reply.code(404).send({ error: 'Not found' });
      }
      if (existsSync(file) && statSync(file).isFile()) {
        const ext = extname(file);
        reply.header('Content-Type', MIME[ext] ?? 'application/octet-stream');
        if (file.endsWith('sw.js') || ext === '.html') reply.header('Cache-Control', 'no-cache');
        return reply.send(readFileSync(file));
      }
      if (urlPath.startsWith('api/')) return reply.code(404).send({ error: 'Not found' });
      reply.header('Content-Type', MIME['.html']).header('Cache-Control', 'no-cache');
      return reply.send(readFileSync(index));
    });
  }

  return { app, emit, listeners };
}
