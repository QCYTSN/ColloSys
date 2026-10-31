Production candidate before deferred transcript mounting; build fingerprint
3a21299ad1b1f1fe2c43156b430fcbe44addae102e888ae7f7dfa33e369ae7c5.

All three paired production rounds, corrected after-only presentation rounds,
and three typing/provider-state rounds completed without concurrent builds or
other tests. Their raw records are retained here, not mixed into the final
build's results. The same65-message/32-file fixture is used. The navigation
sequence explicitly requests three20-message pages (60 of65) before returning;
it does not claim that every message is mounted in the virtualized DOM.

The candidate did not establish an overall speedup: Project details cold
EventTiming200/160/168ms; long-reader return P95 120/152/168ms. Corrected
presentation observations include long-reader feedback over100ms in rounds1
and3. Trace still shows synchronous transcript mount/geometry work during the
first response. The next change lets the verified selection/header render
before React schedules the unchanged full transcript, without a timer or
cached authorization. Final results must be reported separately.

Archive update: all numeric JSON remains here. Intermediate images, recordings and compressed traces are preserved under .local/auth-completion-evidence-archive with their original relative paths. See ../local-archive-map.json. No material was deleted; the final baseline/after evidence remains in its public review locations.
