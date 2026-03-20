-- Migration: Remove unused and redundant columns from ss_consultation
-- Date: 2026-03-20
-- Description: Consolidate duplicate columns and remove unused ones
--              Keep journal columns needed for AI: conDate, conSum, conMil, conAction, conConcerns

-- Drop completely unused + redundant columns only
-- Keep: conDate, conSum, conMil, conAction, conConcerns (used for AI & adviser concerns)
-- Merge: conNotes→adviser_notes, conAtt→attendance_data, isDraft/conStat→status
-- Remove: conType, conFeedback, conProgress, conNextSteps, conRecommendations

ALTER TABLE public.ss_consultation
DROP COLUMN IF EXISTS "conType",
DROP COLUMN IF EXISTS "conFeedback",
DROP COLUMN IF EXISTS "conProgress",
DROP COLUMN IF EXISTS "conNextSteps",
DROP COLUMN IF EXISTS "conRecommendations",
DROP COLUMN IF EXISTS "conNotes",
DROP COLUMN IF EXISTS "conAtt",
DROP COLUMN IF EXISTS "isDraft",
DROP COLUMN IF EXISTS "conStat";
