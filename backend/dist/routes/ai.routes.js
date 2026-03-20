import { Router } from 'express';
import { AIService } from '../services/ai.service.js';
import { authenticate, authorizeRole } from '../middleware/auth.js';
const router = Router();
const aiService = new AIService();
router.post('/summary', authenticate, authorizeRole(['Adviser', 'Admin']), aiService.handleGenerateSummary);
router.post('/participation', authenticate, authorizeRole(['Adviser', 'Admin']), aiService.handleGenerateParticipation);
router.post('/custom-analysis', authenticate, authorizeRole(['Admin']), aiService.handleCustomAnalysis);
export default router;
//# sourceMappingURL=ai.routes.js.map