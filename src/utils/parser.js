// ─── Regexes ────────────────────────────────────────────────────────────────

// Matches: A) text  |  A. text  |  (A) text  |  a) text
const OPTION_RE =
  /^\s*[-*•]?\s*(?:✅\s*)?\(?([A-D])[.)]\)?\s+(.+?)(?:\s*✅)?\s*$/i;

// Matches: 1. question  |  1) question
const QUESTION_RE = /^\s*(?:#{1,6}\s*)?(\d+)[.)]\s+(.+)$/;

// Matches: Q1. question  |  Question 1: question  |  1: question
const QUESTION_FALLBACK_RE =
  /^\s*(?:Q(?:uestion)?\s*)?(\d+)\s*[:.)\-]\s+(.+)$/i;

// Matches standalone header lines like: "QUESTION 1"  "Q5"  "Question 10"
// (number only on the line – question text follows on the next line)
const QUESTION_HEADER_RE = /^\s*Q(?:uestion)?\s*(\d+)\s*[.:]?\s*$/i;

// ─── Public API ─────────────────────────────────────────────────────────────

export function shuffle(array) {
  const copy = [...array];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/**
 * Master entry point.
 * Tries numbered parsing first, falls back to loose-block parsing.
 * Also extracts correct-answer markers from <details> blocks.
 */
export function parseQuestions(raw) {
  const normalized = normalize(raw);

  // Pre-extract answers from <details> blocks (format: **A) text** or **A. text**)
  const detailsAnswers = extractDetailsAnswers(normalized);

  const parsed = parseNumbered(normalized);

  if (parsed.length > 0) {
    return mergeDetailAnswers(parsed, detailsAnswers);
  }

  const loose = parseLooseBlocks(normalized);
  return mergeDetailAnswers(loose, detailsAnswers);
}

// ─── Strategy 1: Line-by-line numbered parser ────────────────────────────────

function parseNumbered(raw) {
  const lines = raw.split("\n");
  const questions = [];
  let current = null;
  // When we see "QUESTION 5" header, stage the id here
  // and wait for the next non-blank, non-option line as question text
  let stagedId = null;

  const pushCurrent = () => {
    if (!current) return;
    if (current.options.length >= 2) {
      questions.push({
        id: current.id,
        question: current.question.trim(),
        options: current.options,
        correct: current.correct || null,
      });
    }
    current = null;
  };

  for (const line of lines) {
    const clean = line.trim();

    // Skip blank lines, horizontal rules, HTML tags, bold markers, detail tags
    if (
      !clean ||
      clean === "---" ||
      /^<\/?details/i.test(clean) ||
      /^<summary/i.test(clean) ||
      /^<\/summary/i.test(clean) ||
      /^\*\*[A-D][.)]/i.test(clean) ||        // bold answer line inside details
      /^Explanation:/i.test(clean) ||
      /^📊/.test(clean) ||
      /^Q#\s*\t/.test(clean) ||
      /^\d+\s*\t/.test(clean)
    ) {
      continue;
    }

    // ── Standalone question header: "QUESTION 5" / "Q5" ──────────────────
    const headerMatch = clean.match(QUESTION_HEADER_RE);
    if (headerMatch) {
      pushCurrent();
      stagedId = Number(headerMatch[1]);
      current = null;
      continue;
    }

    // ── Numbered question: "1. text" / "1) text" / "Q1. text" ───────────
    const qMatch =
      clean.match(QUESTION_RE) || clean.match(QUESTION_FALLBACK_RE);
    if (qMatch) {
      pushCurrent();
      stagedId = null;
      current = {
        id: Number(qMatch[1]),
        question: qMatch[2],
        options: [],
        correct: null,
      };
      continue;
    }

    // ── Not an option → could be question text after a "QUESTION N" header ─
    const optionMatch = clean.match(OPTION_RE);

    if (!optionMatch) {
      if (stagedId !== null && !current) {
        // First real text line after "QUESTION N" header → this is the question
        current = {
          id: stagedId,
          question: clean,
          options: [],
          correct: null,
        };
        stagedId = null;
        continue;
      }
      if (current && current.options.length === 0) {
        // Appending continuation text to a question before any options arrived
        current.question += " " + clean;
        continue;
      }
      // Otherwise ignore (explanations, answer keys, etc.)
      continue;
    }

    // ── It IS an option ──────────────────────────────────────────────────
    if (!current) continue;

    const label = optionMatch[1].toUpperCase();
    const text = optionMatch[2].trim();
    current.options.push({ label, text });

    const hasPrefixTick = /^\s*[-*•]?\s*✅\s*\(?[A-D][.)]/i.test(clean);
    const hasSuffixTick = /✅\s*$/.test(clean);
    if (hasPrefixTick || hasSuffixTick) {
      current.correct = label;
    }
  }

  pushCurrent();
  return questions;
}

// ─── Strategy 2: Loose block parser (fallback) ───────────────────────────────

