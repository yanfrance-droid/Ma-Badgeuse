import { Router } from 'express';
import { asyncHandler, requireUserId } from '../http';
import { getUserSettings, saveUserSettings } from '../services/settingsService';

export const settingsRouter = Router();

/** GET /api/settings — réglages du compte connecté, complétés par les valeurs par défaut. */
settingsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    res.json({ success: true, data: await getUserSettings(requireUserId(req)) });
  })
);

/** POST /api/settings — seuls les réglages connus sont acceptés, chacun contrôlé. */
settingsRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    res.json({ success: true, data: await saveUserSettings(requireUserId(req), req.body) });
  })
);
