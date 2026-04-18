# 📝 PrepDeck MCQ Practice Studio

> A blazing-fast, **AI-powered MCQ practice tool** built entirely in the browser — no server, no database, no login required.

![UI Theme](https://img.shields.io/badge/UI-Neobrutalism-FFD60A?style=flat-square&labelColor=0d0d0d)
![Framework](https://img.shields.io/badge/Framework-React%2018-61DAFB?style=flat-square&labelColor=0d0d0d)
![Build](https://img.shields.io/badge/Build-Vite%205-646CFF?style=flat-square&labelColor=0d0d0d)
![Deploy](https://img.shields.io/badge/Deploy-Vercel%20Ready-000000?style=flat-square&labelColor=0d0d0d)
![License](https://img.shields.io/badge/License-Private-red?style=flat-square&labelColor=0d0d0d)

---

## 🚀 What Is This?

**PrepDeck MCQ Practice Studio** is a client-side web application where you can:

- Paste or upload questions in **any format** (numbered, QUESTION N headers, markdown, HTML `<details>` blocks, answer-key tables, etc.)
- Paste a **plain paragraph/passage** and have AI generate MCQs from it
- Practice the quiz in **random shuffled order**
- Get a **detailed result analysis** with score, wrong answers, and export options

No backend. No database. No account needed. Everything runs in your browser.

---

## ✨ Features

### 📥 Smart Input System
| Feature | Details |
|---|---|
| **Dual Input Mode** | Toggle between *MCQ Questions* and *Paragraph / Passage* |
| **Any MCQ format** | Numbered (`1.`), `QUESTION N` headers, `Q1.`, markdown bullets, `<details>` answer blocks |
| **Paragraph → MCQs** | AI reads your passage and generates fresh questions |
| **Embedded MCQ detection** | If you paste a paragraph that already contains MCQs inside, they are auto-detected and used directly |
| **File upload** | `.txt`, `.md`, `.README`, `.docx` all supported |
| **Cross-mode hint** | If you paste a paragraph in MCQ mode, a helpful message guides you to switch modes |

### 🤖 Multi-Provider AI Engine
Choose your preferred AI provider — all work directly from the browser with zero backend:

| Provider | Model | Cost | Speed |
|---|---|---|---|
| ⚡ **Groq** | LLaMA 3.3 70B | Free tier | Ultra-fast |
| ✦ **Gemini** | Gemini 2.0 Flash | Free tier | Fast |
| 🤖 **ChatGPT** | GPT-4o mini | Paid | Fast |
| 🔀 **OpenRouter** | Llama 3.1 8B | Free models | Fast |

- Provider cards with one-click selection
- Per-provider API key storage in `localStorage`
- Green dot indicator on cards with a saved key
- Falls back to regex parser if no key is provided

### 🎯 Quiz Engine
- Questions shuffled in **random order** every session
- **Progress bar** showing completion
- **Answered/Total counter**
- Navigate freely — Previous / Next
- Select answers by clicking option cards
- **Auto-submit on timer expiry**

### ⏱️ Configurable Settings
- **Quiz Timer** — enable/disable, set minutes (auto-submits on expiry)
- **Negative Marking** — enable/disable with configurable deduction per wrong answer
- **Auto-tag Difficulty** — keywords + text length heuristic auto-classifies each question as Easy / Medium / Hard
- **Question count slider** — choose 3–15 questions when generating from a paragraph

### 📊 Result Analysis
- Score % · Correct · Wrong · No Key · Total Marks stats
- Difficulty distribution (Easy / Medium / Hard counts)
- Visual score bar
- **Wrong Answers Review** — shows your answer vs correct answer for every mistake
- **Export CSV** — full question-level report
- **Export PDF** — formatted landscape report via jsPDF + autoTable
- **Retest in Random Order** — same question set, reshuffled

### 🎨 Neobrutalism UI
- **Space Grotesk + Syne** Google Fonts
- Thick black borders + hard offset drop shadows on every element
- Flat bright color palette: Yellow (`#FFD60A`), Cyan, Lime, Orange, Pink, Purple
- Subtle dot-grid background
- Micro-animations: hover lifts, active press-down, slide-in cards
- Fully responsive (2-column provider grid on mobile)

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| UI Framework | React 18 (Vite) |
| Styling | Vanilla CSS — Neobrutalism theme |
| Fonts | Space Grotesk + Syne (Google Fonts) |
| DOCX parsing | Mammoth.js (browser build) |
| PDF export | jsPDF + jsPDF-AutoTable |
| AI APIs | Groq / Gemini / OpenAI / OpenRouter (fetch, no SDK) |
| Build tool | Vite 5 |
| Deployment | Vercel (static SPA) |
| Persistence | `localStorage` only (API keys + provider preference) |

**No database. No backend. No server.**

---

## 📁 Project Structure

```
mcq-practice-app/
├── index.html                  # Entry HTML + Google Fonts
├── vite.config.js              # Vite build config (no sourcemaps in prod)
├── vercel.json                 # Deployment + security headers
├── package.json
└── src/
    ├── main.jsx                # React root mount
    ├── App.jsx                 # Main application component
    ├── styles.css              # Complete Neobrutalism theme
    └── utils/
        ├── parser.js           # Regex-based MCQ parser (offline fallback)
        └── paragraphParser.js  # AI provider engine (Groq/Gemini/OpenAI/OpenRouter)
```

---

## 🧩 How the Parser Works

### AI Path (when API key is set)
```
User Input → Gemini/Groq/OpenAI/OpenRouter prompt
           → Returns structured JSON { questions: [...] }
           → Normalised → Shuffled → Quiz launched
```
Works on **any input format** — the AI reads it like a human.

### Regex Fallback (no API key)
```
User Input → Line-by-line scan
           → QUESTION_RE / QUESTION_FALLBACK_RE / QUESTION_HEADER_RE
           → OPTION_RE (A) / A. / (A) formats)
           → Details-block answer extraction (**C) text**)
           → parseLooseBlocks with pending-question pairing
           → Shuffled → Quiz launched
```

### Supported MCQ Formats (Regex)
```
1. Question text          ← Standard numbered
1) Question text          ← Parenthesis numbered
QUESTION 1                ← Header + next line = question text
Q1. Question text         ← Q-prefix
A) Option / A. Option / (A) Option   ← All option styles
**C) Answer** in <details>           ← Extracted correct answer
1:C, 2:B, 3:A                        ← Separate answer key
```

---

## 🔐 Security

### ❌ SQL Injection — Not Possible
There is **no database and no SQL** anywhere in the project. SQL injection requires a database to inject into — this app has none. User input goes to either a regex parser or an AI prompt string.

### ✅ XSS Protection
React auto-escapes all `{variable}` JSX interpolation. No `dangerouslySetInnerHTML` is used anywhere. Malicious `<script>` tags pasted into the textarea render as plain text.

### ✅ Content Security Policy (HTTP Header)
```
default-src 'self'
script-src 'self' 'unsafe-inline'
connect-src 'self' + only 4 whitelisted AI API domains
font-src fonts.gstatic.com
frame-ancestors 'none'
object-src 'none'
```
The browser will **block all outbound connections** except to the 4 AI providers. No data can leak to third-party servers.

### ✅ Clickjacking Protection
`X-Frame-Options: DENY` — the app cannot be embedded in any iframe on any site.

### ✅ HTTPS Enforced
`Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`  
Browsers refuse to load the app over plain HTTP for 2 years after first visit.

### ✅ API Keys — Client-Side Storage
API keys are stored in `localStorage` (standard for client-only tools). They are:
- Never sent to any server other than the selected AI provider
- Scoped to your browser only
- Protected from exfiltration by the CSP header
- Only ever used inside a `fetch()` call to the provider's official API endpoint

### ✅ Additional Headers
| Header | Value |
|---|---|
| `X-Content-Type-Options` | `nosniff` |
| `X-XSS-Protection` | `1; mode=block` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | camera, mic, geolocation, payment all blocked |

---

## ⚡ Getting Started (Local Dev)

```bash
# Clone and install
git clone <repo-url>
cd mcq-practice-app
npm install

# Run dev server
npm run dev
# → http://localhost:5173

# Production build
npm run build
# → dist/ folder ready for deployment
```

---

## 🌐 Deployment (Vercel)

1. Push to GitHub
2. Import repo in [vercel.com](https://vercel.com)
3. Framework: **Vite** (auto-detected)
4. Build command: `npm run build`
5. Output directory: `dist`
6. Click **Deploy** — all security headers in `vercel.json` apply automatically

---

## 🔑 Getting Free API Keys

| Provider | Link | Free Tier |
|---|---|---|
| Groq | [console.groq.com/keys](https://console.groq.com/keys) | ✅ Very generous |
| Gemini | [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey) | ✅ Free |
| OpenRouter | [openrouter.ai/keys](https://openrouter.ai/keys) | ✅ Free models |
| OpenAI | [platform.openai.com/api-keys](https://platform.openai.com/api-keys) | Paid ($) |

**Recommended: Groq** — fastest inference, most generous free tier.

---

## 🗺️ What Was Built (Feature Timeline)

1. **Core MCQ Parser** — regex-based line-by-line and loose-block parser
2. **Quiz Engine** — shuffle, navigate, timer, submit, analysis
3. **Export** — CSV + PDF (jsPDF) with full question report
4. **Input Mode Toggle** — MCQ Questions ↔ Paragraph/Passage
5. **Paragraph edge cases** — detect embedded MCQs, smart routing
6. **Multi-provider AI Engine** — Groq, Gemini, OpenAI, OpenRouter with provider card UI
7. **AI-first parsing** — any format input → Gemini/Groq → structured JSON
8. **Neobrutalism theme** — full CSS overhaul with Space Grotesk + Syne
9. **Security hardening** — CSP, HSTS, X-Frame-Options: DENY, XSS headers

---

## 📄 License

Private project. All rights reserved.
