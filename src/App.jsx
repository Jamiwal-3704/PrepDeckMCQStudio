import { useEffect, useMemo, useState } from "react";
import { supabase } from "./lib/supabase";
import { parseQuestions, parseSolutions, shuffle } from "./utils/parser";
import {
  PROVIDERS, PROVIDER_ORDER,
  extractMcqsWithAI, generateQuestionsViaAI, looksLikeMcqs,
} from "./utils/paragraphParser";
import { saveQuizSession, loadQuizSession, clearQuizSession } from "./utils/quizStorage";
import { useAuth, GUEST_Q_LIMIT, AUTH_Q_LIMIT, COOLDOWN_MS, GUEST_GEN_LIMIT } from "./context/AuthContext";
import Navbar         from "./components/Navbar";
import AboutPage      from "./pages/AboutPage";
import { LoginPage, RegisterPage } from "./pages/AuthPages";

// ── Defaults ──────────────────────────────────────────────────────────────────
const DEFAULT_SETTINGS = {
  timerEnabled: true, timerMinutes: 20,
  negativeMarkingEnabled: false, negativeMarks: 0.25,
  autoTagDifficulty: true, questionCount: 5,
};

function loadProviderKeys() {
  try { return JSON.parse(localStorage.getItem("prep_provider_keys") || "{}"); }
  catch { return {}; }
}

