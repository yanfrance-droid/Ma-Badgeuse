import React, { useEffect, useRef, useState } from 'react';
import {
  AbsenceImpact,
  AnnualCockpitSummary,
  AuditLogItem,
  CockpitSummary,
  DailyEntry,
  PeriodItem,
  RegularizationItem,
  StatusItem,
  User,
  UserSettings
} from '../types';
import {
  apiLogout,
  createPeriod,
  createRegularization,
  deleteEntry,
  deletePeriod,
  deleteRegularization,
  fetchAnnualSummary,
  fetchAuditLogs,
  fetchEntries,
  fetchPeriods,
  fetchRegularizations,
  fetchSettings,
  fetchStatuses,
  fetchSummary,
  saveEntry,
  saveSettings,
  triggerResetMyData,
  triggerUndo,
  unvalidateMonth,
  updateMonthlyTarget,
  validateMonth
} from '../api';
import { notify } from '../components/Toaster';
import { formatDuration, formatPlanningHours, parsePlanningHours } from '../utils/format';
import { formatDateFrench, formatMonthLabel, getCurrentSchoolYearStart, getLocalDateStr, getLocalMonthStr } from '../utils/dates';
import {
  DEFAULT_REASON,
  DEFAULT_SCHEDULE,
  EMPTY_PROFILE,
  HabitualSchedule,
  LoadState,
  PeriodFormState,
  Profile,
  SettingsTab,
  errorMessage,
  findReason,
  impactOfEntry,
  isDayOff,
  makePeriodForm,
  noteWithoutReason,
  reasonOfEntry
} from '../domain';
import { buildShareMessage } from '../utils/shareMessage';
import type { ThemeControls } from './useTheme';
import { useReminders } from './useReminders';

/**
 * État et actions de l'espace connecté : chargement du mois, formulaire du jour,
 * compteurs, objectifs, réglages, périodes, transmission et rappels.
 * Les écrans reçoivent l'objet retourné (`WorkspaceModel`) et n'en lisent que ce dont ils ont besoin.
 */
