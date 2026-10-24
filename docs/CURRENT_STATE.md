# Current state — v0.1.0-alpha

This is an early public baseline, not the completed game. Publication prepared 2026-10-25. The original private learner instance and its records are not included.

## Actual prototype

![Actual alpha: first district with disposable Explorer account](media/prototype-district.png)

![Actual alpha: first sound, a [a], before long-form listening](media/prototype-first-sound.png)

These are real browser captures from this public source plus its release asset pack, not the promotional concept images. Primary UI language is Chinese. The detailed outdoor scene covers limited authored areas, not every Prague street.

## Checks performed for this release

- 98 asset-free regression checks passed locally on Node 24.17.0 / Windows.
- Full suite: 107 checks passed after installing runtime assets.
- 5,892 runtime files matched the committed manifest's SHA-256 hashes.
- Isolated smoke run: first-run account setup, login/session, curriculum/game routes and audio byte-range delivery.
- Browser: new Explorer account entered the first district; first phoneme playback showed active playback feedback; moving to step 2, reloading and continuing restored step 2.
- This is a functional publication check, not proof of smooth performance on every device or learning effectiveness.

## Known limitations / contribution priorities

- Camera movement/map rendering can stutter; user playtesting already identified this. No universal zero-stutter claim.
- Fine-art world is two authored outdoor chunks; some remaining geography is coarse/provisional.
- Czech text, phonetics and progression need native-speaker/teacher review. Advanced course coverage is not validated C2 proficiency.
- Chinese-first UI, limited international onboarding/accessibility testing.
- Business loop is initial and fictional. Full property/trade systems are future work.
- Multiplayer is not implemented. No public hosted demo is provided.
- Some authoring recipes require source art/audio tools/upstream datasets beyond the ready-to-play asset pack.

## Baseline packaging changes

Public-only changes remove personalized defaults and machine-local paths, introduce portable startup/assets/test commands, retain renderer build inputs and source notices, and align the course shell/update-notice build identifier. A historical fixed-version assertion was updated to check the version format while the separate service-worker test checks exact runtime version equality.

The public history begins here. Previous private development backups, learner recordings, credentials and chat logs are excluded.

