"""Descriptive speech indicators computed from word-level timestamps.

Everything here is a *practice indicator*, not a clinical measure. The
definitions are deliberately simple and documented so they can be explained to
users and to clinicians:

* speech rate (words/min), over the whole recording and over active speech;
* pauses: gaps between consecutive words that last >= `pause_threshold_sec`;
* repetitions: immediate word repeats ("I I want"), repeated two-word phrases
  ("I want I want") and hyphenated sound repeats ("b-b-ball") in the transcript;
* fillers: um / uh style tokens that the recogniser kept in the transcript;
* flow index (0-100): the mean of three "smoothness" components
  (repetition, filler, pause). Each component falls linearly from 1 to 0 as the
  corresponding ratio rises from 0 to a fixed cap (10 %, 10 % and 30 %).

Speech recognisers often *omit* repetitions and fillers, so repetition and
filler counts are lower bounds on what was actually said.
"""
from __future__ import annotations

import re
from collections import Counter
from dataclasses import dataclass
from typing import Any, Iterable

FILLERS = {"um", "umm", "uh", "uhh", "uhm", "er", "erm", "ah", "hmm", "mm", "mmm", "eh"}

REPETITION_CAP = 0.10
FILLER_CAP = 0.10
PAUSE_CAP = 0.30
MIN_WORDS_FOR_FLOW = 5

_clean = re.compile(r"[^\w\-']+", re.UNICODE)


@dataclass
class Word:
    text: str
    start: float
    end: float


def normalise(token: str) -> str:
    return _clean.sub("", token.lower()).strip("-'")


def flatten_words(segments: Iterable[dict[str, Any]]) -> list[Word]:
    out: list[Word] = []
    for seg in segments:
        for w in seg.get("words", []) or []:
            t = normalise(w["word"])
            if t:
                out.append(Word(t, float(w["start"]), float(w["end"])))
    return out


def _sound_repeat_count(token: str) -> int:
    """Number of repeated onset fragments before the full word.

    'b-ball' -> 1 ; 'b-b-ball' -> 2 ; 's-s-s-sorry' -> 3 ; 'well-known' -> 0.
    """
    parts = [p for p in token.split("-") if p]
    if len(parts) < 2 or len(parts[0]) > 3:
        return 0
    n = 0
    for p in parts[:-1]:
        if p == parts[0]:
            n += 1
        else:
            break
    # the last part must start with the repeated sound for it to be a stutter-like repeat
    return n if n >= 1 and parts[-1].startswith(parts[0]) else 0


def _top(counter: Counter[str], n: int = 8) -> list[dict[str, Any]]:
    return [{"text": k, "count": v} for k, v in counter.most_common(n)]


def compute_indicators(
    segments: list[dict[str, Any]],
    duration_sec: float,
    pause_threshold_sec: float = 0.5,
) -> dict[str, Any]:
    words = flatten_words(segments)
    n = len(words)

    # --- pauses (gaps between consecutive words) ---
    pauses: list[float] = []
    for a, b in zip(words, words[1:]):
        gap = b.start - a.end
        if gap >= pause_threshold_sec:
            pauses.append(gap)
    total_pause = sum(pauses)
    window = (words[-1].end - words[0].start) if n >= 2 else 0.0
    active = max(0.0, window - total_pause)

    rate_total = (n / duration_sec * 60.0) if duration_sec > 0 and n else None
    rate_active = (n / active * 60.0) if active > 0 and n else None

    # --- repetitions ---
    rep_counter: Counter[str] = Counter()
    reps = 0
    for a, b in zip(words, words[1:]):
        if a.text == b.text and a.text not in FILLERS:
            reps += 1
            rep_counter[a.text] += 1
    for i in range(len(words) - 3):
        w = [x.text for x in words[i : i + 4]]
        if w[0] == w[2] and w[1] == w[3] and w[0] != w[1]:
            reps += 1
            rep_counter[f"{w[0]} {w[1]}"] += 1
    for w in words:
        k = _sound_repeat_count(w.text)
        if k:
            reps += k
            rep_counter[w.text] += k

    # --- fillers ---
    fill_counter: Counter[str] = Counter(w.text for w in words if w.text in FILLERS)
    fillers = sum(fill_counter.values())

    # --- flow index ---
    flow = None
    components: dict[str, float] = {}
    if n >= MIN_WORDS_FOR_FLOW and window > 0:
        rep_ratio = reps / n
        fill_ratio = fillers / n
        pause_ratio = total_pause / window
        s_rep = 1 - min(1.0, rep_ratio / REPETITION_CAP)
        s_fill = 1 - min(1.0, fill_ratio / FILLER_CAP)
        s_pause = 1 - min(1.0, pause_ratio / PAUSE_CAP)
        components = {
            "repetition": round(s_rep, 3),
            "filler": round(s_fill, 3),
            "pause": round(s_pause, 3),
        }
        flow = round(100 * (s_rep + s_fill + s_pause) / 3, 1)

    return {
        "word_count": n,
        "speech_rate_wpm_total": None if rate_total is None else round(rate_total, 1),
        "speech_rate_wpm_active": None if rate_active is None else round(rate_active, 1),
        "active_speech_sec": round(active, 2),
        "pause_count": len(pauses),
        "total_pause_sec": round(total_pause, 2),
        "longest_pause_sec": round(max(pauses), 2) if pauses else 0.0,
        "mean_pause_sec": round(total_pause / len(pauses), 2) if pauses else None,
        "repetition_count": reps,
        "repeated_items": _top(rep_counter),
        "filler_count": fillers,
        "filler_items": _top(fill_counter),
        "flow_index": flow,
        "flow_components": components,
        "pause_threshold_sec": pause_threshold_sec,
    }
