import { useEffect, useMemo, useState } from "react";
import { parseQuestions, parseSolutions, shuffle } from "./utils/parser";

const DEFAULT_SETTINGS = {
  timerEnabled: true,
  timerMinutes: 20,
  negativeMarkingEnabled: false,
  negativeMarks: 0.25,
  autoTagDifficulty: true,
};

function App() {
  const [questionText, setQuestionText] = useState("");
  const [solutionText, setSolutionText] = useState("");
  const [questions, setQuestions] = useState([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [mode, setMode] = useState("setup");
  const [quiz, setQuiz] = useState([]);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [timeLeft, setTimeLeft] = useState(0);

  const current = quiz[index] || null;

  useEffect(() => {
    if (mode !== "quiz" || submitted || !settings.timerEnabled) {
      return;
    }

    if (timeLeft <= 0) {
      setNotice("Time is up. Quiz submitted automatically.");
      submitQuiz();
      return;
    }

    const id = setInterval(() => {
      setTimeLeft((prev) => Math.max(prev - 1, 0));
    }, 1000);

    return () => clearInterval(id);
  }, [mode, submitted, settings.timerEnabled, timeLeft]);

  const analysis = useMemo(() => {
    if (!submitted || quiz.length === 0) {
      return null;
    }

    const report = quiz.map((q, i) => {
      const selected = answers[q.runtimeId] || null;
      const correct = q.correct || null;
      const isCorrect = correct ? selected === correct : null;
      const marks =
        isCorrect === null
          ? 0
          : isCorrect
            ? 1
            : settings.negativeMarkingEnabled
              ? -Number(settings.negativeMarks)
              : 0;
      return {
        no: i + 1,
        question: q.question,
        difficulty: q.difficulty,
        selected,
        correct,
        isCorrect,
        options: q.options,
        marks,
      };
    });

    const known = report.filter((r) => r.isCorrect !== null);
    const correctCount = known.filter((r) => r.isCorrect).length;
    const wrong = known.filter((r) => !r.isCorrect);
    const totalMarks = Number(
      report.reduce((sum, r) => sum + r.marks, 0).toFixed(2),
    );
    const byDifficulty = {
      easy: report.filter((r) => r.difficulty === "Easy").length,
      medium: report.filter((r) => r.difficulty === "Medium").length,
      hard: report.filter((r) => r.difficulty === "Hard").length,
    };

    return {
      report,
      knownCount: known.length,
      unknownCount: report.length - known.length,
      correctCount,
      wrongCount: wrong.length,
      score: known.length ? Math.round((correctCount / known.length) * 100) : 0,
      totalMarks,
      byDifficulty,
      wrong,
    };
  }, [
    submitted,
    quiz,
    answers,
    settings.negativeMarkingEnabled,
    settings.negativeMarks,
  ]);

  async function readAnyFile(file) {
    const name = file.name.toLowerCase();
    if (name.endsWith(".docx")) {
      const mammoth = await import("mammoth/mammoth.browser");
      const buffer = await file.arrayBuffer();
      const res = await mammoth.extractRawText({ arrayBuffer: buffer });
      return res.value;
    }

    if (
      name.endsWith(".txt") ||
      name.endsWith(".md") ||
      name.endsWith(".markdown") ||
      name.endsWith(".readme")
    ) {
      return file.text();
    }

    // Fallback for unknown text-like files.
    return file.text();
  }

  async function onQuestionFile(e) {
    const file = e.target.files?.[0];
    if (!file) {
      return;
    }
    try {
      const text = await readAnyFile(file);
      setQuestionText(text);
      setError("");
    } catch {
      setError(
        "Could not read the selected question file. Prefer .txt, .md, .README or .docx.",
      );
    }
  }

  async function onSolutionFile(e) {
    const file = e.target.files?.[0];
    if (!file) {
      return;
    }
    try {
      const text = await readAnyFile(file);
      setSolutionText(text);
      setError("");
    } catch {
      setError("Could not read the selected solution file.");
    }
  }

  function buildQuiz() {
    const parsed = parseQuestions(questionText);
    if (parsed.length === 0) {
      setError(
        "No questions were detected. Paste or upload a file with numbered MCQs and options A-D.",
      );
      return;
    }

    let merged = parsed.map((q) => ({ ...q }));

    const hasEmbedded = merged.some((q) => q.correct);
    if (!hasEmbedded && solutionText.trim()) {
      const solutionArr = parseSolutions(solutionText, merged.length);
      merged = merged.map((q, i) => ({
        ...q,
        correct: solutionArr[i] || null,
      }));
    }

    merged = merged.map((q) => {
      const { question, explicit } = extractExplicitDifficulty(q.question);
      const inferred = settings.autoTagDifficulty
        ? inferDifficulty(question, q.options)
        : "Medium";
      return {
        ...q,
        question,
        difficulty: explicit || inferred,
      };
    });

    const runtime = shuffle(
      merged.map((q, i) => ({
        ...q,
        runtimeId: `${q.id || i + 1}-${Math.random().toString(36).slice(2, 8)}`,
      })),
    );

    setQuestions(merged);
    setQuiz(runtime);
    setMode("quiz");
    setIndex(0);
    setAnswers({});
    setSubmitted(false);
    setTimeLeft(
      settings.timerEnabled
        ? Math.max(1, Number(settings.timerMinutes || 1)) * 60
        : 0,
    );
    setError("");
    setNotice("");
  }

  function retest() {
    const runtime = shuffle(
      questions.map((q, i) => ({
        ...q,
        runtimeId: `${q.id || i + 1}-${Math.random().toString(36).slice(2, 8)}`,
      })),
    );

    setQuiz(runtime);
    setIndex(0);
    setAnswers({});
    setSubmitted(false);
    setTimeLeft(
      settings.timerEnabled
        ? Math.max(1, Number(settings.timerMinutes || 1)) * 60
        : 0,
    );
    setNotice("");
    setMode("quiz");
  }

  function selectAnswer(label) {
    if (!current || submitted) {
      return;
    }

    setAnswers((prev) => ({
      ...prev,
      [current.runtimeId]: label,
    }));
  }

  function gotoNext() {
    setIndex((i) => Math.min(i + 1, quiz.length - 1));
  }

  function gotoPrev() {
    setIndex((i) => Math.max(i - 1, 0));
  }

  function submitQuiz() {
    setSubmitted(true);
    setMode("result");
  }

  function updateSetting(key, value) {
    setSettings((prev) => ({ ...prev, [key]: value }));
  }

  function exportCsv() {
    if (!analysis) {
      return;
    }

    const lines = [
      [
        "No",
        "Question",
        "Difficulty",
        "Selected",
        "Correct",
        "Status",
        "Marks",
      ].join(","),
      ...analysis.report.map((r) =>
        [
          r.no,
          csvSafe(r.question),
          r.difficulty,
          r.selected || "Not answered",
          r.correct || "No key",
          r.isCorrect === null ? "No Key" : r.isCorrect ? "Correct" : "Wrong",
          r.marks,
        ].join(","),
      ),
    ];

    const blob = new Blob([lines.join("\n")], {
      type: "text/csv;charset=utf-8",
    });
    downloadBlob(blob, `mcq-analysis-${Date.now()}.csv`);
  }

  async function exportPdf() {
    if (!analysis) {
      return;
    }

    const [{ jsPDF }, autoTableModule] = await Promise.all([
      import("jspdf"),
      import("jspdf-autotable"),
    ]);
    const autoTable = autoTableModule.default;

    const doc = new jsPDF({ orientation: "landscape" });
    doc.setFontSize(16);
    doc.text("MCQ Result Analysis", 14, 16);
    doc.setFontSize(10);
    doc.text(
      `Score: ${analysis.score}% | Correct: ${analysis.correctCount} | Wrong: ${analysis.wrongCount} | Marks: ${analysis.totalMarks}`,
      14,
      24,
    );

    autoTable(doc, {
      startY: 30,
      head: [
        ["No", "Question", "Diff", "Selected", "Correct", "Status", "Marks"],
      ],
      body: analysis.report.map((r) => [
        r.no,
        r.question,
        r.difficulty,
        r.selected || "Not answered",
        r.correct || "No key",
        r.isCorrect === null ? "No Key" : r.isCorrect ? "Correct" : "Wrong",
        r.marks,
      ]),
      styles: {
        fontSize: 8,
        overflow: "linebreak",
      },
      columnStyles: {
        1: { cellWidth: 120 },
      },
    });

    doc.save(`mcq-analysis-${Date.now()}.pdf`);
  }

  const answeredCount = Object.keys(answers).length;
  const formattedTime = formatTime(timeLeft);

  return (
    <div className="page">
      <div className="bg-grid" aria-hidden="true" />
      <header className="hero">
        <h1>MCQ Practice Studio</h1>
        <p>
          Paste or upload questions, randomize automatically, attempt the quiz,
          then get detailed analysis with wrong answers and correct options.
        </p>
      </header>

      {error && <div className="error-box">{error}</div>}
      {notice && <div className="notice-box">{notice}</div>}

      {mode === "setup" && (
        <section className="card setup-card">
          <h2>1) Add Questions</h2>
          <p className="hint">
            Accepted: .txt, .md, .README, .docx or direct paste.
          </p>
          <textarea
            className="big-input"
            value={questionText}
            onChange={(e) => setQuestionText(e.target.value)}
            placeholder="Paste all MCQs here..."
          />
          <label className="file-btn">
            Upload Questions File
            <input
              type="file"
              accept=".txt,.md,.markdown,.readme,.docx"
              onChange={onQuestionFile}
            />
          </label>

          <h2>2) Optional Solutions File</h2>
          <p className="hint">
            Skip this if correct answers are already marked with ✅ in the
            question file.
          </p>
          <textarea
            className="small-input"
            value={solutionText}
            onChange={(e) => setSolutionText(e.target.value)}
            placeholder="Optional solution mapping (example: 1:C, 2:B...)"
          />
          <label className="file-btn alt">
            Upload Solution File
            <input
              type="file"
              accept=".txt,.md,.markdown,.readme,.docx"
              onChange={onSolutionFile}
            />
          </label>

          <h2>3) Quiz Controls</h2>
          <div className="settings-grid">
            <label className="toggle-row">
              <input
                type="checkbox"
                checked={settings.timerEnabled}
                onChange={(e) =>
                  updateSetting("timerEnabled", e.target.checked)
                }
              />
              Enable Quiz Timer (auto-submit)
            </label>

            <label className="inline-field">
              Time (minutes)
              <input
                type="number"
                min="1"
                value={settings.timerMinutes}
                onChange={(e) =>
                  updateSetting("timerMinutes", Number(e.target.value || 1))
                }
                disabled={!settings.timerEnabled}
              />
            </label>

            <label className="toggle-row">
              <input
                type="checkbox"
                checked={settings.negativeMarkingEnabled}
                onChange={(e) =>
                  updateSetting("negativeMarkingEnabled", e.target.checked)
                }
              />
              Enable Negative Marking (optional)
            </label>

            <label className="inline-field">
              Negative marks per wrong answer
              <input
                type="number"
                min="0"
                step="0.25"
                value={settings.negativeMarks}
                onChange={(e) =>
                  updateSetting("negativeMarks", Number(e.target.value || 0))
                }
                disabled={!settings.negativeMarkingEnabled}
              />
            </label>

            <label className="toggle-row">
              <input
                type="checkbox"
                checked={settings.autoTagDifficulty}
                onChange={(e) =>
                  updateSetting("autoTagDifficulty", e.target.checked)
                }
              />
              Auto-tag difficulty (Easy / Medium / Hard)
            </label>
          </div>

          <button className="primary" onClick={buildQuiz}>
            Generate Random Quiz
          </button>
        </section>
      )}

      {mode === "quiz" && current && (
        <section className="card quiz-card" key={current.runtimeId}>
          <div className="quiz-top">
            <span>
              Question {index + 1}/{quiz.length}
            </span>
            <span>
              Answered: {answeredCount}/{quiz.length}
            </span>
            {settings.timerEnabled && (
              <span className="timer-chip">Time Left: {formattedTime}</span>
            )}
          </div>

          <div className="progress">
            <div style={{ width: `${((index + 1) / quiz.length) * 100}%` }} />
          </div>

          <h2 className="q-title">{current.question}</h2>
          <div
            className={`tag ${current.difficulty?.toLowerCase() || "medium"}`}
          >
            {current.difficulty || "Medium"}
          </div>

          <div className="options">
            {current.options.map((opt) => {
              const checked = answers[current.runtimeId] === opt.label;
              return (
                <button
                  key={opt.label}
                  className={`option ${checked ? "selected" : ""}`}
                  onClick={() => selectAnswer(opt.label)}
                >
                  <span className="label">{opt.label}</span>
                  <span>{opt.text}</span>
                </button>
              );
            })}
          </div>

          <div className="actions">
            <button className="ghost" onClick={gotoPrev} disabled={index === 0}>
              Previous
            </button>
            {index < quiz.length - 1 ? (
              <button className="primary" onClick={gotoNext}>
                Next
              </button>
            ) : (
              <button className="primary" onClick={submitQuiz}>
                Submit Quiz
              </button>
            )}
          </div>
        </section>
      )}

      {mode === "result" && analysis && (
        <section className="card result-card">
          <h2>Result Analysis</h2>
          <div className="stats">
            <div className="stat">
              <strong>{analysis.correctCount}</strong>
              <span>Correct</span>
            </div>
            <div className="stat">
              <strong>{analysis.wrongCount}</strong>
              <span>Wrong</span>
            </div>
            <div className="stat">
              <strong>{analysis.unknownCount}</strong>
              <span>No Key</span>
            </div>
            <div className="stat">
              <strong>{analysis.score}%</strong>
              <span>Score</span>
            </div>
            <div className="stat">
              <strong>{analysis.totalMarks}</strong>
              <span>Marks</span>
            </div>
          </div>

          <div className="difficulty-strip">
            <span>Easy: {analysis.byDifficulty.easy}</span>
            <span>Medium: {analysis.byDifficulty.medium}</span>
            <span>Hard: {analysis.byDifficulty.hard}</span>
          </div>

          <div className="bar-wrap">
            <div
              className="bar correct"
              style={{ width: `${analysis.score}%` }}
            />
            <div
              className="bar wrong"
              style={{ width: `${100 - analysis.score}%` }}
            />
          </div>

          {analysis.wrong.length > 0 ? (
            <div className="wrong-list">
              <h3>Wrong Answers Review</h3>
              {analysis.wrong.map((item) => (
                <article key={item.no} className="wrong-item">
                  <p>
                    <strong>Q{item.no}.</strong> {item.question}
                  </p>
                  <p>
                    Your answer: <b>{item.selected || "Not answered"}</b>
                  </p>
                  <p>
                    Correct answer: <b>{item.correct}</b>
                  </p>
                </article>
              ))}
            </div>
          ) : (
            <p className="all-good">
              Great work. No wrong answers among questions with known keys.
            </p>
          )}

          <div className="actions">
            <button className="ghost" onClick={exportCsv}>
              Export CSV
            </button>
            <button className="ghost" onClick={exportPdf}>
              Export PDF
            </button>
            <button className="ghost" onClick={() => setMode("setup")}>
              Load New Question Set
            </button>
            <button className="primary" onClick={retest}>
              Retest in Random Order
            </button>
          </div>
        </section>
      )}
    </div>
  );
}

