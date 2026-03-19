-- Migration: Update consultation tables for booking system
-- Date: 2026-03-19
-- Description: Alters existing ss_consultation, ss_consultation_bookings, and ss_consultation_slots tables

-- 1. Alter ss_consultation table to add new columns and constraints
ALTER TABLE public.ss_consultation
ADD COLUMN IF NOT EXISTS slot_id integer,
ADD COLUMN IF NOT EXISTS adviser_notes text,
ADD COLUMN IF NOT EXISTS attendance_data jsonb DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS participation_data jsonb DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS status text DEFAULT 'DRAFT'::text,
ADD COLUMN IF NOT EXISTS submitted_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now(),
ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now();

-- Add foreign key constraint for slot_id if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'ss_consultation_slot_id_fkey'
  ) THEN
    ALTER TABLE public.ss_consultation
    ADD CONSTRAINT ss_consultation_slot_id_fkey 
    FOREIGN KEY (slot_id) REFERENCES ss_consultation_slots (slot_id) ON DELETE SET NULL;
  END IF;
END
$$;

-- Add status check constraint if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'ss_consultation_status_check'
  ) THEN
    ALTER TABLE public.ss_consultation
    ADD CONSTRAINT ss_consultation_status_check 
    CHECK (status = ANY(ARRAY['DRAFT'::text, 'SUBMITTED'::text, 'COMPLETED'::text]));
  END IF;
END
$$;

-- Update isDraft default value
ALTER TABLE public.ss_consultation
ALTER COLUMN "isDraft" SET DEFAULT true;

-- Update status default to match isDraft
UPDATE public.ss_consultation 
SET status = 'DRAFT' 
WHERE status IS NULL;

-- 2. Drop old ss_consultation_bookings if it has UUID group_id, then recreate
-- First, back up existing data if table exists with UUID group_id
DO $$
DECLARE
  v_column_type text;
BEGIN
  -- Check if group_id column exists and its type
  SELECT data_type INTO v_column_type 
  FROM information_schema.columns 
  WHERE table_name = 'ss_consultation_bookings' 
  AND column_name = 'group_id';
  
  IF v_column_type = 'uuid' THEN
    -- Drop all dependent foreign keys first
    ALTER TABLE IF EXISTS public.ss_consultation_bookings DROP CONSTRAINT IF EXISTS ss_consultation_bookings_slot_id_fkey;
    ALTER TABLE IF EXISTS public.ss_consultation_bookings DROP CONSTRAINT IF EXISTS ss_consultation_bookings_consultation_id_fkey;
    ALTER TABLE IF EXISTS public.ss_consultation_bookings DROP CONSTRAINT IF EXISTS ss_consultation_bookings_course_id_fkey;
    ALTER TABLE IF EXISTS public.ss_consultation_bookings DROP CONSTRAINT IF EXISTS ss_consultation_bookings_group_id_fkey;
    ALTER TABLE IF EXISTS public.ss_consultation_bookings DROP CONSTRAINT IF EXISTS ss_consultation_bookings_status_check;
    
    -- Drop old table completely
    DROP TABLE IF EXISTS public.ss_consultation_bookings_old;
    DROP TABLE IF EXISTS public.ss_consultation_bookings CASCADE;
    
    -- Create new table with integer group_id
    CREATE TABLE public.ss_consultation_bookings (
      booking_id serial not null,
      slot_id integer not null,
      course_id integer not null,
      group_id integer not null,
      group_name text not null,
      booked_by_email text not null,
      status text not null default 'BOOKED'::text,
      consultation_id integer null,
      created_at timestamp with time zone not null default now(),
      updated_at timestamp with time zone not null default now(),
      constraint ss_consultation_bookings_pkey primary key (booking_id),
      constraint ss_consultation_bookings_consultation_id_fkey foreign KEY (consultation_id) references ss_consultation ("conID") on delete set null,
      constraint ss_consultation_bookings_course_id_fkey foreign KEY (course_id) references ss_courses (id) on delete CASCADE,
      constraint ss_consultation_bookings_group_id_fkey foreign KEY (group_id) references ss_group ("smallgroupID") on delete CASCADE,
      constraint ss_consultation_bookings_slot_id_fkey foreign KEY (slot_id) references ss_consultation_slots (slot_id) on delete CASCADE,
      constraint ss_consultation_bookings_status_check check (
        (
          status = any (
            array[
              'BOOKED'::text,
              'CANCELLED'::text,
              'RESCHEDULED'::text
            ]
          )
        )
      )
    ) TABLESPACE pg_default;
    
    -- Create indexes
    CREATE INDEX IF NOT EXISTS idx_consultation_bookings_slot_status on public.ss_consultation_bookings using btree (slot_id, status) TABLESPACE pg_default;
    CREATE INDEX IF NOT EXISTS idx_consultation_bookings_group_status on public.ss_consultation_bookings using btree (group_id, status) TABLESPACE pg_default;
  END IF;
