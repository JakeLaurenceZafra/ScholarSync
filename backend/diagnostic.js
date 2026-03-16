import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

async function diagnostic() {
  console.log("--- Schema Diagnostic ---");
  const { data: groupings } = await supabase.from('ss_groupings').select('*');
  const { data: groups } = await supabase.from('ss_group').select('*');
  
  if (!groupings || !groups) {
    console.error("Failed to fetch data.");
    return;
  }

  const groupNamesInDetails = new Set(groups.map(g => g.groupName));
  const orphans = groupings.filter(g => !groupNamesInDetails.has(g.groupName));
  
  console.log(`Total Groupings: ${groupings.length}`);
  console.log(`Total Group Details: ${groups.length}`);
  console.log(`Orphaned Groupings (no details matching name): ${orphans.length}`);
  if (orphans.length > 0) {
    console.log("Orphans:", orphans);
  }

  // Check for duplicates in groupings per course
  const courseGroupMap = new Map();
  groupings.forEach(g => {
    const key = `${g.courseID}:${g.groupName}`;
    const entries = courseGroupMap.get(key) || [];
    entries.push(g.groupID);
    courseGroupMap.set(key, entries);
  });

  const duplicates = Array.from(courseGroupMap.entries()).filter(([key, ids]) => ids.length > 1);
  console.log(`Duplicate Group Names per Course: ${duplicates.length}`);
  if (duplicates.length > 0) {
    console.log("Duplicates:", duplicates);
  }
}

diagnostic();
