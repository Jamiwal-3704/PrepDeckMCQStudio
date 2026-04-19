import { useAuth, GUEST_GEN_LIMIT } from "../context/AuthContext";

export default function Navbar({ page, navigate }) {
  const { username, isLoggedIn, guestUsage, logout, loading } = useAuth();

  const usedCount = guestUsage?.count ?? 0;
  const remaining = Math.max(0, GUEST_GEN_LIMIT - usedCount);

  async function handleLogout() {
    await logout();
    navigate("home");
  }

  return (
    <nav className="navbar">
      {/* Brand */}
      <button className="nav-brand" onClick={() => navigate("home")}>
        <span className="nav-brand-icon">📝</span>
        <span className="nav-brand-text">PrepDeck</span>
      </button>

      {/* Links */}
      <div className="nav-links">
        <button
          className={`nav-link ${page === "home" || page === "quiz" || page === "result" ? "active" : ""}`}
          onClick={() => navigate("home")}
        >
          Home
        </button>
        <button
          className={`nav-link ${page === "about" ? "active" : ""}`}
          onClick={() => navigate("about")}
        >
          About
        </button>
      </div>

      {/* Auth area */}
      <div className="nav-auth">
        {loading ? (
          <span className="nav-loading">●●●</span>
        ) : isLoggedIn ? (
          <>
            <span className="nav-user-chip">
              <span className="nav-user-dot" />
              {username ?? "User"}
            </span>
            <button className="nav-auth-btn ghost-sm" onClick={handleLogout}>
              Logout
            </button>
          </>
        ) : (
          <>
            {usedCount > 0 && (
              <span className={`nav-usage-pill ${remaining === 0 ? "exhausted" : ""}`}>
                {remaining === 0 ? "⛔ Limit reached" : `${remaining}/${GUEST_GEN_LIMIT} free`}
              </span>
            )}
            <button className="nav-auth-btn ghost-sm" onClick={() => navigate("login")}>
              Login
            </button>
            <button className="nav-auth-btn primary-sm" onClick={() => navigate("register")}>
              Register
            </button>
          </>
        )}
      </div>
    </nav>
  );
}