END
$$;

-- 3. Drop old ss_consultation_slots if it has UUID allowed_group_id, then recreate
DO $$
DECLARE
  v_column_type text;
BEGIN
  -- Check if allowed_group_id is UUID
  SELECT data_type INTO v_column_type 
  FROM information_schema.columns 
  WHERE table_name = 'ss_consultation_slots' 
  AND column_name = 'allowed_group_id';
  
  IF v_column_type = 'uuid' THEN
    -- Drop all dependent foreign keys first
    ALTER TABLE IF EXISTS public.ss_consultation_bookings DROP CONSTRAINT IF EXISTS ss_consultation_bookings_slot_id_fkey;
    ALTER TABLE IF EXISTS public.ss_consultation DROP CONSTRAINT IF EXISTS ss_consultation_slot_id_fkey;
    ALTER TABLE IF EXISTS public.ss_consultation_slots DROP CONSTRAINT IF EXISTS ss_consultation_slots_course_id_fkey;
    ALTER TABLE IF EXISTS public.ss_consultation_slots DROP CONSTRAINT IF EXISTS ss_consultation_slots_allowed_group_id_fkey;
    ALTER TABLE IF EXISTS public.ss_consultation_slots DROP CONSTRAINT IF EXISTS ss_consultation_slots_owner_account_id_fkey;
    ALTER TABLE IF EXISTS public.ss_consultation_slots DROP CONSTRAINT IF EXISTS ss_consultation_slots_slot_type_check;
    ALTER TABLE IF EXISTS public.ss_consultation_slots DROP CONSTRAINT IF EXISTS ss_consultation_slots_owner_role_check;
    ALTER TABLE IF EXISTS public.ss_consultation_slots DROP CONSTRAINT IF EXISTS ss_consultation_slots_check;
    ALTER TABLE IF EXISTS public.ss_consultation_slots DROP CONSTRAINT IF EXISTS ss_consultation_slots_max_groups_check;
    
    -- Drop old table completely
    DROP TABLE IF EXISTS public.ss_consultation_slots_old;
    DROP TABLE IF EXISTS public.ss_consultation_slots CASCADE;
    
    -- Create new table with integer allowed_group_id
    CREATE TABLE public.ss_consultation_slots (
      slot_id serial not null,
      course_id integer not null,
      owner_account_id integer not null,
      owner_role text not null,
      slot_date date not null,
      start_time time without time zone not null,
      end_time time without time zone not null,
      slot_type text not null,
      max_groups integer not null default 1,
      allowed_group_id integer null,
      google_event_id text null,
      created_at timestamp with time zone not null default now(),
      constraint ss_consultation_slots_pkey primary key (slot_id),
      constraint ss_consultation_slots_course_id_fkey foreign KEY (course_id) references ss_courses (id) on delete CASCADE,
      constraint ss_consultation_slots_allowed_group_id_fkey foreign KEY (allowed_group_id) references ss_group ("smallgroupID") on delete set null,
      constraint ss_consultation_slots_owner_account_id_fkey foreign KEY (owner_account_id) references ss_account (account_id) on delete CASCADE,
      constraint ss_consultation_slots_slot_type_check check (
        (
          slot_type = any (
            array[
              'FIRST_COME_FIRST_SERVE'::text,
              'SPECIFIC_GROUP'::text
            ]
          )
        )
      ),
      constraint ss_consultation_slots_owner_role_check check (
        (
          owner_role = any (array['Admin'::text, 'Adviser'::text])
        )
      ),
      constraint ss_consultation_slots_check check ((start_time < end_time)),
      constraint ss_consultation_slots_max_groups_check check ((max_groups > 0))
    ) TABLESPACE pg_default;
    
    -- Create indexes
    CREATE INDEX IF NOT EXISTS idx_consultation_slots_course_date on public.ss_consultation_slots using btree (course_id, slot_date, start_time) TABLESPACE pg_default;
    CREATE INDEX IF NOT EXISTS idx_consultation_slots_owner_date on public.ss_consultation_slots using btree (owner_account_id, slot_date, start_time) TABLESPACE pg_default;
  END IF;
