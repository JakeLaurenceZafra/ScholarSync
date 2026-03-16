import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

async function checkConsCols() {
  const { data: cons } = await supabase.from('ss_consultation').select('*').limit(1);
  console.log("Consultation columns:", cons ? Object.keys(cons[0]) : "NULL (No records or table error)");
}
checkConsCols();