function inferDifficulty(question, options) {
  const text =
    `${question} ${options.map((o) => o.text).join(" ")}`.toLowerCase();
  const hardKeywords = [
    "architecture",
    "negotiation",
    "repository pattern",
    "dependency injection",
    "fluent api",
    "middleware",
  ];
  const mediumKeywords = [
    "api",
    "status code",
    "ef core",
    "controller",
    "dto",
    "cors",
  ];

  const lengthScore =
    question.length +
    options.map((o) => o.text.length).reduce((a, b) => a + b, 0);
  const hardHit = hardKeywords.some((k) => text.includes(k));
  const mediumHit = mediumKeywords.some((k) => text.includes(k));

  if (hardHit || lengthScore > 300) {
    return "Hard";
  }
  if (mediumHit || lengthScore > 170) {
    return "Medium";
  }
  return "Easy";
}

function extractExplicitDifficulty(question) {
  const m = question.match(/\[(easy|medium|hard)\]\s*$/i);
  if (!m) {
    return { question, explicit: null };
  }
  return {
    question: question.replace(/\[(easy|medium|hard)\]\s*$/i, "").trim(),
    explicit: capitalize(m[1]),
  };
}

function formatTime(total) {
  const safe = Math.max(0, Number(total || 0));
  const m = Math.floor(safe / 60)
    .toString()
    .padStart(2, "0");
  const s = Math.floor(safe % 60)
    .toString()
    .padStart(2, "0");
  return `${m}:${s}`;
}

function capitalize(word) {
  return word.slice(0, 1).toUpperCase() + word.slice(1).toLowerCase();
}

function csvSafe(text) {
  const clean = String(text || "").replace(/"/g, '""');
  return `"${clean}"`;
}

function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default App;