function parseLooseBlocks(raw) {
  const blocks = raw
    .split(/\n\s*\n/g)
    .map((b) => b.trim())
    .filter(Boolean);

  const out = [];
  let pendingQuestion = null; // question text from a block that had no options

  for (let i = 0; i < blocks.length; i++) {
    const lines = blocks[i]
      .split("\n")
      .map((l) => l.trim())
      .filter(
        (l) =>
          l &&
          !/^<\/?details/i.test(l) &&
          !/^<summary/i.test(l) &&
          !/^Explanation:/i.test(l) &&
          !/^\*\*[A-D][.)]/i.test(l)
      );

    if (lines.length === 0) continue;

    // Separate option lines from non-option lines in this block
    const optionLines = [];
    const nonOptionLines = [];
    let correct = null;

    for (const line of lines) {
      const m = line.match(OPTION_RE);
      if (m) {
        optionLines.push({ label: m[1].toUpperCase(), text: m[2].trim() });
        if (/✅/.test(line)) correct = m[1].toUpperCase();
      } else {
        nonOptionLines.push(line);
      }
    }

    // ── Block has options AND question text ──────────────────────────────
    if (optionLines.length >= 2 && nonOptionLines.length > 0) {
      const questionText = nonOptionLines
        .join(" ")
        .replace(/^Q(?:uestion)?\s*\d+[.:]?\s*/i, "")
        .replace(/^#{1,6}\s*/, "")
        .replace(/^\d+[.)]\s*/, "")
        .trim();
      if (questionText) {
        out.push({
          id: out.length + 1,
          question: questionText,
          options: optionLines,
          correct,
        });
        pendingQuestion = null;
      }
      continue;
    }

    // ── Block has ONLY options → pair with previous pending question ─────
    if (optionLines.length >= 2 && nonOptionLines.length === 0) {
      if (pendingQuestion) {
        out.push({
          id: out.length + 1,
          question: pendingQuestion,
          options: optionLines,
          correct,
        });
        pendingQuestion = null;
      }
      // else: orphan options block, skip
      continue;
    }

    // ── Block has NO options → it's a question text block ───────────────
    if (optionLines.length === 0 && nonOptionLines.length > 0) {
      const candidate = nonOptionLines
        .join(" ")
        .replace(/^Q(?:uestion)?\s*\d+[.:]?\s*/i, "")
        .replace(/^#{1,6}\s*/, "")
        .replace(/^\d+[.)]\s*/, "")
        .trim();

      // Only treat as pending question if it looks like a real question
      // (not just a heading like "Answer Key" or a single word)
      if (candidate.length > 10 && !isAnswerKeyBlock(candidate)) {
        pendingQuestion = candidate;
      }
      continue;
    }
  }

  return out;
}

// ─── Extract correct answers from <details> blocks ───────────────────────────

/**
 * Scan the raw text for patterns like:
 *   <details> <summary>✅ Answer</summary> **C) Repository Pattern**
 * and return an ordered array of answer labels.
 */
function extractDetailsAnswers(raw) {
  const answers = [];
  // Match bold answer inside details block: **A) text** or **A. text**
  const detailsRE =
    /\*\*\s*([A-D])[.)]\s*.+?\*\*/gi;
  let m;
  while ((m = detailsRE.exec(raw)) !== null) {
    answers.push(m[1].toUpperCase());
  }
  return answers;
}

/**
 * Apply extracted <details> answers (in document order) to parsed questions
 * that currently have no `correct` value.
 */
function mergeDetailAnswers(questions, detailsAnswers) {
  if (detailsAnswers.length === 0) return questions;

  return questions.map((q, i) => {
    if (q.correct) return q; // Already has answer from ✅ marker
    if (i < detailsAnswers.length) {
      return { ...q, correct: detailsAnswers[i] };
    }
    return q;
  });
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isAnswerKeyBlock(text) {
  return (
    /answer\s*key/i.test(text) ||
    /quick\s*reference/i.test(text) ||
    /^topic$/i.test(text.trim())
  );
}

export function parseSolutions(raw, questionCount = 0) {
  const normalized = normalize(raw);
  const map = new Map();

  const extracted = parseQuestions(normalized);
  if (extracted.length > 0) {
    extracted.forEach((q, i) => {
      if (q.correct) map.set(i + 1, q.correct);
    });
  }

  normalized.split("\n").forEach((line) => {
    const trimmed = line.trim();
    const m = trimmed.match(/^(\d+)\s*[:.)\\-]\s*([A-D])\b/i);
    if (m) map.set(Number(m[1]), m[2].toUpperCase());
  });

  normalized.split(/[;,]+/).forEach((chunk) => {
    const m = chunk.trim().match(/^(\d+)\s*[-:=]\s*([A-D])$/i);
    if (m) map.set(Number(m[1]), m[2].toUpperCase());
  });

  const arr = [];
  const size = questionCount || Math.max(0, ...map.keys());
  for (let i = 1; i <= size; i += 1) {
    arr.push(map.get(i) || null);
  }
  return arr;
}

function normalize(text) {
  return (text || "")
    .replace(/\r\n/g, "\n")
    .replace(/\uFEFF/g, "")
    .replace(/\t/g, "    ");
}
