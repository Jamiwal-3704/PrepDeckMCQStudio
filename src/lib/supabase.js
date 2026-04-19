import { createClient } from "@supabase/supabase-js";

// Public anon key — safe to expose in client-side code.
// Security is enforced by Row Level Security policies on the database.
const SUPABASE_URL      = "https://xphkzqtvdirebkilfyqq.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhwaGt6cXR2ZGlyZWJraWxmeXFxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY1OTg1NzYsImV4cCI6MjA5MjE3NDU3Nn0.uDD3pq_iZoRoB2ZTy14ScVcFKi1g_RD2gHY2Er1mqgw";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
