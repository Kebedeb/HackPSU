# Safety and honesty

Aman is **screening and referral support, not diagnosis.** Every result shows: "Screening support. Not a diagnosis. Follow the health worker's judgment and local guidelines."

## The decision

- Only the transparent rule-based protocol in `packages/protocol` decides `HOME`, `REFER_SOON` or `GO_NOW`. The same engine runs on the phone and on the server, and the server always recomputes the decision rather than trusting the client.
- Every clinical number in `protocol.json` is cited to the published chart. The loader throws on any `TODO` placeholder.
- The most urgent matching rule wins. Every outcome returns reason keys, so the explanation is shown in the user's language.
- **Missing critical answers never produce a reassuring result.** If age, a danger sign, or another required answer is unknown, the outcome is at least `REFER_SOON` and the case is flagged for human review.

## Audio: one-way support signal

- Audio can only raise `HOME` to `REFER_SOON`. The rule is in `protocol.json`: cough must be true, and `audioScore` must be a finite number from 0 to 1 at or above `tauHigh`. The reason key is `audio_abnormal_sounds` and `audioEscalated` is true. Audio never lowers urgency and never produces `GO_NOW`. The loader rejects any other escalation target.
- A missing score is ignored. A score that is not finite or not inside 0 to 1 does not escalate and sets `needsHumanReview`.
- `tauHigh` is chosen on synthetic validation subjects (specificity at least 0.80 when possible, otherwise the best Youden index) and written into `protocol.json` by `ml/train.py`. It is not a clinical threshold.
- The score is shown as a support signal trained on synthetic tones, not children. A high AUROC in `ml/metrics.json` is separation of synthetic tones only.
- The current model is trained on **synthetic tones**: not children, not phone-recorded cough, not real recordings. Its metrics measure how well it separates two kinds of synthetic tone, not clinical performance.
- Evaluation uses **subject-level splits** (GroupShuffleSplit and GroupKFold on `subject_id`), because each subject contributes several recordings. Splitting by recording alone would leak a subject's voice and recording conditions across splits. `ml/train.py` asserts zero subject overlap, and a test checks `ml/metrics.json`.
- Any future dataset must follow the same rule. **SPRSound** is pediatric *stethoscope* (auscultation) lung-sound audio. Results on it are stethoscope lung-sound results, not phone-cough validation, and they need patient-level splits. COUGHVID and Coswara (both CC BY 4.0) are candidate phone-cough datasets but are mostly adult and were not used.

## Voice notes and the language model

- Gemini is used only to transcribe, translate and extract fields. Its output is validated with zod and passed to the protocol as data. It is never asked for, and never allowed to set, the outcome.
- Only clearly stated facts are marked true or false; everything else stays unknown.
- Families cannot reliably count breaths or check chest indrawing or stridor, so those stay unknown for voice-note cases. A voice note on its own therefore never yields `HOME`; it yields at least `REFER_SOON` with human review.
- Unclear or unsupported audio gets a reply asking the family to contact a health worker, and the case is flagged for review. The raw transcript is stored beside the decision.

## Known protocol limits (documented, not hidden)

- **Source.** The numeric cutoffs come from the WHO 2014 revision as printed in the Zimbabwe IMNCI chart booklet (2016). A real deployment must replace `protocol.json` with the national IMNCI booklet in use (Pakistan or Ethiopia), and a clinician must review it.
- **Chest indrawing at 2 to 59 months** maps to `REFER_SOON`, following the 2014 revision. The chart's exception for HIV-exposed or HIV-infected children (refer) cannot be applied, because this form has no HIV field.
- **Fever** at 2 months or older maps to `REFER_SOON`, because the chart's fever box needs a stiff-neck check, a malaria test and the duration, which this form does not collect. Fever in a young infant (under 2 months) maps to `GO_NOW`.
- **Diarrhoea** maps to `REFER_SOON`, because the dehydration classification needs signs this form does not collect.
- **Stridor in a young infant** maps to `GO_NOW`, because the young-infant chart refers severe breathing signs urgently. This is flagged for clinician review.
- **Age 5 years or older** is outside the chart: `REFER_SOON` with human review.
- **Medicine.** The app never gives dosing. The caregiver card says to give only medicine a health worker supplied, in the amount they stated.

## Data and translation

- All demo data is synthetic, and the clinics are invented and labeled as such. Do not enter real patient information. The map location is a synthetic point the worker picks, not the phone's GPS.
- The Urdu and Amharic text is a machine draft and is marked as such in the app. A native speaker must review it before any real use.
- The dashboard PIN is a demo placeholder, not authentication. Real deployment needs proper authentication, consent, data protection, and trials with health workers. Nothing here is clinically validated.
