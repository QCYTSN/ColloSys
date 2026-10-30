# Fold authentication artwork

`fold.webp` is an original asset generated for ColloSys on 2026-10-30 with the available OpenAI image-generation tool. It was generated without reference-image uploads. The art direction was a single asymmetric terracotta ceramic ribbon, broad folded planes, an open angular arch, cream inner surfaces and transparent background; no face, brand character, room or UI. The generated PNG is retained in the local generated-images folder; this file is a WebP encoding of that image, without compositional edits. Runtime size is 207,570 bytes, with alpha.

The production asset is copied by `scripts/codecast-prepare.mjs` to `/collo-auth/fold.webp`; there is no runtime CDN or image API dependency. The editable presentation and original vector fallback live in `ProductAuthScene.tsx` and `product-auth-scene.css`. No Rive/Grok/OpenDesign artwork, models or animation files are shipped. The existing supplied peanut logo remains separate and unchanged.
