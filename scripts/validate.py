"""Validate data/questions.json and print a summary by type, chapter and topic.

Usage: python3 scripts/validate.py
Exits with status 1 if any hard check fails.
"""
import json
import re
import sys
from collections import Counter
from difflib import SequenceMatcher
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
REQUIRED = ["id", "chapter", "type", "topic", "question", "options", "correct_answer", "explanation", "source"]
ID_RE = re.compile(r"^CM-C(\d+)-\d{3}$")


def main():
    errors, warnings = [], []
    try:
        questions = json.loads((ROOT / "data" / "questions.json").read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        sys.exit(f"FAIL: invalid JSON: {exc}")

    ids = Counter(q.get("id") for q in questions)
    errors += [f"duplicate id {i}" for i, n in ids.items() if n > 1]

    for q in questions:
        qid = q.get("id", "?")
        missing = [k for k in REQUIRED if not q.get(k)]
        if missing:
            errors.append(f"{qid}: missing {missing}")
            continue
        m = ID_RE.match(qid)
        if not m or q["chapter"] != f"Class {m.group(1)}":
            errors.append(f"{qid}: id does not match chapter {q['chapter']}")
        if q["correct_answer"] not in q["options"]:
            errors.append(f"{qid}: correct_answer not among options")
        if len(set(q["options"])) != len(q["options"]):
            errors.append(f"{qid}: repeated option")
        if q["type"] == "mcq" and len(q["options"]) != 4:
            errors.append(f"{qid}: mcq must have 4 options")
        elif q["type"] == "tf" and q["options"] != ["True", "False"]:
            errors.append(f"{qid}: tf options must be ['True', 'False']")
        elif q["type"] not in ("mcq", "tf"):
            errors.append(f"{qid}: unknown type {q['type']}")
        if any(re.search(r"\b(all|none) of the above\b", o, re.I) for o in q["options"]):
            errors.append(f"{qid}: uses all/none of the above")

    texts = [(q["id"], q["question"].lower()) for q in questions]
    for i, (id_a, a) in enumerate(texts):
        for id_b, b in texts[i + 1:]:
            if SequenceMatcher(None, a, b).ratio() > 0.85:
                warnings.append(f"near-duplicate questions {id_a} / {id_b}")

    mcq = [q for q in questions if q["type"] == "mcq"]
    tf = [q for q in questions if q["type"] == "tf"]
    chapters = Counter(q["chapter"] for q in questions)
    errors += [f"{c} has only {n} questions (min 25)" for c, n in chapters.items() if n < 25]

    positions = Counter("ABCD"[q["options"].index(q["correct_answer"])] for q in mcq)
    # A length cue: the correct option is more than 15% longer than every distractor.
    longest = sum(1 for q in mcq if len(q["correct_answer"]) >
                  1.15 * max(len(o) for o in q["options"] if o != q["correct_answer"]))
    if longest > 0.2 * len(mcq):
        warnings.append(f"correct option is noticeably the longest in {longest}/{len(mcq)} MCQs")

    print(f"Total questions: {len(questions)}")
    print(f"By type: mcq {len(mcq)} ({len(mcq) / len(questions):.0%}), tf {len(tf)} ({len(tf) / len(questions):.0%})")
    tf_true = sum(1 for q in tf if q["correct_answer"] == "True")
    print(f"True/false balance: {tf_true} true, {len(tf) - tf_true} false")
    print(f"MCQ correct position: " + ", ".join(f"{k} {positions[k]}" for k in "ABCD"))
    print(f"MCQ where correct option is noticeably the longest: {longest}/{len(mcq)}")
    print("\nBy chapter:")
    for c in sorted(chapters, key=lambda c: int(c.split()[1])):
        cm = sum(1 for q in mcq if q["chapter"] == c)
        print(f"  {c}: {chapters[c]} (mcq {cm}, tf {chapters[c] - cm})")
    print("\nBy topic:")
    for c in sorted(chapters, key=lambda c: int(c.split()[1])):
        print(f"  {c}")
        for topic, n in sorted(Counter(q["topic"] for q in questions if q["chapter"] == c).items()):
            print(f"    {n:2d}  {topic}")

    for w in warnings:
        print(f"WARNING: {w}")
    for e in errors:
        print(f"ERROR: {e}")
    print(f"\n{'FAIL' if errors else 'PASS'}: {len(errors)} errors, {len(warnings)} warnings")
    sys.exit(1 if errors else 0)


if __name__ == "__main__":
    main()
