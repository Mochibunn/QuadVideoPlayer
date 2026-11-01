---
name: Android Downloads access
description: Why Downloads needs a different entry point from the ordinary folder picker.
---

Do not try to “fix” Android's Downloads folder picker by requesting broader
filesystem permissions. Android 11+ intentionally forbids choosing the Downloads
root with ACTION_OPEN_DOCUMENT_TREE.

**Why:** The user reported the disabled Downloads root. Google's storage
documentation explicitly lists it as restricted; this is not a missing grant.

**How to apply:** Keep a Downloads shortcut that queries only Downloads videos
through MediaStore, with ordinary file selection available for unindexed files.
Respect selected-only access on Android 14+, and never imply that it gives the
whole Downloads library. Do not add MANAGE_EXTERNAL_STORAGE for this use case.
