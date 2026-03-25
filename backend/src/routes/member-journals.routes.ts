import { Router } from 'express';
import { pool } from '../db.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

// GET member journals for a specific group in a course
router.get('/course/:courseId/group/:groupId', authenticate, async (req, res) => {
    try {
        const { courseId, groupId } = req.params;
        
        const { rows } = await pool.query(
            `SELECT * FROM member_journals 
             WHERE course_id = $1 AND group_id = $2 
             ORDER BY created_at DESC`,
            [courseId, groupId]
        );
        
        res.json({ journals: rows });
    } catch (err: any) {
        console.error('Error fetching member journals:', err);
        res.status(500).json({ error: err.message });
    }
});

// POST create a new member journal entry
router.post('/', authenticate, async (req, res) => {
    try {
        const body: any = req.body || {};

        const courseId = body.courseId ?? body.courseID ?? body.course_id ?? null;
        const groupId = body.groupId ?? body.groupID ?? body.group_id ?? null;
        const memberEmail = body.memberEmail ?? body.member_email ?? null;
        const incomingMemberName = body.memberName ?? body.member_name ?? null;
        const journalDate = body.journalDate ?? body.journal_date ?? null;
        const journalText = String(body.journalText ?? body.journal_text ?? '').trim();
        const journalLabel = String(body.journalLabel ?? body.journal_label ?? '').trim();
        const normalizedJournalDate = String(journalDate || '').trim() || new Date().toISOString().slice(0, 10);
        const allowedLabels = ['Updates', 'Action Plans', 'Issues and Blockers', 'Reminder'];

        if (!courseId || !groupId || !memberEmail) {
            return res.status(400).json({ error: 'Missing required fields: courseId/groupId/memberEmail.' });
        }

        if (!journalText) {
            return res.status(400).json({ error: 'Journal text is required.' });
        }

        if (!allowedLabels.includes(journalLabel)) {
            return res.status(400).json({ error: 'Invalid journal label.' });
        }

        let memberName = String(incomingMemberName || '').trim();
        if (!memberName) {
            const { rows: accountRows } = await pool.query(
                `SELECT "accountName" FROM ss_account WHERE LOWER("accountEmail") = LOWER($1) LIMIT 1`,
                [String(memberEmail)]
            );
            memberName = String(accountRows[0]?.accountName || '').trim();
        }
        if (!memberName) {
            memberName = String(memberEmail).split('@')[0] || 'Unknown Member';
        }

        const { rows } = await pool.query(
            `INSERT INTO member_journals (
                course_id, group_id, member_email, member_name,
                journal_date,
                journal_text, journal_label
            ) VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING *`,
            [
                courseId, groupId, memberEmail, memberName,
                normalizedJournalDate,
                journalText, journalLabel
            ]
        );

        res.json(rows[0]);
    } catch (err: any) {
        console.error('Error creating member journal:', err);
        res.status(500).json({ error: err.message });
    }
});

// PUT update a member journal entry
router.put('/:id', authenticate, async (req, res) => {
    try {
        const { id } = req.params;
        const user: any = (req as any).user || {};
        const body: any = req.body || {};
        const journalDate = body.journalDate ?? body.journal_date ?? null;
        const journalText = String(body.journalText ?? body.journal_text ?? '').trim();
        const journalLabel = String(body.journalLabel ?? body.journal_label ?? '').trim();
        const allowedLabels = ['Updates', 'Action Plans', 'Issues and Blockers', 'Reminder'];
        const requesterEmail = String(user?.email || '').trim().toLowerCase();
        const requesterRole = String(user?.role || '').trim().toLowerCase();

        if (!journalText) {
            return res.status(400).json({ error: 'Journal text is required.' });
        }

        if (!allowedLabels.includes(journalLabel)) {
            return res.status(400).json({ error: 'Invalid journal label.' });
        }

        const { rows: ownerRows } = await pool.query(
            `SELECT id, member_email
             FROM member_journals
             WHERE id = $1
             LIMIT 1`,
            [id]
        );

        if (ownerRows.length === 0) {
            return res.status(404).json({ error: 'Member journal not found' });
        }

        const ownerEmail = String(ownerRows[0].member_email || '').trim().toLowerCase();
        const canEdit = requesterRole === 'admin' || (requesterEmail !== '' && requesterEmail === ownerEmail);
        if (!canEdit) {
            return res.status(403).json({ error: 'Only the journal creator or an admin can edit this journal.' });
        }

        const { rows } = await pool.query(
            `UPDATE member_journals SET
                journal_date = COALESCE($1, journal_date),
                journal_text = $2,
                journal_label = $3,
                updated_at = NOW()
             WHERE id = $4
             RETURNING *`,
            [
                journalDate,
                journalText,
                journalLabel,
                id
            ]
        );

        if (rows.length === 0) {
            return res.status(404).json({ error: 'Member journal not found' });
        }

        res.json(rows[0]);
    } catch (err: any) {
        console.error('Error updating member journal:', err);
        res.status(500).json({ error: err.message });
    }
});

// DELETE a member journal entry
router.delete('/:id', authenticate, async (req, res) => {
    try {
        const { id } = req.params;
        const user: any = (req as any).user || {};
        const requesterEmail = String(user?.email || '').trim().toLowerCase();
        const requesterRole = String(user?.role || '').trim().toLowerCase();

        const { rows: ownerRows } = await pool.query(
            `SELECT id, member_email
             FROM member_journals
             WHERE id = $1
             LIMIT 1`,
            [id]
        );

        if (ownerRows.length === 0) {
            return res.status(404).json({ error: 'Member journal not found' });
        }

        const ownerEmail = String(ownerRows[0].member_email || '').trim().toLowerCase();
        const canDelete = requesterRole === 'admin' || (requesterEmail !== '' && requesterEmail === ownerEmail);
        if (!canDelete) {
            return res.status(403).json({ error: 'Only the journal creator or an admin can delete this journal.' });
        }

        const { rows } = await pool.query(
            'DELETE FROM member_journals WHERE id = $1 RETURNING *',
            [id]
        );

        if (rows.length === 0) {
            return res.status(404).json({ error: 'Member journal not found' });
        }

        res.json({ message: 'Member journal deleted successfully' });
    } catch (err: any) {
        console.error('Error deleting member journal:', err);
        res.status(500).json({ error: err.message });
    }
});

export default router;
