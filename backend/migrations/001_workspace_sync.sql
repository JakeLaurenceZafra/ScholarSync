-- Run this in your Supabase SQL Editor
-- Creates the ss_connected_sheets table for Workspace Sync feature

CREATE TABLE IF NOT EXISTS ss_connected_sheets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  courseID INT NOT NULL REFERENCES ss_courses(id) ON DELETE CASCADE,
  sheetId TEXT NOT NULL,
  sheetName TEXT NOT NULL DEFAULT 'Connected Sheet',
  groupCount INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(courseID, sheetId)
);

-- Also add googleAccessToken column to ss_account if it doesn't exist
ALTER TABLE ss_account 
ADD COLUMN IF NOT EXISTS googleAccessToken TEXT;
