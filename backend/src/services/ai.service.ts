import { GoogleGenerativeAI } from "@google/generative-ai";
import { pool } from "../db.js";
import crypto from 'crypto';
import 'dotenv/config';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export class AIService {
  handleGenerateSummary = async (req: any, res: any) => {
    try {
      const { context, courseID, groupName, forceRefresh } = req.body;
      if (!context) return res.status(400).json({ error: "Context is required." });

      // Compute hash of the context
      const dataHash = crypto.createHash('sha256').update(context).digest('hex').substring(0, 16);

      // Check cache
      if (!forceRefresh) {
        const { rows: cached } = await pool.query(
          'SELECT result, data_hash FROM ss_ai_cache WHERE course_id = $1 AND group_name = $2 AND type = $3',
          [Number(courseID), groupName, 'summary']
        );
        if (cached.length > 0 && cached[0].data_hash === dataHash) {
          console.log("Returning cached summary for", groupName);
          return res.json({ summary: cached[0].result, cached: true });
        }
      }

      console.log("Generating fresh summary for context length:", context.length);
      const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" });
      const result = await model.generateContent(`Summarize this context for a consultation report: ${context}`);
      const summaryText = result.response.text();

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
      const { conID, courseID, groupName, forceRefresh } = req.body;
      console.log("Generating participation insights for conID:", conID);
      
      const { rows: consultations } = await pool.query('SELECT * FROM ss_consultation WHERE "conID" = $1', [Number(conID)]);
      const consultation = consultations[0];
      
      if (!consultation) {
        return res.status(404).json({ error: "Consultation not found." });
      }
      
      const { rows: attendance } = await pool.query('SELECT * FROM ss_attendance WHERE "conID" = $1', [Number(conID)]);
      const { rows: participation } = await pool.query('SELECT * FROM ss_participation WHERE "conID" = $1', [Number(conID)]);
      
      // Compute data hash for caching
      const rawData = JSON.stringify({ consultation, attendance, participation });
      const dataHash = crypto.createHash('sha256').update(rawData).digest('hex').substring(0, 16);

      // Check cache
      if (!forceRefresh) {
        const { rows: cached } = await pool.query(
          'SELECT result, data_hash FROM ss_ai_cache WHERE course_id = $1 AND group_name = $2 AND type = $3',
          [Number(courseID), groupName, 'participation']
        );
        if (cached.length > 0 && cached[0].data_hash === dataHash) {
          console.log("Returning cached participation insights for", groupName);
          return res.json({ insight: cached[0].result, cached: true });
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
        Summarize the engagement for consultation ID ${conID}.
        Consultation: ${JSON.stringify(consultation)}
        Group Members: ${groupMembers.join(', ')}
        Absent: ${absentMembers.join(', ')}
        Attendance: ${JSON.stringify(attendance)}
        Participation: ${JSON.stringify(participation)}

        Reporting Guidelines:
        - Plain text only.
        - Formal tone.
        - Under 200 words.
        - Mention present and absent by name.
        - Use sections: ENGAGEMENT OVERVIEW, ATTENDANCE ISSUES, PARTICIPATION FEEDBACK.
      `;

      const result = await model.generateContent(prompt);
      const insightText = result.response.text();

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
      const { rows: consultations } = await pool.query('SELECT * FROM ss_consultation WHERE "courseID" = $1', [Number(courseId)]);
      
      if (!consultations || consultations.length === 0) {
        return res.status(404).json({ error: "No relevant data available." });
      }

      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
      const prompt = `INSTRUCTION: ${instruction}\n\nDATA: ${JSON.stringify(consultations)}`;
      const result = await model.generateContent(prompt);
      res.json({ analysis: result.response.text().replace(/[\*\#\-\d\.]+/g, '').trim() });
    } catch (err: any) {
      res.status(500).json({ error: "Analysis failed." });
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
