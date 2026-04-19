// Persists quiz session across browser refreshes (clears on tab close)
const KEY = "prep_quiz_session";

export function saveQuizSession(state) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // quota exceeded — ignore silently
  }
}

export function loadQuizSession() {
  try {
    return JSON.parse(sessionStorage.getItem(KEY) ?? "null");
  } catch {
    return null;
  }
}

export function clearQuizSession() {
  sessionStorage.removeItem(KEY);
}