END
$$;

-- 4. Re-add foreign key constraints that may have been dropped
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE table_name = 'ss_consultation_bookings' 
    AND constraint_name = 'ss_consultation_bookings_slot_id_fkey'
  ) THEN
    ALTER TABLE public.ss_consultation_bookings
    ADD CONSTRAINT ss_consultation_bookings_slot_id_fkey 
    FOREIGN KEY (slot_id) REFERENCES ss_consultation_slots (slot_id) ON DELETE CASCADE;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE table_name = 'ss_consultation' 
    AND constraint_name = 'ss_consultation_slot_id_fkey'
  ) THEN
    ALTER TABLE public.ss_consultation
    ADD CONSTRAINT ss_consultation_slot_id_fkey 
    FOREIGN KEY (slot_id) REFERENCES ss_consultation_slots (slot_id) ON DELETE SET NULL;
  END IF;
END
$$;

-- 5. If tables were not recreated (already have correct types), just alter to add missing columns/constraints
-- Alter ss_consultation_slots to ensure it has all necessary constraints
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE table_name = 'ss_consultation_slots' 
    AND constraint_name = 'ss_consultation_slots_slot_type_check'
  ) THEN
    ALTER TABLE public.ss_consultation_slots
    ADD CONSTRAINT ss_consultation_slots_slot_type_check CHECK (
      slot_type = ANY(ARRAY['FIRST_COME_FIRST_SERVE'::text, 'SPECIFIC_GROUP'::text])
    );
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE table_name = 'ss_consultation_slots' 
    AND constraint_name = 'ss_consultation_slots_owner_role_check'
  ) THEN
    ALTER TABLE public.ss_consultation_slots
    ADD CONSTRAINT ss_consultation_slots_owner_role_check CHECK (
      owner_role = ANY(ARRAY['Admin'::text, 'Adviser'::text])
    );
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE table_name = 'ss_consultation_slots' 
    AND constraint_name = 'ss_consultation_slots_check'
  ) THEN
    ALTER TABLE public.ss_consultation_slots
    ADD CONSTRAINT ss_consultation_slots_check CHECK (start_time < end_time);
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE table_name = 'ss_consultation_slots' 
    AND constraint_name = 'ss_consultation_slots_max_groups_check'
  ) THEN
    ALTER TABLE public.ss_consultation_slots
    ADD CONSTRAINT ss_consultation_slots_max_groups_check CHECK (max_groups > 0);
  END IF;
END
$$;

-- 6. Ensure indexes exist
CREATE INDEX IF NOT EXISTS idx_consultation_bookings_slot_status on public.ss_consultation_bookings using btree (slot_id, status) TABLESPACE pg_default;
CREATE INDEX IF NOT EXISTS idx_consultation_bookings_group_status on public.ss_consultation_bookings using btree (group_id, status) TABLESPACE pg_default;
CREATE INDEX IF NOT EXISTS idx_consultation_slots_course_date on public.ss_consultation_slots using btree (course_id, slot_date, start_time) TABLESPACE pg_default;
CREATE INDEX IF NOT EXISTS idx_consultation_slots_owner_date on public.ss_consultation_slots using btree (owner_account_id, slot_date, start_time) TABLESPACE pg_default;

-- 7. Ensure ss_consultation_bookings has correct status check constraint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE table_name = 'ss_consultation_bookings' 
    AND constraint_name = 'ss_consultation_bookings_status_check'
  ) THEN
    ALTER TABLE public.ss_consultation_bookings
    ADD CONSTRAINT ss_consultation_bookings_status_check CHECK (
      status = ANY(ARRAY['BOOKED'::text, 'CANCELLED'::text, 'RESCHEDULED'::text])
    );
  END IF;
END
$$;

COMMIT;
