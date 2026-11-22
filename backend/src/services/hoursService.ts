import { db } from '../database';
import { AnnualCockpitSummary, AnnualMonthItem, DailyEntry, GlobalCockpitSummary, MonthSummary } from '../types';

/**
 * Convertit 'HH:mm' en minutes depuis minuit
 */
export function timeToMinutes(timeStr: string): number {
  if (!timeStr) return 0;
  const [hours, minutes] = timeStr.split(':').map(Number);
  return (hours || 0) * 60 + (minutes || 0);
}

/**
 * Calcule la durée travaillée en heures (décimales) avec gestion propre du passage de minuit
 */
export function computeActualHours(
  startTime: string | null,
  endTime: string | null,
  breakMinutes: number = 0
): number {
  if (!startTime || !endTime) return 0;

  const startMin = timeToMinutes(startTime);
  const endMin = timeToMinutes(endTime);

  let durationMin = 0;
  if (endMin >= startMin) {
    durationMin = endMin - startMin;
  } else {
    // Cas de nuit ou franchissement de minuit
    durationMin = 24 * 60 - startMin + endMin;
  }

  const effectiveMin = Math.max(0, durationMin - (breakMinutes || 0));
  // Arrondi à 2 décimales
  return Math.round((effectiveMin / 60) * 100) / 100;
}

/**
 * Calcule l'écart journalier en tenant compte du statut et de sa règle comptable
 */
export function computeDailyDelta(
  entry: {
    expected_hours: number;
    actual_hours: number;
    accounting_rule?: string;
  },
  isUnworkedFuture: boolean = false
): { delta: number; positive: number; negative: number } {
  // Une journée future non travaillée et non déclarée n'engendre aucune dette prématurée
  if (isUnworkedFuture) {
    return { delta: 0, positive: 0, negative: 0 };
  }

  const expected = Number(entry.expected_hours || 0);
  const actual = Number(entry.actual_hours || 0);
  const rule = entry.accounting_rule;

  // 1. Règle NEUTRAL (ex: Jour de repos, jour à 0h, congé sans dette)
  if (rule === 'NEUTRAL') {
    const delta = actual > 0 ? actual : 0;
    return { delta, positive: delta, negative: 0 };
  }

  // 2. Règle MAINTAINED (ex: Congé payé, Arrêt maladie avec maintien de salaire)
  // Les heures attendues sont réputées faites : aucun passif (delta négatif = 0)
  if (rule === 'MAINTAINED') {
    const effectiveActual = Math.max(actual, expected);
    const delta = Math.round((effectiveActual - expected) * 100) / 100;
    return { delta, positive: delta > 0 ? delta : 0, negative: 0 };
  }

  // 3. Règle DEDUCTED (ex: Absence non rémunérée / à rattraper)
  if (rule === 'DEDUCTED') {
    const delta = Math.round((actual - expected) * 100) / 100;
    return { delta, positive: delta > 0 ? delta : 0, negative: delta < 0 ? Math.abs(delta) : 0 };
  }

  // Écart réel direct sans distorsion
  const delta = Math.round((actual - expected) * 100) / 100;
  const positive = delta > 0 ? delta : 0;
  const negative = delta < 0 ? Math.abs(delta) : 0;

  return { delta, positive, negative };
}

/**
 * Calcule le cockpit global :
 * - Solde Positif total (Persistance infinie)
 * - Solde Négatif total (Persistance infinie)
 * - Aucune fusion / Zéro compensation automatique
 * - Bilan du mois en cours
 * - Décompte des jours (au-dessus / en-dessous / neutres)
 */
