import { google } from 'googleapis';
import { pool } from './db.js';
import 'dotenv/config';
export class GoogleDocsService {
    static async archiveConsultation(data, userEmail) {
        try {
            // 1. Get course details using pool
            const { rows: courses } = await pool.query('SELECT * FROM ss_courses WHERE id = $1', [data.courseID]);
            const course = courses[0];
            if (!course)
                throw new Error("Course not found");
            // 2. Setup Google Auth
            const { rows: accounts } = await pool.query('SELECT "googleAccessToken" FROM ss_account WHERE "accountEmail" = $1', [userEmail]);
            const accessToken = accounts[0]?.googleAccessToken;
            if (!accessToken)
                throw new Error("No Google token found for user");
            const auth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET);
            auth.setCredentials({ access_token: accessToken });
            const docs = google.docs({ version: 'v1', auth });
            const drive = google.drive({ version: 'v3', auth });
            let docId = course.courseSheetUrl; // Using this column as doc link for now
            if (!docId || !docId.includes('docs.google.com')) {
                // Create new document if none exists
                const res = await docs.documents.create({
                    requestBody: { title: `ScholarSync Archive: ${course.courseName} (${course.courseCode})` }
                });
                docId = res.data.documentId;
                // Save docId back to course
                await pool.query('UPDATE ss_courses SET "courseSheetUrl" = $1 WHERE id = $2', [docId, course.id]);
            }
            else {
                // Extract ID from URL if stored as URL
                const match = docId.match(/\/d\/(.*?)\//);
                if (match)
                    docId = match[1];
            }
            // 3. Append content
            const content = `
--- CONSULTATION RECORD ---
Date: ${data.conDate}
Type: ${data.conType}
Group: ${data.groupName}
Milestone: ${data.conMil}
Summary: ${data.conSum}
Action: ${data.conAction}
Status: ${data.conStat}
---------------------------
\n`;
            await docs.documents.batchUpdate({
                documentId: docId,
                requestBody: {
                    requests: [{
                            insertText: {
                                location: { index: 1 },
                                text: content
                            }
                        }]
                }
            });
            console.log(`Archived consultation ${data.conID} to doc ${docId}`);
            return docId;
        }
        catch (err) {
            console.error("GOOGLE DOCS ARCHIVE ERROR:", err.message);
            throw err;
        }
    }
    static async exportToDoc(courseId, userEmail) {
        // Logic for exporting all records to a new doc
        return { success: true };
    }
}
//# sourceMappingURL=googleDocsService.js.map