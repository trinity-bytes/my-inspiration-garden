# Inline uploaded-video playback
Objective: Keep uploaded-video cards static and play videos inside the clicked-card detail modal.
Branch: feat/inline-video; delivery: ask-on-risk; forecast: 650 authored lines; runner: mise exec -- pnpm test.

## Specs
S1. "aparece pero no en la card de previsualizacion." Fix uploaded-video previews; verify poster decoding and serving.
S2. "ademas, aprovechando que esta subido en internet seria interesante que permita ver el video desde el mismo card".
S3. Superseded by the owner correction: "me equivoqué, cuando pedi la orevisualizacion dle video me referia a que pase en el modal que se abre al hscerncoick en la csrd no ennla card misma. podriamosncorregir eso?" Playback belongs in the detail modal; cards retain static previews. Existing other-kind activation remains unchanged.
Current behavior: activating a video card opens its detail modal, which provides native controls for uploaded files and direct MP4 URLs. Existing external YouTube/Vimeo embeds remain unchanged.

## Tasks
T1 — S1 — delegated (independent media serving unit, disjoint API/docs surfaces) — implemented; 26 focused tests pass — commit 2da48f3. Risk: item 3 (shared media HTTP contract).
T2 — S1–S3 — delegated (independent client playback unit, disjoint web surfaces) — implemented; 22 focused tests pass — commit 1f281cf. Risk: item 3 (shared activation behavior).
T3 — S1–S3 — inline integration and independent verification — automated verification passed; browser proof unavailable — code commits 2da48f3, 1f281cf.

## Log
L1. User: "aparece pero no en la card de previsualizacion. ademas, aprovechando que esta subido en internet seria interesante que permita ver el video desde el mismo card"
L2. User: "si, tipo algo similar a lo de un video de youtube que se piede ver desde ahi por la previsualizacion"
L3. Read-only map: WebGL barrel distortion precludes a faithful rectangular DOM overlay. Use one independently owned VideoTexture, reuse click-vs-drag and poster registry, restore poster on teardown. API currently ignores byte ranges; actual browser failure cause unproven. RDD globally disabled. No production publication authorized for this new candidate yet.

L4. T1 RED 12 failed/14 passed; GREEN26 media route tests, API typecheck/scoped formatting pass. T2 initial missing-module RED; GREEN21 then bounded correction GREEN22 focused tests; web typecheck/scoped format pass.
L5. Independent scratch verification: full suite1032 tests (83 shared,721 web,228 API), typecheck/lint/build pass. Lint3 warnings. Shared media baseline GET/404 probes2 pass. Node20 warning against >=26; full test status is observed, not silently claimed Node26.
L6. Independent blocker: ready live texture was hidden by pending poster reveal gate. Corrected in cards.ts and pinned regression; independent original probe + regression3 pass, including stop/reassignment readiness. Parent spot check4 files/11 tests pass before correction; independent corrected recheck above supplies final proof.
L7. Real-browser/GPU/Safari proof UNAVAILABLE: CUA inventory returned no browsers and browser access host unavailable. Do not claim visual playback or complete S1 production reproduction. User decision needed to validate externally / publish for testing. No commits, push, release for this candidate. RDD globally disabled; native assessment unavailable due undeclared untracked inventory, no review started. Forecast exceeds400 lines, ask-on-risk delivery strategy unresolved before any work-unit commit.

L8. User authorized publication for production testing: "si", answering "¿Publico una nueva release para que lo pruebes en producción?". Delivery follows the explicit release path, not a PR chain. Keep API and client in separate Conventional Commits; real-browser proof remains pending owner QA.

L9. Code committed: 2da48f3 API (120 changed lines), 1f281cf inline playback (551 changed lines; lifecycle/integration tests kept together). RDD disabled/unmanaged. Release preflight spot check4 files/12 tests passes. main equals origin/main before publication. Publishing v0.15.0 for owner browser QA.

L10. 2026-11-07: Owner corrected playback placement (S3) and authorized release, main/develop synchronization, and cleanup only after production checks. Remote v0.15.0 was ahead of the initial local checkout; fast-forwarded before final verification. Reopened T2/T3 for the correction.
L11. Corrected shared card activation to open details for uploaded videos; removed canvas playback controls and toggle semantics. Preserved poster generation and media range handling. Detail modal handles stored video media and direct HTTP(S) MP4 URLs for link/video items, with native controls, inline playback, and no autoplay. New requested behavior reproduced RED before implementation.
L12. Independent verifier: no blockers; 44 focused tests, 10 scratch probes and 9 baseline comparisons passed. Actual browser decoding remains unverified. RDD globally disabled/unmanaged; no native review started. Release target v0.15.1.

L13. Final checks on corrected v0.15.0 base: shared 83 and API 228 tests pass; full web suite, web typecheck and production build pass. API tests required local-port access outside sandbox. Lint passes with 3 pre-existing warnings; build retains the existing chunk-size warning. Parent spot check32 tests passes. No visual-browser proof available.
