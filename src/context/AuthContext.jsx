import {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { supabase } from "../lib/supabase";

// ── Constants ─────────────────────────────────────────────────────────────────
export const GUEST_GEN_LIMIT = 2;
export const GUEST_Q_LIMIT = 15;
export const AUTH_Q_LIMIT = 50;
export const COOLDOWN_MS = 4 * 60 * 60 * 1000; // 4 hours

// ── Guest fingerprint ─────────────────────────────────────────────────────────
// Stored in localStorage so it survives refreshes.
// If user clears localStorage they get a new fingerprint (and 2 new free uses).
// That's acceptable — true rate limiting requires server-side IP checks.
function getGuestFingerprint() {
  let fp = localStorage.getItem("prep_guest_fp");
  if (!fp) {
    fp = crypto.randomUUID
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2) + Date.now();
    localStorage.setItem("prep_guest_fp", fp);
  }
  return fp;
}

// ── Context ───────────────────────────────────────────────────────────────────
const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true); // true while initial session loads
  const [guestUsage, setGuestUsage] = useState({ count: 0, windowStart: null });

  // ── Load session on mount ───────────────────────────────────────────────────
  useEffect(() => {
    // getSession is fast (reads from storage, no network)
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) fetchProfile(session.user.id);
      setLoading(false);
    });

    // Stay in sync when user logs in/out in another tab
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_ev, session) => {
      setUser(session?.user ?? null);
      if (session?.user) fetchProfile(session.user.id);
      else setProfile(null);
    });

    return () => subscription.unsubscribe();
  }, []);

  // ── Load guest usage from Supabase (server-side, cache-proof) ──────────────
  useEffect(() => {
    loadGuestUsage();
  }, []);

  async function fetchProfile(userId) {
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .single();
    if (data) setProfile(data);
  }

  async function loadGuestUsage() {
    const fp = getGuestFingerprint();
    const { data } = await supabase
      .from("guest_usage")
      .select("*")
      .eq("fingerprint", fp)
      .single();

    if (!data) return; // first-time guest — no record yet

    // Reset if 4-hr window passed
    if (
      data.window_start &&
      Date.now() - new Date(data.window_start).getTime() >= COOLDOWN_MS
    ) {
      await supabase
        .from("guest_usage")
        .update({
          count: 0,
          window_start: null,
          updated_at: new Date().toISOString(),
        })
        .eq("fingerprint", fp);
      setGuestUsage({ count: 0, windowStart: null });
    } else {
      setGuestUsage({ count: data.count, windowStart: data.window_start });
    }
  }

  // ── Guest limit check (reads from state — no extra DB call) ────────────────
  const checkGuestLimit = useCallback(() => {
    const windowMs = guestUsage.windowStart
      ? Date.now() - new Date(guestUsage.windowStart).getTime()
      : 0;
    // Cooldown expired → treat as fresh
    if (guestUsage.windowStart && windowMs >= COOLDOWN_MS) {
      return { allowed: true, remaining: GUEST_GEN_LIMIT, timeLeftMs: 0 };
    }
    if (guestUsage.count >= GUEST_GEN_LIMIT) {
      const timeLeftMs = guestUsage.windowStart
        ? Math.max(0, COOLDOWN_MS - windowMs)
        : 0;
      return { allowed: false, remaining: 0, timeLeftMs };
    }
    return {
      allowed: true,
      remaining: GUEST_GEN_LIMIT - guestUsage.count,
      timeLeftMs: 0,
    };
  }, [guestUsage]);

  // ── Record a guest generation (upsert to Supabase) ─────────────────────────
  const recordGuestGeneration = useCallback(async () => {
    const fp = getGuestFingerprint();
    const now = new Date().toISOString();
    const newCount = guestUsage.count + 1;
    const windowStart = guestUsage.windowStart ?? now;

    await supabase.from("guest_usage").upsert({
      fingerprint: fp,
      count: newCount,
      window_start: windowStart,
      updated_at: now,
    });
    setGuestUsage({ count: newCount, windowStart });
  }, [guestUsage]);

  // ── Auth actions ─────────────────────────────────────────────────────────────
  const register = useCallback(async (username, email, password) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: window.location.origin,
        data: { username }, // picked up by the DB trigger
      },
    });
    if (error) throw new Error(error.message);
    return data; // data.session is null if email confirmation is required
  }, []);

  const login = useCallback(async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw new Error(error.message);
    return data;
  }, []);

  const logout = useCallback(async () => {
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
  }, []);

  // ── Username helper ───────────────────────────────────────────────────────
  const username = profile?.username ?? user?.user_metadata?.username ?? null;

  // ── Context value (stable reference) ─────────────────────────────────────
  const value = useMemo(
    () => ({
      user,
      profile,
      username,
      loading,
      isLoggedIn: Boolean(user),
      guestUsage,
      checkGuestLimit,
      recordGuestGeneration,
      register,
      login,
      logout,
    }),
    [
      user,
      profile,
      username,
      loading,
      guestUsage,
      checkGuestLimit,
      recordGuestGeneration,
      register,
      login,
      logout,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
