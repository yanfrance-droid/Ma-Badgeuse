import { Router } from 'express';
import { getGlobalCockpitSummary, getAnnualCockpitSummary, getCurrentSchoolYearStart } from '../services/hoursService';
import { asyncHandler, localYearMonth, requireInteger, requireUserId, requireYearMonth } from '../http';

export const summaryRouter = Router();

/** GET /api/summary/annual?start_year=AAAA — bilan de l'année scolaire (septembre à août). */
summaryRouter.get(
  '/annual',
  asyncHandler(async (req, res) => {
    const userId = requireUserId(req);
    const startYear = req.query.start_year === undefined
      ? getCurrentSchoolYearStart(new Date())
      : requireInteger(req.query.start_year, "L'année scolaire", 2000, 2100);
    res.json({ success: true, data: await getAnnualCockpitSummary(userId, startYear) });
  })
);

/** GET /api/summary?month=AAAA-MM — compteurs et bilan du mois. */
summaryRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const userId = requireUserId(req);
    const month = req.query.month === undefined ? localYearMonth() : requireYearMonth(req.query.month, 'Le mois');
    res.json({ success: true, data: await getGlobalCockpitSummary(userId, month) });
  })
);
