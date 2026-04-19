export default function AboutPage({ navigate }) {
  return (
    <div className="about-page">
      <div className="card about-card">
        <h1 className="about-title">About PrepDeck MCQ Studio</h1>
        <p className="about-lead">
          A blazing-fast, AI-powered MCQ practice tool — built entirely in your browser.
          No server. No database. No sign-up required to start.
        </p>

        <div className="about-grid">
          {/* What it does */}
          <div className="about-block">
            <h2>🎯 What It Does</h2>
            <ul>
              <li>Paste questions in <strong>any format</strong> — numbered, QUESTION N headers, markdown, HTML <code>&lt;details&gt;</code> blocks</li>
              <li>Paste a <strong>paragraph</strong> and AI generates fresh MCQs from it</li>
              <li>Shuffle questions, take a timed quiz, review wrong answers</li>
              <li>Export results as <strong>CSV or PDF</strong></li>
              <li>Download a full <strong>Q&amp;A answer sheet</strong> PDF</li>
            </ul>
          </div>

          {/* AI Providers */}
          <div className="about-block">
            <h2>🤖 AI Providers</h2>
            <ul>
              <li><strong>⚡ Groq</strong> — Fastest, free tier (recommended)</li>
              <li><strong>✦ Gemini</strong> — Google AI, free tier</li>
              <li><strong>🤖 ChatGPT</strong> — OpenAI GPT-4o mini</li>
              <li><strong>🔀 OpenRouter</strong> — 100+ models, free options</li>
            </ul>
            <p>Your API key is stored only in your browser — never sent to our servers.</p>
          </div>

          {/* Usage Limits */}
          <div className="about-block highlight-block">
            <h2>📊 Usage Limits</h2>
            <table className="about-table">
              <thead>
                <tr><th>Plan</th><th>Questions</th><th>Generations</th></tr>
              </thead>
              <tbody>
                <tr>
                  <td>🆓 Guest</td>
                  <td>Up to 15 per session</td>
                  <td>2 per 4 hours</td>
                </tr>
                <tr>
                  <td>🔓 Logged In</td>
                  <td>Up to 50 per session</td>
                  <td>Unlimited</td>
                </tr>
              </tbody>
            </table>
            <p className="about-note">Guest sessions reset after a 4-hour cooldown automatically.</p>
          </div>

          {/* Security */}
          <div className="about-block">
            <h2>🔒 Privacy &amp; Security</h2>
            <ul>
              <li><strong>No backend</strong> — everything runs in your browser</li>
              <li><strong>No database</strong> — SQL injection is impossible</li>
              <li><strong>React XSS protection</strong> — all input is auto-escaped</li>
              <li><strong>CSP headers</strong> — only 4 AI API domains are whitelisted</li>
              <li><strong>HTTPS enforced</strong> — HSTS header active</li>
              <li><strong>Passwords hashed</strong> — SHA-256 before localStorage</li>
            </ul>
          </div>

          {/* Tech stack */}
          <div className="about-block">
            <h2>🛠️ Tech Stack</h2>
            <ul>
              <li>React 18 + Vite 5</li>
              <li>Vanilla CSS — Neobrutalism theme</li>
              <li>Space Grotesk + Syne (Google Fonts)</li>
              <li>Mammoth.js (DOCX parsing)</li>
              <li>jsPDF + AutoTable (PDF export)</li>
            </ul>
          </div>

          {/* CTA */}
          <div className="about-block about-cta-block">
            <h2>🚀 Ready to start?</h2>
            <p>No sign-up needed for your first 2 sessions.</p>
            <button className="primary" onClick={() => navigate("home")}>
              Go to Studio →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
