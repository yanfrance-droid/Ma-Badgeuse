import { Router, Request, Response } from 'express';
import { getGlobalCockpitSummary, getAnnualCockpitSummary, getCurrentSchoolYearStart } from '../services/hoursService';

export const summaryRouter = Router();

/**
 * GET /api/summary/annual?start_year=YYYY
 * Renvoie le bilan annuel scolaire (Septembre à Août) avec décompte du quota d'heures
 */
summaryRouter.get('/annual', async (req: Request, res: Response) => {
  try {
    const userId = req.userId || 1;
    const defaultStartYear = getCurrentSchoolYearStart(new Date());
    const startYear = req.query.start_year ? parseInt(req.query.start_year as string, 10) : defaultStartYear;
    const summary = await getAnnualCockpitSummary(userId, isNaN(startYear) ? defaultStartYear : startYear);
    res.json({ success: true, data: summary });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/summary?month=YYYY-MM
 * Renvoie les métriques pour la Vignette Phare (Positif, Négatif, Bilan du mois, Stats)
 */
summaryRouter.get('/', async (req: Request, res: Response) => {
  try {
    const userId = req.userId || 1;
    const now = new Date();
    const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const month = (req.query.month as string) || defaultMonth;
    const summary = await getGlobalCockpitSummary(userId, month);
    res.json({ success: true, data: summary });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});
