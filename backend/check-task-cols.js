import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

async function checkTaskCols() {
  const { data: tasks } = await supabase.from('ss_grouptasks').select('*').limit(1);
  console.log("Tasks columns:", tasks ? Object.keys(tasks[0]) : "NULL (No records or table error)");
  
  // Also check if table exists by trying a schema-less query if it fails
  if (!tasks) {
     const { error } = await supabase.from('ss_grouptasks').select('count');
     console.log("Table check error:", error);
  }
}
checkTaskCols();