export async function getGlobalCockpitSummary(userId: number = 1, targetYearMonth?: string): Promise<GlobalCockpitSummary> {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const todayStr = `${y}-${m}-${d}`;
  const defaultYm = `${y}-${m}`;
  const currentYm = targetYearMonth || defaultYm;

  // 1. Récupération de tous les pointages de l'utilisateur avec les règles comptables associées
  const entries = await db.all<any>(`
    SELECT 
      d.*,
      s.accounting_rule,
      s.label as status_label,
      s.color_hex as status_color
    FROM daily_entries d
    LEFT JOIN status_catalog s ON d.status_id = s.id
    WHERE d.user_id = ?
  `, [userId]);

  // 2. Récupération de toutes les régularisations dont la date d'effet est atteinte (<= aujourd'hui)
  const regularizations = await db.all<any>(`
    SELECT counter_type, COALESCE(operation_type, 'SETTLE') as operation_type, amount_hours
    FROM regularizations
    WHERE user_id = ? AND reg_date <= ?
  `, [userId, todayStr]);

  let netRegPositive = 0;
  let netRegNegative = 0;
  for (const reg of regularizations) {
    const isAdd = reg.operation_type === 'ADD';
    const amt = Number(reg.amount_hours || 0);
    if (reg.counter_type === 'POSITIVE') {
      if (isAdd) {
        netRegPositive += amt;
      } else {
        netRegPositive -= amt;
      }
    } else if (reg.counter_type === 'NEGATIVE') {
      if (isAdd) {
        netRegNegative += amt;
      } else {
        netRegNegative -= amt;
      }
    }
  }

  // 3. Calculs des cumuls historiques globaux (Indépendance absolue)
  let sumPositiveAllTime = 0;
  let sumNegativeAllTime = 0;

  // Calculs spécifiques au mois ciblé
  let monthExpected = 0;
  let monthActual = 0;
  let monthPositiveDelta = 0;
  let monthNegativeDelta = 0;

  let countAbove = 0;
  let countBelow = 0;
  let countExact = 0;
  let countZeroOrAbsent = 0;
  let totalMonthDays = 0;

  for (const row of entries) {
    const isFuture = Boolean(row.entry_date && row.entry_date > todayStr);
    const isUnworkedFuture = isFuture && Number(row.actual_hours || 0) === 0 && !row.status_id;

    const { delta, positive, negative } = computeDailyDelta(row, isUnworkedFuture);

    // Les journées futures non encore travaillées ne gonflent pas la dette
    if (!isUnworkedFuture) {
      sumPositiveAllTime += positive;
      sumNegativeAllTime += negative;
    }

    // Si l'entrée appartient au mois analysé
    if (row.entry_date && row.entry_date.startsWith(currentYm)) {
      totalMonthDays++;
      monthExpected += Number(row.expected_hours || 0);
      monthActual += Number(row.actual_hours || 0);
      monthPositiveDelta += positive;
      monthNegativeDelta += negative;

      if (delta > 0) countAbove++;
      else if (delta < 0) countBelow++;
      else if (Number(row.expected_hours || 0) === 0 && Number(row.actual_hours || 0) === 0) countZeroOrAbsent++;
      else countExact++;
    }
  }

  // 4. Objectif mensuel contractuel
  const targetRow = await db.get<any>(`
    SELECT target_hours, is_validated, validated_at 
    FROM monthly_targets 
    WHERE user_id = ? AND year_month = ?
  `, [userId, currentYm]);

  let monthlyTargetHours = 120;
  if (targetRow && targetRow.target_hours !== undefined) {
    monthlyTargetHours = Number(targetRow.target_hours);
  } else {
    // Consulter le paramètre de l'utilisateur ou par défaut
    const userSetting = await db.get<any>(`
      SELECT setting_value FROM user_settings WHERE user_id = ? AND setting_key = 'default_monthly_target'
    `, [userId]);
    if (userSetting && userSetting.setting_value) {
      monthlyTargetHours = parseFloat(userSetting.setting_value) || 120;
    } else {
      const defaultSetting = await db.get<any>(`
        SELECT setting_value FROM app_settings WHERE setting_key = 'default_monthly_target'
      `);
      if (defaultSetting && defaultSetting.setting_value) {
        monthlyTargetHours = parseFloat(defaultSetting.setting_value) || 120;
      }
    }
  }

  // Soldes bruts cumulés après régularisations manuelles (ajouts ou déductions)
  const grossPositive = Math.max(0, Math.round((sumPositiveAllTime + netRegPositive) * 100) / 100);
  const grossNegative = Math.max(0, Math.round((sumNegativeAllTime + netRegNegative) * 100) / 100);

  // LOGIQUE DE RATTRAPAGE DIRECT & COMPENSATION RECHERCHÉE PAR L'UTILISATEUR :
  // Les heures supplémentaires effectuées compensent directement les heures dues à l'employeur.
  // Exemple : Si l'agent doit 4h et fait 6h sup, la dette s'éteint (0h due) et le solde sup passe à +2h.
  let totalPositiveBalance = 0;
  let totalNegativeBalance = 0;

  if (grossPositive >= grossNegative) {
    totalPositiveBalance = Math.round((grossPositive - grossNegative) * 100) / 100;
    totalNegativeBalance = 0;
  } else {
    totalPositiveBalance = 0;
    totalNegativeBalance = Math.round((grossNegative - grossPositive) * 100) / 100;
  }

  const monthSummary: MonthSummary = {
    year_month: currentYm,
    target_hours: Math.round(monthlyTargetHours * 100) / 100,
    expected_hours: Math.round(monthExpected * 100) / 100,
    actual_hours: Math.round(monthActual * 100) / 100,
    delta_hours: Math.round((monthActual - monthExpected) * 100) / 100,
    positive_delta: Math.round(monthPositiveDelta * 100) / 100,
    negative_delta: Math.round(monthNegativeDelta * 100) / 100,
    is_validated: Boolean(targetRow?.is_validated),
    validated_at: targetRow?.validated_at || null
  };

  return {
    total_positive_balance: totalPositiveBalance,
    total_negative_balance: totalNegativeBalance,
    gross_positive_hours: grossPositive,
    gross_negative_hours: grossNegative,
    current_month: monthSummary,
    days_counts: {
      above_quota: countAbove,
      below_quota: countBelow,
      exact_quota: countExact,
      zero_or_absent: countZeroOrAbsent,
      total_days: totalMonthDays
    }
  };
}

