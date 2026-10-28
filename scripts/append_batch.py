"""Append one authored batch of questions to data/questions.json.

Usage: python3 scripts/append_batch.py BATCH.json CHAPTER_NO SOURCE_FILE PAGE_LABEL BATCH_NAME [partial]

Pass "partial" when the batch covers only part of a file, so the file is not yet marked done.

BATCH.json is a list of compact items:
  {"t": "mcq", "topic": "...", "q": "...", "a": "correct option",
   "d": ["distractor", "distractor", "distractor"], "e": "explanation", "p": 18}
  {"t": "tf",  "topic": "...", "q": "statement", "a": true, "e": "...", "p": 18}

The correct MCQ option is placed so positions are spread evenly across A-D.
"""
import json
import random
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
QUESTIONS = ROOT / "data" / "questions.json"
PROGRESS = ROOT / "data" / "progress.json"


def load(path, default):
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else default


def main():
    batch_file, chapter_no, source_file, page_label, batch_name = sys.argv[1:6]
    partial = sys.argv[6:7] == ["partial"]
    chapter = f"Class {chapter_no}"
    items = json.loads(Path(batch_file).read_text(encoding="utf-8"))
    questions = load(QUESTIONS, [])
    progress = load(PROGRESS, {"batches_done": [], "files_done": [], "question_count": 0})

    if batch_name in progress["batches_done"]:
        sys.exit(f"Batch {batch_name} already appended")

    rng = random.Random(batch_name)
    n_mcq = sum(1 for it in items if it["t"] == "mcq")
    positions = [i % 4 for i in range(n_mcq)]
    rng.shuffle(positions)

    prefix = f"CM-C{chapter_no}-"
    next_no = 1 + max((int(q["id"][len(prefix):]) for q in questions if q["id"].startswith(prefix)), default=0)
    seen = {q["question"].strip().lower() for q in questions}

    new = []
    for it in items:
        if it["q"].strip().lower() in seen:
            sys.exit(f"Duplicate question: {it['q']}")
        if it["t"] == "mcq":
            if len(it["d"]) != 3 or it["a"] in it["d"] or len(set(it["d"])) != 3:
                sys.exit(f"Bad distractors: {it['q']}")
            options = list(it["d"])
            rng.shuffle(options)
            options.insert(positions.pop(), it["a"])
            answer = it["a"]
        elif it["t"] == "tf":
            options = ["True", "False"]
            answer = "True" if it["a"] is True else "False"
        else:
            sys.exit(f"Unknown type: {it['t']}")
        new.append({
            "id": f"{prefix}{next_no:03d}",
            "chapter": chapter,
            "type": it["t"],
            "topic": it["topic"],
            "question": it["q"],
            "options": options,
            "correct_answer": answer,
            "explanation": it["e"],
            "source": f"{source_file}, {page_label} {it['p']}",
        })
        next_no += 1
        seen.add(it["q"].strip().lower())

    questions.extend(new)
    QUESTIONS.write_text(json.dumps(questions, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    progress["batches_done"].append(batch_name)
    if not partial and source_file not in progress["files_done"]:
        progress["files_done"].append(source_file)
    progress["question_count"] = len(questions)
    progress["by_chapter"] = {}
    for q in questions:
        progress["by_chapter"][q["chapter"]] = progress["by_chapter"].get(q["chapter"], 0) + 1
    PROGRESS.write_text(json.dumps(progress, indent=2) + "\n", encoding="utf-8")

    tf_true = sum(1 for q in new if q["type"] == "tf" and q["correct_answer"] == "True")
    tf = sum(1 for q in new if q["type"] == "tf")
    pos = [q["options"].index(q["correct_answer"]) for q in new if q["type"] == "mcq"]
    print(f"{batch_name}: +{len(new)} ({len(new) - tf} mcq, {tf} tf, {tf_true} true); "
          f"positions A-D {[pos.count(i) for i in range(4)]}; total {len(questions)}")


if __name__ == "__main__":
    main()
