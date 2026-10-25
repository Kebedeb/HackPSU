# Demo script (3 minutes)

Before the demo: run `pnpm build && pnpm seed && pnpm start`, open the HTTPS URL on the phone once while online (so the service worker caches everything), and open `/clinic` on the laptop with the PIN.

Tell it as one story about one child. The symptom rules come from the WHO child-illness chart; only the cough audio model, the patients and the clinics are demo data.

## The story

1. **0:00 A coughing child (20 s).** A Lady Health Worker in rural Punjab is at a village home. A two-year-old has had a cough for three days and is breathing fast. There is no doctor nearby and no signal. She opens Aman.
2. **0:20 The worker screens the child, offline (60 s).** Turn Wi-Fi off on the phone. Pick Urdu, accept the disclaimer, and enter the age. Tap through the danger signs and symptoms, count breaths with the tap counter, and record the cough (or use the demo clip). Aman shows the decision, reads the reasons aloud, and shows the caregiver card. Point out that the cough score is experimental and display-only: it never changes the referral decision.
3. **1:20 A family voice note arrives in Urdu (40 s).** Meanwhile, in another village, a mother sends an Urdu voice note to the Telegram bot about her own child's cough and fever (or use `/voice` if Telegram misbehaves). Show the transcript and extracted facts, the follow-up question button, and the decision reply in Urdu. A voice note alone never yields HOME, because breaths must be counted by someone watching the child.
4. **2:00 Both cases reach the clinic, most urgent first (40 s).** Turn Wi-Fi back on. The worker's queued case syncs, and the clinic screen updates live. The most urgent child is at the top: GO_NOW before REFER_SOON before HOME, youngest first within each level. Open the case to show the translated summary, the reasons, and "Pick a clinic" with the routing note.
5. **2:40 Close (20 s).** The child who needed a clinic today is the first one the clinic sees. Briefly open `/limits` to show the cough model is trained on synthetic tones and is not used by the decision. Next steps: field trials with health workers, the national IMNCI protocol, real consented pediatric cough recordings, more languages, and WhatsApp.

## Fallbacks

| Problem | Fallback |
|---|---|
| Telegram fails | `/voice` web upload |
| Gemini key missing or quota hit | Show the seeded voice-note case on the dashboard |
| Microphone blocked | "Use synthetic demo clip" on the cough screen |
| Venue Wi-Fi down | The field flow is fully offline; run the server on a laptop hotspot |
