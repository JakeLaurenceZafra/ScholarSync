import { GoogleGenerativeAI } from "@google/generative-ai";
import { pool } from "../db.js";
import 'dotenv/config';
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
export class AIService {
    handleGenerateSummary = async (req, res) => {
        try {
            const { context } = req.body;
            const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
            const result = await model.generateContent(`Summarize this context for a consultation report: ${context}`);
            res.json({ summary: result.response.text() });
        }
        catch (err) {
            console.error("AI API Error:", err);
            res.status(500).json({ error: "AI service failed." });
        }
    };
    handleGenerateParticipation = async (req, res) => {
        try {
            const { conID } = req.body;
            const { rows: consultations } = await pool.query('SELECT * FROM ss_consultation WHERE "conID" = $1', [Number(conID)]);
            const consultation = consultations[0];
            if (!consultation) {
                return res.status(404).json({ error: "Consultation not found." });
            }
            const { rows: attendance } = await pool.query('SELECT * FROM ss_attendance WHERE "conID" = $1', [Number(conID)]);
            const { rows: participation } = await pool.query('SELECT * FROM ss_participation WHERE "conID" = $1', [Number(conID)]);
            let groupMembers = [];
            let absentMembers = [];
            if (consultation.groupName) {
                const { rows: groups } = await pool.query('SELECT * FROM ss_group WHERE "groupName" = $1', [consultation.groupName]);
                const group = groups[0];
                if (group) {
                    const members = [group.member1, group.member2, group.member3, group.member4, group.member5].filter(m => m).map(m => m.toLowerCase().trim());
                    groupMembers = members;
                    if (attendance && attendance.length > 0) {
                        const presentMembers = [];
                        attendance.forEach(att => {
                            [att.mem1, att.mem2, att.mem3, att.mem4, att.mem5].forEach(mem => {
                                if (mem)
                                    presentMembers.push(mem.toLowerCase().trim());
                            });
                        });
                        absentMembers = members.filter(member => !presentMembers.includes(member));
                    }
                    else {
                        absentMembers = members;
                    }
                }
            }
            const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
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
            res.json({ insight: result.response.text() });
        }
        catch (err) {
            console.error("AI ERROR:", err.message);
            res.status(500).json({ error: "AI service failed." });
        }
    };
    handleCustomAnalysis = async (req, res) => {
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
        }
        catch (err) {
            res.status(500).json({ error: "Analysis failed." });
        }
    };
    handleListModels = async (req, res) => {
        try {
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${process.env.GEMINI_API_KEY}`);
            const data = await response.json();
            res.json(data);
        }
        catch (err) {
            res.status(500).json({ error: "Cannot reach model registry" });
        }
    };
}
//# sourceMappingURL=ai.service.js.map