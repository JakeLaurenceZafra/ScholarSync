# Missing Route Issue

## Problem
Frontend is calling: `GET /api/courses/:id/groups`
Backend has: `GET /api/courses/:id/teams`

## Frontend calls:
- `/api/courses/${courseId}/groups` (schedule page)

## Backend endpoints:
- `/api/courses/:id/teams` ✅ EXISTS
- `/api/courses/:id/groups` ❌ MISSING

## Solution
Add the missing `/api/courses/:id/groups` endpoint that returns groups for a course.