export function useWorkspace(currentUser: User, theme: ThemeControls) {
  const todayStr = getLocalDateStr();
  const todayMonth = getLocalMonthStr();

  // Données du mois
  const [currentMonth, setCurrentMonth] = useState<string>(todayMonth);
  const [summary, setSummary] = useState<CockpitSummary | null>(null);
  const [entries, setEntries] = useState<DailyEntry[]>([]);
  const [statuses, setStatuses] = useState<StatusItem[]>([]);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const monthRequestRef = useRef(0);
  const annualRequestRef = useRef(0);

  // Réglages du compte (stockés sur le serveur)
  const [settingsLoaded, setSettingsLoaded] = useState<boolean>(false);
  const [habitualSchedule, setHabitualSchedule] = useState<HabitualSchedule>(DEFAULT_SCHEDULE);
  const [habitualForm, setHabitualForm] = useState<HabitualSchedule>(DEFAULT_SCHEDULE);
  const [profile, setProfile] = useState<Profile>(EMPTY_PROFILE);
  const [profileForm, setProfileForm] = useState<Profile>(EMPTY_PROFILE);
  const [savingHabitual, setSavingHabitual] = useState<boolean>(false);

  // Fenêtre des réglages
  const [showSettingsModal, setShowSettingsModal] = useState<boolean>(false);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('SCHEDULE');
  const [resetConfirmationInput, setResetConfirmationInput] = useState<string>('');
  const [isResetting, setIsResetting] = useState<boolean>(false);
  const [auditLogs, setAuditLogs] = useState<AuditLogItem[]>([]);
  const [loadingAudit, setLoadingAudit] = useState<boolean>(false);

  // Transmission
  const [showShareModal, setShowShareModal] = useState<boolean>(false);
  const [showMoreMenu, setShowMoreMenu] = useState<boolean>(false);
  const [copiedShare, setCopiedShare] = useState<boolean>(false);

  // Pointage rapide
  const [quickBadgingToday, setQuickBadgingToday] = useState<boolean>(false);
  const pendingQuickBadge = useRef<string | null>(null);

  // Bilan annuel (septembre à août)
  const [showAnnualModal, setShowAnnualModal] = useState<boolean>(false);
  const [annualSummary, setAnnualSummary] = useState<AnnualCockpitSummary | null>(null);
  const [annualStartYear, setAnnualStartYear] = useState<number>(() => getCurrentSchoolYearStart(new Date()));
  const [annualTargetStr, setAnnualTargetStr] = useState<string>('800h');
  const [isEditingAnnualTarget, setIsEditingAnnualTarget] = useState<boolean>(false);
  const [isSavingAnnualTarget, setIsSavingAnnualTarget] = useState<boolean>(false);
  const [printMode, setPrintMode] = useState<'MONTHLY' | 'ANNUAL'>('MONTHLY');

  // Objectif du mois et régularisations
  const [monthlyTargetInput, setMonthlyTargetInput] = useState<number>(0);
  const [targetInputStr, setTargetInputStr] = useState<string>('');
  const [savingTarget, setSavingTarget] = useState<boolean>(false);
  const [regularizationsList, setRegularizationsList] = useState<RegularizationItem[]>([]);
  const [showAllRegularizations, setShowAllRegularizations] = useState<boolean>(false);

  // Saisie d'une journée
  const [selectedDate, setSelectedDate] = useState<string>(todayStr);
  const [editingEntryDate, setEditingEntryDate] = useState<string | null>(null);
  const formSectionRef = useRef<HTMLElement>(null);
  const [dayType, setDayType] = useState<'WORKED' | 'ABSENT'>('WORKED');
  const [expectedHours, setExpectedHours] = useState<number>(DEFAULT_SCHEDULE.expectedHours);
  const [startTime, setStartTime] = useState<string>(DEFAULT_SCHEDULE.startTime);
  const [endTime, setEndTime] = useState<string>(DEFAULT_SCHEDULE.endTime);
  const [breakMinutes, setBreakMinutes] = useState<number>(DEFAULT_SCHEDULE.breakMinutes);
  const [absenceReasonId, setAbsenceReasonId] = useState<string>(DEFAULT_REASON.id);
  const [absenceImpact, setAbsenceImpact] = useState<AbsenceImpact>(DEFAULT_REASON.defaultImpact);
  const [absenceHours, setAbsenceHours] = useState<number>(DEFAULT_SCHEDULE.expectedHours);
  const [notes, setNotes] = useState<string>('');
  const [savingDay, setSavingDay] = useState<boolean>(false);

  // Ajustement de compteur (règlement ou ajout)
  const [settleModal, setSettleModal] = useState<{
    isOpen: boolean;
    type: 'POSITIVE' | 'NEGATIVE';
    operation: 'SETTLE' | 'ADD';
    totalDue: number;
    amountToSettle: number;
    reason: string;
    date: string;
  }>({
    isOpen: false,
    type: 'POSITIVE',
    operation: 'SETTLE',
    totalDue: 0,
    amountToSettle: 0,
    reason: '',
    date: todayStr
  });

  // Périodes multi-jours
  const [showPeriodModal, setShowPeriodModal] = useState<boolean>(false);
  const [periodForm, setPeriodForm] = useState<PeriodFormState>(() => makePeriodForm(todayStr, todayStr));
  const [savingPeriod, setSavingPeriod] = useState<boolean>(false);
  const [periods, setPeriods] = useState<PeriodItem[]>([]);

  // ===================== SESSION =====================

  const handleLogout = async () => {
    if (!window.confirm(`Se déconnecter du compte « ${currentUser?.display_name || currentUser?.username} » ?`)) return;
    await apiLogout();
    // Recharger la page efface tout l'état affiché du compte précédent.
    window.location.reload();
  };

  const isActiveUser = Boolean(currentUser && !currentUser.must_change_password);

  // ===================== CHARGEMENTS =====================

  const applySettings = (st: UserSettings) => {
    const schedule: HabitualSchedule = {
      startTime: st.habitual_start_time,
      endTime: st.habitual_end_time,
      breakMinutes: Number(st.habitual_break_minutes) || 0,
      expectedHours: Number(st.habitual_expected_hours) || 0
    };
    setHabitualSchedule(schedule);
    setHabitualForm(schedule);
    const nextProfile: Profile = {
      agentName: st.agent_name,
      employerName: st.employer_name,
      jobTitle: st.job_title,
      managerPhone: st.manager_phone,
      managerEmail: st.manager_email
    };
    setProfile(nextProfile);
    setProfileForm(nextProfile);
  };

  useEffect(() => {
    if (!isActiveUser) return;
    let cancelled = false;
    fetchSettings()
      .then((st) => {
        if (!cancelled) applySettings(st);
      })
      .catch((err) => notify(`Réglages non chargés : ${errorMessage(err)}`, 'error'))
      .finally(() => {
        if (!cancelled) setSettingsLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [isActiveUser]);

  const loadAnnualData = async (startYear: number = annualStartYear) => {
    const requestId = ++annualRequestRef.current;
    try {
      const data = await fetchAnnualSummary(startYear);
      if (requestId !== annualRequestRef.current) return;
      setAnnualSummary(data);
      setAnnualTargetStr(formatPlanningHours(data.annual_contract_hours));
    } catch (err) {
      if (requestId === annualRequestRef.current) notify(`Bilan annuel non chargé : ${errorMessage(err)}`, 'error');
    }
  };

  const loadMonthData = async () => {
    if (!isActiveUser) return;
    // Seule la réponse de la dernière demande est affichée (changement de mois rapide).
    const requestId = ++monthRequestRef.current;
    setLoadState('loading');
    try {
      const [sum, ent, stat, regs] = await Promise.all([
        fetchSummary(currentMonth),
        fetchEntries(currentMonth),
        fetchStatuses(),
        fetchRegularizations()
      ]);
      if (requestId !== monthRequestRef.current) return;
      setSummary(sum);
      setEntries(ent);
      setStatuses(stat);
      setRegularizationsList(regs);
      setMonthlyTargetInput(sum.current_month.target_hours);
      setTargetInputStr(formatPlanningHours(sum.current_month.target_hours));
      setLoadState('ok');
    } catch (err) {
      if (requestId !== monthRequestRef.current) return;
      setLoadState('error');
      notify(`Impossible de charger les données du mois : ${errorMessage(err)}`, 'error');
      return;
    }
    loadAnnualData(annualStartYear);
  };

  useEffect(() => {
    loadMonthData();
  }, [currentMonth, isActiveUser]);

  const loadAuditLogs = async () => {
    setLoadingAudit(true);
    try {
      setAuditLogs(await fetchAuditLogs(100));
    } catch (err) {
      notify(`Historique non chargé : ${errorMessage(err)}`, 'error');
    } finally {
      setLoadingAudit(false);
    }
  };

  const loadPeriods = async () => {
    try {
      setPeriods(await fetchPeriods());
    } catch (err) {
      notify(`Périodes non chargées : ${errorMessage(err)}`, 'error');
    }
  };

  // ===================== POINTAGE RAPIDE (lien de notification) =====================

  useEffect(() => {
    const param = new URLSearchParams(window.location.search).get('quick_badge');
    if (param) {
      pendingQuickBadge.current = param;
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  // Traité une fois les réglages et le mois en cours chargés, pour utiliser les bons horaires.
  useEffect(() => {
    if (!settingsLoaded || loadState !== 'ok' || currentMonth !== todayMonth || !pendingQuickBadge.current) return;
    const mode = pendingQuickBadge.current;
    pendingQuickBadge.current = null;
    setSelectedDate(todayStr);
    if (mode === 'auto') {
      if (entries.some((e) => e.entry_date === todayStr)) {
        notify("La journée d'aujourd'hui est déjà enregistrée.", 'info');
      } else if (
        window.confirm(`Enregistrer aujourd'hui avec vos horaires habituels (${habitualSchedule.startTime} - ${habitualSchedule.endTime}) ?`)
      ) {
        handleQuickBadgeToday();
      }
    } else {
      window.setTimeout(() => formSectionRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
    }
  }, [settingsLoaded, loadState]);

  const handleQuickBadgeToday = async () => {
    setQuickBadgingToday(true);
    try {
      // Les heures faites sont calculées par le serveur à partir des horaires.
      await saveEntry({
        entry_date: todayStr,
        expected_hours: habitualSchedule.expectedHours,
        start_time: habitualSchedule.startTime,
        end_time: habitualSchedule.endTime,
        break_minutes: habitualSchedule.breakMinutes,
        notes: 'Pointage rapide'
      });
      await loadMonthData();
      notify("Journée d'aujourd'hui enregistrée.", 'success');
    } catch (err) {
      notify(`Erreur lors du pointage : ${errorMessage(err)}`, 'error');
    } finally {
      setQuickBadgingToday(false);
    }
  };

  // ===================== RAPPELS =====================

  // On ne sait si aujourd'hui est pointé que lorsque le mois affiché est le mois en cours.
  const todayRecorded = currentMonth === todayMonth ? entries.some((e) => e.entry_date === todayStr) : null;
  const reminders = useReminders(habitualSchedule, todayRecorded, loadState);

  // ===================== FORMULAIRE DU JOUR =====================

  const populateFormFromEntry = (entry?: DailyEntry) => {
    if (!entry) {
      // Nouvelle journée : horaires habituels.
      setDayType('WORKED');
      setExpectedHours(habitualSchedule.expectedHours);
      setStartTime(habitualSchedule.startTime);
      setEndTime(habitualSchedule.endTime);
      setBreakMinutes(habitualSchedule.breakMinutes);
      setAbsenceReasonId(DEFAULT_REASON.id);
      setAbsenceImpact(DEFAULT_REASON.defaultImpact);
      setAbsenceHours(habitualSchedule.expectedHours);
      setNotes('');
      return;
    }
    if (entry.status_id) {
      const reason = reasonOfEntry(entry) ?? DEFAULT_REASON;
      const impact = impactOfEntry(entry);
      setDayType('ABSENT');
      setAbsenceReasonId(reason.id);
      setAbsenceImpact(impact);
      setAbsenceHours(impact === 'COUNTED_AS_WORKED' ? entry.actual_hours : entry.expected_hours || habitualSchedule.expectedHours);
      setNotes(noteWithoutReason(entry.notes, reason));
    } else {
      setDayType('WORKED');
      setExpectedHours(entry.expected_hours);
      setStartTime(entry.start_time || habitualSchedule.startTime);
      setEndTime(entry.end_time || habitualSchedule.endTime);
      setBreakMinutes(entry.break_minutes);
      setNotes(entry.notes || '');
    }
  };

  const existingEntry = entries.find((e) => e.entry_date === selectedDate);
  const existingEntryKey = existingEntry ? `${existingEntry.id}:${existingEntry.updated_at ?? ''}` : 'none';

  // Le formulaire n'est rempli qu'au changement de date ou quand la journée elle-même change :
  // un rechargement des données (régularisation, objectif...) n'efface plus une saisie en cours.
  useEffect(() => {
    populateFormFromEntry(existingEntry);
  }, [selectedDate, existingEntryKey, habitualSchedule]);

  // ===================== NAVIGATION =====================

  const handleSelectMonth = (newMonth: string) => {
    if (!newMonth) return;
    setEditingEntryDate(null);
    setCurrentMonth(newMonth);
    setSelectedDate(newMonth === todayMonth ? todayStr : `${newMonth}-01`);
  };

  const shiftMonth = (delta: number) => {
    const [y, m] = currentMonth.split('-').map(Number);
    handleSelectMonth(getLocalMonthStr(new Date(y, m - 1 + delta, 1)));
  };
  const handlePrevMonth = () => shiftMonth(-1);
  const handleNextMonth = () => shiftMonth(1);
  const handleCurrentMonth = () => handleSelectMonth(todayMonth);

  const handleSelectDate = (newDate: string) => {
    if (!newDate) return;
    setEditingEntryDate(null);
    setSelectedDate(newDate);
    if (newDate.slice(0, 7) !== currentMonth) setCurrentMonth(newDate.slice(0, 7));
  };

  const handleGoToToday = () => handleSelectDate(todayStr);

  /** Bouton « Pointer » de la barre du bas : aujourd'hui, puis le formulaire de saisie. */
  const goToTodayForm = () => {
    handleGoToToday();
    window.setTimeout(() => formSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  };

  const shiftDay = (delta: number) => {
    const [y, m, d] = selectedDate.split('-').map(Number);
    handleSelectDate(getLocalDateStr(new Date(y, m - 1, d + delta)));
  };
  const handlePrevDay = () => shiftDay(-1);
  const handleNextDay = () => shiftDay(1);

  const handleStartEdit = (entry: DailyEntry) => {
    handleSelectDate(entry.entry_date);
    setEditingEntryDate(entry.entry_date);
    populateFormFromEntry(entry);
    window.setTimeout(() => formSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  };

  const handleCancelEdit = () => {
    setEditingEntryDate(null);
    populateFormFromEntry(existingEntry);
  };

  // Heures faites calculées à partir des horaires (même règle que le serveur).
  let calculatedActual = 0;
  if (dayType === 'WORKED' && startTime && endTime) {
    const [sh, sm] = startTime.split(':').map(Number);
    const [eh, em] = endTime.split(':').map(Number);
    const sMin = sh * 60 + sm;
    const eMin = eh * 60 + em;
    const durMin = Math.max(0, (eMin >= sMin ? eMin - sMin : 24 * 60 - sMin + eMin) - breakMinutes);
    calculatedActual = Math.round((durMin / 60) * 100) / 100;
  }

  const dayDelta =
    dayType === 'WORKED'
      ? Math.round((calculatedActual - expectedHours) * 100) / 100
      : absenceImpact === 'TO_RECOVER'
      ? -Math.abs(absenceHours)
      : 0;

  const handleSaveDay = async (e: React.FormEvent) => {
    e.preventDefault();
    let payload: Parameters<typeof saveEntry>[0];
    if (dayType === 'WORKED') {
      if (!startTime || !endTime) {
        notify("Indiquez l'heure d'arrivée et l'heure de départ.", 'error');
        return;
      }
      if (
        calculatedActual >= 12 &&
        !window.confirm(
          `Durée calculée : ${formatDuration(calculatedActual)} (${startTime} à ${endTime}).\n\nConfirmez-vous cette durée, ou avez-vous inversé l'arrivée et le départ ?`
        )
      ) {
        return;
      }
      payload = {
        entry_date: selectedDate,
        expected_hours: expectedHours,
        start_time: startTime,
        end_time: endTime,
        break_minutes: breakMinutes,
        status_id: null,
        notes: notes.trim() || null
      };
    } else {
      const reason = findReason(absenceReasonId) ?? DEFAULT_REASON;
      const status = statuses.find((s) => s.code === reason.statusCode);
      if (!status) {
        notify(`Le statut « ${reason.statusCode} » est introuvable sur le serveur.`, 'error');
        return;
      }
      const hours = Number(absenceHours);
      if (absenceImpact !== 'NEUTRAL' && !(hours > 0)) {
        notify("Indiquez un nombre d'heures supérieur à 0.", 'error');
        return;
      }
      payload = {
        entry_date: selectedDate,
        expected_hours: absenceImpact === 'NEUTRAL' ? 0 : hours,
        start_time: null,
        end_time: null,
        break_minutes: 0,
        manual_actual_hours: absenceImpact === 'COUNTED_AS_WORKED' ? hours : 0,
        status_id: status.id,
        absence_reason: reason.id,
        absence_impact: absenceImpact,
        notes: notes.trim() || null
      };
    }

    setSavingDay(true);
    try {
      await saveEntry(payload);
      setEditingEntryDate(null);
      await loadMonthData();
    } catch (err) {
      notify(`Erreur lors de l'enregistrement : ${errorMessage(err)}`, 'error');
    } finally {
      setSavingDay(false);
    }
  };

  const handleDeleteDay = async (dateStr: string) => {
    if (!window.confirm(`Supprimer la journée du ${formatDateFrench(dateStr)} ?\n(« Annuler » dans l'en-tête permet de revenir en arrière.)`)) return;
    try {
      await deleteEntry(dateStr);
      if (editingEntryDate === dateStr) setEditingEntryDate(null);
      await loadMonthData();
    } catch (err) {
      notify(`Erreur : ${errorMessage(err)}`, 'error');
    }
  };

  // ===================== COMPTEURS =====================

  const handleOpenAdjustment = (type: 'POSITIVE' | 'NEGATIVE', operation: 'SETTLE' | 'ADD') => {
    const total = type === 'POSITIVE' ? summary?.total_positive_balance || 0 : summary?.total_negative_balance || 0;
    const defaultAmount = operation === 'SETTLE' ? total : habitualSchedule.expectedHours;
    const defaultReason =
      operation === 'ADD'
        ? type === 'POSITIVE'
          ? 'Report solde heures sup'
          : 'Report solde heures à rattraper'
        : type === 'POSITIVE'
        ? 'Payé sur ma fiche de paie'
        : 'Heures rattrapées';
    setSettleModal({
      isOpen: true,
      type,
      operation,
      totalDue: total,
      amountToSettle: defaultAmount > 0 ? defaultAmount : habitualSchedule.expectedHours,
      reason: defaultReason,
      date: todayStr
    });
  };

  const handleConfirmSettle = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = Number(settleModal.amountToSettle);
    if (!(amount > 0)) {
      notify("Indiquez un nombre d'heures supérieur à 0.", 'error');
      return;
    }
    if (settleModal.operation === 'SETTLE') {
      if (amount > settleModal.totalDue + 0.001) {
        notify(`Impossible de déduire plus que le solde actuel (${formatDuration(settleModal.totalDue)}).`, 'error');
        return;
      }
      if (settleModal.date > todayStr) {
        notify('Un règlement ne peut pas être daté dans le futur.', 'error');
        return;
      }
    }
    try {
      await createRegularization({
        reg_date: settleModal.date,
        counter_type: settleModal.type,
        operation_type: settleModal.operation,
        amount_hours: amount,
        reason: settleModal.reason.trim() || (settleModal.operation === 'ADD' ? 'Ajout manuel' : 'Régularisation')
      });
      setSettleModal({ ...settleModal, isOpen: false });
      await loadMonthData();
    } catch (err) {
      notify(`Erreur : ${errorMessage(err)}`, 'error');
    }
  };

  const handleDeleteRegularization = async (r: RegularizationItem) => {
    if (!window.confirm(`Annuler cette opération de ${formatDuration(r.amount_hours)} (${r.reason}) ?`)) return;
    try {
      await deleteRegularization(r.id);
      await loadMonthData();
    } catch (err) {
      notify(`Erreur : ${errorMessage(err)}`, 'error');
    }
  };

  const handleUndo = async () => {
    try {
      notify(await triggerUndo(), 'success');
      await loadMonthData();
      if (showSettingsModal && settingsTab === 'HISTORY') await loadAuditLogs();
    } catch (err) {
      notify(`Impossible d'annuler : ${errorMessage(err)}`, 'error');
    }
  };

  // ===================== OBJECTIFS =====================

  const handleSaveMonthlyTarget = async (value: number | string) => {
    const num = typeof value === 'number' ? value : parsePlanningHours(value);
    if (!Number.isFinite(num) || num < 0 || num > 744) {
      notify('Objectif invalide : saisissez par exemple 88, 88h ou 46h39.', 'error');
      setTargetInputStr(formatPlanningHours(monthlyTargetInput));
      return;
    }
    if (num === monthlyTargetInput) {
      setTargetInputStr(formatPlanningHours(num));
      return;
    }
    setSavingTarget(true);
    try {
      await updateMonthlyTarget(currentMonth, num);
      await loadMonthData();
    } catch (err) {
      notify(`Erreur lors de l'enregistrement de l'objectif : ${errorMessage(err)}`, 'error');
      setTargetInputStr(formatPlanningHours(monthlyTargetInput));
    } finally {
      setSavingTarget(false);
    }
  };

  const isMonthValidated = Boolean(summary?.current_month.is_validated);

  const handleToggleMonthValidation = async () => {
    try {
      if (isMonthValidated) {
        if (!window.confirm(`Rouvrir ${monthDisplay} ? Les journées et l'objectif redeviendront modifiables.`)) return;
        await unvalidateMonth(currentMonth);
        notify(`${monthDisplay} est rouvert.`, 'success');
      } else {
        if (!window.confirm(`Valider ${monthDisplay} ?\nLe mois sera verrouillé : plus aucune modification possible tant qu'il n'est pas rouvert.`)) return;
        await validateMonth(currentMonth);
        notify(`${monthDisplay} est validé et verrouillé.`, 'success');
      }
      await loadMonthData();
    } catch (err) {
      notify(`Erreur : ${errorMessage(err)}`, 'error');
    }
  };

  const handleSaveAnnualTarget = async () => {
    const hours = parsePlanningHours(annualTargetStr);
    if (!Number.isFinite(hours) || hours < 1 || hours > 5000) {
      notify('Quota invalide : saisissez par exemple 800 ou 800h.', 'error');
      return;
    }
    setIsSavingAnnualTarget(true);
    try {
      await saveSettings({ annual_target_hours: String(hours) });
      setIsEditingAnnualTarget(false);
      await loadAnnualData(annualStartYear);
    } catch (err) {
      notify(`Erreur lors de l'enregistrement du quota annuel : ${errorMessage(err)}`, 'error');
    } finally {
      setIsSavingAnnualTarget(false);
    }
  };

  const handleChangeAnnualYear = (delta: number) => {
    const nextYear = annualStartYear + delta;
    setAnnualStartYear(nextYear);
    loadAnnualData(nextYear);
  };

  const printAs = (mode: 'MONTHLY' | 'ANNUAL') => {
    setPrintMode(mode);
    window.setTimeout(() => window.print(), 100);
  };
  const handlePrintMonthly = () => printAs('MONTHLY');
  const handlePrintAnnual = () => printAs('ANNUAL');

  // ===================== RÉGLAGES =====================

  const openSettings = (tab: SettingsTab = 'SCHEDULE') => {
    setHabitualForm(habitualSchedule);
    setProfileForm(profile);
    setSettingsTab(tab);
    setShowSettingsModal(true);
    if (tab === 'HISTORY') loadAuditLogs();
  };

  const selectSettingsTab = (tab: SettingsTab) => {
    setSettingsTab(tab);
    if (tab === 'HISTORY') loadAuditLogs();
  };

  const handleSaveHabitualSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!(habitualForm.expectedHours > 0)) {
      notify('Les heures attendues par jour doivent être supérieures à 0.', 'error');
      return;
    }
    setSavingHabitual(true);
    try {
      const saved = await saveSettings({
        habitual_start_time: habitualForm.startTime,
        habitual_end_time: habitualForm.endTime,
        habitual_break_minutes: String(habitualForm.breakMinutes),
        habitual_expected_hours: String(habitualForm.expectedHours),
        agent_name: profileForm.agentName.trim(),
        employer_name: profileForm.employerName.trim(),
        job_title: profileForm.jobTitle.trim()
      });
      applySettings(saved);
      setShowSettingsModal(false);
      notify('Réglages enregistrés.', 'success');
    } catch (err) {
      notify(`Erreur lors de l'enregistrement des réglages : ${errorMessage(err)}`, 'error');
    } finally {
      setSavingHabitual(false);
    }
  };

  /** Enregistre les coordonnées du responsable (fenêtre de transmission). */
  const saveContacts = async () => {
    try {
      const saved = await saveSettings({ manager_phone: profile.managerPhone.trim(), manager_email: profile.managerEmail.trim() });
      applySettings(saved);
    } catch (err) {
      notify(`Coordonnées non enregistrées : ${errorMessage(err)}`, 'error');
    }
  };

  const handleResetMyPersonalData = async () => {
    if (resetConfirmationInput.trim() !== 'RESET') return;
    if (
      !window.confirm(
        `Effacer tous vos pointages, périodes, régularisations, objectifs et votre historique (${currentUser?.display_name}) ?\n\nLes autres comptes ne sont pas touchés et vos réglages sont conservés. Une sauvegarde de sécurité est faite avant.`
      )
    ) {
      return;
    }
    setIsResetting(true);
    try {
      const res = await triggerResetMyData('RESET');
      notify(`Vos données ont été effacées.\nSauvegarde de sécurité : ${res.safetyBackup}`, 'success');
      setResetConfirmationInput('');
      setShowSettingsModal(false);
      await loadMonthData();
    } catch (err) {
      notify(`Erreur lors de l'effacement : ${errorMessage(err)}`, 'error');
    } finally {
      setIsResetting(false);
    }
  };

  // ===================== PÉRIODES =====================

  const openPeriodModal = (startDate: string, endDate: string) => {
    setPeriodForm(makePeriodForm(startDate, endDate));
    setShowPeriodModal(true);
    loadPeriods();
  };

  const handleSavePeriod = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!periodForm.startDate || !periodForm.endDate) {
      notify('Renseignez la date de début et la date de fin.', 'error');
      return;
    }
    if (periodForm.startDate > periodForm.endDate) {
      notify('La date de début doit précéder la date de fin.', 'error');
      return;
    }
    const reason = findReason(periodForm.reasonId) ?? DEFAULT_REASON;
    const status = statuses.find((s) => s.code === reason.statusCode);
    const perDay = periodForm.impact === 'NEUTRAL' ? 0 : habitualSchedule.expectedHours;

    setSavingPeriod(true);
    try {
      const result = await createPeriod({
        label: periodForm.label || reason.label,
        start_date: periodForm.startDate,
        end_date: periodForm.endDate,
        status_id: status ? status.id : null,
        notes: null,
        preserve_overrides: true,
        skip_weekends: periodForm.skipWeekends,
        expected_hours_per_day: perDay,
        actual_hours_per_day: periodForm.impact === 'COUNTED_AS_WORKED' ? perDay : 0,
        absence_reason: reason.id,
        absence_impact: periodForm.impact
      });
      setShowPeriodModal(false);
      await loadMonthData();
      notify(`Période enregistrée (${result.days_modified} jour(s)).`, 'success');
    } catch (err) {
      notify(`Erreur lors de l'enregistrement de la période : ${errorMessage(err)}`, 'error');
    } finally {
      setSavingPeriod(false);
    }
  };

  const handleDeletePeriod = async (p: PeriodItem) => {
    if (
      !window.confirm(
        `Supprimer la période « ${p.label} » (${p.start_date} → ${p.end_date}) ?\nLes journées déjà posées restent enregistrées : supprimez-les une par une si besoin.`
      )
    ) {
      return;
    }
    try {
      await deletePeriod(p.id);
      await Promise.all([loadPeriods(), loadMonthData()]);
    } catch (err) {
      notify(`Erreur : ${errorMessage(err)}`, 'error');
    }
  };

  // ===================== CHIFFRES DU MOIS =====================

  const totalWorkedThisMonth = Math.round(entries.reduce((acc, cur) => acc + (cur.actual_hours || 0), 0) * 100) / 100;
  const totalExpectedThisMonth = Math.round(entries.reduce((acc, cur) => acc + (cur.expected_hours || 0), 0) * 100) / 100;
  const targetThisMonth = summary?.current_month.target_hours ?? monthlyTargetInput;
  const monthProgressPercent = Math.min(100, Math.round((totalWorkedThisMonth / Math.max(1, targetThisMonth)) * 100));
  const monthRemainingHours = Math.max(0, Math.round((targetThisMonth - totalWorkedThisMonth) * 100) / 100);
  const monthOvertimeHours = totalWorkedThisMonth > targetThisMonth ? Math.round((totalWorkedThisMonth - targetThisMonth) * 100) / 100 : 0;
  const monthPositiveHours = summary?.current_month.positive_delta || 0;
  const monthNegativeHours = summary?.current_month.negative_delta || 0;
  const monthNetBalance = summary?.current_month.delta_hours || 0;
  const cpDaysThisMonth = entries.filter(isDayOff).length;
  const monthDisplay = formatMonthLabel(currentMonth);
  const agentName = profile.agentName.trim() || currentUser?.display_name || '';

  // ===================== TRANSMISSION =====================

  const generateShareMessage = () =>
    buildShareMessage({
      monthDisplay,
      agentName,
      targetHours: targetThisMonth,
      workedHours: totalWorkedThisMonth,
      dayOffCount: cpDaysThisMonth,
      positiveHours: monthPositiveHours,
      negativeHours: monthNegativeHours,
      netBalance: monthNetBalance,
      totalPositiveBalance: summary?.total_positive_balance || 0,
      totalNegativeBalance: summary?.total_negative_balance || 0,
      entries
    });

  const handleCopyShareText = async () => {
    try {
      await navigator.clipboard.writeText(generateShareMessage());
      setCopiedShare(true);
      window.setTimeout(() => setCopiedShare(false), 2500);
    } catch {
      notify("Copie automatique impossible : sélectionnez le texte de l'aperçu pour le copier.", 'info');
    }
  };

  const handleSendWhatsApp = () => {
    const text = encodeURIComponent(generateShareMessage());
    let phone = profile.managerPhone.replace(/[^0-9]/g, '');
    if (phone.startsWith('0') && phone.length === 10) phone = '33' + phone.slice(1);
    const url = phone ? `https://wa.me/${phone}?text=${text}` : `https://api.whatsapp.com/send?text=${text}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const handleSendEmail = () => {
    const subject = `Feuille de pointage - ${monthDisplay} - ${agentName || 'Salarié(e)'}`;
    window.location.href = `mailto:${encodeURIComponent(profile.managerEmail)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(
      generateShareMessage()
    )}`;
  };

  const handleSendSMS = () => {
    const text = encodeURIComponent(generateShareMessage());
    const phone = profile.managerPhone.replace(/[^0-9+]/g, '');
    const separator = /iPad|iPhone|iPod/.test(navigator.userAgent) ? '&' : '?';
    window.location.href = `sms:${phone}${separator}body=${text}`;
  };

  const handleNativeShare = async () => {
    const text = generateShareMessage();
    if (!navigator.share) {
      handleCopyShareText();
      return;
    }
    try {
      await navigator.share({ title: `Feuille de pointage - ${monthDisplay}`, text });
    } catch (err) {
      if ((err as Error).name !== 'AbortError') handleCopyShareText();
    }
  };

  return {
    ...theme,
    ...reminders,
    currentUser,
    todayStr,
    todayMonth,
    currentMonth,
    setCurrentMonth,
    summary,
    setSummary,
    entries,
    setEntries,
    statuses,
    setStatuses,
    loadState,
    setLoadState,
    settingsLoaded,
    setSettingsLoaded,
    habitualSchedule,
    setHabitualSchedule,
    habitualForm,
    setHabitualForm,
    profile,
    setProfile,
    profileForm,
    setProfileForm,
    savingHabitual,
    setSavingHabitual,
    showSettingsModal,
    setShowSettingsModal,
    settingsTab,
    setSettingsTab,
    resetConfirmationInput,
    setResetConfirmationInput,
    isResetting,
    setIsResetting,
    auditLogs,
    setAuditLogs,
    loadingAudit,
    setLoadingAudit,
    showShareModal,
    setShowShareModal,
    showMoreMenu,
    setShowMoreMenu,
    copiedShare,
    setCopiedShare,
    quickBadgingToday,
    setQuickBadgingToday,
    showAnnualModal,
    setShowAnnualModal,
    annualSummary,
    setAnnualSummary,
    annualStartYear,
    setAnnualStartYear,
    annualTargetStr,
    setAnnualTargetStr,
    isEditingAnnualTarget,
    setIsEditingAnnualTarget,
    isSavingAnnualTarget,
    setIsSavingAnnualTarget,
    printMode,
    setPrintMode,
    monthlyTargetInput,
    setMonthlyTargetInput,
    targetInputStr,
    setTargetInputStr,
    savingTarget,
    setSavingTarget,
    regularizationsList,
    setRegularizationsList,
    showAllRegularizations,
    setShowAllRegularizations,
    selectedDate,
    setSelectedDate,
    editingEntryDate,
    setEditingEntryDate,
    dayType,
    setDayType,
    expectedHours,
    setExpectedHours,
    startTime,
    setStartTime,
    endTime,
    setEndTime,
    breakMinutes,
    setBreakMinutes,
    absenceReasonId,
    setAbsenceReasonId,
    absenceImpact,
    setAbsenceImpact,
    absenceHours,
    setAbsenceHours,
    notes,
    setNotes,
    savingDay,
    setSavingDay,
    settleModal,
    setSettleModal,
    showPeriodModal,
    setShowPeriodModal,
    periodForm,
    setPeriodForm,
    savingPeriod,
    setSavingPeriod,
    periods,
    setPeriods,
    monthRequestRef,
    annualRequestRef,
    pendingQuickBadge,
    formSectionRef,
    handleLogout,
    isActiveUser,
    applySettings,
    loadAnnualData,
    loadMonthData,
    loadAuditLogs,
    loadPeriods,
    handleQuickBadgeToday,
    todayRecorded,
    populateFormFromEntry,
    existingEntry,
    existingEntryKey,
    handleSelectMonth,
    shiftMonth,
    handlePrevMonth,
    handleNextMonth,
    handleCurrentMonth,
    handleSelectDate,
    handleGoToToday,
    goToTodayForm,
    shiftDay,
    handlePrevDay,
    handleNextDay,
    handleStartEdit,
    handleCancelEdit,
    calculatedActual,
    dayDelta,
    handleSaveDay,
    handleDeleteDay,
    handleOpenAdjustment,
    handleConfirmSettle,
    handleDeleteRegularization,
    handleUndo,
    handleSaveMonthlyTarget,
    isMonthValidated,
    handleToggleMonthValidation,
    handleSaveAnnualTarget,
    handleChangeAnnualYear,
    printAs,
    handlePrintMonthly,
    handlePrintAnnual,
    openSettings,
    selectSettingsTab,
    handleSaveHabitualSchedule,
    saveContacts,
    handleResetMyPersonalData,
    openPeriodModal,
    handleSavePeriod,
    handleDeletePeriod,
    totalWorkedThisMonth,
    totalExpectedThisMonth,
    targetThisMonth,
    monthProgressPercent,
    monthRemainingHours,
    monthOvertimeHours,
    monthPositiveHours,
    monthNegativeHours,
    monthNetBalance,
    cpDaysThisMonth,
    monthDisplay,
    agentName,
    generateShareMessage,
    handleCopyShareText,
    handleSendWhatsApp,
    handleSendEmail,
    handleSendSMS,
    handleNativeShare
  };
}

export type WorkspaceModel = ReturnType<typeof useWorkspace>;
