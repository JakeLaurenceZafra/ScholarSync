import { GoogleGenerativeAI } from "@google/generative-ai";
import { pool } from "../db.js";
import crypto from 'crypto';
import 'dotenv/config';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

const sanitizeAiText = (text: string): string => {
  return text
    .replace(/[\*#]+/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
};

export class AIService {
  handleGenerateSummary = async (req: any, res: any) => {
    try {
      const { context, consultationHistory, courseID, groupName, forceRefresh } = req.body;
      if (!context) return res.status(400).json({ error: "Context is required." });

      const promptContext = consultationHistory
        ? `CONSULTATION HISTORY (PRIMARY BASIS):\n${consultationHistory}\n\nADDITIONAL CONTEXT:\n${context}`
        : context;

      // Compute hash of the context used by prompt
      const dataHash = crypto.createHash('sha256').update(promptContext).digest('hex').substring(0, 16);

      // Check cache
      if (!forceRefresh) {
        const { rows: cached } = await pool.query(
          'SELECT result, data_hash FROM ss_ai_cache WHERE course_id = $1 AND group_name = $2 AND type = $3',
          [Number(courseID), groupName, 'summary']
        );
        if (cached.length > 0 && cached[0].data_hash === dataHash) {
          console.log("Returning cached summary for", groupName);
          return res.json({ summary: sanitizeAiText(cached[0].result || ''), cached: true });
        }
      }

      console.log("Generating fresh summary for context length:", promptContext.length);
      const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" });
      const result = await model.generateContent(`
        Generate an Academic Synthesis from consultation history.
        Use consultation history as the primary basis for your analysis.

        Required format (plain text only):
        ACADEMIC SYNTHESIS
        YYYY-MM-DD
        - What happened: <max 18 words>
        - Next step / blocker: <max 14 words>

        YYYY-MM-DD
        - What happened: <max 18 words>
        - Next step / blocker: <max 14 words>

        Rules:
        - Separate entries by consultation day (one block per day).
        - Keep each day concise (2 bullets only, short phrases, no long paragraphs).
        - Sort days from oldest to newest.
        - If there are many logs, keep all days but stay compact.
        - Focus on progression, recurring blockers, and adviser-directed actions.
        - Do not include participation analysis.
        - Do not include attendance analysis.
        - Do not use markdown symbols like * or #.

        Data:
        ${promptContext}
      `);
      const summaryText = sanitizeAiText(result.response.text());

      // Upsert cache
      await pool.query(
        `INSERT INTO ss_ai_cache (course_id, group_name, type, result, data_hash, updated_at)
         VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
         ON CONFLICT ON CONSTRAINT ss_ai_cache_unique_key 
         DO UPDATE SET result = $4, data_hash = $5, updated_at = CURRENT_TIMESTAMP`,
        [Number(courseID), groupName, 'summary', summaryText, dataHash]
      );

      res.json({ summary: summaryText, cached: false });
    } catch (err: any) {
      console.error("AI API Error (Summary):", err.message);
      res.status(500).json({ error: "AI service failed: " + err.message });
    }
  }

  handleGenerateParticipation = async (req: any, res: any) => {
    try {
      const { conID, consultationHistory, courseID, groupName, forceRefresh } = req.body;
      console.log("Generating participation insights for conID:", conID);
      
      const { rows: consultations } = await pool.query('SELECT * FROM ss_consultation WHERE "conID" = $1', [Number(conID)]);
      const consultation = consultations[0];
      
      if (!consultation) {
        return res.status(404).json({ error: "Consultation not found." });
      }
      
      const { rows: attendance } = await pool.query('SELECT * FROM ss_attendance WHERE "conID" = $1', [Number(conID)]);
      const { rows: participation } = await pool.query('SELECT * FROM ss_participation WHERE "conID" = $1', [Number(conID)]);
      
      // Compute data hash for caching
      const rawData = JSON.stringify({ consultation, attendance, participation, consultationHistory: consultationHistory || '' });
      const dataHash = crypto.createHash('sha256').update(rawData).digest('hex').substring(0, 16);

      // Check cache
      if (!forceRefresh) {
        const { rows: cached } = await pool.query(
          'SELECT result, data_hash FROM ss_ai_cache WHERE course_id = $1 AND group_name = $2 AND type = $3',
          [Number(courseID), groupName, 'participation']
        );
        if (cached.length > 0 && cached[0].data_hash === dataHash) {
          console.log("Returning cached participation insights for", groupName);
          return res.json({ insight: sanitizeAiText(cached[0].result || ''), cached: true });
        }
      }

      let groupMembers: string[] = [];
      let absentMembers: string[] = [];
      if (consultation.groupName) {
        const { rows: groups } = await pool.query('SELECT * FROM ss_group WHERE "groupName" = $1', [consultation.groupName]);
        const group = groups[0];
        
        if (group) {
          const members = [group.member1, group.member2, group.member3, group.member4, group.member5].filter(m => m).map(m => m.toLowerCase().trim());
          groupMembers = members;
          
          if (attendance && attendance.length > 0) {
            const presentMembers: string[] = [];
            attendance.forEach(att => {
              [att.mem1, att.mem2, att.mem3, att.mem4, att.mem5].forEach(mem => {
                if (mem) presentMembers.push(mem.toLowerCase().trim());
              });
            });
            absentMembers = members.filter(member => !presentMembers.includes(member));
          } else {
            absentMembers = members;
          }
        }
      }

      console.log("Feeding context to Gemini: Members present/absent count:", groupMembers.length, absentMembers.length);

      const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" });

      const prompt = `
        Summarize participation and attendance for consultation ID ${conID}.
        Consultation History (Primary Context): ${consultationHistory || 'No additional consultation history provided.'}
        Consultation: ${JSON.stringify(consultation)}
        Group Members: ${groupMembers.join(', ')}
        Absent: ${absentMembers.join(', ')}
        Attendance: ${JSON.stringify(attendance)}
        Participation: ${JSON.stringify(participation)}

        Required format (plain text only):
        PARTICIPATION SUMMARY
        YYYY-MM-DD
        - Attendance: <present names> | Absent: <absent names>
        - Participation: <very short insight>
        - Action: <very short coaching/action item>

        YYYY-MM-DD
        - Attendance: <present names> | Absent: <absent names>
        - Participation: <very short insight>
        - Action: <very short coaching/action item>

        Rules:
        - Separate entries by consultation day (one compact block per day).
        - Keep each bullet short and concise; no long paragraphs.
        - Sort days from oldest to newest.
        - If there are many logs, keep all days but stay compact.
        - Mention present and absent names when available.
        - Focus only on attendance and participation behavior.
        - Do not use markdown symbols like * or #.
      `;

      const result = await model.generateContent(prompt);
      const insightText = sanitizeAiText(result.response.text());

      // Upsert cache
      await pool.query(
        `INSERT INTO ss_ai_cache (course_id, group_name, type, result, data_hash, updated_at)
         VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
         ON CONFLICT ON CONSTRAINT ss_ai_cache_unique_key 
         DO UPDATE SET result = $4, data_hash = $5, updated_at = CURRENT_TIMESTAMP`,
        [Number(courseID), groupName, 'participation', insightText, dataHash]
      );

      res.json({ insight: insightText, cached: false });
    } catch (err: any) {
      console.error("AI ERROR (Participation):", err.message);
      res.status(500).json({ error: "AI service failed: " + err.message });
    }
  }

  handleCustomAnalysis = async (req: any, res: any) => {
    try {
      const { courseId, instruction } = req.body;

      if (!courseId || Number.isNaN(Number(courseId))) {
        return res.status(400).json({ error: "Valid courseId is required." });
      }
      if (!instruction || !String(instruction).trim()) {
        return res.status(400).json({ error: "Instruction is required." });
      }

      const { rows: courseGroups } = await pool.query(
        `SELECT name AS "groupName", team_number
         FROM team_groups
         WHERE course_id = $1
         ORDER BY team_number ASC NULLS LAST, name ASC`,
        [Number(courseId)]
      );

      const { rows: consultations } = await pool.query(
        `SELECT "conID", "groupName", "conDate", "conMil", "conSum", "conAction", "conConcerns", adviser_notes, status, submitted_at, updated_at
         FROM ss_consultation
         WHERE "courseID" = $1
         AND status = 'SUBMITTED'
         AND submitted_at IS NOT NULL
         ORDER BY COALESCE(submitted_at, updated_at) DESC NULLS LAST, "conID" DESC`,
        [Number(courseId)]
      );

      const normalizeGroupKey = (name: string) => String(name || '').trim().toLowerCase();

      const grouped = consultations.reduce((acc: Record<string, any[]>, row: any) => {
        const originalName = row.groupName || 'Unknown Group';
        const key = normalizeGroupKey(originalName);
        if (!acc[key]) acc[key] = [];
        acc[key].push({ ...row, groupName: originalName });
        return acc;
      }, {});

      if (courseGroups.length === 0 && consultations.length === 0) {
        return res.status(404).json({ error: "No groups or consultation data found for this course." });
      }

      const groupNamesFromCourse = courseGroups.map((g: any) => String(g.groupName || '').trim()).filter(Boolean);
      const consultationOnlyGroupNames = consultations
        .map((c: any) => String(c.groupName || '').trim())
        .filter(Boolean)
        .filter((name, idx, arr) => arr.indexOf(name) === idx);

      const allGroupNames = Array.from(new Set([...groupNamesFromCourse, ...consultationOnlyGroupNames]));

      const compactContext = allGroupNames
        .map((groupName) => {
          const entries = grouped[normalizeGroupKey(groupName)] || [];

          if (entries.length === 0) {
            return `GROUP: ${groupName}\nNo consultation history yet.`;
          }

          const limitedEntries = entries.slice(0, 8);
          const lines = limitedEntries.map((entry: any, idx: number) => {
            const summary = String(entry.conSum || '').slice(0, 280);
            const milestone = String(entry.conMil || '-').slice(0, 120);
            const action = String(entry.conAction || '-').slice(0, 180);
            const concerns = String(entry.conConcerns || '-').slice(0, 180);
            return [
              `${idx + 1}. Date: ${entry.conDate || '-'} | Milestone: ${milestone}`,
              `Summary: ${summary || '-'}`,
              `Action: ${action}`,
              `Concerns: ${concerns}`
            ].join('\n');
          }).join('\n\n');

          return `GROUP: ${groupName}\n${lines}`;
        })
        .join('\n\n');

      const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" });
      const prompt = `
You are analyzing consultation data across ALL groups in one course.

User Instruction:
${String(instruction).trim()}

Course Consultation Data by Group:
${compactContext}

Output requirements:
- Return plain text only.
- Always include every group in the course, even when there is no consultation history.
- Organize findings by group where relevant.
- If user asks for updates (e.g., SRS updates), summarize each group's latest status clearly.
- Keep it concise but complete.
`;

      const result = await model.generateContent(prompt);
      const analysisBody = sanitizeAiText(result.response.text());
      res.json({ analysis: analysisBody });
    } catch (err: any) {
      console.error("AI ERROR (Custom Analysis):", err.message);
      res.status(500).json({ error: "Analysis failed: " + err.message });
    }
  }

  handleListModels = async (req: any, res: any) => {
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${process.env.GEMINI_API_KEY}`);
      const data = await response.json();
      res.json(data);
    } catch (err) {
      res.status(500).json({ error: "Cannot reach model registry" });
    }
  }
}
