console.log('Please run the following SQL in Supabase SQL editor:');
console.log(`
    -- Add archived field to ss_grouptasks
    ALTER TABLE ss_grouptasks ADD COLUMN IF NOT EXISTS archived BOOLEAN DEFAULT FALSE;
`);
console.log('The comments conversion will be handled automatically by the application at runtime.');