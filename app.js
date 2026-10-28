"use strict";

(function () {
  const SESSION_SIZE = 25;
  const EXAM_MS = 50 * 60 * 1000;
  const LOW_TIME_MS = 5 * 60 * 1000;
  const KEYS = {
    theme: "cmq.theme",
    font: "cmq.font",
    setup: "cmq.setup",
    mistakes: "cmq.mistakes",
    flags: "cmq.flags",
  };

  const $ = (id) => document.getElementById(id);
  const root = document.documentElement;

  // ---------- Storage (fails safely in private mode) ----------
  const store = {
    get(key, fallback) {
      try {
        const raw = localStorage.getItem(key);
        return raw === null ? fallback : JSON.parse(raw);
      } catch (e) {
        return fallback;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem(key, JSON.stringify(value));
      } catch (e) {
        /* storage unavailable: keep working without persistence */
      }
    },
    remove(key) {
      try {
        localStorage.removeItem(key);
      } catch (e) {
        /* ignore */
      }
    },
  };

  // ---------- Small DOM helper ----------
  function el(tag, attrs, children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === null || v === undefined || v === false) continue;
      if (k === "class") node.className = v;
      else if (k === "text") node.textContent = v;
      else if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
      else node.setAttribute(k, v === true ? "" : v);
    }
    for (const child of [].concat(children || [])) {
      if (child === null || child === undefined || child === false) continue;
      node.append(child instanceof Node ? child : document.createTextNode(String(child)));
    }
    return node;
  }

  function shuffle(list) {
    const a = list.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function formatClock(ms) {
    const total = Math.max(0, Math.round(ms / 1000));
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  }

  function plural(n, word) {
    return `${n} ${word}${n === 1 ? "" : "s"}`;
  }

  // ---------- Theme and text size ----------
  const darkQuery = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;

  function effectiveTheme() {
    if (root.dataset.theme === "light" || root.dataset.theme === "dark") return root.dataset.theme;
    return darkQuery && darkQuery.matches ? "dark" : "light";
  }

  function renderTheme() {
    const dark = effectiveTheme() === "dark";
    root.classList.toggle("is-dark", dark);
    $("themeToggle").setAttribute("aria-label", dark ? "Switch to light mode" : "Switch to dark mode");
    $("themeToggle").title = dark ? "Light mode" : "Dark mode";
  }

  function toggleTheme() {
    const next = effectiveTheme() === "dark" ? "light" : "dark";
    root.dataset.theme = next;
    store.set(KEYS.theme, next);
    renderTheme();
  }

  function setFont(size) {
    root.dataset.font = size;
    store.set(KEYS.font, size);
    renderFont();
  }

  function renderFont() {
    const size = root.dataset.font || "m";
    document.querySelectorAll(".font-size button").forEach((b) => {
      b.setAttribute("aria-pressed", String(b.dataset.font === size));
    });
  }

  // ---------- Question bank ----------
  let bank = [];
  const byId = new Map();
  let chapters = [];

  async function loadBank() {
    try {
      const res = await fetch("data/questions.json", { cache: "no-cache" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      bank = await res.json();
    } catch (err) {
      const msg = $("loadStatus");
      msg.textContent =
        "The questions could not be loaded. If you opened this file directly from your computer, " +
        "serve the folder with a local web server or use the GitHub Pages site.";
      msg.classList.add("error");
      return;
    }
    bank.forEach((q) => byId.set(q.id, q));
    chapters = [...new Set(bank.map((q) => q.chapter))].sort(
      (a, b) => parseInt(a.replace(/\D/g, ""), 10) - parseInt(b.replace(/\D/g, ""), 10)
    );
    $("loadStatus").textContent = "";
    renderSetup();
    renderMistakesPanel();
    renderFlagsPanel();
    $("setupForm").hidden = false;
    $("mistakesPanel").hidden = false;
    $("flagsPanel").hidden = false;
  }

  // ---------- Setup ----------
  function renderSetup() {
    const saved = store.get(KEYS.setup, {});
    const scopes = [{ value: "all", label: "All chapters", count: bank.length }].concat(
      chapters.map((c) => ({ value: c, label: c, count: bank.filter((q) => q.chapter === c).length }))
    );
    const savedScope = scopes.some((s) => s.value === saved.scope) ? saved.scope : "all";
    const box = $("scopeChoices");
    box.replaceChildren(
      ...scopes.map((s) =>
        el("label", { class: "choice" }, [
          el("input", { type: "radio", name: "scope", value: s.value, checked: s.value === savedScope }),
          el("span", { class: "choice-body" }, [
            el("span", { class: "choice-title", text: s.label }),
            el("span", { class: "choice-desc", text: plural(s.count, "question") }),
          ]),
        ])
      )
    );
    const form = $("setupForm");
    if (saved.scoring) form.elements.scoring.value = saved.scoring;
    if (saved.mode) form.elements.mode.value = saved.mode;
  }

  function readSetup() {
    const form = $("setupForm");
    return {
      scope: form.elements.scope.value || "all",
      scoring: form.elements.scoring.value === "penalty" ? "penalty" : "none",
      mode: form.elements.mode.value === "study" ? "study" : "exam",
    };
  }

  // ---------- Mistakes ----------
  function getMistakes() {
    const m = store.get(KEYS.mistakes, {});
    return m && typeof m === "object" && !Array.isArray(m) ? m : {};
  }

  function addMistake(id) {
    const m = getMistakes();
    m[id] = { count: ((m[id] && m[id].count) || 0) + 1, last: new Date().toISOString() };
    store.set(KEYS.mistakes, m);
  }

  function removeMistake(id) {
    const m = getMistakes();
    if (m[id]) {
      delete m[id];
      store.set(KEYS.mistakes, m);
    }
  }

  function mistakeIds() {
    return Object.keys(getMistakes()).filter((id) => byId.has(id));
  }

  function renderMistakesPanel() {
    const n = mistakeIds().length;
    $("mistakesSummary").textContent =
      n === 0
        ? "No saved mistakes yet. Questions you answer wrongly are saved here automatically."
        : `${plural(n, "question")} saved from previous sessions.`;
    $("practiseMistakesBtn").disabled = n === 0;
    $("exportMistakesBtn").disabled = n === 0;
    $("clearMistakesBtn").disabled = n === 0;
  }

  function downloadJson(filename, data) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = el("a", { href: url, download: filename });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function exportMistakes() {
    downloadJson(`cm-quiz-mistakes-${new Date().toISOString().slice(0, 10)}.json`, {
      app: "cm-study-quiz",
      type: "mistakes",
      version: 1,
      exportedAt: new Date().toISOString(),
      mistakes: getMistakes(),
    });
  }

  async function importMistakes(file) {
    const status = $("mistakesStatus");
    status.classList.remove("error");
    try {
      const data = JSON.parse(await file.text());
      let incoming = {};
      if (Array.isArray(data)) data.forEach((id) => (incoming[id] = { count: 1, last: null }));
      else if (Array.isArray(data.mistakes)) data.mistakes.forEach((id) => (incoming[id] = { count: 1, last: null }));
      else if (data.mistakes && typeof data.mistakes === "object") incoming = data.mistakes;
      else throw new Error("format");
      const current = getMistakes();
      let added = 0;
      for (const [id, info] of Object.entries(incoming)) {
        if (!byId.has(id)) continue;
        if (!current[id]) added++;
        const count = Math.max((current[id] && current[id].count) || 0, (info && info.count) || 1);
        current[id] = { count, last: (current[id] && current[id].last) || (info && info.last) || null };
      }
      store.set(KEYS.mistakes, current);
      status.textContent = `Import complete: ${plural(added, "new question")} added.`;
    } catch (e) {
      status.textContent = "That file could not be read. Choose a mistakes file exported from this site.";
      status.classList.add("error");
    }
    renderMistakesPanel();
  }

  // ---------- Flags ----------
  function getFlags() {
    const f = store.get(KEYS.flags, {});
    return f && typeof f === "object" && !Array.isArray(f) ? f : {};
  }

  function renderFlagsPanel() {
    const n = Object.keys(getFlags()).length;
    $("flagsSummary").textContent = n === 0 ? "No flagged questions." : `${plural(n, "question")} flagged.`;
    $("exportFlagsBtn").disabled = n === 0;
    $("clearFlagsBtn").disabled = n === 0;
  }

  function exportFlags() {
    const flags = getFlags();
    downloadJson("flags.json", {
      app: "cm-study-quiz",
      type: "flags",
      version: 1,
      exportedAt: new Date().toISOString(),
      count: Object.keys(flags).length,
      flags: Object.entries(flags).map(([id, f]) => {
        const q = byId.get(id) || {};
        return {
          id,
          reason: f.reason,
          note: f.note || "",
          flaggedAt: f.flaggedAt,
          chapter: q.chapter,
          question: q.question,
          options: q.options,
          correct_answer: q.correct_answer,
          source: q.source,
        };
      }),
    });
  }

  let flagTargetId = null;
  let flagOnClose = null;

  function openFlagDialog(id, onClose) {
    const q = byId.get(id);
    const existing = getFlags()[id];
    flagTargetId = id;
    flagOnClose = onClose || null;
    $("flagDialogQuestion").textContent = `${q.id} · ${q.question}`;
    $("flagForm").elements.reason.value = existing ? existing.reason : "wrong";
    $("flagNote").value = existing ? existing.note || "" : "";
    $("removeFlagBtn").hidden = !existing;
    // Reset so closing with Escape is not mistaken for the previous action.
    $("flagDialog").returnValue = "";
    $("flagDialog").showModal();
  }

  function onFlagDialogClose() {
    const action = $("flagDialog").returnValue;
    const flags = getFlags();
    if (flagTargetId && action === "save") {
      flags[flagTargetId] = {
        reason: $("flagForm").elements.reason.value,
        note: $("flagNote").value.trim(),
        flaggedAt: new Date().toISOString(),
      };
      store.set(KEYS.flags, flags);
    } else if (flagTargetId && action === "remove") {
      delete flags[flagTargetId];
      store.set(KEYS.flags, flags);
    }
    flagTargetId = null;
    renderFlagsPanel();
    if (flagOnClose) flagOnClose();
    flagOnClose = null;
  }

  // ---------- Screens ----------
  function showScreen(name) {
    ["home", "quiz", "results"].forEach((s) => ($(`screen-${s}`).hidden = s !== name));
    $("quizStatus").hidden = name !== "quiz";
    window.scrollTo(0, 0);
  }

  // ---------- Session ----------
  let session = null;
  let lastSettings = null;

  function startSession(settings) {
    let pool;
    if (settings.kind === "mistakes") pool = mistakeIds().map((id) => byId.get(id));
    else pool = settings.scope === "all" ? bank : bank.filter((q) => q.chapter === settings.scope);
    if (pool.length === 0) return;

    const questions = shuffle(pool).slice(0, Math.min(SESSION_SIZE, pool.length));
    lastSettings = settings;
    session = {
      ...settings,
      questions,
      answers: new Array(questions.length).fill(null),
      index: 0,
      startedAt: Date.now(),
      deadline: settings.mode === "exam" ? Date.now() + EXAM_MS : null,
      timerId: null,
      finished: false,
    };

    $("timer").hidden = session.mode !== "exam";
    $("prevBtn").hidden = false;
    $("clearAnswerBtn").hidden = session.mode !== "exam";
    $("qGridWrap").hidden = session.mode !== "exam";
    $("finishBtn").textContent = session.mode === "exam" ? "Finish exam" : "Finish now";
    $("progressBar").setAttribute("aria-valuemax", String(questions.length));
    buildGrid();
    if (session.deadline) {
      tick();
      session.timerId = setInterval(tick, 250);
    }
    showScreen("quiz");
    renderQuestion(true);
  }

  function tick() {
    if (!session || session.finished || !session.deadline) return;
    const left = session.deadline - Date.now();
    const timer = $("timer");
    timer.textContent = formatClock(left);
    timer.classList.toggle("low", left <= LOW_TIME_MS);
    if (left <= 0) finishSession(true);
  }

  function buildGrid() {
    $("qGrid").replaceChildren(
      ...session.questions.map((_, i) =>
        el("button", {
          type: "button",
          text: i + 1,
          "aria-label": `Question ${i + 1}`,
          onclick: () => goTo(i),
        })
      )
    );
  }

  function renderStatus() {
    const n = session.questions.length;
    const answered = session.answers.filter((a) => a !== null).length;
    $("progressText").textContent = `${session.index + 1} / ${n}`;
    $("progressFill").style.width = `${((session.index + 1) / n) * 100}%`;
    $("progressBar").setAttribute("aria-valuenow", String(session.index + 1));
    $("answeredCount").textContent = `Answered ${answered} of ${n}`;
    [...$("qGrid").children].forEach((b, i) => {
      b.classList.toggle("answered", session.answers[i] !== null);
      b.setAttribute("aria-current", String(i === session.index));
    });
  }

  function renderQuestion(moveFocus) {
    const q = session.questions[session.index];
    const answer = session.answers[session.index];
    const reveal = session.mode === "study" && answer !== null;

    $("qChapter").textContent = q.chapter;
    $("qTopic").textContent = q.topic;
    $("qType").textContent = q.type === "tf" ? "True or false" : "Multiple choice";
    $("qText").textContent = q.question;

    $("qOptions").replaceChildren(
      ...q.options.map((opt, i) => {
        const isCorrect = opt === q.correct_answer;
        const isChosen = answer === i;
        let cls = "option";
        let tag = null;
        if (reveal && isCorrect) {
          cls += " correct";
          tag = isChosen ? "Your answer · Correct" : "Correct answer";
        } else if (reveal && isChosen) {
          cls += " incorrect";
          tag = "Your answer · Incorrect";
        } else if (!reveal && isChosen) {
          cls += " selected";
        }
        return el(
          "button",
          {
            type: "button",
            class: cls,
            "data-index": i,
            "aria-pressed": String(isChosen),
            disabled: reveal,
            onclick: () => choose(i),
          },
          [
            el("span", { class: "option-key", "aria-hidden": "true", text: i + 1 }),
            el("span", { class: "option-text" }, [opt, tag ? el("span", { class: "option-tag", text: tag }) : null]),
          ]
        );
      })
    );

    const fb = $("qFeedback");
    fb.className = "feedback";
    if (reveal) {
      const right = q.options[answer] === q.correct_answer;
      fb.classList.add(right ? "ok" : "bad");
      fb.replaceChildren(
        el("p", { class: "feedback-title", text: right ? "Correct" : `Incorrect. The correct answer is: ${q.correct_answer}` }),
        el("p", { text: q.explanation }),
        el("p", { class: "source", text: `Source: ${q.source}` })
      );
    } else {
      fb.replaceChildren();
    }

    const last = session.index === session.questions.length - 1;
    const next = $("nextBtn");
    if (session.mode === "study" && answer === null) next.textContent = last ? "Skip and finish" : "Skip";
    else next.textContent = last ? (session.mode === "exam" ? "Finish exam" : "See results") : "Next";
    $("prevBtn").disabled = session.index === 0;
    $("clearAnswerBtn").disabled = answer === null;
    renderFlagButton();
    renderStatus();
    if (moveFocus) $("qText").focus({ preventScroll: false });
  }

  function renderFlagButton() {
    const q = session.questions[session.index];
    const flagged = Boolean(getFlags()[q.id]);
    $("flagBtn").setAttribute("aria-pressed", String(flagged));
    $("flagBtn").textContent = flagged ? "Flagged" : "Flag";
  }

  function choose(i) {
    if (!session || session.finished) return;
    const q = session.questions[session.index];
    if (i < 0 || i >= q.options.length) return;
    if (session.mode === "study") {
      if (session.answers[session.index] !== null) return;
      session.answers[session.index] = i;
      if (q.options[i] === q.correct_answer) {
        if (session.kind === "mistakes") removeMistake(q.id);
      } else {
        addMistake(q.id);
      }
    } else {
      session.answers[session.index] = i;
    }
    renderQuestion(false);
  }

  function goTo(i) {
    if (!session || i < 0 || i >= session.questions.length) return;
    session.index = i;
    renderQuestion(true);
  }

  function goNext() {
    if (!session || session.finished) return;
    if (session.index < session.questions.length - 1) goTo(session.index + 1);
    else confirmFinish();
  }

  function confirmFinish() {
    const blanks = session.answers.filter((a) => a === null).length;
    if (session.mode === "exam" && blanks > 0) {
      if (!window.confirm(`You have ${plural(blanks, "unanswered question")}. Finish the exam anyway?`)) return;
    }
    finishSession(false);
  }

  function finishSession(timedOut) {
    if (!session || session.finished) return;
    session.finished = true;
    session.timedOut = timedOut;
    session.endedAt = timedOut && session.deadline ? session.deadline : Date.now();
    clearInterval(session.timerId);

    if (session.mode === "exam") {
      session.questions.forEach((q, i) => {
        const a = session.answers[i];
        if (a === null) return;
        if (q.options[a] === q.correct_answer) {
          if (session.kind === "mistakes") removeMistake(q.id);
        } else {
          addMistake(q.id);
        }
      });
    }
    renderResults();
    showScreen("results");
    $("resultsTitle").focus();
  }

  function exitSession() {
    if (!window.confirm("Leave this session? Your answers will not be graded.")) return;
    clearInterval(session.timerId);
    session = null;
    goHome();
  }

  // ---------- Results ----------
  function computeScore(s) {
    const n = s.questions.length;
    const value = 20 / n;
    let correct = 0;
    let wrong = 0;
    s.questions.forEach((q, i) => {
      const a = s.answers[i];
      if (a === null) return;
      if (q.options[a] === q.correct_answer) correct++;
      else wrong++;
    });
    const raw = value * correct - (s.scoring === "penalty" ? value * wrong : 0);
    const grade = Math.max(0, Math.round((raw + Number.EPSILON) * 10) / 10);
    return { n, correct, wrong, blank: n - correct - wrong, grade };
  }

  let reviewFilter = "all";

  function renderResults() {
    const s = session;
    const score = computeScore(s);
    $("gradeValue").textContent = score.grade.toFixed(1);
    $("statCorrect").textContent = score.correct;
    $("statWrong").textContent = score.wrong;
    $("statBlank").textContent = score.blank;
    $("statTime").textContent = formatClock(Math.min(s.endedAt - s.startedAt, s.deadline ? EXAM_MS : Infinity));
    $("statScoring").textContent = s.scoring === "penalty" ? "Penalty" : "No penalty";
    $("statMode").textContent = s.mode === "exam" ? "Exam" : "Study";
    const scope = s.kind === "mistakes" ? "Review mistakes" : s.scope === "all" ? "All chapters" : s.scope;
    $("statScope").textContent = `${scope} · ${plural(score.n, "question")} · ${(20 / score.n).toFixed(2).replace(/\.?0+$/, "")} points each`;
    $("timeUpNote").hidden = !s.timedOut;
    reviewFilter = "all";
    renderFilter();
    renderReviewList();
  }

  function renderFilter() {
    document.querySelectorAll(".filter button").forEach((b) => {
      b.setAttribute("aria-pressed", String(b.dataset.filter === reviewFilter));
    });
  }

  function renderReviewList() {
    const s = session;
    const items = s.questions.map((q, i) => {
      const a = s.answers[i];
      const status = a === null ? "blank" : q.options[a] === q.correct_answer ? "correct" : "wrong";
      return { q, i, a, status };
    });
    const shown = items.filter((it) => reviewFilter === "all" || it.status === reviewFilter);
    const labels = { correct: "Correct", wrong: "Wrong", blank: "Blank" };
    const list = $("reviewList");
    if (shown.length === 0) {
      list.replaceChildren(el("li", { class: "muted", text: "No questions in this category." }));
      return;
    }
    list.replaceChildren(
      ...shown.map(({ q, i, a, status }) => {
        const flagBtn = el("button", {
          type: "button",
          class: "btn btn-quiet",
          "aria-pressed": String(Boolean(getFlags()[q.id])),
          text: getFlags()[q.id] ? "Flagged" : "Flag",
        });
        flagBtn.addEventListener("click", () =>
          openFlagDialog(q.id, () => {
            const on = Boolean(getFlags()[q.id]);
            flagBtn.setAttribute("aria-pressed", String(on));
            flagBtn.textContent = on ? "Flagged" : "Flag";
          })
        );
        return el("li", { class: `card review-item is-${status}` }, [
          el("div", { class: "review-head" }, [
            el("span", { class: "status-tag", text: `${i + 1}. ${labels[status]}` }),
            el("span", { class: "chip", text: q.chapter }),
            el("span", { class: "q-topic", text: q.topic }),
          ]),
          el("p", { class: "review-q", text: q.question }),
          el("dl", { class: "answer-lines" }, [
            el("div", {}, [el("dt", { text: "Your answer:" }), el("dd", { text: a === null ? "No answer" : q.options[a] })]),
            el("div", {}, [el("dt", { text: "Correct answer:" }), el("dd", { text: q.correct_answer })]),
          ]),
          el("p", { text: q.explanation }),
          el("p", { class: "source", text: `Source: ${q.source} · ${q.id}` }),
          flagBtn,
        ]);
      })
    );
  }

  function goHome() {
    renderMistakesPanel();
    renderFlagsPanel();
    showScreen("home");
  }

  // ---------- Keyboard ----------
  function onKeyDown(e) {
    if (!session || session.finished || $("screen-quiz").hidden) return;
    if ($("flagDialog").open) return;
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const t = e.target;
    if (t.closest && t.closest("input, textarea, select")) return;

    if (/^[1-9]$/.test(e.key)) {
      const i = Number(e.key) - 1;
      if (i < session.questions[session.index].options.length) {
        e.preventDefault();
        choose(i);
      }
    } else if (e.key === "Enter") {
      // Enter moves on, unless focus is on another control that Enter should activate.
      const control = t.closest && t.closest("button, a, label");
      if (control && !control.classList.contains("option")) return;
      e.preventDefault();
      goNext();
    } else if (e.key === "ArrowRight") {
      if (session.index < session.questions.length - 1) {
        e.preventDefault();
        goTo(session.index + 1);
      }
    } else if (e.key === "ArrowLeft") {
      if (session.index > 0) {
        e.preventDefault();
        goTo(session.index - 1);
      }
    }
  }

  // ---------- Wire up ----------
  function init() {
    renderTheme();
    renderFont();
    if (darkQuery) {
      const onChange = () => renderTheme();
      if (darkQuery.addEventListener) darkQuery.addEventListener("change", onChange);
      else if (darkQuery.addListener) darkQuery.addListener(onChange);
    }
    $("themeToggle").addEventListener("click", toggleTheme);
    document.querySelectorAll(".font-size button").forEach((b) => b.addEventListener("click", () => setFont(b.dataset.font)));

    $("brandBtn").addEventListener("click", () => {
      if (session && !session.finished) exitSession();
      else goHome();
    });

    $("setupForm").addEventListener("submit", (e) => {
      e.preventDefault();
      const settings = readSetup();
      store.set(KEYS.setup, settings);
      startSession({ ...settings, kind: "normal" });
    });

    $("practiseMistakesBtn").addEventListener("click", () => {
      const settings = readSetup();
      startSession({ ...settings, scope: "all", kind: "mistakes" });
    });
    $("exportMistakesBtn").addEventListener("click", exportMistakes);
    $("importMistakesInput").addEventListener("change", (e) => {
      const file = e.target.files && e.target.files[0];
      if (file) importMistakes(file);
      e.target.value = "";
    });
    $("clearMistakesBtn").addEventListener("click", () => {
      if (!window.confirm("Clear all saved mistakes? Export them first if you want a backup.")) return;
      store.remove(KEYS.mistakes);
      $("mistakesStatus").textContent = "Mistakes list cleared.";
      renderMistakesPanel();
    });

    $("exportFlagsBtn").addEventListener("click", exportFlags);
    $("clearFlagsBtn").addEventListener("click", () => {
      if (!window.confirm("Clear all flagged questions?")) return;
      store.remove(KEYS.flags);
      renderFlagsPanel();
    });

    $("prevBtn").addEventListener("click", () => goTo(session.index - 1));
    $("nextBtn").addEventListener("click", goNext);
    $("clearAnswerBtn").addEventListener("click", () => {
      session.answers[session.index] = null;
      renderQuestion(false);
    });
    $("flagBtn").addEventListener("click", () =>
      openFlagDialog(session.questions[session.index].id, renderFlagButton)
    );
    $("finishBtn").addEventListener("click", confirmFinish);
    $("exitBtn").addEventListener("click", exitSession);

    $("againBtn").addEventListener("click", () => {
      if (lastSettings.kind === "mistakes" && mistakeIds().length === 0) {
        goHome();
        return;
      }
      startSession(lastSettings);
    });
    $("homeBtn").addEventListener("click", goHome);
    document.querySelectorAll(".filter button").forEach((b) =>
      b.addEventListener("click", () => {
        reviewFilter = b.dataset.filter;
        renderFilter();
        renderReviewList();
      })
    );

    $("flagDialog").addEventListener("close", onFlagDialogClose);
    document.addEventListener("keydown", onKeyDown);
    // Timers are throttled in background tabs; re-check as soon as the page is visible again.
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) tick();
    });

    loadBank();
  }

  init();
})();
