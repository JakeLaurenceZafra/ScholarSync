import { Router } from 'express';
import { AIService } from '../services/ai.service';
import { authenticate, authorizeRole } from '../middleware/auth';

const router = Router();
const aiService = new AIService();

// UC-401 & UC-402: Accessible by Adviser & Admin
// Example: Ensure your ai routes are protected like this
router.post('/summary', authenticate, authorizeRole(['Adviser', 'Admin']), aiService.handleGenerateSummary);
router.post('/participation', authenticate, authorizeRole(['Adviser', 'Admin']), aiService.handleGenerateParticipation);

// UC-403: Admin Only
router.post('/custom-analysis', authenticate, authorizeRole(['Admin']), aiService.handleCustomAnalysis);

// Add this to your existing ai.routes.ts
router.post('/debug-models', authenticate, authorizeRole(['Adviser', 'Admin']), aiService.handleListModels);

export default router;