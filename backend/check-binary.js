
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

function toHex(str) {
  return Array.from(str).map(c => c.charCodeAt(0).toString(16).padStart(4, '0')).join(' ');
}

async function checkBinary() {
  const { data: groupings } = await supabase.from('ss_groupings').select('groupName, groupID');
  const { data: groups } = await supabase.from('ss_group').select('groupName, smallgroupID');
  
  console.log("--- Binary Check ---");
  
  const groupingsMap = new Map();
  groupings.forEach(g => {
    const hex = toHex(g.groupName);
    console.log(`Grouping ID ${g.groupID}: "${g.groupName}" [${hex}]`);
    groupingsMap.set(g.groupName, hex);
  });

  console.log("");

  groups.forEach(g => {
    const hex = toHex(g.groupName);
    console.log(`Group Detail ID ${g.smallgroupID}: "${g.groupName}" [${hex}]`);
    if (groupingsMap.has(g.groupName)) {
      console.log("  -> MATCHES a grouping name.");
    } else {
       console.log("  -> NO EXACT MATCH in groupings.");
       // Check for fuzzy hex match
       for (const [name, gHex] of groupingsMap.entries()) {
         if (name.trim() === g.groupName.trim()) {
           console.log(`     (Trimming would match: "${name}" [${gHex}])`);
         }
       }
    }
  });
}

checkBinary();