/**
 * Détermine l'année de rentrée scolaire (Septembre Y à Août Y+1) pour une date donnée
 */
export function getCurrentSchoolYearStart(date: Date = new Date()): number {
  const year = date.getFullYear();
  const month = date.getMonth() + 1; // 1 to 12
  // De Septembre (9) à Décembre (12) -> début = year
  // De Janvier (1) à Août (8) -> début = year - 1
  return month >= 9 ? year : year - 1;
}

const FRENCH_MONTH_NAMES: Record<string, string> = {
  '01': 'Janvier',
  '02': 'Février',
  '03': 'Mars',
  '04': 'Avril',
  '05': 'Mai',
  '06': 'Juin',
  '07': 'Juillet',
  '08': 'Août',
  '09': 'Septembre',
  '10': 'Octobre',
  '11': 'Novembre',
  '12': 'Décembre',
};

/**
 * Calcule le bilan annuel scolaire complet (Septembre à Août) avec décompte du quota d'heures
 */
export async function getAnnualCockpitSummary(userId: number = 1, startYear: number): Promise<AnnualCockpitSummary> {
  const endYear = startYear + 1;
  const schoolYearLabel = `${startYear} - ${endYear}`;
  const startMonth = `${startYear}-09`;
  const endMonth = `${endYear}-08`;

  // 1. Récupération du quota d'heures annuelles pour cet utilisateur
  let annualContractHours = 800;
  const userSettingRow = await db.get<any>(`
    SELECT setting_value FROM user_settings WHERE user_id = ? AND setting_key = 'annual_target_hours'
  `, [userId]);
  if (userSettingRow && userSettingRow.setting_value) {
    const val = parseFloat(userSettingRow.setting_value);
    if (!isNaN(val) && val > 0) annualContractHours = val;
  } else {
    const settingRow = await db.get<any>(`
      SELECT setting_value FROM app_settings WHERE setting_key = 'annual_target_hours'
    `);
    if (settingRow && settingRow.setting_value) {
      const val = parseFloat(settingRow.setting_value);
      if (!isNaN(val) && val > 0) annualContractHours = val;
    }
  }

  // Objectif mensuel par défaut
  let defaultMonthlyTarget = 120;
  const userDefMonth = await db.get<any>(`
    SELECT setting_value FROM user_settings WHERE user_id = ? AND setting_key = 'default_monthly_target'
  `, [userId]);
  if (userDefMonth && userDefMonth.setting_value) {
    const val = parseFloat(userDefMonth.setting_value);
    if (!isNaN(val) && val > 0) defaultMonthlyTarget = val;
  } else {
    const defMonthRow = await db.get<any>(`
      SELECT setting_value FROM app_settings WHERE setting_key = 'default_monthly_target'
    `);
    if (defMonthRow && defMonthRow.setting_value) {
      const val = parseFloat(defMonthRow.setting_value);
      if (!isNaN(val) && val > 0) defaultMonthlyTarget = val;
    }
  }

  // 2. Générer la liste des 12 mois de septembre à août
  const monthKeys: string[] = [];
  for (let m = 9; m <= 12; m++) {
    monthKeys.push(`${startYear}-${String(m).padStart(2, '0')}`);
  }
  for (let m = 1; m <= 8; m++) {
    monthKeys.push(`${endYear}-${String(m).padStart(2, '0')}`);
  }

  // 3. Récupérer toutes les entrées de la période pour cet utilisateur
  const entries = await db.all<any>(`
    SELECT 
      d.*,
      s.accounting_rule,
      s.is_default_absence
    FROM daily_entries d
    LEFT JOIN status_catalog s ON d.status_id = s.id
    WHERE d.user_id = ? AND d.entry_date >= ? AND d.entry_date <= ?
    ORDER BY d.entry_date ASC
  `, [userId, `${startYear}-09-01`, `${endYear}-08-31`]);

  // 4. Récupérer les cibles mensuelles configurées pour cet utilisateur
  const targets = await db.all<any>(`
    SELECT year_month, target_hours, is_validated
    FROM monthly_targets
    WHERE user_id = ? AND year_month >= ? AND year_month <= ?
  `, [userId, startMonth, endMonth]);
  const targetsMap = new Map<string, { target_hours: number; is_validated: number }>();
  for (const t of targets) {
    targetsMap.set(t.year_month, {
      target_hours: Number(t.target_hours),
      is_validated: Number(t.is_validated)
    });
  }

  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  // 5. Construire le bilan par mois
  const monthItems: AnnualMonthItem[] = [];
  let totalWorkedHours = 0;
  let totalExpectedHours = 0;
  let totalTargetHours = 0;
  let totalWorkedDays = 0;
  let totalAbsenceDays = 0;
  let totalPositiveDelta = 0;
  let totalNegativeDelta = 0;

  for (const ym of monthKeys) {
    const [yStr, mStr] = ym.split('-');
    const mName = `${FRENCH_MONTH_NAMES[mStr] || mStr} ${yStr}`;
    const targetInfo = targetsMap.get(ym);
    const targetH = targetInfo ? targetInfo.target_hours : defaultMonthlyTarget;
    const isValidated = targetInfo ? Boolean(targetInfo.is_validated) : false;

    let mExpected = 0;
    let mActual = 0;
    let mPos = 0;
    let mNeg = 0;
    let mWorkedDays = 0;
    let mAbsenceDays = 0;

    const monthEntries = entries.filter((e) => e.entry_date && e.entry_date.startsWith(ym));

    for (const row of monthEntries) {
      const isFuture = Boolean(row.entry_date && row.entry_date > todayStr);
      const isUnworkedFuture = isFuture && Number(row.actual_hours || 0) === 0 && !row.status_id;

      const { delta, positive, negative } = computeDailyDelta(row, isUnworkedFuture);

      mExpected += Number(row.expected_hours || 0);
      mActual += Number(row.actual_hours || 0);
      mPos += positive;
      mNeg += negative;

      if (Number(row.actual_hours || 0) > 0) {
        mWorkedDays++;
      }
      if (row.status_id) {
        mAbsenceDays++;
      }
    }

    const mDelta = Math.round((mActual - mExpected) * 100) / 100;
    const roundedActual = Math.round(mActual * 100) / 100;
    const roundedExpected = Math.round(mExpected * 100) / 100;
    const roundedPos = Math.round(mPos * 100) / 100;
    const roundedNeg = Math.round(mNeg * 100) / 100;

    monthItems.push({
      year_month: ym,
      month_name: mName,
      target_hours: targetH,
      expected_hours: roundedExpected,
      actual_hours: roundedActual,
      delta_hours: mDelta,
      positive_delta: roundedPos,
      negative_delta: roundedNeg,
      worked_days: mWorkedDays,
      absence_days: mAbsenceDays,
      is_validated: isValidated
    });

    totalWorkedHours += roundedActual;
    totalExpectedHours += roundedExpected;
    totalTargetHours += targetH;
    totalWorkedDays += mWorkedDays;
    totalAbsenceDays += mAbsenceDays;
    totalPositiveDelta += roundedPos;
    totalNegativeDelta += roundedNeg;
  }

  totalWorkedHours = Math.round(totalWorkedHours * 100) / 100;
  totalExpectedHours = Math.round(totalExpectedHours * 100) / 100;
  totalTargetHours = Math.round(totalTargetHours * 100) / 100;
  totalPositiveDelta = Math.round(totalPositiveDelta * 100) / 100;
  totalNegativeDelta = Math.round(totalNegativeDelta * 100) / 100;

  // Décompte par rapport au quota d'heures annuel
  const remainingContractHours = Math.max(0, Math.round((annualContractHours - totalWorkedHours) * 100) / 100);
  const overtimeContractHours = Math.max(0, Math.round((totalWorkedHours - annualContractHours) * 100) / 100);
  const progressPercent = annualContractHours > 0
    ? Math.min(100, Math.round((totalWorkedHours / annualContractHours) * 1000) / 10)
    : 100;

  return {
    school_year: schoolYearLabel,
    start_year: startYear,
    end_year: endYear,
    start_month: startMonth,
    end_month: endMonth,
    annual_contract_hours: annualContractHours,
    total_worked_hours: totalWorkedHours,
    total_expected_hours: totalExpectedHours,
    total_target_hours: totalTargetHours,
    remaining_contract_hours: remainingContractHours,
    overtime_contract_hours: overtimeContractHours,
    progress_percent: progressPercent,
    total_worked_days: totalWorkedDays,
    total_absence_days: totalAbsenceDays,
    total_positive_delta: totalPositiveDelta,
    total_negative_delta: totalNegativeDelta,
    months: monthItems
  };
}
