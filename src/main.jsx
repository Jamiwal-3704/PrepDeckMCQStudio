import { Component, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AuthProvider } from "./context/AuthContext";
import App from "./App";
import "./styles.css";

class AppErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, message: "" };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, message: error?.message || "Unknown runtime error" };
  }
  componentDidCatch(error, errorInfo) {
    console.error("App crashed:", error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: "24px", fontFamily: "Space Grotesk, Segoe UI, sans-serif" }}>
          <h1>Application Error</h1>
          <p>The app encountered a runtime issue. Refresh once, and if it persists share this message:</p>
          <pre style={{ whiteSpace: "pre-wrap", background: "#fff4f4", padding: "12px", border: "2px solid #0d0d0d" }}>
            {this.state.message}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <AppErrorBoundary>
      <AuthProvider>
        <App />
      </AuthProvider>
    </AppErrorBoundary>
  </StrictMode>,
);
