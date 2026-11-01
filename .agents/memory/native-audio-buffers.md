---
name: Native audio buffer contract
description: Media3 empty-input and output-ownership requirements for PCM processors.
---

Treat zero-remaining PCM input as a no-op before requesting or replacing an
output buffer, including when an effect is disabled.

**Why:** Media3 passes empty buffers during normal pipeline draining. Its base
processor shares an empty-buffer sentinel, so replacing output first can alias
input and output, cause an illegal self-copy, or discard pending output.
An always-installed processor can therefore break ordinary playback even when
its effect is switched off.

**How to apply:** Preserve pending output on empty input. Native regression tests
must cover empty sentinels, consumed output reused as empty input, flushing,
end-of-stream, enabled/disabled effects, and both integer and float PCM—not just
nonempty test tones. A browser preview cannot verify this contract.
