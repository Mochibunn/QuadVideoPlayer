---
name: Booru.org compatibility
description: Why hosted booru.org boards need a public HTML adapter and paced original-file lookups.
---

Hosted booru.org boards use the older Gelbooru public listing pages; do not
assume that newer Gelbooru DAPI endpoints work there. Resolve the original
file from the post page rather than deriving it from its thumbnail.

**Why:** The DAPI-only implementation failed on a working public board.
Live verification found normal listings available and original PNGs behind
JPEG thumbnails. Parallel detail lookups also triggered HTTP 429; paced,
serialized retrieval passed the live test without bypassing access controls.

**How to apply:** Validate changes against public listing and post-page
structures, including GIF/PNG original URLs and offset-based pagination.
Keep lookups paced across searches sharing a board, publish initial results
incrementally, and stop on permission/rate-limit responses. Do not work
around sign-in requirements or browser challenges.
