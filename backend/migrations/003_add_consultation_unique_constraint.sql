-- Migration: Add unique constraint for ss_consultation
-- Date: 2026-03-20
-- Description: Add unique constraint on (slot_id, groupName) to support ON CONFLICT upsert logic

-- Add unique constraint if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE table_name = 'ss_consultation' 
    AND constraint_name = 'ss_consultation_slot_groupname_unique'
  ) THEN
    ALTER TABLE public.ss_consultation
    ADD CONSTRAINT ss_consultation_slot_groupname_unique 
    UNIQUE (slot_id, "groupName");
  END IF;
END
$$;
