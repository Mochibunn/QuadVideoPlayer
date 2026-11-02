#!/usr/bin/env python3
"""Create a tiny, dependency-free synthetic key jingle for the game overlay."""

import math
import struct
import wave
from pathlib import Path


SAMPLE_RATE = 22_050
DURATION_SECONDS = 0.92
STRIKES = (0.025, 0.16, 0.34, 0.43)
PARTIALS = (
    (1783.0, 0.42, 15.0),
    (2471.0, 0.30, 19.0),
    (3217.0, 0.22, 23.0),
    (1049.0, 0.20, 10.0),
    (637.0, 0.12, 8.0),
)


def sample_at(time_seconds: float) -> float:
    result = 0.0
    for strike_index, strike_at in enumerate(STRIKES):
        age = time_seconds - strike_at
        if age < 0:
            continue
        softness = 1.0 if strike_index == 0 else 0.72
        for partial_index, (frequency, amplitude, decay) in enumerate(PARTIALS):
            detuned = frequency * (1.0 + strike_index * 0.0017 + partial_index * 0.0004)
            envelope = math.exp(-decay * age)
            result += softness * amplitude * envelope * math.sin(2 * math.pi * detuned * age)
        if age < 0.018:
            transient = math.exp(-age * 210) * math.sin(2 * math.pi * (5111 + strike_index * 79) * age)
            result += softness * 0.16 * transient
    return result


def main() -> None:
    output = Path(__file__).resolve().parents[1] / "assets" / "audio" / "key-jingle.wav"
    output.parent.mkdir(parents=True, exist_ok=True)
    frame_count = round(SAMPLE_RATE * DURATION_SECONDS)
    samples = [sample_at(index / SAMPLE_RATE) for index in range(frame_count)]
    peak = max(max(abs(sample) for sample in samples), 1e-9)
    gain = 0.62 / peak
    pcm = b"".join(
        struct.pack("<h", max(-32767, min(32767, round(sample * gain * 32767))))
        for sample in samples
    )
    with wave.open(str(output), "wb") as output_wave:
        output_wave.setnchannels(1)
        output_wave.setsampwidth(2)
        output_wave.setframerate(SAMPLE_RATE)
        output_wave.writeframes(pcm)
    print(f"Wrote {output} ({len(pcm)} bytes)")


if __name__ == "__main__":
    main()
