# Authentication artwork

The current product bundles the original hand-authored `waterside.svg` through ProductAuthScene. Its continuous water, mountain, near bank, reflection and small light layers share a 560 by 300 viewBox. Product CSS gives the same scene a separate dark palette and moves only the water reflection/light. The painted bounds end at the viewBox bottom, so the caption has a genuine 32px gap. Composition and actual-page evidence are recorded in docs/product-ui/auth-completion/EXECUTION.md.

## Historical Fold asset (not copied into the current application)


`fold.webp` is an original asset generated for ColloSys on 2026-10-30 with the available OpenAI image-generation tool. It was generated without reference-image uploads. The art direction was a single asymmetric terracotta ceramic ribbon, broad folded planes, an open angular arch, cream inner surfaces and transparent background; no face, brand character, room or UI. The generated PNG is retained in the local generated-images folder; this file is a WebP encoding of that image, without compositional edits. Runtime size is 207,570 bytes, with alpha.

This historical asset is no longer copied by the current preparation chain; there is no runtime CDN or image API dependency. The editable presentation and original vector fallback live in `ProductAuthScene.tsx` and `product-auth-scene.css`. No Rive/Grok/OpenDesign artwork, models or animation files are shipped. The existing supplied peanut logo remains separate and unchanged.
