-- Add adviser_id column to ss_consultation_slots table
ALTER TABLE ss_consultation_slots 
ADD COLUMN IF NOT EXISTS adviser_id INTEGER;

-- Add foreign key constraint if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'ss_consultation_slots_adviser_id_fkey'
    ) THEN
        ALTER TABLE ss_consultation_slots 
        ADD CONSTRAINT ss_consultation_slots_adviser_id_fkey 
        FOREIGN KEY (adviser_id) REFERENCES ss_account(account_id) ON DELETE CASCADE;
    END IF;
END $$;

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_ss_consultation_slots_adviser ON ss_consultation_slots(adviser_id);
