import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

async function deepDiagnostic() {
  console.log("--- Deep Schema Diagnostic ---");
  const { data: groupings } = await supabase.from('ss_groupings').select('*');
  const { data: groups } = await supabase.from('ss_group').select('*');
  
  if (!groupings || !groups) {
    console.error("Failed to fetch data.");
    return;
  }

  const groupDetailsNames = groups.map(g => g.groupName);
  const groupingsNames = groupings.map(g => g.groupName);

  console.log("\nGroupings in ss_groupings:");
  groupings.forEach(g => console.log(`- ID: ${g.groupID}, Name: "${g.groupName}", Course: ${g.courseID}`));

  console.log("\nGroups in ss_group:");
  groups.forEach(g => console.log(`- ID: ${g.smallgroupID}, Name: "${g.groupName}"`));

  console.log("\nMismatches:");
  for (const g of groupings) {
    const match = groups.find(gd => gd.groupName === g.groupName);
    if (!match) {
      console.log(`[ORPHAN] Grouping ID ${g.groupID} ("${g.groupName}") has NO details in ss_group.`);
      // Check for fuzzy match (case/whitespace)
      const fuzzy = groups.find(gd => gd.groupName.trim().toLowerCase() === g.groupName.trim().toLowerCase());
      if (fuzzy) {
        console.log(`  -> Fuzzy match found: "${fuzzy.groupName}" (ID ${fuzzy.smallgroupID})`);
      }
    }
  }

  const unusedDetails = groups.filter(gd => !groupings.some(g => g.groupName === gd.groupName));
  unusedDetails.forEach(gd => console.log(`[UNUSED] Group detail ID ${gd.smallgroupID} ("${gd.groupName}") is not referenced by any groupings.`));
}

deepDiagnostic();
