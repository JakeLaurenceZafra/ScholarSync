import { Router } from 'express';
import { pool } from '../db.js';
import { authenticate, authorizeRole } from '../middleware/auth.js';

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
        const {
            courseId,
            groupId,
            memberEmail,
            memberName,
            taskUpdates,
            actionPlans,
            issues,
            minutesDate,
            minutesAdviser,
            minutesKeyPoints,
            minutesActionItems,
            minutesActionDeadlines,
            nextConsultation
        } = req.body;

        const { rows } = await pool.query(
            `INSERT INTO member_journals (
                course_id, group_id, member_email, member_name,
                task_updates, action_plans, issues,
                minutes_date, minutes_adviser, minutes_key_points,
                minutes_action_items, minutes_action_deadlines, next_consultation
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
            RETURNING *`,
            [
                courseId, groupId, memberEmail, memberName,
                taskUpdates, actionPlans, issues,
                minutesDate, minutesAdviser, minutesKeyPoints,
                minutesActionItems, minutesActionDeadlines, nextConsultation
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
        const {
            taskUpdates,
            actionPlans,
            issues,
            minutesDate,
            minutesAdviser,
            minutesKeyPoints,
            minutesActionItems,
            minutesActionDeadlines,
            nextConsultation
        } = req.body;

        const { rows } = await pool.query(
            `UPDATE member_journals SET
                task_updates = $1, action_plans = $2, issues = $3,
                minutes_date = $4, minutes_adviser = $5, minutes_key_points = $6,
                minutes_action_items = $7, minutes_action_deadlines = $8, next_consultation = $9,
                updated_at = NOW()
             WHERE id = $10
             RETURNING *`,
            [
                taskUpdates, actionPlans, issues,
                minutesDate, minutesAdviser, minutesKeyPoints,
                minutesActionItems, minutesActionDeadlines, nextConsultation,
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
router.delete('/:id', authenticate, authorizeRole(['Adviser', 'Admin']), async (req, res) => {
    try {
        const { id } = req.params;

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
