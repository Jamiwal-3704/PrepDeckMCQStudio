import { useEffect, useMemo, useState } from "react";
import { parseQuestions, parseSolutions, shuffle } from "./utils/parser";
import {
  PROVIDERS,
  PROVIDER_ORDER,
  extractMcqsWithAI,
  generateQuestionsViaAI,
  looksLikeMcqs,
} from "./utils/paragraphParser";

// Load saved provider prefs from localStorage
function loadProviderKeys() {
  try { return JSON.parse(localStorage.getItem("prep_provider_keys") || "{}"); }
  catch { return {}; }
}

const DEFAULT_SETTINGS = {
  timerEnabled: true,
  timerMinutes: 20,
  negativeMarkingEnabled: false,
  negativeMarks: 0.25,
  autoTagDifficulty: true,
  questionCount: 5,
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

  // Input & AI state
  const [inputMode, setInputMode] = useState("mcq");
  const [processing, setProcessing] = useState(false);

  // Provider selection
  const [selectedProviderId, setSelectedProviderId] = useState(
    () => localStorage.getItem("prep_selected_provider") || "groq"
  );
  const [providerKeys, setProviderKeys] = useState(loadProviderKeys);
  const [showProviderPanel, setShowProviderPanel] = useState(false);

  const provider = PROVIDERS[selectedProviderId] || PROVIDERS.groq;
  const apiKey = providerKeys[selectedProviderId] || "";
  const hasApiKey = Boolean(apiKey.trim());

  const current = quiz[index] || null;

  function saveProviderKey(providerId, key) {
    const next = { ...providerKeys, [providerId]: key };
    setProviderKeys(next);
    localStorage.setItem("prep_provider_keys", JSON.stringify(next));
  }

  function selectProvider(id) {
    setSelectedProviderId(id);
    localStorage.setItem("prep_selected_provider", id);
  }

  // ── Timer ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (mode !== "quiz" || submitted || !settings.timerEnabled) return;
    if (timeLeft <= 0) {
      setNotice("Time is up. Quiz submitted automatically.");
      submitQuiz();
      return;
    }
    const id = setInterval(() => setTimeLeft((p) => Math.max(p - 1, 0)), 1000);
    return () => clearInterval(id);
  }, [mode, submitted, settings.timerEnabled, timeLeft]);

  // ── Analysis ───────────────────────────────────────────────────────────────
  const analysis = useMemo(() => {
    if (!submitted || quiz.length === 0) return null;
    const report = quiz.map((q, i) => {
      const selected = answers[q.runtimeId] || null;
      const correct = q.correct || null;
      const isCorrect = correct ? selected === correct : null;
      const marks =
        isCorrect === null ? 0
        : isCorrect ? 1
        : settings.negativeMarkingEnabled ? -Number(settings.negativeMarks)
        : 0;
      return { no: i + 1, question: q.question, difficulty: q.difficulty, selected, correct, isCorrect, options: q.options, marks };
    });
    const known = report.filter((r) => r.isCorrect !== null);
    const correctCount = known.filter((r) => r.isCorrect).length;
    const wrong = known.filter((r) => !r.isCorrect);
    const totalMarks = Number(report.reduce((s, r) => s + r.marks, 0).toFixed(2));
    const byDifficulty = {
      easy: report.filter((r) => r.difficulty === "Easy").length,
      medium: report.filter((r) => r.difficulty === "Medium").length,
      hard: report.filter((r) => r.difficulty === "Hard").length,
    };
    return {
      report, knownCount: known.length, unknownCount: report.length - known.length,
      correctCount, wrongCount: wrong.length,
      score: known.length ? Math.round((correctCount / known.length) * 100) : 0,
      totalMarks, byDifficulty, wrong,
    };
  }, [submitted, quiz, answers, settings.negativeMarkingEnabled, settings.negativeMarks]);

  // ── File reading ───────────────────────────────────────────────────────────
  async function readAnyFile(file) {
    if (file.name.toLowerCase().endsWith(".docx")) {
      const mammoth = await import("mammoth/mammoth.browser");
      const buffer = await file.arrayBuffer();
      const res = await mammoth.extractRawText({ arrayBuffer: buffer });
      return res.value;
    }
    return file.text();
  }

  async function onQuestionFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    try { setQuestionText(await readAnyFile(file)); setError(""); }
    catch { setError("Could not read file. Use .txt, .md, .README or .docx."); }
  }

  async function onSolutionFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    try { setSolutionText(await readAnyFile(file)); setError(""); }
    catch { setError("Could not read the solution file."); }
  }

  // ── Launch quiz ────────────────────────────────────────────────────────────
  function launchQuiz(parsedQuestions, noticeMsg = "") {
    let merged = parsedQuestions.map((q) => ({ ...q }));

    const hasEmbedded = merged.some((q) => q.correct);
    if (!hasEmbedded && solutionText.trim()) {
      const sol = parseSolutions(solutionText, merged.length);
      merged = merged.map((q, i) => ({ ...q, correct: sol[i] || null }));
    }

    merged = merged.map((q) => {
      const { question, explicit } = extractExplicitDifficulty(q.question);
      const inferred = settings.autoTagDifficulty ? inferDifficulty(question, q.options) : "Medium";
      return { ...q, question, difficulty: explicit || inferred };
    });

    const runtime = shuffle(
      merged.map((q, i) => ({
        ...q,
        runtimeId: `${q.id || i + 1}-${Math.random().toString(36).slice(2, 8)}`,
      }))
    );

    setQuestions(merged);
    setQuiz(runtime);
    setMode("quiz");
    setIndex(0);
    setAnswers({});
    setSubmitted(false);
    setTimeLeft(settings.timerEnabled ? Math.max(1, Number(settings.timerMinutes || 1)) * 60 : 0);
    setError("");
    setNotice(noticeMsg);
  }

  // ── Main action ────────────────────────────────────────────────────────────
  async function handleBuildQuiz() {
    setError("");
    if (!questionText.trim()) { setError("Please paste or upload some content first."); return; }

    if (inputMode === "paragraph") {
      if (hasApiKey) {
        if (looksLikeMcqs(questionText)) {
          await runAI("extract", `🔍 AI extracted questions from your content using ${provider.name}!`);
        } else {
          await runAI("generate", `🤖 ${provider.name} generated ${settings.questionCount} questions from your passage!`);
        }
      } else {
        const parsed = parseQuestions(questionText);
        if (parsed.length > 0) {
          launchQuiz(parsed, `✅ Found ${parsed.length} MCQ(s) — starting quiz!`);
        } else {
          setShowProviderPanel(true);
          setError("No MCQs detected. Select an AI provider and enter your API key to generate questions from the paragraph.");
        }
      }
      return;
    }

    // MCQ mode
    if (hasApiKey) {
      await runAI("extract", `🤖 ${provider.name} extracted and normalised your questions!`);
    } else {
      const parsed = parseQuestions(questionText);
      if (parsed.length === 0) {
        setShowProviderPanel(true);
        setError("Could not parse questions with the local parser. Select an AI provider above to handle any format.");
        return;
      }
      launchQuiz(parsed);
    }
  }

  async function runAI(task, successNotice) {
    setProcessing(true);
    setError("");
    try {
      const count = Number(settings.questionCount) || 5;
      const result = task === "extract"
        ? await extractMcqsWithAI(questionText, provider, apiKey)
        : await generateQuestionsViaAI(questionText, provider, apiKey, count);
      launchQuiz(result, successNotice);
    } catch (err) {
      setError(`${provider.name} error: ${err.message}`);
    } finally {
      setProcessing(false);
    }
  }

  // ── Retest ─────────────────────────────────────────────────────────────────
  function retest() {
    const runtime = shuffle(
      questions.map((q, i) => ({
        ...q,
        runtimeId: `${q.id || i + 1}-${Math.random().toString(36).slice(2, 8)}`,
      }))
    );
    setQuiz(runtime); setIndex(0); setAnswers({}); setSubmitted(false);
    setTimeLeft(settings.timerEnabled ? Math.max(1, Number(settings.timerMinutes || 1)) * 60 : 0);
    setNotice(""); setMode("quiz");
  }

  function selectAnswer(label) {
    if (!current || submitted) return;
    setAnswers((prev) => ({ ...prev, [current.runtimeId]: label }));
  }
  function gotoNext() { setIndex((i) => Math.min(i + 1, quiz.length - 1)); }
  function gotoPrev() { setIndex((i) => Math.max(i - 1, 0)); }
  function submitQuiz() { setSubmitted(true); setMode("result"); }
  function updateSetting(key, value) { setSettings((prev) => ({ ...prev, [key]: value })); }

  // ── Export ─────────────────────────────────────────────────────────────────
  function exportCsv() {
    if (!analysis) return;
    const lines = [
      ["No","Question","Difficulty","Selected","Correct","Status","Marks"].join(","),
      ...analysis.report.map((r) =>
        [r.no, csvSafe(r.question), r.difficulty, r.selected || "Not answered",
          r.correct || "No key", r.isCorrect === null ? "No Key" : r.isCorrect ? "Correct" : "Wrong", r.marks].join(",")
      ),
    ];
    downloadBlob(new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" }), `mcq-analysis-${Date.now()}.csv`);
  }

  async function exportPdf() {
    if (!analysis) return;
    const [{ jsPDF }, autoTableModule] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
    const autoTable = autoTableModule.default;
    const doc = new jsPDF({ orientation: "landscape" });
    doc.setFontSize(16); doc.text("MCQ Result Analysis", 14, 16);
    doc.setFontSize(10);
    doc.text(`Score: ${analysis.score}% | Correct: ${analysis.correctCount} | Wrong: ${analysis.wrongCount} | Marks: ${analysis.totalMarks}`, 14, 24);
    autoTable(doc, {
      startY: 30,
      head: [["No","Question","Diff","Selected","Correct","Status","Marks"]],
      body: analysis.report.map((r) => [r.no, r.question, r.difficulty, r.selected||"Not answered", r.correct||"No key", r.isCorrect===null?"No Key":r.isCorrect?"Correct":"Wrong", r.marks]),
      styles: { fontSize: 8, overflow: "linebreak" },
      columnStyles: { 1: { cellWidth: 120 } },
    });
    doc.save(`mcq-analysis-${Date.now()}.pdf`);
  }

  const answeredCount = Object.keys(answers).length;

  const ctaLabel = (() => {
    if (processing) return null;
    if (inputMode === "paragraph") {
      if (!hasApiKey) return "Start Quiz (regex fallback)";
      if (looksLikeMcqs(questionText)) return `Extract MCQs with ${provider.name}`;
      return `Generate ${settings.questionCount} Questions with ${provider.name}`;
    }
    return hasApiKey ? `Extract with ${provider.name} & Start Quiz` : "Generate Quiz (regex fallback)";
  })();

  return (
    <div className="page">
      <div className="bg-grid" aria-hidden="true" />
      <header className="hero">
        <h1>MCQ Practice Studio</h1>
        <p>Paste questions in any format or a paragraph — AI will extract or generate questions and shuffle them for practice.</p>
      </header>

      {error && <div className="error-box">{error}</div>}
      {notice && <div className="notice-box">{notice}</div>}

      {mode === "setup" && (
        <section className="card setup-card">

          {/* ── Input Type Toggle ── */}
          <div className="mode-selector-row">
            <span className="mode-label">Input Type</span>
            <div className="mode-toggle" role="group">
              <button id="mode-mcq" className={`mode-btn ${inputMode === "mcq" ? "active" : ""}`}
                onClick={() => { setInputMode("mcq"); setError(""); }}>
                <span className="mode-icon">📝</span> MCQ Questions
              </button>
              <button id="mode-paragraph" className={`mode-btn ${inputMode === "paragraph" ? "active" : ""}`}
                onClick={() => { setInputMode("paragraph"); setError(""); }}>
                <span className="mode-icon">📄</span> Paragraph / Passage
              </button>
            </div>
          </div>

          {/* ── AI Provider Panel ── */}
          <div className="provider-section">
            <button
              className="provider-toggle-btn"
              onClick={() => setShowProviderPanel((v) => !v)}
              type="button"
            >
              <span className="provider-toggle-left">
                <span className="provider-selected-icon" style={{ background: provider.color }}>
                  {provider.icon}
                </span>
                <span>
                  <span className="provider-selected-name">{provider.name}</span>
                  <span className="provider-selected-model">{provider.modelLabel}</span>
                </span>
              </span>
              <span className="provider-toggle-right">
                <span className={`key-status ${hasApiKey ? "ok" : "missing"}`}>
                  {hasApiKey ? "✓ Key saved" : "No key"}
                </span>
                <span className="chevron">{showProviderPanel ? "▲" : "▼"}</span>
              </span>
            </button>

            {showProviderPanel && (
              <div className="provider-panel">
                <p className="provider-panel-hint">Select an AI provider, then enter your API key below.</p>

                {/* Provider Cards */}
                <div className="provider-cards">
                  {PROVIDER_ORDER.map((pid) => {
                    const p = PROVIDERS[pid];
                    const selected = pid === selectedProviderId;
                    const hasKey = Boolean((providerKeys[pid] || "").trim());
                    return (
                      <button
                        key={pid}
                        className={`provider-card ${selected ? "selected" : ""}`}
                        style={{ "--p-color": p.color }}
                        onClick={() => selectProvider(pid)}
                        type="button"
                      >
                        <span className="pc-icon" style={{ background: p.color }}>{p.icon}</span>
                        <span className="pc-name">{p.name}</span>
                        <span className="pc-tagline">{p.tagline}</span>
                        <span className="pc-model">{p.modelLabel}</span>
                        {hasKey && <span className="pc-key-dot" title="Key saved" />}
                      </button>
                    );
                  })}
                </div>

                {/* Key input for selected provider */}
                <div className="provider-key-row">
                  <label className="provider-key-label">
                    {provider.name} API Key
                  </label>
                  <input
                    type="password"
                    className="api-key-input"
                    placeholder={provider.keyPlaceholder}
                    value={providerKeys[selectedProviderId] || ""}
                    onChange={(e) => saveProviderKey(selectedProviderId, e.target.value)}
                  />
                  <p className="api-key-hint">
                    Get a free key at{" "}
                    <a href={provider.keyLink} target="_blank" rel="noreferrer">
                      {provider.keyLinkLabel}
                    </a>
                    . Stored only in your browser's localStorage.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* ── Textarea ── */}
          <h2 style={{ marginTop: "18px" }}>
            {inputMode === "mcq" ? "Paste Questions" : "Paste Paragraph / Passage"}
          </h2>
          <p className="hint">
            {inputMode === "mcq"
              ? "Works with any format — numbered, QUESTION N headers, markdown, <details> blocks, etc."
              : "Paste any passage. Embedded MCQs are extracted; plain paragraphs generate new questions via AI."}
          </p>
          <textarea
            className="big-input"
            value={questionText}
            onChange={(e) => { setQuestionText(e.target.value); setError(""); }}
            placeholder={inputMode === "mcq" ? "Paste MCQs in any format here…" : "Paste your passage or paragraph here…"}
          />
          <label className="file-btn">
            {inputMode === "mcq" ? "Upload Questions File" : "Upload Passage File"}
            <input type="file" accept=".txt,.md,.markdown,.readme,.docx" onChange={onQuestionFile} />
          </label>

          {/* MCQ mode: solutions */}
          {inputMode === "mcq" && (
            <>
              <h2>Optional Solutions File</h2>
              <p className="hint">Skip if answers are embedded in the text or AI will extract them.</p>
              <textarea className="small-input" value={solutionText}
                onChange={(e) => setSolutionText(e.target.value)}
                placeholder="Optional solution mapping (example: 1:C, 2:B…)" />
              <label className="file-btn alt">
                Upload Solution File
                <input type="file" accept=".txt,.md,.markdown,.readme,.docx" onChange={onSolutionFile} />
              </label>
            </>
          )}

          {/* Settings */}
          <h2>Settings</h2>
          <div className="settings-grid">
            <label className="toggle-row">
              <input type="checkbox" checked={settings.timerEnabled}
                onChange={(e) => updateSetting("timerEnabled", e.target.checked)} />
              Enable Quiz Timer (auto-submit)
            </label>
            <label className="inline-field">
              Time (minutes)
              <input type="number" min="1" value={settings.timerMinutes}
                onChange={(e) => updateSetting("timerMinutes", Number(e.target.value || 1))}
                disabled={!settings.timerEnabled} />
            </label>
            <label className="toggle-row">
              <input type="checkbox" checked={settings.negativeMarkingEnabled}
                onChange={(e) => updateSetting("negativeMarkingEnabled", e.target.checked)} />
              Enable Negative Marking
            </label>
            <label className="inline-field">
              Negative marks per wrong answer
              <input type="number" min="0" step="0.25" value={settings.negativeMarks}
                onChange={(e) => updateSetting("negativeMarks", Number(e.target.value || 0))}
                disabled={!settings.negativeMarkingEnabled} />
            </label>
            <label className="toggle-row">
              <input type="checkbox" checked={settings.autoTagDifficulty}
                onChange={(e) => updateSetting("autoTagDifficulty", e.target.checked)} />
              Auto-tag difficulty (Easy / Medium / Hard)
            </label>
            {inputMode === "paragraph" && !looksLikeMcqs(questionText) && (
              <label className="inline-field">
                Questions to generate
                <div className="count-slider-row">
                  <input type="range" min="3" max="15" step="1"
                    value={settings.questionCount}
                    onChange={(e) => updateSetting("questionCount", Number(e.target.value))} />
                  <span className="count-pill">{settings.questionCount}</span>
                </div>
              </label>
            )}
          </div>

          {/* CTA */}
          <div className="paragraph-cta-row">
            <button className="primary" onClick={handleBuildQuiz} disabled={processing}>
              {processing ? <><span className="spinner" /> Processing with {provider.name}…</> : ctaLabel}
            </button>
            {processing && <span className="gen-hint">AI is reading your content and building the quiz…</span>}
          </div>
        </section>
      )}

      {/* ── QUIZ ── */}
      {mode === "quiz" && current && (
        <section className="card quiz-card" key={current.runtimeId}>
          <div className="quiz-top">
            <span>Question {index + 1}/{quiz.length}</span>
            <span>Answered: {answeredCount}/{quiz.length}</span>
            {settings.timerEnabled && <span className="timer-chip">Time Left: {formatTime(timeLeft)}</span>}
          </div>
          <div className="progress"><div style={{ width: `${((index + 1) / quiz.length) * 100}%` }} /></div>
          <h2 className="q-title">{current.question}</h2>
          <div className={`tag ${current.difficulty?.toLowerCase() || "medium"}`}>{current.difficulty || "Medium"}</div>
          <div className="options">
            {current.options.map((opt) => {
              const checked = answers[current.runtimeId] === opt.label;
              return (
                <button key={opt.label} className={`option ${checked ? "selected" : ""}`} onClick={() => selectAnswer(opt.label)}>
                  <span className="label">{opt.label}</span>
                  <span>{opt.text}</span>
                </button>
              );
            })}
          </div>
          <div className="actions">
            <button className="ghost" onClick={gotoPrev} disabled={index === 0}>Previous</button>
            {index < quiz.length - 1
              ? <button className="primary" onClick={gotoNext}>Next</button>
              : <button className="primary" onClick={submitQuiz}>Submit Quiz</button>}
          </div>
        </section>
      )}

      {/* ── RESULT ── */}
      {mode === "result" && analysis && (
        <section className="card result-card">
          <h2>Result Analysis</h2>
          <div className="stats">
            <div className="stat"><strong>{analysis.correctCount}</strong><span>Correct</span></div>
            <div className="stat"><strong>{analysis.wrongCount}</strong><span>Wrong</span></div>
            <div className="stat"><strong>{analysis.unknownCount}</strong><span>No Key</span></div>
            <div className="stat"><strong>{analysis.score}%</strong><span>Score</span></div>
            <div className="stat"><strong>{analysis.totalMarks}</strong><span>Marks</span></div>
          </div>
          <div className="difficulty-strip">
            <span>Easy: {analysis.byDifficulty.easy}</span>
            <span>Medium: {analysis.byDifficulty.medium}</span>
            <span>Hard: {analysis.byDifficulty.hard}</span>
          </div>
          <div className="bar-wrap">
            <div className="bar correct" style={{ width: `${analysis.score}%` }} />
            <div className="bar wrong" style={{ width: `${100 - analysis.score}%` }} />
          </div>
          {analysis.wrong.length > 0 ? (
            <div className="wrong-list">
              <h3>Wrong Answers Review</h3>
              {analysis.wrong.map((item) => (
                <article key={item.no} className="wrong-item">
                  <p><strong>Q{item.no}.</strong> {item.question}</p>
                  <p>Your answer: <b>{item.selected || "Not answered"}</b></p>
                  <p>Correct answer: <b>{item.correct}</b></p>
                </article>
              ))}
            </div>
          ) : (
            <p className="all-good">Great work. No wrong answers among questions with known keys.</p>
          )}
          <div className="actions">
            <button className="ghost" onClick={exportCsv}>Export CSV</button>
            <button className="ghost" onClick={exportPdf}>Export PDF</button>
            <button className="ghost" onClick={() => setMode("setup")}>Load New Question Set</button>
            <button className="primary" onClick={retest}>Retest in Random Order</button>
          </div>
        </section>
      )}
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function inferDifficulty(question, options) {
  const text = `${question} ${options.map((o) => o.text).join(" ")}`.toLowerCase();
  const hard = ["architecture","negotiation","repository pattern","dependency injection","fluent api","middleware"];
  const med = ["api","status code","ef core","controller","dto","cors"];
  const len = question.length + options.map((o) => o.text.length).reduce((a, b) => a + b, 0);
  if (hard.some((k) => text.includes(k)) || len > 300) return "Hard";
  if (med.some((k) => text.includes(k)) || len > 170) return "Medium";
  return "Easy";
}

function extractExplicitDifficulty(question) {
  const m = question.match(/\[(easy|medium|hard)\]\s*$/i);
  if (!m) return { question, explicit: null };
  return { question: question.replace(/\[(easy|medium|hard)\]\s*$/i, "").trim(), explicit: capitalize(m[1]) };
}

function formatTime(total) {
  const safe = Math.max(0, Number(total || 0));
  return `${Math.floor(safe / 60).toString().padStart(2, "0")}:${Math.floor(safe % 60).toString().padStart(2, "0")}`;
}

function capitalize(w) { return w.slice(0, 1).toUpperCase() + w.slice(1).toLowerCase(); }
function csvSafe(t) { return `"${String(t || "").replace(/"/g, '""')}"`; }
function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

export default App;
