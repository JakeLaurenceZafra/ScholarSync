
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

async function simulateApi(groupId) {
  console.log(`--- Simulating API for ID ${groupId} ---`);
  
  // 1. Fetch grouping
  const { data: grouping, error: groupingError } = await supabase
    .from('ss_groupings')
    .select('groupName')
    .eq('groupID', groupId)
    .single();

  if (groupingError) {
    console.error("Step 1 Failed:", groupingError);
    return;
  }
  console.log("Step 1 Success. Found name:", grouping.groupName);

  // 2. Fetch details
  const { data: groups, error: detailError } = await supabase
    .from('ss_group')
    .select('*')
    .eq('groupName', grouping.groupName);

  if (detailError) {
    console.error("Step 2 Error:", detailError);
    return;
  }
  
  console.log(`Step 2 Success. Found ${groups?.length} results.`);
  if (groups && groups.length > 0) {
    console.log("First result smallgroupID:", groups[0].smallgroupID);
  } else {
    console.log("NO RESULTS in ss_group for name:", grouping.groupName);
  }
}

async function runTests() {
  await simulateApi(156);
  await simulateApi(157);
  await simulateApi(12);
}

runTests();
