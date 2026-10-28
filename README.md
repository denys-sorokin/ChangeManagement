# Change Management Study Quiz

A small static quiz site for practising the Change Management course. It has 300 questions across six classes, exam and study modes, and grades out of 20.

> This website was created for study purposes only, to help students prepare for the Change Management course. The course materials used to create these questions belong to their original authors and instructors. This site is not affiliated with the university and is not an official exam resource.

## Using the site

- **Setup:** choose the scope (all chapters or one class), the scoring (no penalty, or penalty: −0.8 per wrong answer, never below 0), and the mode (Exam with a 50-minute timer, or Study with immediate feedback).
- **Sessions** have 25 random questions with no repeats. Each question is worth 20 / N points.
- **Review mistakes:** wrong answers are saved in the browser. Practise them, export or import them as JSON, or clear the list.
- **Flag:** mark a question as wrong or unclear, then export `flags.json` from the home page and send it to the author.
- Light/dark theme and three text sizes are remembered on each device. Keyboard: `1`–`4` choose an option, `Enter` goes to the next question, `←` `→` move between questions.

Everything runs in the browser. No account, no backend, and no external services are used at runtime.

## Publishing on GitHub Pages

In the repository, go to **Settings → Pages**, choose **Deploy from a branch**, select the branch and the `/ (root)` folder, and save. The `.nojekyll` file makes Pages serve the files as they are.

To run it locally, serve the folder (opening `index.html` directly won't load the questions because of browser file restrictions):

```sh
python3 -m http.server 8000
# then open http://localhost:8000
```

## Files

| Path | Purpose |
| --- | --- |
| `index.html`, `styles.css`, `app.js` | The quiz (plain HTML, CSS and JavaScript, no build step) |
| `data/questions.json` | The question bank |
| `data/progress.json` | Log of the generation batches |
| `scripts/append_batch.py` | Appends one authored batch, assigns IDs and spreads correct answers across A–D |
| `scripts/validate.py` | Checks the bank and prints a summary by type, chapter and topic |
| `fonts/` | Self-hosted Archivo, IBM Plex Sans and IBM Plex Mono (SIL Open Font License), so the site makes no external requests |

## Question bank

The questions were written from the course slides (Classes 1–6). Portuguese content was translated into English. Each question has this shape:

```json
{
  "id": "CM-C1-001",
  "chapter": "Class 1",
  "type": "mcq",
  "topic": "Change vs. transformation",
  "question": "…",
  "options": ["…", "…", "…", "…"],
  "correct_answer": "…",
  "explanation": "…",
  "source": "Class1a_Anatomy_of_Change_2026.pdf, p. 19"
}
```

| Chapter | Questions | Multiple choice | True/false |
| --- | --- | --- | --- |
| Class 1 – The Anatomy of Change | 41 | 31 | 10 |
| Class 2 – The Human Side of Change | 72 | 54 | 18 |
| Class 3 – From Vision to Narrative | 44 | 33 | 11 |
| Class 4 – Designing the Transformation | 29 | 22 | 7 |
| Class 5 – Power, Politics, Culture & Purpose | 51 | 38 | 13 |
| Class 6 – Leading Change Under Uncertainty | 63 | 47 | 16 |
| **Total** | **300** | **225** | **75** |

Run the checks after editing the bank:

```sh
python3 scripts/validate.py
```
