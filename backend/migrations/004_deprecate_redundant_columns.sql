-- Migration: Document deprecated columns in ss_consultation
-- Date: 2026-03-20
-- Description: Clean up redundant columns - keeping AI-critical columns and adviser concerns
-- 
-- KEPT FOR AI & ADVISER FEEDBACK (journal consultation data):
-- - conDate (consultation date)
-- - conMil (milestone/topic)
-- - conSum (summary)
-- - conAction (next actions)
-- - conConcerns (adviser concerns about the group)
--
-- MERGED COLUMNS (removed in migration 005):
-- - conNotes → adviser_notes (same purpose, kept adviser_notes)
-- - conAtt → attendance_data (same purpose, kept attendance_data JSONB format)
-- - isDraft, conStat → status (all three tracked status, kept status with CHECK constraint)
-- 
-- REMOVED IN MIGRATION 005:
-- - conType (journal type - unused)
-- - conFeedback, conProgress, conNextSteps, conRecommendations (completely unused)
--
-- RESULT: Clean schema optimized for consultation feedback + AI summarization + adviser concerns

-- Add comments to columns for clarity
COMMENT ON COLUMN public.ss_consultation."conDate" IS 'Consultation date - used for AI context';
COMMENT ON COLUMN public.ss_consultation."conMil" IS 'Milestone/topic - used for AI context';
COMMENT ON COLUMN public.ss_consultation."conSum" IS 'Summary of consultation - used for AI summarization';
COMMENT ON COLUMN public.ss_consultation."conAction" IS 'Next actions/recommendations - used for AI context';
COMMENT ON COLUMN public.ss_consultation."conConcerns" IS 'Adviser/admin concerns about the group';
COMMENT ON COLUMN public.ss_consultation.status IS 'DRAFT, SUBMITTED, or COMPLETED - unified status replaces isDraft, conStat';
COMMENT ON COLUMN public.ss_consultation.adviser_notes IS 'Adviser notes - replaces conNotes';
COMMENT ON COLUMN public.ss_consultation.attendance_data IS 'Attendance tracking JSONB - replaces conAtt';
