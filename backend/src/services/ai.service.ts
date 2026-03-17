import { GoogleGenerativeAI } from '@google/generative-ai';
import db from '../Config/supabaseconfig.js';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export class AIService {

 handleGenerateSummary = async (req: any, res: any) => {
  try {
    const { conID } = req.body;
    const { data, error } = await db.from('ss_consultation').select('*').eq('conID', Number(conID)).single();
    
    if (error || !data) return res.status(404).json({ error: "Consultation not found." });

    const model = genAI.getGenerativeModel({ model: "models/gemini-2.5-flash" });

    const prompt = `
  You are an academic monitoring assistant. Draft a concise internal advisory report for a Capstone group.

  ### Data Input:
  - Milestone: ${data.conMil || 'N/A'}
  - Summary: ${data.conSum || 'N/A'}
  - Status: ${data.conStat || 'N/A'}
  - Notes: ${data.conNotes || 'None'}

  ### Reporting Guidelines:
  - DO NOT use markdown symbols (no #, no *, no **).
  - Use plain text formatting.
  - Refer to the students as "the group."
  - Maintain a formal, analytical tone.
  - Keep the total length under 200 words.
  - Use the following headings:
    OVERVIEW
    CONCERNS
    ACTION ITEMS
`;

    const result = await model.generateContent(prompt);
    res.json({ summary: result.response.text() });
  } catch (err) {
    console.error("DEBUG - AI API Error Details:", err.response?.data || err.message);
    res.status(500).json({ error: "AI service failed." });
  }
}

  handleGenerateParticipation = async (req: any, res: any) => {
  try {
    const { conID } = req.body;
    
    // Get consultation data
    const { data: consultation, error: consError } = await db.from('ss_consultation').select('*').eq('conID', Number(conID)).single();
    if (consError || !consultation) {
      return res.status(404).json({ error: "Consultation not found." });
    }
    
    // Corrected table names to match your schema
    const { data: attendance, error: attError } = await db.from('ss_attendance').select('*').eq('conID', Number(conID));
    const { data: participation, error: partError } = await db.from('ss_participation').select('*').eq('conID', Number(conID));
    
    if (attError || partError) {
      console.error("Database query error:", attError || partError);
      return res.status(500).json({ error: "Failed to fetch records: Table name mismatch." });
    }

    // Get group members
    let groupMembers: string[] = [];
    let absentMembers: string[] = [];
    if (consultation.groupName) {
      const { data: group, error: groupError } = await db.from('ss_group').select('*').eq('groupName', consultation.groupName).single();
      if (!groupError && group) {
        const members = [group.member1, group.member2, group.member3, group.member4, group.member5].filter(m => m).map(m => m.toLowerCase().trim());
        groupMembers = members;
        
        // Get present members from attendance (mem1, mem2, etc.)
        if (attendance && attendance.length > 0) {
          const presentMembers: string[] = [];
          attendance.forEach(att => {
            [att.mem1, att.mem2, att.mem3, att.mem4, att.mem5].forEach(mem => {
              if (mem) presentMembers.push(mem.toLowerCase().trim());
            });
          });
          // Absent are those in group but not in present
          absentMembers = members.filter(member => !presentMembers.includes(member));
        } else {
          absentMembers = members; // If no attendance, all are absent
        }
      }
    }

    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const prompt = `
  You are an academic monitoring assistant. Analyze the attendance and participation logs for THIS SPECIFIC consultation ID ${conID} ONLY. Do not consider any other consultations, historical data, or general knowledge. Focus solely on the provided data for this consultation.

  Consultation Details: ${JSON.stringify(consultation)}
  Group Members: ${groupMembers.length > 0 ? groupMembers.join(', ') : "No group members found."}
  Absent Members: ${absentMembers.length > 0 ? absentMembers.join(', ') : "All members present."}
  Attendance Data: ${attendance && attendance.length > 0 ? JSON.stringify(attendance) : "No attendance data logged."}
  Participation Data: ${participation && participation.length > 0 ? JSON.stringify(participation) : "No participation data logged."}

  Reporting Guidelines:
  - DO NOT use markdown symbols (no #, no *, no **).
  - Use plain text formatting only.
  - Refer to the students as "the group."
  - Maintain a formal, analytical tone.
  - Keep the total length under 200 words.
  - Explicitly mention the names of present and absent members in your analysis.
  - Use the following sections with distinct focuses to avoid redundancy:
    ENGAGEMENT OVERVIEW: Provide a high-level summary of group engagement, including who was present and who was absent by name.
    ATTENDANCE ISSUES: Detail specific attendance problems, listing absent members and potential impacts.
    PARTICIPATION FEEDBACK: Analyze participation quality for present members, noting any disparities or highlights.
`;

    const result = await model.generateContent(prompt);
    res.json({ insight: result.response.text() });
  } catch (err: any) {
    console.error("AI SDK ERROR:", err.message);
    res.status(500).json({ error: "AI service failed: " + err.message });
  }
}

  handleCustomAnalysis = async (req: any, res: any) => {
    try {
      const { courseId, instruction } = req.body;
      
      // Validate input
      if (!courseId || !instruction || instruction.trim().length === 0) {
        return res.status(400).json({ error: "Course ID and instruction are required." });
      }

      // Get consultation data for the course
      const { data: consultations, error } = await db.from('ss_consultation').select('*').eq('courseID', Number(courseId));
      
      if (error) {
        console.error("Database error:", error);
        return res.status(500).json({ error: "Failed to retrieve consultation data." });
      }

      if (!consultations || consultations.length === 0) {
        return res.status(404).json({ error: "No relevant consultation data available." });
      }

      // Sanitize PII from the data
      const sanitizedData = this.sanitize(consultations);

      const model = genAI.getGenerativeModel({ model: "models/gemini-2.5-flash" });

      const prompt = `
You are an academic monitoring assistant providing advisory analysis for course-level insights.

INSTRUCTION: ${instruction}

CONSULTATION DATA: ${JSON.stringify(sanitizedData)}

IMPORTANT GUIDELINES:
- Focus only on the provided consultation data for this course
- Provide advisory insights only - do not make authoritative decisions
- Maintain academic professionalism and objectivity
- Structure your response clearly with appropriate headings
- Keep analysis under 500 words
- If data is insufficient for the instruction, clearly state this limitation

Please provide your analysis based on the instruction and available data.
`;

      // Set timeout for the AI request (25 seconds as per requirements)
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Analysis timed out.')), 25000);
      });

      const analysisPromise = model.generateContent(prompt);
      
      const result = await Promise.race([analysisPromise, timeoutPromise]);
      const cleanedAnalysis = this.cleanMarkdown(result.response.text());
      res.json({ analysis: cleanedAnalysis });
      
    } catch (err: any) {
      console.error("Custom analysis error:", err);
      if (err.message === 'Analysis timed out.') {
        return res.status(408).json({ error: "Analysis timed out. Please refine instruction." });
      }
      res.status(500).json({ error: "Analysis failed. Please try again." });
    }
  }

  private sanitize = (data: any[]): any[] => {
    return data.map(consultation => {
      // Remove or anonymize potentially sensitive information
      const sanitized = { ...consultation };
      
      // Remove any direct PII fields if they exist
      // Note: Based on current schema, consultations don't contain direct PII
      // but this method is ready for future PII sanitization needs
      
      // Ensure group names are generic if needed
      if (sanitized.groupName) {
        // Keep group names as they are for analysis purposes
        // Could anonymize to "Group A", "Group B" etc. if needed
      }
      
      return sanitized;
    });
  }

  private cleanMarkdown = (text: string): string => {
    return text
      // Remove bold/italic markdown (**text** and *text*)
      .replace(/\*\*(.*?)\*\*/g, '$1')
      .replace(/\*(.*?)\*/g, '$1')
      // Remove headers (# ## ###)
      .replace(/^#+\s*/gm, '')
      // Remove bullet points (- or *)
      .replace(/^[-*]\s*/gm, '')
      // Remove numbered lists (1. 2. etc.)
      .replace(/^\d+\.\s*/gm, '')
      // Clean up extra whitespace
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  handleListModels = async (req: any, res: any) => {
  try {
    // In SDK 0.24.1, we often fetch models via a request to the API base
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${process.env.GEMINI_API_KEY}`);
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: "Cannot reach model registry" });
  }
}
}