import { useState } from "react";
import { useAuth } from "../context/AuthContext";

// ── Login ─────────────────────────────────────────────────────────────────────
export function LoginPage({ navigate }) {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    if (!email.trim() || !password) {
      setError("Please fill in all fields.");
      return;
    }
    setLoading(true);
    try {
      await login(email.trim().toLowerCase(), password);
      navigate("home");
    } catch (err) {
      // Make Supabase error messages friendlier
      const msg = err.message;
      if (msg.includes("Invalid login credentials"))
        setError("Incorrect email or password. Please try again.");
      else if (msg.includes("Email not confirmed"))
        setError(
          "Please confirm your email address before logging in. Check your inbox.",
        );
      else setError(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="card auth-card">
        <h1 className="auth-title">Welcome Back 👋</h1>
        <p className="auth-subtitle">
          Log in to generate up to 50 questions — unlimited times, any device.
        </p>

        {error && <div className="error-box">{error}</div>}

        <form className="auth-form" onSubmit={handleSubmit} noValidate>
          <label className="auth-label">
            Email
            <input
              type="email"
              className="auth-input"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
          </label>
          <label className="auth-label">
            Password
            <input
              type="password"
              className="auth-input"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </label>
          <button
            className="primary auth-submit"
            type="submit"
            disabled={loading}
          >
            {loading ? (
              <>
                <span className="spinner" /> Logging in…
              </>
            ) : (
              "Log In"
            )}
          </button>
        </form>

        <p className="auth-switch">
          Don&apos;t have an account?{" "}
          <button className="link-btn" onClick={() => navigate("register")}>
            Register here
          </button>
        </p>
        <p className="auth-switch">
          <button className="link-btn" onClick={() => navigate("home")}>
            ← Continue as Guest (2 free sessions)
          </button>
        </p>
      </div>
    </div>
  );
}

// ── Register ──────────────────────────────────────────────────────────────────
export function RegisterPage({ navigate }) {
  const { register } = useAuth();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false); // email confirmation pending
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    if (!username.trim() || !email.trim() || !password || !confirm) {
      setError("Please fill in all fields.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    setLoading(true);
    try {
      const data = await register(
        username.trim(),
        email.trim().toLowerCase(),
        password,
      );
      // If session is null → email confirmation required
      if (data.session) {
        navigate("home");
      } else {
        setSuccess(true); // show "check your email" UI
      }
    } catch (err) {
      const msg = err.message;
      if (msg.includes("already registered") || msg.includes("already exists"))
        setError("An account with this email already exists.");
      else if (msg.includes("Password should"))
        setError("Password must be at least 6 characters.");
      else setError(msg);
    } finally {
      setLoading(false);
    }
  }

  // ── Email confirmation screen ────────────────────────────────────────────────
  if (success) {
    return (
      <div className="auth-page">
        <div className="card auth-card auth-confirmation-card">
          <div className="auth-confirmation-badge">
            Secure account verification
          </div>
          <h1 className="auth-title auth-title-confirmation">
            Confirm your email
          </h1>
          <p className="auth-subtitle auth-subtitle-confirmation">
            We sent a verification message to <strong>{email}</strong>. Open the
            email and click the confirmation link to activate your account.
          </p>
          <div className="confirm-tip auth-confirmation-tip">
            <strong>Important:</strong> If the message does not appear in your
            inbox within a minute, check Promotions, Updates, or Spam.
          </div>
          <div className="auth-confirmation-steps">
            <div className="auth-confirmation-step">
              <span className="auth-step-index">1</span>
              <span>Open the verification email from Supabase Auth.</span>
            </div>
            <div className="auth-confirmation-step">
              <span className="auth-step-index">2</span>
              <span>
                Select the confirmation link to activate your account.
              </span>
            </div>
            <div className="auth-confirmation-step">
              <span className="auth-step-index">3</span>
              <span>Return here and sign in with your new credentials.</span>
            </div>
          </div>
          <button
            className="primary auth-submit"
            style={{ marginTop: "16px" }}
            onClick={() => navigate("login")}
          >
            Go to Login →
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <div className="card auth-card">
        <h1 className="auth-title">Create Account 🎉</h1>
        <p className="auth-subtitle">
          Unlock unlimited question generation. Works on any device.
        </p>

        {error && <div className="error-box">{error}</div>}

        <form className="auth-form" onSubmit={handleSubmit} noValidate>
          <label className="auth-label">
            Username
            <input
              type="text"
              className="auth-input"
              placeholder="coolstudent99"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
            />
          </label>
          <label className="auth-label">
            Email
            <input
              type="email"
              className="auth-input"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
          </label>
          <label className="auth-label">
            Password
            <input
              type="password"
              className="auth-input"
              placeholder="Min. 6 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
            />
          </label>
          <label className="auth-label">
            Confirm Password
            <input
              type="password"
              className="auth-input"
              placeholder="Repeat password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
            />
          </label>
          <button
            className="primary auth-submit"
            type="submit"
            disabled={loading}
          >
            {loading ? (
              <>
                <span className="spinner" /> Creating account…
              </>
            ) : (
              "Create Account"
            )}
          </button>
        </form>

        <p className="auth-switch">
          Already have an account?{" "}
          <button className="link-btn" onClick={() => navigate("login")}>
            Log in here
          </button>
        </p>
      </div>
    </div>
  );
}
