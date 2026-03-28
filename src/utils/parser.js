const OPTION_RE = /^\s*[-*]?\s*(?:✅\s*)?([A-D])\)\s*(.+?)(?:\s*✅)?\s*$/i;

const QUESTION_RE = /^\s*(?:#{1,6}\s*)?(\d+)\.\s+(.+)$/;
const QUESTION_FALLBACK_RE =
  /^\s*(?:Q(?:uestion)?\s*)?(\d+)\s*[:)\-.]\s+(.+)$/i;

export function shuffle(array) {
  const copy = [...array];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function parseQuestions(raw) {
  const lines = normalize(raw).split("\n");
  const questions = [];
  let current = null;

  const pushCurrent = () => {
    if (!current) {
      return;
    }

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

    if (!clean || clean === "---") {
      continue;
    }

    const qMatch =
      clean.match(QUESTION_RE) || clean.match(QUESTION_FALLBACK_RE);
    if (qMatch) {
      pushCurrent();
      current = {
        id: Number(qMatch[1]),
        question: qMatch[2],
        options: [],
        correct: null,
      };
      continue;
    }

    if (!current) {
      continue;
    }

    const optionMatch = clean.match(OPTION_RE);
    if (optionMatch) {
      const label = optionMatch[1].toUpperCase();
      const text = optionMatch[2].trim();
      current.options.push({ label, text });

      const hasPrefixTick = /^\s*[-*]?\s*✅\s*[A-D]\)/i.test(clean);
      const hasSuffixTick = /✅\s*$/.test(clean);
      if (hasPrefixTick || hasSuffixTick) {
        current.correct = label;
      }
    }
  }

  pushCurrent();

  if (questions.length > 0) {
    return questions;
  }

  return parseLooseBlocks(raw);
}

function parseLooseBlocks(raw) {
  const blocks = normalize(raw)
    .split(/\n\s*\n/g)
    .map((b) => b.trim())
    .filter(Boolean);

  const out = [];

  blocks.forEach((block, i) => {
    const lines = block
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length < 3) {
      return;
    }

    const question = lines[0]
      .replace(/^#{1,6}\s*/, "")
      .replace(/^\d+\.\s*/, "");
    const options = [];
    let correct = null;

    for (const line of lines.slice(1)) {
      const optionMatch = line.match(OPTION_RE);
      if (!optionMatch) {
        continue;
      }
      const label = optionMatch[1].toUpperCase();
      options.push({ label, text: optionMatch[2].trim() });
      if (/✅/.test(line)) {
        correct = label;
      }
    }

    if (options.length >= 2) {
      out.push({
        id: i + 1,
        question,
        options,
        correct,
      });
    }
  });

  return out;
}

export function parseSolutions(raw, questionCount = 0) {
  const normalized = normalize(raw);
  const map = new Map();

  const extracted = parseQuestions(normalized);
  if (extracted.length > 0) {
    extracted.forEach((q, i) => {
      if (q.correct) {
        map.set(i + 1, q.correct);
      }
    });
  }

  normalized.split("\n").forEach((line) => {
    const trimmed = line.trim();
    const m = trimmed.match(/^(\d+)\s*[:.)\-]\s*([A-D])\b/i);
    if (m) {
      map.set(Number(m[1]), m[2].toUpperCase());
    }
  });

  normalized.split(/[;,]+/).forEach((chunk) => {
    const m = chunk.trim().match(/^(\d+)\s*[-:=]\s*([A-D])$/i);
    if (m) {
      map.set(Number(m[1]), m[2].toUpperCase());
    }
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
