# MCQ Practice Studio

Turn any raw MCQ document into a smart, test-ready practice website.

If you have ever thought, I have questions in text or Word format, but I want a real quiz portal with timer, analysis, report export, and retest mode, this project is built exactly for that.

## Why This Project Feels Powerful

Most quiz apps force you to hardcode questions in JSON or manually create forms.

This one does the opposite:

1. You paste text or upload a file.
2. It reads and structures MCQs automatically.
3. It shuffles and launches a test instantly.
4. It evaluates your answers, explains mistakes, and exports report files.
5. It lets you retest the same set in fresh random order.

That means faster learning loops, less setup time, and better revision outcomes.

## What You Can Do With It

### Smart Input Layer

- Paste questions directly in a text area.
- Upload files in these formats:
  - .txt
  - .md
  - .README
  - .docx
- Upload a separate solution file if questions do not include answers.
- If tick-mark answers already exist in question text, solutions are auto-detected.

### Real Quiz Experience

- Random question order every attempt.
- Clean option selection flow.
- Previous and Next navigation.
- Progress and answered counters.
- Optional timer with automatic submit on timeout.

### Advanced Evaluation

- Correct, Wrong, No-Key counts.
- Percentage score.
- Total marks.
- Optional negative marking toggle (disabled by default, enabled only when user chooses).
- Difficulty distribution across Easy, Medium, Hard.
- Wrong-answer review showing selected and correct option.

### Reporting and Reuse

- Export full analysis to CSV.
- Export full analysis to PDF.
- Retest mode reshuffles the same uploaded question bank.

## How The Feature Magic Works

### Flexible Parser Engine

The parser can understand common MCQ patterns and loose formatting styles, including both answer mark styles:

- Prefix style: ✅ C) Unauthorized
- Suffix style: C) Unauthorized ✅

It also supports separate key formats like:

- 1:C
- 2. B
- 3-A

### Timer and Auto-Submit Logic

When timer is enabled, a countdown runs during quiz mode.
When it reaches zero, the app automatically submits and generates analysis.

### Optional Negative Marking

Negative marking is not forced.

It is only applied if user enables it in Quiz Controls.
If not enabled, wrong answers reduce score percentage but do not deduct marks.

### Difficulty Tagging

- Auto-tagging uses question text heuristics.
- Explicit tags in question text are respected, for example:
  - What is CORS? [Easy]
  - Explain middleware pipeline [Hard]

## Tech Stack and Libraries Used

Core stack:

- React
- Vite
- HTML
- CSS

Libraries used:

- mammoth for reading .docx files
- jspdf for PDF generation
- jspdf-autotable for tabular result reports in PDF

## Where Everything Is Implemented

- Main app logic and feature flow: src/App.jsx
- Parsing and transformation logic: src/utils/parser.js
- Design, animations, responsiveness: src/styles.css
- App bootstrapping: src/main.jsx
- Build and scripts config: package.json
- Dev server config: vite.config.js

## Build and Run Guide

### Prerequisites

- Node.js version 18 or higher
- npm version 9 or higher

### Install

Run:

npm install

### Start Development Server

Run:

npm run dev

Open the local URL shown in terminal, typically http://localhost:5173

### Create Production Build

Run:

npm run build

### Preview Production Build

Run:

npm run preview

## Deploy to Vercel (production)

This project is a static Vite app. Vercel detects it automatically.

1. Push the project to GitHub, GitLab, or Bitbucket (or use the Vercel CLI).
2. In [Vercel](https://vercel.com), choose **Add New Project** and import the repository.
3. Leave defaults: **Framework Preset** = Vite (or **Build Command** `npm run build` and **Output Directory** `dist` if needed).
4. Deploy. The included `vercel.json` adds SPA routing and basic security headers.

You can also deploy from the CLI (after `npm i -g vercel`):

vercel

For production:

vercel --prod

The `.nvmrc` file pins a Node version Vercel can use for consistent builds.

## Deploy to Vercel (production)

This project is a static Vite app. Vercel detects it automatically.

1. Push the project to GitHub, GitLab, or Bitbucket (or use the Vercel CLI).
2. In [Vercel](https://vercel.com), choose **Add New Project** and import the repository.
3. Leave defaults: **Framework Preset** = Vite (or **Build Command** `npm run build` and **Output Directory** `dist` if needed).
4. Deploy. The included `vercel.json` adds SPA routing and basic security headers.

You can also deploy from the CLI (after `npm i -g vercel`):

vercel

For production:

vercel --prod

The `.nvmrc` file pins a Node version Vercel can use for consistent builds.

## Suggested Question Format

Use this format for best parsing accuracy:

1. Which status code is 401?
   A) Forbidden
   B) Bad Request
   C) Unauthorized ✅
   D) Not Found

