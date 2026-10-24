# Demo script (3 minutes)

Before the demo: run `pnpm build && pnpm seed && pnpm start`, open the HTTPS URL on the phone once while online (so the service worker caches everything), and open `/clinic` on the laptop with the PIN.

1. **0:00 The scene (20 s).** A Lady Health Worker in Punjab, or a Health Extension Worker in the Ethiopian highlands, alone at a village home with a coughing child and no doctor.
2. **0:20 Field flow, offline (60 s).** Turn Wi-Fi off on the phone. Pick a language, accept the disclaimer, enter the age, tap through the danger signs and symptoms, tap the breath counter, and record a cough (or use the synthetic demo clip). Show the decision, the spoken reasons, and the caregiver card. Point out that the sound signal can only raise home care to a clinic visit, and only when the chart itself found no concerning signs.
3. **1:20 Dashboard (30 s).** Turn Wi-Fi on. The queued case syncs once, and the dashboard updates live: GO_NOW first, the translated summary, the reasons, and "Pick a clinic" with the routing note.
4. **1:50 Voice note (40 s).** Send a synthetic Urdu or Amharic voice note to the Telegram bot (or use `/voice` if Telegram misbehaves). Show the extraction, a follow-up button, the decision reply, and the new case on the dashboard. Note that a voice note alone never yields HOME, because breaths must be counted by an observer.
5. **2:30 Honesty (20 s).** Open `/limits`: synthetic tones, subject-level splits, the validation rule for tauHigh, and the line that a high AUROC is separation of synthetic tones only.
6. **2:50 Close.** Next steps: field trials with health workers, the national IMNCI protocol, real consented pediatric phone-cough data with subject-level evaluation, more languages, and WhatsApp deployment.

## Fallbacks

| Problem | Fallback |
|---|---|
| Telegram fails | `/voice` web upload |
| Gemini key missing or quota hit | Show the seeded voice-note case on the dashboard |
| Microphone blocked | "Use synthetic demo clip" on the cough screen |
| Venue Wi-Fi down | The field flow is fully offline; run the server on a laptop hotspot |
