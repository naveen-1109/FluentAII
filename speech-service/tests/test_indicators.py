import math

from app.indicators import compute_indicators, flatten_words, normalise


def seg(words):
    """words: list of (text, start, end) -> one segment dict"""
    return [{
        "start": words[0][1], "end": words[-1][2], "text": " ".join(w[0] for w in words),
        "words": [{"word": t, "start": s, "end": e} for t, s, e in words],
    }]


def even(tokens, start=0.0, step=0.4, dur=0.3):
    return [(t, start + i * step, start + i * step + dur) for i, t in enumerate(tokens)]


def test_normalise_strips_punctuation_but_keeps_hyphen_inside():
    assert normalise(" Hello, ") == "hello"
    assert normalise("B-b-ball.") == "b-b-ball"
    assert normalise("...") == ""


def test_clean_speech_has_full_flow_and_no_events():
    w = even("the quick brown fox jumps over the lazy dog".split())
    r = compute_indicators(seg(w), duration_sec=4.0)
    assert r["word_count"] == 9
    assert r["pause_count"] == 0
    assert r["repetition_count"] == 0
    assert r["filler_count"] == 0
    assert r["flow_index"] == 100.0


def test_speech_rate_total_vs_active_uses_documented_definitions():
    # 6 words, 0.4 s apart, then a 2 s gap before the last 4 words
    a = even("one two three four five six".split(), 0.0, 0.4, 0.3)
    b = even("seven eight nine ten".split(), a[-1][2] + 2.0, 0.4, 0.3)
    r = compute_indicators(seg(a + b), duration_sec=10.0)
    assert r["word_count"] == 10
    assert r["pause_count"] == 1
    assert math.isclose(r["total_pause_sec"], 2.0, abs_tol=0.01)
    assert math.isclose(r["speech_rate_wpm_total"], 60.0, abs_tol=0.1)  # 10 words / 10 s
    window = b[-1][2] - a[0][1]
    assert math.isclose(r["active_speech_sec"], window - 2.0, abs_tol=0.01)
    assert math.isclose(r["speech_rate_wpm_active"], 10 / (window - 2.0) * 60, abs_tol=0.2)


def test_pause_threshold_is_respected():
    w = [("a", 0.0, 0.2), ("b", 0.6, 0.8), ("c", 1.5, 1.7)]  # gaps 0.4 and 0.7
    r = compute_indicators(seg(w), duration_sec=2.0, pause_threshold_sec=0.5)
    assert r["pause_count"] == 1 and math.isclose(r["longest_pause_sec"], 0.7, abs_tol=0.01)
    r2 = compute_indicators(seg(w), duration_sec=2.0, pause_threshold_sec=0.3)
    assert r2["pause_count"] == 2


def test_word_phrase_and_sound_repetitions():
    toks = "i i want to to go i want i want b-b-ball s-s-s-sorry".split()
    r = compute_indicators(seg(even(toks)), duration_sec=8.0)
    items = {x["text"]: x["count"] for x in r["repeated_items"]}
    assert items["i"] == 1 and items["to"] == 1
    assert items["i want"] == 1
    assert items["b-b-ball"] == 2 and items["s-s-s-sorry"] == 3
    # i i (1) + to to (1) + "i want i want" (1) + b-b-ball (2) + s-s-s-sorry (3)
    assert r["repetition_count"] == 1 + 1 + 1 + 2 + 3


def test_hyphenated_normal_words_are_not_repetitions():
    r = compute_indicators(seg(even("a well-known state-of-the-art idea works".split())), duration_sec=3)
    assert r["repetition_count"] == 0


def test_fillers_counted_and_not_double_counted_as_repetition():
    toks = "um um so uh i think hmm it works".split()
    r = compute_indicators(seg(even(toks)), duration_sec=4)
    assert r["filler_count"] == 4
    assert r["repetition_count"] == 0


def test_flow_decreases_with_disfluency_and_is_bounded():
    clean = compute_indicators(seg(even("this is a very smooth sentence today".split())), 3.0)
    rough = compute_indicators(
        seg(even("um i i i want uh to to go go home home now".split())), 5.0
    )
    assert clean["flow_index"] > rough["flow_index"]
    assert 0.0 <= rough["flow_index"] <= 100.0


def test_too_short_for_flow_and_empty_input_are_safe():
    r = compute_indicators(seg(even(["hello", "there"])), duration_sec=1.0)
    assert r["flow_index"] is None
    e = compute_indicators([], duration_sec=5.0)
    assert e["word_count"] == 0
    assert e["speech_rate_wpm_total"] is None and e["flow_index"] is None
    z = compute_indicators(seg(even("a b c d e f".split())), duration_sec=0.0)
    assert z["speech_rate_wpm_total"] is None


def test_flatten_ignores_empty_tokens():
    s = [{"words": [{"word": " ", "start": 0, "end": 0.1}, {"word": "Hi!", "start": 0.2, "end": 0.4}]}]
    assert [w.text for w in flatten_words(s)] == ["hi"]