// ── App ───────────────────────────────────────────────────────────────────────
export default function App() {
  const { user, isLoggedIn, loading: authLoading, checkGuestLimit, recordGuestGeneration, guestUsage } = useAuth();

  // Page routing
  const [page, setPage] = useState("home");
  function navigate(p) { setPage(p); window.scrollTo(0, 0); }

  // ── Quiz state ──────────────────────────────────────────────────────────────
  const [questionText, setQuestionText] = useState("");
  const [solutionText, setSolutionText] = useState("");
  const [questions,    setQuestions]    = useState([]);
  const [error,        setError]        = useState("");
  const [notice,       setNotice]       = useState("");
  const [quizMode,     setQuizMode]     = useState("setup"); // setup | quiz | result
  const [quiz,         setQuiz]         = useState([]);
  const [index,        setIndex]        = useState(0);
  const [answers,      setAnswers]      = useState({});
  const [submitted,    setSubmitted]    = useState(false);
  const [settings,     setSettings]     = useState(DEFAULT_SETTINGS);
  const [timeLeft,     setTimeLeft]     = useState(0);
  const [inputMode,    setInputMode]    = useState("mcq");
  const [processing,   setProcessing]   = useState(false);

  // Provider state
  const [selectedProviderId, setSelectedProviderId] = useState(
    () => localStorage.getItem("prep_selected_provider") || "groq"
  );
  const [providerKeys,      setProviderKeys]      = useState(loadProviderKeys);
  const [showProviderPanel, setShowProviderPanel] = useState(false);

  const provider  = PROVIDERS[selectedProviderId] || PROVIDERS.groq;
  const apiKey    = providerKeys[selectedProviderId] || "";
  const hasApiKey = Boolean(apiKey.trim());

  const maxQ = isLoggedIn ? AUTH_Q_LIMIT : GUEST_Q_LIMIT;

  // ── Restore quiz session on mount ───────────────────────────────────────────
  useEffect(() => {
    const saved = loadQuizSession();
    if (!saved) return;
    setQuestions(saved.questions || []);
    setQuiz(saved.quiz || []);
    setIndex(saved.index || 0);
    setAnswers(saved.answers || {});
    setSubmitted(saved.submitted || false);
    setSettings(saved.settings || DEFAULT_SETTINGS);
    setInputMode(saved.inputMode || "mcq");
    setNotice(saved.notice || "");
    setTimeLeft(saved.timeLeft || 0);
    if (saved.quizMode === "quiz" || saved.quizMode === "result") {
      setQuizMode(saved.quizMode);
      setPage("home"); // keep page = home, quizMode drives the view
    }
  }, []);

  // ── Persist session on meaningful changes (NOT every timer tick) ───────────
  useEffect(() => {
    if (quizMode === "setup") return;
    saveQuizSession({ quizMode, questions, quiz, index, answers, submitted, settings, inputMode, notice });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quizMode, quiz, index, answers, submitted]);

  // ── Timer (interval created once per quiz, not every tick) ─────────────────
  useEffect(() => {
    if (quizMode !== "quiz" || submitted || !settings.timerEnabled) return;
    const id = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) { clearInterval(id); submitQuiz(); return 0; }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quizMode, submitted, settings.timerEnabled]);

  // ── Save quiz result to Supabase when submitted (logged-in users only) ──────
  useEffect(() => {
    if (!submitted || !isLoggedIn || !user || quiz.length === 0) return;
    const correct = quiz.filter((q) => q.correct && answers[q.runtimeId] === q.correct).length;
    const known   = quiz.filter((q) => q.correct).length;
    const wrong   = quiz.filter((q) => q.correct && answers[q.runtimeId] !== q.correct).length;
    const score   = known ? Math.round((correct / known) * 100) : 0;
    const negMark = settings.negativeMarkingEnabled ? Number(settings.negativeMarks) : 0;
    const marks   = Number((correct - wrong * negMark).toFixed(2));
    supabase.from("quiz_sessions").insert({
      user_id:         user.id,
      input_mode:      inputMode,
      provider:        hasApiKey ? selectedProviderId : "regex",
      total_questions: quiz.length,
      correct,
      wrong,
      score_percent:   score,
      total_marks:     marks,
      time_taken_secs: settings.timerEnabled ? settings.timerMinutes * 60 - timeLeft : null,
      settings,
    }).then(({ error }) => {
      if (error) console.warn("Supabase save failed:", error.message);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submitted]);

  // ── Analysis ────────────────────────────────────────────────────────────────
  const analysis = useMemo(() => {
    if (!submitted || quiz.length === 0) return null;
    const report = quiz.map((q, i) => {
      const selected  = answers[q.runtimeId] || null;
      const correct   = q.correct || null;
      const isCorrect = correct ? selected === correct : null;
      const marks     = isCorrect === null ? 0 : isCorrect ? 1
        : settings.negativeMarkingEnabled ? -Number(settings.negativeMarks) : 0;
      return { no: i + 1, question: q.question, difficulty: q.difficulty, selected, correct, isCorrect, options: q.options, marks };
    });
    const known = report.filter((r) => r.isCorrect !== null);
    const correctCount = known.filter((r) => r.isCorrect).length;
    const wrong = known.filter((r) => !r.isCorrect);
    const totalMarks = Number(report.reduce((s, r) => s + r.marks, 0).toFixed(2));
    const byDifficulty = {
      easy:   report.filter((r) => r.difficulty === "Easy").length,
      medium: report.filter((r) => r.difficulty === "Medium").length,
      hard:   report.filter((r) => r.difficulty === "Hard").length,
    };
    return {
      report, knownCount: known.length, unknownCount: report.length - known.length,
      correctCount, wrongCount: wrong.length,
      score: known.length ? Math.round((correctCount / known.length) * 100) : 0,
      totalMarks, byDifficulty, wrong,
    };
  }, [submitted, quiz, answers, settings.negativeMarkingEnabled, settings.negativeMarks]);

  // ── File reading ─────────────────────────────────────────────────────────────
  async function readAnyFile(file) {
    if (file.name.toLowerCase().endsWith(".docx")) {
      const mammoth = await import("mammoth/mammoth.browser");
      const res = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
      return res.value;
    }
    return file.text();
  }

  // ── Launch quiz ──────────────────────────────────────────────────────────────
  function launchQuiz(parsed, noticeMsg = "") {
    let merged = parsed.map((q) => ({ ...q }));
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
    const runtime = shuffle(merged.map((q, i) => ({
      ...q, runtimeId: `${q.id || i + 1}-${Math.random().toString(36).slice(2, 8)}`,
    })));
    setQuestions(merged);
    setQuiz(runtime);
    setQuizMode("quiz");
    setIndex(0);
    setAnswers({});
    setSubmitted(false);
    setTimeLeft(settings.timerEnabled ? Math.max(1, Number(settings.timerMinutes || 1)) * 60 : 0);
    setError("");
    setNotice(noticeMsg);
  }

  // ── Guest limit check ────────────────────────────────────────────────────────
  function enforceGuestLimit() {
    if (isLoggedIn) return true;
    const { allowed, timeLeftMs } = checkGuestLimit();
    if (!allowed) {
      const hrs  = Math.floor(timeLeftMs / 3600000);
      const mins = Math.floor((timeLeftMs % 3600000) / 60000);
      setError(
        `⛔ You've used both free sessions. Next reset in ${hrs}h ${mins}m. ` +
        `Create a free account for unlimited access.`
      );
      navigate("register");
      return false;
    }
    return true;
  }

  // ── Build quiz ───────────────────────────────────────────────────────────────
  async function handleBuildQuiz() {
    setError("");
    if (!questionText.trim()) { setError("Please paste or upload some content first."); return; }

    if (inputMode === "paragraph") {
      if (hasApiKey) {
        if (!enforceGuestLimit()) return;
        if (looksLikeMcqs(questionText)) {
          await runAI("extract", `🔍 AI extracted questions from your content!`);
        } else {
          await runAI("generate", `🤖 ${provider.name} generated ${settings.questionCount} questions!`);
        }
      } else {
        const parsed = parseQuestions(questionText);
        if (parsed.length > 0) { launchQuiz(parsed, `✅ Found ${parsed.length} embedded MCQ(s)!`); }
        else { setShowProviderPanel(true); setError("Add an AI API key to generate questions from a paragraph."); }
      }
      return;
    }

    if (hasApiKey) {
      if (!enforceGuestLimit()) return;
      await runAI("extract", `🤖 ${provider.name} extracted and structured your questions!`);
    } else {
      const parsed = parseQuestions(questionText);
      if (!parsed.length) { setShowProviderPanel(true); setError("Could not parse. Add an AI key for any-format support."); return; }
      launchQuiz(parsed);
    }
  }

  async function runAI(task, successNotice) {
    setProcessing(true);
    setError("");
    try {
      const count  = Math.min(Number(settings.questionCount) || 5, maxQ);
      const result = task === "extract"
        ? await extractMcqsWithAI(questionText, provider, apiKey)
        : await generateQuestionsViaAI(questionText, provider, apiKey, count);
      if (!isLoggedIn) recordGuestGeneration();
      launchQuiz(result, successNotice);
    } catch (err) {
      setError(`${provider.name} error: ${err.message}`);
    } finally {
      setProcessing(false);
    }
  }

  // ── Quiz actions ─────────────────────────────────────────────────────────────
  function retest() {
    const runtime = shuffle(questions.map((q, i) => ({
      ...q, runtimeId: `${q.id || i + 1}-${Math.random().toString(36).slice(2, 8)}`,
    })));
    setQuiz(runtime); setIndex(0); setAnswers({}); setSubmitted(false);
    setTimeLeft(settings.timerEnabled ? Math.max(1, Number(settings.timerMinutes || 1)) * 60 : 0);
    setNotice(""); setQuizMode("quiz");
  }

  function loadNew() {
    clearQuizSession();
    setQuizMode("setup");
    setQuestionText(""); setSolutionText("");
    setQuestions([]); setQuiz([]);
    setIndex(0); setAnswers({}); setSubmitted(false);
    setError(""); setNotice("");
  }

  function selectAnswer(label) {
    if (!quiz[index] || submitted) return;
    setAnswers((prev) => ({ ...prev, [quiz[index].runtimeId]: label }));
  }
  function gotoNext() { setIndex((i) => Math.min(i + 1, quiz.length - 1)); }
  function gotoPrev() { setIndex((i) => Math.max(i - 1, 0)); }
  function submitQuiz() { setSubmitted(true); setQuizMode("result"); }

  function updateSetting(key, val) { setSettings((p) => ({ ...p, [key]: val })); }
  function saveProviderKey(id, key) {
    const next = { ...providerKeys, [id]: key };
    setProviderKeys(next);
    localStorage.setItem("prep_provider_keys", JSON.stringify(next));
  }
  function selectProvider(id) {
    setSelectedProviderId(id);
    localStorage.setItem("prep_selected_provider", id);
  }

  // ── Exports ──────────────────────────────────────────────────────────────────
  function exportCsv() {
    if (!analysis) return;
    const lines = [
      ["No","Question","Difficulty","Selected","Correct","Status","Marks"].join(","),
      ...analysis.report.map((r) =>
        [r.no, csvSafe(r.question), r.difficulty, r.selected||"Not answered",
         r.correct||"No key", r.isCorrect===null?"No Key":r.isCorrect?"Correct":"Wrong", r.marks].join(",")
      ),
    ];
    downloadBlob(new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" }), `mcq-result-${Date.now()}.csv`);
  }

  async function exportResultPdf() {
    if (!analysis) return;
    const [{ jsPDF }, { default: autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
    const doc = new jsPDF({ orientation: "landscape" });
    doc.setFontSize(16); doc.text("MCQ Result Analysis", 14, 16);
    doc.setFontSize(10);
    doc.text(`Score: ${analysis.score}% | Correct: ${analysis.correctCount} | Wrong: ${analysis.wrongCount} | Marks: ${analysis.totalMarks}`, 14, 24);
    autoTable(doc, {
      startY: 30,
      head: [["No","Question","Diff","Selected","Correct","Status","Marks"]],
      body: analysis.report.map((r) => [r.no, r.question, r.difficulty, r.selected||"Not answered", r.correct||"No key",
        r.isCorrect===null?"No Key":r.isCorrect?"Correct":"Wrong", r.marks]),
      styles: { fontSize: 8, overflow: "linebreak" }, columnStyles: { 1: { cellWidth: 120 } },
    });
    doc.save(`mcq-result-${Date.now()}.pdf`);
  }

  // NEW: Full Q&A Sheet PDF
  async function exportQAPdf() {
    const [{ jsPDF }, { default: autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
    const doc = new jsPDF();
    doc.setFontSize(18); doc.setFont("helvetica", "bold");
    doc.text("Question & Answer Sheet", 14, 18);
    doc.setFontSize(10); doc.setFont("helvetica", "normal");
    doc.text(`Total Questions: ${questions.length}  |  Generated: ${new Date().toLocaleDateString()}`, 14, 26);

    let y = 34;
    questions.forEach((q, qi) => {
      // Check if need new page
      if (y > 250) { doc.addPage(); y = 16; }
      doc.setFont("helvetica", "bold"); doc.setFontSize(11);
      const qLines = doc.splitTextToSize(`Q${qi + 1}. ${q.question}`, 180);
      doc.text(qLines, 14, y);
      y += qLines.length * 6 + 2;
      doc.setFont("helvetica", "normal"); doc.setFontSize(10);
      (q.options || []).forEach((opt) => {
        if (y > 272) { doc.addPage(); y = 16; }
        const isCorrect = opt.label === q.correct;
        const prefix = isCorrect ? `✓ ${opt.label})` : `   ${opt.label})`;
        if (isCorrect) { doc.setFont("helvetica", "bold"); doc.setTextColor(0, 120, 60); }
        const oLines = doc.splitTextToSize(`${prefix} ${opt.text}`, 175);
        doc.text(oLines, 16, y);
        y += oLines.length * 5.5;
        doc.setFont("helvetica", "normal"); doc.setTextColor(0, 0, 0);
      });
      y += 6;
    });
    doc.save(`qa-sheet-${Date.now()}.pdf`);
  }

  const current      = quiz[index] || null;
  const answeredCount = Object.keys(answers).length;
  const ctaLabel = (() => {
    if (processing) return null;
    if (inputMode === "paragraph") {
      if (!hasApiKey) return "Extract / Start Quiz (regex)";
      if (looksLikeMcqs(questionText)) return `Extract MCQs with ${provider.name}`;
      return `Generate ${Math.min(settings.questionCount, maxQ)} Questions with ${provider.name}`;
    }
    return hasApiKey ? `Extract with ${provider.name} & Start Quiz` : "Generate Quiz (regex fallback)";
  })();

  // ── Page routing ─────────────────────────────────────────────────────────────
  const showAbout    = page === "about";
  const showLogin    = page === "login";
  const showRegister = page === "register";
  const showApp      = !showAbout && !showLogin && !showRegister;

  return (
    <>
      <Navbar page={page} navigate={navigate} />

      {/* Block rendering until Supabase resolves the session (instant, from storage) */}
      {authLoading ? (
        <div className="auth-loading-bar" aria-label="Loading session" />
      ) : (
        <>


      {showAbout    && <AboutPage    navigate={navigate} />}
      {showLogin    && <LoginPage    navigate={navigate} />}
      {showRegister && <RegisterPage navigate={navigate} />}

      {showApp && (
        <div className="page">
          <div className="bg-grid" aria-hidden="true" />

          {quizMode === "setup" && (
            <>
              <header className="hero">
                <h1>MCQ Practice Studio</h1>
                <p>Paste questions in any format or a paragraph — AI extracts or generates questions and shuffles them for practice.</p>
              </header>

              {error  && <div className="error-box">{error}</div>}
              {notice && <div className="notice-box">{notice}</div>}

              <section className="card setup-card">
                {/* Mode toggle */}
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

                {/* Guest limit banner — reads guestUsage state, never calls checkGuestLimit() in render */}
                {!isLoggedIn && (
                  <div className="guest-limit-bar">
                    <span>🆓 Guest: {guestUsage?.count ?? 0}/{GUEST_GEN_LIMIT} free sessions used</span>
                    <button className="link-btn" onClick={() => navigate("register")}>Register for unlimited →</button>
                  </div>
                )}

                {/* Provider panel */}
                <div className="provider-section">
                  <button className="provider-toggle-btn" onClick={() => setShowProviderPanel((v) => !v)} type="button">
                    <span className="provider-toggle-left">
                      <span className="provider-selected-icon" style={{ background: provider.color }}>{provider.icon}</span>
                      <span>
                        <span className="provider-selected-name">{provider.name}</span>
                        <span className="provider-selected-model">{provider.modelLabel}</span>
                      </span>
                    </span>
                    <span className="provider-toggle-right">
                      <span className={`key-status ${hasApiKey ? "ok" : "missing"}`}>{hasApiKey ? "✓ Key saved" : "No key"}</span>
                      <span className="chevron">{showProviderPanel ? "▲" : "▼"}</span>
                    </span>
                  </button>
                  {showProviderPanel && (
                    <div className="provider-panel">
                      <p className="provider-panel-hint">Select an AI provider, then enter your API key.</p>
                      <div className="provider-cards">
                        {PROVIDER_ORDER.map((pid) => {
                          const p = PROVIDERS[pid];
                          const sel = pid === selectedProviderId;
                          const hasKey = Boolean((providerKeys[pid] || "").trim());
                          return (
                            <button key={pid} className={`provider-card ${sel ? "selected" : ""}`}
                              style={{ "--p-color": p.color }} onClick={() => selectProvider(pid)} type="button">
                              <span className="pc-icon" style={{ background: p.color }}>{p.icon}</span>
                              <span className="pc-name">{p.name}</span>
                              <span className="pc-tagline">{p.tagline}</span>
                              <span className="pc-model">{p.modelLabel}</span>
                              {hasKey && <span className="pc-key-dot" />}
                            </button>
                          );
                        })}
                      </div>
                      <div className="provider-key-row">
                        <label className="provider-key-label">{provider.name} API Key</label>
                        <input type="password" className="api-key-input" placeholder={provider.keyPlaceholder}
                          value={providerKeys[selectedProviderId] || ""}
                          onChange={(e) => saveProviderKey(selectedProviderId, e.target.value)} />
                        <p className="api-key-hint">
                          Free key at <a href={provider.keyLink} target="_blank" rel="noreferrer">{provider.keyLinkLabel}</a>.
                          Stored only in your browser.
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Textarea */}
                <h2 style={{ marginTop: "14px" }}>{inputMode === "mcq" ? "Paste Questions" : "Paste Paragraph / Passage"}</h2>
                <p className="hint">
                  {inputMode === "mcq"
                    ? "Works with any format — numbered, QUESTION N headers, markdown, <details> blocks, etc."
                    : "Paste any passage. Embedded MCQs are extracted; plain paragraphs generate new questions via AI."}
                </p>
                <textarea className="big-input" value={questionText}
                  onChange={(e) => { setQuestionText(e.target.value); setError(""); }}
                  placeholder={inputMode === "mcq" ? "Paste MCQs in any format here…" : "Paste your passage or paragraph here…"} />
                <label className="file-btn">
                  {inputMode === "mcq" ? "Upload Questions File" : "Upload Passage File"}
                  <input type="file" accept=".txt,.md,.markdown,.readme,.docx"
                    onChange={async (e) => { const f = e.target.files?.[0]; if (f) try { setQuestionText(await readAnyFile(f)); } catch { setError("Could not read file."); } }} />
                </label>

                {inputMode === "mcq" && (
                  <>
                    <h2>Optional Solutions File</h2>
                    <p className="hint">Skip if answers are embedded or AI will extract them.</p>
                    <textarea className="small-input" value={solutionText} onChange={(e) => setSolutionText(e.target.value)}
                      placeholder="Optional: 1:C, 2:B, 3:A…" />
                    <label className="file-btn alt">
                      Upload Solution File
                      <input type="file" accept=".txt,.md,.docx"
                        onChange={async (e) => { const f = e.target.files?.[0]; if (f) try { setSolutionText(await readAnyFile(f)); } catch { setError("Could not read file."); } }} />
                    </label>
                  </>
                )}

                {/* Settings */}
                <h2>Settings</h2>
                <div className="settings-grid">
                  <label className="toggle-row">
                    <input type="checkbox" checked={settings.timerEnabled} onChange={(e) => updateSetting("timerEnabled", e.target.checked)} />
                    Enable Quiz Timer (auto-submit)
                  </label>
                  <label className="inline-field">
                    Time (minutes)
                    <input type="number" min="1" value={settings.timerMinutes}
                      onChange={(e) => updateSetting("timerMinutes", Number(e.target.value || 1))} disabled={!settings.timerEnabled} />
                  </label>
                  <label className="toggle-row">
                    <input type="checkbox" checked={settings.negativeMarkingEnabled} onChange={(e) => updateSetting("negativeMarkingEnabled", e.target.checked)} />
                    Enable Negative Marking
                  </label>
                  <label className="inline-field">
                    Negative marks per wrong answer
                    <input type="number" min="0" step="0.25" value={settings.negativeMarks}
                      onChange={(e) => updateSetting("negativeMarks", Number(e.target.value || 0))} disabled={!settings.negativeMarkingEnabled} />
                  </label>
                  <label className="toggle-row">
                    <input type="checkbox" checked={settings.autoTagDifficulty} onChange={(e) => updateSetting("autoTagDifficulty", e.target.checked)} />
                    Auto-tag difficulty (Easy / Medium / Hard)
                  </label>
                  {inputMode === "paragraph" && !looksLikeMcqs(questionText) && (
                    <label className="inline-field">
                      Questions to generate (max {maxQ} for {isLoggedIn ? "your account" : "guests"})
                      <div className="count-slider-row">
                        <input type="range" min="3" max={maxQ} step="1" value={Math.min(settings.questionCount, maxQ)}
                          onChange={(e) => updateSetting("questionCount", Number(e.target.value))} />
                        <span className="count-pill">{Math.min(settings.questionCount, maxQ)}</span>
                      </div>
                    </label>
                  )}
                </div>

                <div className="paragraph-cta-row">
                  <button className="primary" onClick={handleBuildQuiz} disabled={processing}>
                    {processing ? <><span className="spinner" /> Processing with {provider.name}…</> : ctaLabel}
                  </button>
                  {processing && <span className="gen-hint">AI is reading your content…</span>}
                </div>
              </section>
            </>
          )}

          {/* ── QUIZ ── */}
          {quizMode === "quiz" && current && (
            <>
              {error  && <div className="error-box">{error}</div>}
              {notice && <div className="notice-box">{notice}</div>}
              <section className="card quiz-card" key={current.runtimeId}>
                <div className="quiz-top">
                  <span>Question {index + 1}/{quiz.length}</span>
                  <span>Answered: {answeredCount}/{quiz.length}</span>
                  {settings.timerEnabled && <span className="timer-chip">⏱ {formatTime(timeLeft)}</span>}
                </div>
                <div className="progress"><div style={{ width: `${((index + 1) / quiz.length) * 100}%` }} /></div>
                <h2 className="q-title">{current.question}</h2>
                <div className={`tag ${current.difficulty?.toLowerCase() || "medium"}`}>{current.difficulty || "Medium"}</div>
                <div className="options">
                  {current.options.map((opt) => (
                    <button key={opt.label} className={`option ${answers[current.runtimeId] === opt.label ? "selected" : ""}`}
                      onClick={() => selectAnswer(opt.label)}>
                      <span className="label">{opt.label}</span>
                      <span>{opt.text}</span>
                    </button>
                  ))}
                </div>
                <div className="actions">
                  <button className="ghost" onClick={gotoPrev} disabled={index === 0}>Previous</button>
                  {index < quiz.length - 1
                    ? <button className="primary" onClick={gotoNext}>Next</button>
                    : <button className="primary" onClick={submitQuiz}>Submit Quiz</button>}
                </div>
              </section>
            </>
          )}

          {/* ── RESULT ── */}
          {quizMode === "result" && analysis && (
            <>
              {notice && <div className="notice-box">{notice}</div>}
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
                  <div className="bar wrong"   style={{ width: `${100 - analysis.score}%` }} />
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

                {/* Q&A Sheet section */}
                <div className="qa-sheet-box">
                  <div className="qa-sheet-info">
                    <span className="qa-sheet-icon">📋</span>
                    <div>
                      <strong>Question &amp; Answer Sheet</strong>
                      <p>Download all {questions.length} questions with options and highlighted correct answers as a printable PDF.</p>
                    </div>
                  </div>
                  <button className="primary qa-pdf-btn" onClick={exportQAPdf}>
                    ⬇ Download Q&amp;A Sheet PDF
                  </button>
                </div>

                <div className="actions">
                  <button className="ghost" onClick={exportCsv}>Export CSV</button>
                  <button className="ghost" onClick={exportResultPdf}>Export Result PDF</button>
                  <button className="ghost" onClick={loadNew}>Load New Question Set</button>
                  <button className="primary" onClick={retest}>Retest in Random Order</button>
                </div>
              </section>
            </>
          )}
        </div>
      )}

      </>
      )}
    </>
  );
}



// ── Pure helpers ──────────────────────────────────────────────────────────────
function inferDifficulty(question, options) {
  const text = `${question} ${options.map((o) => o.text).join(" ")}`.toLowerCase();
  const hard = ["architecture","repository pattern","dependency injection","fluent api","middleware","negotiation"];
  const med  = ["api","status code","ef core","controller","dto","cors"];
  const len  = question.length + options.map((o) => o.text.length).reduce((a, b) => a + b, 0);
  if (hard.some((k) => text.includes(k)) || len > 300) return "Hard";
  if (med.some((k)  => text.includes(k)) || len > 170) return "Medium";
  return "Easy";
}

function extractExplicitDifficulty(question) {
  const m = question.match(/\[(easy|medium|hard)\]\s*$/i);
  if (!m) return { question, explicit: null };
  return { question: question.replace(/\[(easy|medium|hard)\]\s*$/i, "").trim(), explicit: capitalize(m[1]) };
}

function formatTime(total) {
  const s = Math.max(0, Number(total || 0));
  return `${Math.floor(s / 60).toString().padStart(2, "0")}:${Math.floor(s % 60).toString().padStart(2, "0")}`;
}

function capitalize(w)  { return w.slice(0, 1).toUpperCase() + w.slice(1).toLowerCase(); }
function csvSafe(t)     { return `"${String(t || "").replace(/"/g, '""')}"`; }
function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a   = Object.assign(document.createElement("a"), { href: url, download: name });
  document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}
