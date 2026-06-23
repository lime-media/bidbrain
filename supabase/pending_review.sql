-- Run this in Supabase dashboard → SQL Editor

-- Add pending_review flag to materials
-- DEFAULT false means all existing (already-reviewed) materials are NOT in the review queue
ALTER TABLE public.materials
  ADD COLUMN IF NOT EXISTS pending_review boolean NOT NULL DEFAULT false;

-- Add pending_review flag to vendors
ALTER TABLE public.vendors
  ADD COLUMN IF NOT EXISTS pending_review boolean NOT NULL DEFAULT false;
