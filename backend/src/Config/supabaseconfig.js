import 'dotenv/config'; 
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY; // Changed from SUPABASE_KEY to match .env

if (!supabaseUrl || !supabaseKey) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_ANON_KEY in .env file");
}

const supabase = createClient(supabaseUrl, supabaseKey);

export default supabase;