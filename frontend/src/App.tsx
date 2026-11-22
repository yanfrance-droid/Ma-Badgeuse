import React, { useState, useEffect, useRef } from 'react';
import { CockpitSummary, DailyEntry, StatusItem, RegularizationItem, AnnualCockpitSummary, User } from './types';
import {
  fetchSummary,
  fetchEntries,
  fetchStatuses,
  saveEntry,
  deleteEntry,
  triggerUndo,
  fetchRegularizations,
  createRegularization,
  deleteRegularization,
  updateMonthlyTarget,
  fetchSettings,
  saveSettings,
  createPeriod,
  createBackupNow,
  fetchBackupList,
  restoreBackup,
  fetchDatabaseStatus,
  triggerOptimizeDatabase,
  triggerResetDatabase,
  triggerResetMyData,
  triggerResetServerAll,
  uploadRestoreBackup,
  fetchAnnualSummary,
  saveAnnualTarget,
  apiGetMe,
  apiLogout,
  apiVerifyAdminPin,
  apiChangeAdminPin,
  apiDeleteUser,
  apiListUsers
} from './api';
import { AuthScreen } from './components/AuthScreen';
import {
  formatHours,
  formatDuration,
  formatSimpleHours,
  formatPlanningHours,
  parsePlanningHours
} from './components/CockpitVignette';
import {
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  Printer,
  Download,
  Trash2,
  CheckCircle2,
  ArrowUpRight,
  ArrowDownRight,
  Edit2,
  Briefcase,
  AlertCircle,
  X,
  Settings,
  Calendar,
  CalendarPlus,
  Share2,
  Send,
  Copy,
  Check,
  Mail,
  Phone,
  MessageSquare,
  Database,
  HardDrive,
  RefreshCw,
  AlertTriangle,
  ShieldCheck,
  Bell,
  BellRing,
  Zap,
  Sun,
  Moon,
  Monitor,
  LogOut,
  UserCheck,
  Lock,
  Unlock,
  Key,
  ShieldAlert,
  Users
} from 'lucide-react';
import {
  getStoredReminderConfig,
  saveStoredReminderConfig,
  requestNotificationPermission,
  sendTestNotification,
  checkAndTriggerDailyReminder,
  computeReminderTimeFromEnd,
  ReminderConfig
} from './services/notificationService';

export type ThemeMode = 'LIGHT' | 'DARK' | 'SYSTEM';

// Les motifs d'absence avec correspondance statut et règle planning
const ABSENCE_REASONS = [
  { id: 'JOUR_ZERO', label: '🏖️ Jour à 0 h (Congés / Vacances)', statusCode: 'JOUR_ZERO', defaultRule: 'NEUTRAL' },
  { id: 'CP', label: '🏖️ Congés Payés (CP)', statusCode: 'CONGE_PAYE', defaultRule: 'NEUTRAL' },
  { id: 'FERIE', label: '🛑 Jour Férié chômé', statusCode: 'JOUR_FERIE', defaultRule: 'NEUTRAL' },
  { id: 'FERMETURE', label: '⚠️ Fermeture école / Vacances scolaires', statusCode: 'FERMETURE_ECOLE', defaultRule: 'NEUTRAL' },
  { id: 'MALADIE', label: '🤒 Arrêt Maladie', statusCode: 'ARRET_MALADIE', defaultRule: 'NEUTRAL' },
  { id: 'ENFANT_MALADE', label: '🧒 Enfant malade', statusCode: 'ARRET_MALADIE', defaultRule: 'NEUTRAL' },
  { id: 'FAMILLE', label: '💍 Événement familial', statusCode: 'EVENT_FAMILLE', defaultRule: 'NEUTRAL' },
  { id: 'FORMATION', label: '🎓 Formation', statusCode: 'CONGE_PAYE', defaultRule: 'COUNTED_AS_WORKED' },
  { id: 'SANS_SOLDE', label: '🚫 Absence sans solde / À rattraper', statusCode: 'CONGE_SANS_SOLDE', defaultRule: 'TO_RECOVER' },
  { id: 'ACCIDENT', label: '🩹 Accident du travail', statusCode: 'ARRET_MALADIE', defaultRule: 'NEUTRAL' },
];

// Fonctions utilitaires garantissant la date LOCALE (sans décalage UTC)
function getLocalDateStr(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getLocalMonthStr(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function getCurrentSchoolYearStart(date: Date = new Date()): number {
  const y = date.getFullYear();
  const m = date.getMonth() + 1;
  return m >= 9 ? y : y - 1;
}

export const App: React.FC = () => {
  const todayStr = getLocalDateStr();
  const todayMonth = getLocalMonthStr();

  // Gestion de la session utilisateur multi-comptes
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isAuthChecking, setIsAuthChecking] = useState<boolean>(true);

  // Navigation Mois par mois
  const [currentMonth, setCurrentMonth] = useState<string>(todayMonth);
  const [summary, setSummary] = useState<CockpitSummary | null>(null);
  const [entries, setEntries] = useState<DailyEntry[]>([]);
  const [statuses, setStatuses] = useState<StatusItem[]>([]);

  // Configuration des horaires habituels (Option personnalisable, par défaut 10h45 - 14h45 = 4h/j)
  const [habitualSchedule, setHabitualSchedule] = useState<{
    startTime: string;
    endTime: string;
    breakMinutes: number;
    expectedHours: number;
  }>(() => {
    const cached = localStorage.getItem('habitual_schedule');
    if (cached) {
      try {
        return JSON.parse(cached);
      } catch {}
    }
    return {
      startTime: '10:45',
      endTime: '14:45',
      breakMinutes: 0,
      expectedHours: 4.0
    };
  });

  // Nom de l'agent pour le relevé officiel imprimé
  const [userName, setUserName] = useState<string>(() => localStorage.getItem('agent_name') || '');

  // Modale de transmission (WhatsApp, Email, SMS, Copie)
  const [showShareModal, setShowShareModal] = useState<boolean>(false);
  const [recipientPhone, setRecipientPhone] = useState<string>(() => localStorage.getItem('manager_phone') || '');
  const [recipientEmail, setRecipientEmail] = useState<string>(() => localStorage.getItem('manager_email') || '');
  const [copiedShare, setCopiedShare] = useState<boolean>(false);

  // Modale de réglage des horaires habituels et maintenance de la base
  const [showHabitualModal, setShowHabitualModal] = useState<boolean>(false);
  const [habitualForm, setHabitualForm] = useState(habitualSchedule);
  const [savingHabitual, setSavingHabitual] = useState<boolean>(false);
  const [settingsTab, setSettingsTab] = useState<'SCHEDULE' | 'DATABASE'>('SCHEDULE');
  const [dbStatus, setDbStatus] = useState<{
    integrity: string;
    databaseSizeKb: number;
    walSizeKb: number;
    totalEntries: number;
    totalRegularizations: number;
    totalPeriods: number;
    totalBackups: number;
    lastBackupDate: string | null;
  } | null>(null);
  const [backupsList, setBackupsList] = useState<Array<{ filename: string; sizeBytes: number; createdAt: string; isAuto: boolean }>>([]);
  const [loadingDbStatus, setLoadingDbStatus] = useState<boolean>(false);
  const [resetConfirmationInput, setResetConfirmationInput] = useState<string>('');
  const [isResetting, setIsResetting] = useState<boolean>(false);
  const [selectedRestoreFile, setSelectedRestoreFile] = useState<File | null>(null);
  const [isRestoringUpload, setIsRestoringUpload] = useState<boolean>(false);

  // Mode Administrateur Système (Code PIN)
  const [isAdminUnlocked, setIsAdminUnlocked] = useState<boolean>(() => {
    return sessionStorage.getItem('admin_unlocked') === 'true';
  });
  const [showAdminPinModal, setShowAdminPinModal] = useState<boolean>(false);
  const [adminPinInput, setAdminPinInput] = useState<string>('');
  const [adminPinError, setAdminPinError] = useState<string | null>(null);
  const [verifyingAdminPin, setVerifyingAdminPin] = useState<boolean>(false);

  // Gestion des utilisateurs (Admin)
  const [adminUsersList, setAdminUsersList] = useState<User[]>([]);
  const [loadingAdminUsers, setLoadingAdminUsers] = useState<boolean>(false);

  // Modification du code PIN Admin
  const [adminOldPinInput, setAdminOldPinInput] = useState<string>('');
  const [adminNewPinInput, setAdminNewPinInput] = useState<string>('');
  const [savingNewPin, setSavingNewPin] = useState<boolean>(false);
  const [pinChangeSuccess, setPinChangeSuccess] = useState<string | null>(null);

  // Configuration des rappels de pointage quotidien
  const [reminderConfig, setReminderConfig] = useState<ReminderConfig>(() => getStoredReminderConfig(habitualSchedule.endTime));
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission | 'unsupported'>(() => {
    return typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'unsupported';
  });
  const [testingNotification, setTestingNotification] = useState<boolean>(false);
  const [quickBadgingToday, setQuickBadgingToday] = useState<boolean>(false);

  // Thème d'affichage : Clair, Sombre ou Automatique (selon le système / smartphone)
  const [appTheme, setAppTheme] = useState<ThemeMode>(() => {
    return (localStorage.getItem('app_theme') as ThemeMode) || 'SYSTEM';
  });

  // Bilan et Décompte Annuel Scolaire (Septembre à Août)
  const [showAnnualModal, setShowAnnualModal] = useState<boolean>(false);
  const [annualSummary, setAnnualSummary] = useState<AnnualCockpitSummary | null>(null);
  const [annualStartYear, setAnnualStartYear] = useState<number>(() => getCurrentSchoolYearStart(new Date()));
  const [annualTargetInput, setAnnualTargetInput] = useState<number>(800);
  const [annualTargetStr, setAnnualTargetStr] = useState<string>('800h');
  const [isEditingAnnualTarget, setIsEditingAnnualTarget] = useState<boolean>(false);
  const [isSavingAnnualTarget, setIsSavingAnnualTarget] = useState<boolean>(false);
  const [loadingAnnual, setLoadingAnnual] = useState<boolean>(false);
  const [printMode, setPrintMode] = useState<'MONTHLY' | 'ANNUAL'>('MONTHLY');

  // Heures demandées par l'employeur pour ce mois (Objectif mensuel planning)
  const [monthlyTargetInput, setMonthlyTargetInput] = useState<number>(120);
  const [targetInputStr, setTargetInputStr] = useState<string>('120h');
  const [savingTarget, setSavingTarget] = useState<boolean>(false);
  const [regularizationsList, setRegularizationsList] = useState<RegularizationItem[]>([]);
  const [showAllRegularizations, setShowAllRegularizations] = useState<boolean>(false);

  // Saisie du pointage d'une journée
  const [selectedDate, setSelectedDate] = useState<string>(todayStr);
  const [editingEntryDate, setEditingEntryDate] = useState<string | null>(null);
  const formSectionRef = useRef<HTMLElement>(null);
  
  // Type de journée : 'WORKED' (J'ai travaillé) ou 'ABSENT' (Absence / Exceptionnel)
  const [dayType, setDayType] = useState<'WORKED' | 'ABSENT'>('WORKED');

  // Si 'WORKED' :
  const [expectedHours, setExpectedHours] = useState<number>(habitualSchedule.expectedHours);
  const [startTime, setStartTime] = useState<string>(habitualSchedule.startTime);
  const [endTime, setEndTime] = useState<string>(habitualSchedule.endTime);
  const [breakMinutes, setBreakMinutes] = useState<number>(habitualSchedule.breakMinutes);

  // Si 'ABSENT' :
  const [absenceReasonId, setAbsenceReasonId] = useState<string>('JOUR_ZERO');
  // Impact sur le solde : 'NEUTRAL' (neutre), 'TO_RECOVER' (à rattraper), 'COUNTED_AS_WORKED' (compté fait)
  const [absenceImpact, setAbsenceImpact] = useState<'NEUTRAL' | 'TO_RECOVER' | 'COUNTED_AS_WORKED'>('NEUTRAL');
  const [absenceHours, setAbsenceHours] = useState<number>(habitualSchedule.expectedHours);
  const [notes, setNotes] = useState<string>('');

  // Modale d'ajustement de compteur (Règlement / Déduction OU Ajout manuel)
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
    date: getLocalDateStr()
  });

  const [savingDay, setSavingDay] = useState<boolean>(false);

  // Modale pour poser une période multi-jours (Vacances / Congés / Arrêt prolongé)
  const [showPeriodModal, setShowPeriodModal] = useState<boolean>(false);
  const [periodForm, setPeriodForm] = useState<{
    label: string;
    startDate: string;
    endDate: string;
    reasonId: string;
    impact: 'NEUTRAL' | 'TO_RECOVER' | 'COUNTED_AS_WORKED';
    skipWeekends: boolean;
  }>({
    label: '🏖️ Jour à 0 h (Congés)',
    startDate: todayStr,
    endDate: todayStr,
    reasonId: 'JOUR_ZERO',
    impact: 'NEUTRAL',
    skipWeekends: true
  });
  const [savingPeriod, setSavingPeriod] = useState<boolean>(false);

  // Sauvegarde d'une période multi-jours
  const handleSavePeriod = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!periodForm.startDate || !periodForm.endDate) {
      alert("Veuillez renseigner la date de début et la date de fin.");
      return;
    }
    if (periodForm.startDate > periodForm.endDate) {
      alert("La date de début ne peut pas être postérieure à la date de fin.");
      return;
    }

    setSavingPeriod(true);
    try {
      const reasonObj = ABSENCE_REASONS.find((r) => r.id === periodForm.reasonId) || ABSENCE_REASONS[0];
      const statusRecord = statuses.find((s) => s.code === reasonObj.statusCode);

      let expPerDay = 0;
      let actPerDay = 0;

      if (periodForm.impact === 'TO_RECOVER') {
        expPerDay = habitualSchedule.expectedHours;
        actPerDay = 0;
      } else if (periodForm.impact === 'COUNTED_AS_WORKED') {
        expPerDay = habitualSchedule.expectedHours;
        actPerDay = habitualSchedule.expectedHours;
      } else {
        // NEUTRAL
        expPerDay = 0;
        actPerDay = 0;
      }

      await createPeriod({
        label: periodForm.label || reasonObj.label,
        start_date: periodForm.startDate,
        end_date: periodForm.endDate,
        status_id: statusRecord ? statusRecord.id : null,
        notes: reasonObj.label,
        preserve_overrides: true,
        skip_weekends: periodForm.skipWeekends,
        expected_hours_per_day: expPerDay,
        actual_hours_per_day: actPerDay
      });

      setShowPeriodModal(false);
      await loadMonthData();
      alert("Période enregistrée avec succès !");
    } catch (err: any) {
      alert("Erreur lors de l'enregistrement de la période : " + err.message);
    } finally {
      setSavingPeriod(false);
    }
  };

  // Vérification de la session utilisateur sur l'appareil
  useEffect(() => {
    apiGetMe()
      .then((user) => {
        if (user) {
          setCurrentUser(user);
          if (!localStorage.getItem('agent_name')) {
            setUserName(user.display_name);
            localStorage.setItem('agent_name', user.display_name);
          }
        } else {
          setCurrentUser(null);
        }
      })
      .catch(() => {
        setCurrentUser(null);
      })
      .finally(() => {
        setIsAuthChecking(false);
      });
  }, []);

  // Déconnexion d'un compte
  const handleLogout = async () => {
    if (confirm(`Voulez-vous vous déconnecter du compte "${currentUser?.display_name || currentUser?.username}" ?`)) {
      await apiLogout();
      setCurrentUser(null);
      setSummary(null);
      setEntries([]);
    }
  };

  // Chargement des données à chaque changement de mois ou d'utilisateur
  useEffect(() => {
    if (currentUser) {
      loadMonthData();
    }
  }, [currentMonth, currentUser]);

  // Chargement des paramètres sauvegardés pour l'utilisateur connecté
  useEffect(() => {
    if (!currentUser) return;
    fetchSettings()
      .then((st) => {
        if (st) {
          const config = {
            startTime: st.habitual_start_time || '10:45',
            endTime: st.habitual_end_time || '14:45',
            breakMinutes: parseInt(st.habitual_break_minutes || '0', 10),
            expectedHours: parseFloat(st.habitual_expected_hours || '4.0')
          };
          setHabitualSchedule(config);
          setHabitualForm(config);
          localStorage.setItem('habitual_schedule', JSON.stringify(config));
        }
      })
      .catch(console.error);
  }, [currentUser]);

  // Détection du pointage rapide depuis une notification (URL ?quick_badge=auto ou ?quick_badge=today)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const quickParam = params.get('quick_badge');
    if (quickParam === 'auto') {
      window.history.replaceState({}, '', window.location.pathname);
      handleQuickBadgeToday();
    } else if (quickParam === 'today') {
      window.history.replaceState({}, '', window.location.pathname);
      setSelectedDate(todayStr);
      if (formSectionRef.current) {
        formSectionRef.current.scrollIntoView({ behavior: 'smooth' });
      }
    }
  }, []);

  // Synchronisation des champs quand la date sélectionnée change
  useEffect(() => {
    const existing = entries.find((e) => e.entry_date === selectedDate);
    populateFormFromEntry(existing);
  }, [selectedDate, entries, habitualSchedule]);

  // Surveillance et déclenchement du rappel d'oubli de pointage
  useEffect(() => {
    checkAndTriggerDailyReminder(entries, habitualSchedule);

    const interval = setInterval(() => {
      checkAndTriggerDailyReminder(entries, habitualSchedule);
    }, 60 * 1000);

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        checkAndTriggerDailyReminder(entries, habitualSchedule);
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [entries, habitualSchedule, reminderConfig]);

  // Thème d'affichage : gestion dynamique Clair, Sombre ou Automatique
  const applyAppTheme = (theme: ThemeMode) => {
    const isDark =
      theme === 'DARK' ||
      (theme === 'SYSTEM' &&
        typeof window !== 'undefined' &&
        window.matchMedia &&
        window.matchMedia('(prefers-color-scheme: dark)').matches);

    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }

    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
      meta.setAttribute('content', isDark ? '#0B1528' : '#0D2B52');
    }
  };

  const handleChangeTheme = (newTheme: ThemeMode) => {
    setAppTheme(newTheme);
    localStorage.setItem('app_theme', newTheme);
    applyAppTheme(newTheme);
  };

  const handleCycleTheme = () => {
    if (appTheme === 'LIGHT') {
      handleChangeTheme('DARK');
    } else if (appTheme === 'DARK') {
      handleChangeTheme('SYSTEM');
    } else {
      handleChangeTheme('LIGHT');
    }
  };

  // Écoute de la préférence sombre du système en mode 'SYSTEM'
  useEffect(() => {
    applyAppTheme(appTheme);
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => {
      const stored = (localStorage.getItem('app_theme') as ThemeMode) || 'SYSTEM';
      if (stored === 'SYSTEM') {
        applyAppTheme('SYSTEM');
      }
    };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [appTheme]);

  // Remplir le formulaire à partir d'une entrée existante ou avec les horaires habituels par défaut
  const populateFormFromEntry = (entry?: DailyEntry) => {
    if (entry) {
      if (entry.status_id) {
        // Journée d'absence
        setDayType('ABSENT');
        const matchReason = ABSENCE_REASONS.find(
          (r) => entry.notes?.includes(r.label) || entry.notes?.includes(r.id)
        ) || ABSENCE_REASONS[0];
        setAbsenceReasonId(matchReason.id);

        if (entry.expected_hours > 0 && entry.actual_hours === 0) {
          setAbsenceImpact('TO_RECOVER');
          setAbsenceHours(entry.expected_hours);
        } else if (entry.actual_hours > 0) {
          setAbsenceImpact('COUNTED_AS_WORKED');
          setAbsenceHours(entry.actual_hours);
        } else {
          setAbsenceImpact('NEUTRAL');
          setAbsenceHours(entry.expected_hours || habitualSchedule.expectedHours);
        }

        // Nettoyer les notes sans répétition du libellé d'absence
        let cleanNote = entry.notes || '';
        for (const r of ABSENCE_REASONS) {
          if (cleanNote.includes(r.label)) {
            cleanNote = cleanNote.split(r.label).join('').replace(/^[ -:]+/, '').trim();
          }
        }
        setNotes(cleanNote);
      } else {
        // Journée travaillée
        setDayType('WORKED');
        setExpectedHours(entry.expected_hours !== undefined ? entry.expected_hours : habitualSchedule.expectedHours);
        setStartTime(entry.start_time || habitualSchedule.startTime);
        setEndTime(entry.end_time || habitualSchedule.endTime);
        setBreakMinutes(entry.break_minutes !== undefined ? entry.break_minutes : habitualSchedule.breakMinutes);
        setNotes(entry.notes || '');
      }
    } else {
      // Nouvelle entrée : charger l'horaire habituel (4h normales au contrat)
      // Les heures normales vont sur l'objectif du mois, PAS en heures supplémentaires
      setDayType('WORKED');
      setExpectedHours(habitualSchedule.expectedHours);
      setStartTime(habitualSchedule.startTime);
      setEndTime(habitualSchedule.endTime);
      setBreakMinutes(habitualSchedule.breakMinutes);
      setAbsenceReasonId('MALADIE');
      setAbsenceImpact('COUNTED_AS_WORKED');
      setAbsenceHours(habitualSchedule.expectedHours);
      setNotes('');
    }
  };

  const loadMonthData = async () => {
    if (!currentUser) return;
    try {
      const [sum, ent, stat, regs] = await Promise.all([
        fetchSummary(currentMonth),
        fetchEntries(currentMonth),
        fetchStatuses(),
        fetchRegularizations()
      ]);
      setSummary(sum);
      setEntries(ent);
      setStatuses(stat);
      setRegularizationsList(regs || []);
      if (sum && sum.current_month) {
        setMonthlyTargetInput(sum.current_month.target_hours);
        setTargetInputStr(formatPlanningHours(sum.current_month.target_hours));
      }
      // Actualiser le bilan annuel en arrière-plan
      loadAnnualData(annualStartYear);
    } catch (err) {
      console.error(err);
    }
  };

  // Chargement des données du bilan annuel (Septembre à Août)
  const loadAnnualData = async (startYear?: number) => {
    try {
      setLoadingAnnual(true);
      const yr = startYear !== undefined ? startYear : annualStartYear;
      const data = await fetchAnnualSummary(yr);
      setAnnualSummary(data);
      setAnnualTargetInput(data.annual_contract_hours);
      setAnnualTargetStr(formatPlanningHours(data.annual_contract_hours));
    } catch (err) {
      console.error('Erreur chargement bilan annuel:', err);
    } finally {
      setLoadingAnnual(false);
    }
  };

  // Enregistrement du quota d'heures annuelles
  const handleSaveAnnualTarget = async () => {
    try {
      setIsSavingAnnualTarget(true);
      const parsed = parsePlanningHours(annualTargetStr);
      const hoursToSave = parsed > 0 ? parsed : annualTargetInput;
      await saveAnnualTarget(hoursToSave);
      setAnnualTargetInput(hoursToSave);
      setIsEditingAnnualTarget(false);
      await loadAnnualData(annualStartYear);
    } catch (err: any) {
      alert("Erreur lors de l'enregistrement de l'objectif annuel : " + err.message);
    } finally {
      setIsSavingAnnualTarget(false);
    }
  };

  // Changement d'année scolaire (ex: 2025 -> 2026 -> 2027)
  const handleChangeAnnualYear = (delta: number) => {
    const nextYear = annualStartYear + delta;
    setAnnualStartYear(nextYear);
    loadAnnualData(nextYear);
  };

  const handlePrintMonthly = () => {
    setPrintMode('MONTHLY');
    setTimeout(() => {
      window.print();
    }, 100);
  };

  const handlePrintAnnual = () => {
    setPrintMode('ANNUAL');
    setTimeout(() => {
      window.print();
    }, 100);
  };

  // Sauvegarde des horaires habituels dans la base et localement
  const handleSaveHabitualSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingHabitual(true);
    try {
      await saveSettings({
        habitual_start_time: habitualForm.startTime,
        habitual_end_time: habitualForm.endTime,
        habitual_break_minutes: String(habitualForm.breakMinutes),
        habitual_expected_hours: String(habitualForm.expectedHours)
      });
      setHabitualSchedule(habitualForm);
      localStorage.setItem('habitual_schedule', JSON.stringify(habitualForm));
      localStorage.setItem('agent_name', userName);
      setShowHabitualModal(false);

      // Si la date actuelle n'était pas enregistrée, appliquer les nouveaux horaires
      const existing = entries.find((en) => en.entry_date === selectedDate);
      if (!existing && dayType === 'WORKED') {
        setStartTime(habitualForm.startTime);
        setEndTime(habitualForm.endTime);
        setBreakMinutes(habitualForm.breakMinutes);
        setExpectedHours(habitualForm.expectedHours);
      }
    } catch (err: any) {
      alert("Erreur lors de l'enregistrement des horaires : " + err.message);
    } finally {
      setSavingHabitual(false);
    }
  };

  // Chargement des détails et de l'état de la base de données
  const loadDatabaseDetails = async () => {
    setLoadingDbStatus(true);
    try {
      const [status, backups] = await Promise.all([
        fetchDatabaseStatus(),
        fetchBackupList()
      ]);
      setDbStatus(status);
      setBackupsList(backups);
    } catch (err: any) {
      console.warn("Erreur chargement statut BD:", err);
    } finally {
      setLoadingDbStatus(false);
    }
  };

  const handleOptimizeDb = async () => {
    try {
      const res = await triggerOptimizeDatabase();
      alert(res.message || "Base de données compactée et optimisée avec succès !");
      await loadDatabaseDetails();
    } catch (err: any) {
      alert("Erreur lors de l'optimisation : " + err.message);
    }
  };

  const handleCreateServerBackup = async () => {
    try {
      await createBackupNow();
      alert("Sauvegarde créée avec succès sur le serveur !");
      await loadDatabaseDetails();
    } catch (err: any) {
      alert("Erreur création sauvegarde : " + err.message);
    }
  };

  const handleRestoreServerBackup = async (filename: string) => {
    if (!window.confirm(`Êtes-vous sûr de vouloir restaurer la sauvegarde "${filename}" ?\n\nUne sauvegarde de sécurité préalable sera effectuée automatiquement.`)) {
      return;
    }
    try {
      await restoreBackup(filename);
      alert(`Sauvegarde "${filename}" restaurée avec succès !`);
      setShowHabitualModal(false);
      await loadMonthData();
    } catch (err: any) {
      alert("Erreur lors de la restauration : " + err.message);
    }
  };

  const handleUploadRestore = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRestoreFile) {
      alert("Veuillez sélectionner un fichier .sqlite.");
      return;
    }
    if (!window.confirm(`Êtes-vous sûr de vouloir importer et restaurer le fichier "${selectedRestoreFile.name}" ?\n\nUne sauvegarde d'urgence sera créée avant écrasement.`)) {
      return;
    }
    setIsRestoringUpload(true);
    try {
      await uploadRestoreBackup(selectedRestoreFile);
      alert("Fichier importé et base restaurée avec succès !");
      setSelectedRestoreFile(null);
      setShowHabitualModal(false);
      await loadMonthData();
    } catch (err: any) {
      alert("Erreur lors de l'import : " + err.message);
    } finally {
      setIsRestoringUpload(false);
    }
  };

  // Remise à zéro isolée du compte connecté uniquement
  const handleResetMyPersonalData = async () => {
    if (resetConfirmationInput.trim() !== 'RESET') {
      alert("Veuillez taper exactement le mot 'RESET' en majuscules pour confirmer.");
      return;
    }
    if (!window.confirm(`⚠️ Confirmation de remise à zéro :\n\nVoulez-vous vraiment effacer tous vos pointages et congés personnels (${currentUser?.display_name}) ?\n\nGARANTIE : Les comptes et pointages des autres membres de la famille restent 100% intacts.`)) {
      return;
    }
    setIsResetting(true);
    try {
      const res = await triggerResetMyData('RESET');
      alert(`Votre espace personnel a été remis à zéro avec succès !\n\nUne sauvegarde de vos heures a été archivée sur le serveur : ${res.safetyBackup}`);
      setResetConfirmationInput('');
      setShowHabitualModal(false);
      await loadMonthData();
    } catch (err: any) {
      alert("Erreur lors de la remise à zéro : " + err.message);
    } finally {
      setIsResetting(false);
    }
  };

  // Remise à zéro totale du serveur (Admin uniquement)
  const [resetServerInput, setResetServerInput] = useState<string>('');
  const handleResetServerAll = async () => {
    if (resetServerInput.trim() !== 'RESET_SERVEUR') {
      alert("Veuillez taper exactement 'RESET_SERVEUR' en majuscules pour confirmer.");
      return;
    }
    if (!window.confirm("💥 DANGER : Cette action réservée à l'administrateur va remettre à zéro TOUS LES COMPTES ET POINTAGES du serveur.\n\nUne sauvegarde complète de sécurité sera créée avant l'opération.\n\nConfirmez-vous ?")) {
      return;
    }
    setIsResetting(true);
    try {
      const res = await triggerResetServerAll('RESET_SERVEUR');
      alert(`Le serveur a été remis à zéro avec succès.\n\nSauvegarde d'urgence : ${res.safetyBackup}`);
      setResetServerInput('');
      setShowHabitualModal(false);
      await loadMonthData();
    } catch (err: any) {
      alert("Erreur : " + err.message);
    } finally {
      setIsResetting(false);
    }
  };

  // Gestion du Mode Administrateur (Code PIN)
  const handleVerifyAdminPin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminPinInput.trim()) {
      setAdminPinError('Veuillez entrer le code PIN administrateur.');
      return;
    }
    setVerifyingAdminPin(true);
    setAdminPinError(null);
    try {
      await apiVerifyAdminPin(adminPinInput.trim());
      setIsAdminUnlocked(true);
      sessionStorage.setItem('admin_unlocked', 'true');
      setShowAdminPinModal(false);
      setAdminPinInput('');
      // Charger les données admin
      loadAdminUsers();
      loadDatabaseDetails();
      // Basculer l'onglet vers la base et ouvrir la modale
      setSettingsTab('DATABASE');
      setShowHabitualModal(true);
    } catch (err: any) {
      setAdminPinError(err.message || 'Code PIN administrateur incorrect.');
    } finally {
      setVerifyingAdminPin(false);
    }
  };

  const handleLockAdmin = () => {
    setIsAdminUnlocked(false);
    sessionStorage.removeItem('admin_unlocked');
    sessionStorage.removeItem('admin_pin');
    setSettingsTab('SCHEDULE');
  };

  const loadAdminUsers = async () => {
    setLoadingAdminUsers(true);
    try {
      const users = await apiListUsers();
      setAdminUsersList(users);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingAdminUsers(false);
    }
  };

  const handleDeleteUser = async (userToDelete: User) => {
    if (userToDelete.id === 1) {
      alert("Le compte initial (Maman) ne peut pas être supprimé.");
      return;
    }
    if (confirm(`Êtes-vous sûr de vouloir supprimer définitivement le compte de "${userToDelete.display_name}" (@${userToDelete.username}) ainsi que tous ses pointages ?`)) {
      try {
        await apiDeleteUser(userToDelete.id);
        alert(`Le compte de "${userToDelete.display_name}" a été supprimé.`);
        await loadAdminUsers();
      } catch (err: any) {
        alert("Erreur lors de la suppression : " + err.message);
      }
    }
  };

  const handleChangePin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminOldPinInput.trim() || !adminNewPinInput.trim()) {
      alert("Veuillez renseigner l'ancien et le nouveau code PIN.");
      return;
    }
    setSavingNewPin(true);
    setPinChangeSuccess(null);
    try {
      await apiChangeAdminPin(adminOldPinInput.trim(), adminNewPinInput.trim());
      setPinChangeSuccess("Code PIN administrateur modifié avec succès !");
      setAdminOldPinInput('');
      setAdminNewPinInput('');
      setTimeout(() => setPinChangeSuccess(null), 4000);
    } catch (err: any) {
      alert("Erreur : " + err.message);
    } finally {
      setSavingNewPin(false);
    }
  };

  // Pointage express d'aujourd'hui en 1 clic
  const handleQuickBadgeToday = async () => {
    setQuickBadgingToday(true);
    try {
      await saveEntry({
        entry_date: todayStr,
        start_time: habitualSchedule.startTime,
        end_time: habitualSchedule.endTime,
        break_minutes: habitualSchedule.breakMinutes,
        manual_actual_hours: habitualSchedule.expectedHours,
        expected_hours: habitualSchedule.expectedHours,
        notes: 'Pointage rapide habituel'
      });
      await loadMonthData();
      alert("Journée d'aujourd'hui validée avec succès !");
    } catch (err: any) {
      alert("Erreur lors du pointage : " + err.message);
    } finally {
      setQuickBadgingToday(false);
    }
  };

  // Gestion des rappels de pointage
  const handleToggleReminder = async (enabled: boolean) => {
    if (enabled) {
      try {
        const perm = await requestNotificationPermission();
        setNotificationPermission(perm);
        if (perm !== 'granted') {
          alert("L'autorisation pour les notifications a été refusée par votre navigateur.");
          return;
        }
      } catch (err: any) {
        alert("Impossible d'activer les notifications : " + err.message);
        return;
      }
    }
    const updated = { ...reminderConfig, enabled };
    setReminderConfig(updated);
    saveStoredReminderConfig(updated);
  };

  const handleUpdateReminderTime = (time: string) => {
    const updated = { ...reminderConfig, time };
    setReminderConfig(updated);
    saveStoredReminderConfig(updated);
  };

  const handleTestReminder = async () => {
    setTestingNotification(true);
    try {
      await sendTestNotification();
      setNotificationPermission('granted');
      alert("Notification de test envoyée avec succès ! Regardez en haut de votre écran.");
    } catch (err: any) {
      alert("Erreur lors de l'envoi du test : " + err.message);
    } finally {
      setTestingNotification(false);
    }
  };


  // Sauvegarde des heures demandées par l'employeur pour ce mois (planning mairie/école)
  const handleSaveMonthlyTarget = async (newTarget: number | string) => {
    const num = typeof newTarget === 'number' ? newTarget : parsePlanningHours(newTarget);
    setSavingTarget(true);
    try {
      await updateMonthlyTarget(currentMonth, num);
      setMonthlyTargetInput(num);
      setTargetInputStr(formatPlanningHours(num));
      await loadMonthData();
    } catch (err: any) {
      alert("Erreur lors de l'enregistrement de l'objectif : " + err.message);
    } finally {
      setSavingTarget(false);
    }
  };

  // Formatage lisible de la date en français (ex: "Samedi 21 novembre 2026")
  const formatDateFrench = (dateStr: string) => {
    if (!dateStr) return '';
    const [y, m, d] = dateStr.split('-').map(Number);
    const dateObj = new Date(y, m - 1, d);
    const days = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
    const months = [
      'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
      'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'
    ];
    return `${days[dateObj.getDay()]} ${d} ${months[m - 1]} ${y}`;
  };

  // Sélection directe d'un mois (synchronise le mois ET la date)
  const handleSelectMonth = (newMonth: string) => {
    if (!newMonth) return;
    setEditingEntryDate(null);
    setCurrentMonth(newMonth);
    // Si c'est le mois actuel réel, se caler sur aujourd'hui, sinon sur le 1er du mois
    if (newMonth === todayMonth) {
      setSelectedDate(todayStr);
    } else {
      setSelectedDate(`${newMonth}-01`);
    }
  };

  // Navigation mois par mois
  const handlePrevMonth = () => {
    const [y, m] = currentMonth.split('-').map(Number);
    const prev = new Date(y, m - 2, 1);
    handleSelectMonth(getLocalMonthStr(prev));
  };

  const handleNextMonth = () => {
    const [y, m] = currentMonth.split('-').map(Number);
    const next = new Date(y, m, 1);
    handleSelectMonth(getLocalMonthStr(next));
  };

  const handleCurrentMonth = () => {
    handleSelectMonth(todayMonth);
  };

  // Sélection directe d'une date (synchronise la date ET le mois)
  const handleSelectDate = (newDate: string) => {
    if (!newDate) return;
    setEditingEntryDate(null);
    setSelectedDate(newDate);
    const m = newDate.slice(0, 7);
    if (m !== currentMonth) {
      setCurrentMonth(m);
    }
  };

  // Revenir immédiatement à aujourd'hui (synchronise tout)
  const handleGoToToday = () => {
    setEditingEntryDate(null);
    setSelectedDate(todayStr);
    if (currentMonth !== todayMonth) {
      setCurrentMonth(todayMonth);
    }
  };

  // Navigation jour par jour
  const handlePrevDay = () => {
    const [y, m, d] = selectedDate.split('-').map(Number);
    const prev = new Date(y, m - 1, d - 1);
    handleSelectDate(getLocalDateStr(prev));
  };

  const handleNextDay = () => {
    const [y, m, d] = selectedDate.split('-').map(Number);
    const next = new Date(y, m - 1, d + 1);
    handleSelectDate(getLocalDateStr(next));
  };

  // Activer le mode édition depuis la liste et faire défiler l'écran vers le formulaire
  const handleStartEdit = (entry: DailyEntry) => {
    handleSelectDate(entry.entry_date);
    setEditingEntryDate(entry.entry_date);
    populateFormFromEntry(entry);
    setTimeout(() => {
      formSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
  };

  // Annuler le mode édition
  const handleCancelEdit = () => {
    setEditingEntryDate(null);
    const existing = entries.find((e) => e.entry_date === selectedDate);
    populateFormFromEntry(existing);
  };

  // Entrée existante pour le jour sélectionné
  const existingEntry = entries.find((e) => e.entry_date === selectedDate);

  // Calcul automatique des heures faites (quand travaillé)
  let calculatedActual = 0;
  if (dayType === 'WORKED' && startTime && endTime) {
    const [sh, sm] = startTime.split(':').map(Number);
    const [eh, em] = endTime.split(':').map(Number);
    const sMin = sh * 60 + sm;
    const eMin = eh * 60 + em;
    let durMin = eMin >= sMin ? eMin - sMin : 24 * 60 - sMin + eMin;
    durMin = Math.max(0, durMin - breakMinutes);
    calculatedActual = Math.round((durMin / 60) * 100) / 100;
  }

  // Écart journalier
  let dayDelta = 0;
  if (dayType === 'WORKED') {
    dayDelta = Math.round((calculatedActual - expectedHours) * 100) / 100;
  } else {
    if (absenceImpact === 'TO_RECOVER') {
      dayDelta = -Math.abs(absenceHours);
    } else {
      dayDelta = 0;
    }
  }

  // Enregistrer ou modifier la journée
  const handleSaveDay = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingDay(true);
    try {
      if (dayType === 'WORKED') {
        // Alerte de sécurité si la durée calculée dépasse 12h (inversion possible arrivée / départ)
        if (calculatedActual >= 12) {
          if (!confirm(`⚠️ Attention : Vous avez indiqué une durée de ${calculatedActual}h (${startTime} à ${endTime}).\n\nConfirmez-vous cette durée exceptionnelle ou avez-vous inversé l'heure d'arrivée et de départ ?`)) {
            setSavingDay(false);
            return;
          }
        }

        // Journée de travail normale
        await saveEntry({
          entry_date: selectedDate,
          expected_hours: expectedHours,
          start_time: startTime,
          end_time: endTime,
          break_minutes: breakMinutes,
          status_id: null,
          notes: notes.trim() || null
        });
      } else {
        // Journée d'absence avec impact choisi
        const reasonObj = ABSENCE_REASONS.find((r) => r.id === absenceReasonId) || ABSENCE_REASONS[0];
        const statusRecord = statuses.find((s) => s.code === (reasonObj as any).statusCode) || statuses[0];

        let finalExpected = 0;
        let finalActual = 0;

        if (absenceImpact === 'TO_RECOVER') {
          // Doit être rattrapé : X heures attendues mais 0h faites => delta = -X
          finalExpected = Number(absenceHours);
          finalActual = 0;
        } else if (absenceImpact === 'COUNTED_AS_WORKED') {
          // Compté comme travaillé : X heures faites sur le mois
          finalExpected = Number(absenceHours);
          finalActual = Number(absenceHours);
        } else {
          // Neutre : 0 attendu, 0 fait => delta = 0h
          finalExpected = 0;
          finalActual = 0;
        }

        const cleanNotes = notes.trim();
        const noteLabel = cleanNotes ? `${reasonObj.label} : ${cleanNotes}` : reasonObj.label;

        await saveEntry({
          entry_date: selectedDate,
          expected_hours: finalExpected,
          start_time: null,
          end_time: null,
          break_minutes: 0,
          manual_actual_hours: finalActual,
          status_id: statusRecord ? statusRecord.id : 1,
          notes: noteLabel
        });
      }

      setEditingEntryDate(null);
      await loadMonthData();
    } catch (err: any) {
      alert("Erreur lors de l'enregistrement : " + err.message);
    } finally {
      setSavingDay(false);
    }
  };

  // Supprimer le pointage d'une date
  const handleDeleteDay = async (dateStr: string) => {
    if (confirm(`Effacer les notes du ${dateStr} ?`)) {
      try {
        await deleteEntry(dateStr);
        if (editingEntryDate === dateStr) {
          setEditingEntryDate(null);
        }
        await loadMonthData();
      } catch (err: any) {
        alert("Erreur : " + err.message);
      }
    }
  };

  // Ouvrir la modale d'ajustement (Règlement / Déduction OU Ajout manuel)
  const handleOpenAdjustment = (type: 'POSITIVE' | 'NEGATIVE', operation: 'SETTLE' | 'ADD' = 'SETTLE') => {
    const total = type === 'POSITIVE'
      ? (summary?.total_positive_balance || 0)
      : (summary?.total_negative_balance || 0);

    let defaultReason = '';
    let defaultAmount = operation === 'SETTLE' ? total : 4;

    if (operation === 'ADD') {
      defaultReason = type === 'POSITIVE'
        ? 'Report solde heures sup'
        : 'Report solde heures à rattraper';
    } else {
      defaultReason = type === 'POSITIVE'
        ? 'Payé sur ma fiche de paie'
        : 'Heures rattrapées';
    }

    setSettleModal({
      isOpen: true,
      type,
      operation,
      totalDue: total,
      amountToSettle: defaultAmount > 0 ? defaultAmount : 4,
      reason: defaultReason,
      date: getLocalDateStr()
    });
  };

  const handleOpenSettle = (type: 'POSITIVE' | 'NEGATIVE') => {
    handleOpenAdjustment(type, 'SETTLE');
  };

  // Valider le règlement ou l'ajout d'heures
  const handleConfirmSettle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (settleModal.amountToSettle <= 0) {
      alert("Veuillez indiquer un nombre d'heures supérieur à 0.");
      return;
    }
    try {
      await createRegularization({
        reg_date: settleModal.date,
        counter_type: settleModal.type,
        operation_type: settleModal.operation,
        amount_hours: Number(settleModal.amountToSettle),
        reason: settleModal.reason.trim() || (settleModal.operation === 'ADD' ? 'Ajout manuel' : 'Régularisation')
      });
      setSettleModal({ ...settleModal, isOpen: false });
      await loadMonthData();
    } catch (err: any) {
      alert("Erreur : " + err.message);
    }
  };

  // Annuler la dernière action
  const handleUndo = async () => {
    try {
      const res = await triggerUndo();
      alert(res.message);
      await loadMonthData();
    } catch (err: any) {
      alert("Impossible d'annuler : " + err.message);
    }
  };

  // Cumuls du mois (Heures initiales demandées, effectué, progression et reste à faire)
  const totalWorkedThisMonth = Math.round(entries.reduce((acc, cur) => acc + (cur.actual_hours || 0), 0) * 100) / 100;
  const totalExpectedThisMonth = Math.round(entries.reduce((acc, cur) => acc + (cur.expected_hours || 0), 0) * 100) / 100;
  const targetThisMonth = summary?.current_month?.target_hours !== undefined ? summary.current_month.target_hours : (monthlyTargetInput ?? 80);
  const monthProgressPercent = Math.min(100, Math.round((totalWorkedThisMonth / Math.max(1, targetThisMonth)) * 100));
  const monthRemainingHours = Math.max(0, Math.round((targetThisMonth - totalWorkedThisMonth) * 100) / 100);
  const monthOvertimeHours = totalWorkedThisMonth > targetThisMonth ? Math.round((totalWorkedThisMonth - targetThisMonth) * 100) / 100 : 0;
  // Bilan strict du mois sélectionné pour le Livre de Preuves
  const monthPositiveHours = summary?.current_month?.positive_delta || 0;
  const monthNegativeHours = summary?.current_month?.negative_delta || 0;
  const monthNetBalance = summary?.current_month?.delta_hours || 0;
  const monthDelta = monthNetBalance;
  // Décompte des journées de congés / jours à 0h posées sur le mois
  const cpDaysThisMonth = entries.filter((e) =>
    e.status_id === 1 ||
    e.status_id === 2 ||
    e.status_id === 7 ||
    e.notes?.toLowerCase().includes('congé') ||
    e.notes?.toLowerCase().includes('0 h') ||
    e.notes?.toLowerCase().includes('0h') ||
    e.notes?.toLowerCase().includes('cp') ||
    e.notes?.toLowerCase().includes('vacance')
  ).length;

  // Libellé du mois en français
  const [yearNum, monthNum] = currentMonth.split('-').map(Number);
  const monthNames = [
    'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
    'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'
  ];
  const monthDisplay = `${monthNames[monthNum - 1]} ${yearNum}`;

  // Sauvegarde des contacts responsables
  const handleUpdateRecipientPhone = (val: string) => {
    setRecipientPhone(val);
    localStorage.setItem('manager_phone', val);
  };

  const handleUpdateRecipientEmail = (val: string) => {
    setRecipientEmail(val);
    localStorage.setItem('manager_email', val);
  };

  // Génération du texte formel et vérifiable de la feuille de pointage
  const generateShareMessage = () => {
    const agent = userName.trim() ? userName.trim() : 'Salarié(e)';
    const lines = [
      `📋 Récapitulatif de mes heures — ${monthDisplay}`,
      `Agent : ${agent}`,
      ``,
      `🎯 Objectif planning du mois : ${formatPlanningHours(targetThisMonth)}`,
      `⏱️ Total heures travaillées : ${formatDuration(totalWorkedThisMonth)}`,
      `🏖️ Jours à 0h / Congés : ${cpDaysThisMonth} jour(s)`,
      ``,
      `⚖️ Bilan du mois :`,
      `• Heures sup : +${monthPositiveHours} h`,
      `• Heures à rattraper : ${monthNegativeHours > 0 ? `-${monthNegativeHours} h` : '0 h'}`,
      `• Solde net : ${monthNetBalance >= 0 ? `+${monthNetBalance} h` : `${monthNetBalance} h`}`,
      ``,
      `📊 Compteurs globaux :`,
      `• On me doit : ${formatHours(summary?.total_positive_balance || 0)}`,
      `• Je dois : ${formatHours(-Math.abs(summary?.total_negative_balance || 0))}`,
      ``,
      `🗓️ Détail des journées :`
    ];

    if (entries.length === 0) {
      lines.push(`(Aucune journée enregistrée pour ce mois)`);
    } else {
      entries.forEach((e) => {
        const [y, m, d] = e.entry_date.split('-').map(Number);
        const dayStr = `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`;
        const delta = e.delta_hours || 0;
        const deltaStr = delta !== 0 ? ` [${formatHours(delta)}]` : '';
        const notesStr = e.notes ? ` (${e.notes})` : '';

        if (e.actual_hours > 0) {
          lines.push(
            `- ${dayStr} : ${e.start_time || '??'} à ${e.end_time || '??'} (${formatDuration(e.actual_hours)})${deltaStr}${notesStr}`
          );
        } else if (e.status_label || e.notes) {
          lines.push(
            `- ${dayStr} : 0h [${e.status_label || 'Absence'}]${notesStr}`
          );
        }
      });
    }

    lines.push(``);
    lines.push(`Bonne réception et à disposition si besoin !`);

    return lines.join('\n');
  };

  const handleCopyShareText = async () => {
    const text = generateShareMessage();
    try {
      await navigator.clipboard.writeText(text);
      setCopiedShare(true);
      setTimeout(() => setCopiedShare(false), 2500);
    } catch {
      alert("Impossible de copier automatiquement. Vous pouvez sélectionner le texte ci-dessous pour le copier manuellement.");
    }
  };

  const handleSendWhatsApp = () => {
    const text = generateShareMessage();
    let cleanPhone = recipientPhone.replace(/[^0-9]/g, '');
    if (cleanPhone.startsWith('0') && cleanPhone.length === 10) {
      cleanPhone = '33' + cleanPhone.slice(1);
    }
    const url = cleanPhone
      ? `https://wa.me/${cleanPhone}?text=${encodeURIComponent(text)}`
      : `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
  };

  const handleSendEmail = () => {
    const text = generateShareMessage();
    const subject = `Feuille de pointage - ${monthDisplay} - ${userName || 'Salarié(e)'}`;
    const mailtoUrl = `mailto:${encodeURIComponent(recipientEmail || '')}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`;
    window.location.href = mailtoUrl;
  };

  const handleSendSMS = () => {
    const text = generateShareMessage();
    const cleanPhone = recipientPhone.replace(/[^0-9+]/g, '');
    const isIOS = typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent);
    const smsUrl = cleanPhone
      ? (isIOS ? `sms:${cleanPhone}&body=${encodeURIComponent(text)}` : `sms:${cleanPhone}?body=${encodeURIComponent(text)}`)
      : (isIOS ? `sms:&body=${encodeURIComponent(text)}` : `sms:?body=${encodeURIComponent(text)}`);
    window.location.href = smsUrl;
  };

  const handleNativeShare = async () => {
    const text = generateShareMessage();
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Feuille de pointage - ${monthDisplay}`,
          text: text
        });
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          handleCopyShareText();
        }
      }
    } else {
      handleCopyShareText();
    }
  };

  if (isAuthChecking) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center text-white p-4">
        <div className="w-12 h-12 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin mb-4" />
        <p className="text-sm font-medium text-slate-400">Chargement de votre espace...</p>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <AuthScreen
        onLoginSuccess={(user) => {
          setCurrentUser(user);
          setUserName(user.display_name);
          localStorage.setItem('agent_name', user.display_name);
        }}
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-950 text-slate-800 dark:text-slate-100 pb-16 font-sans transition-colors duration-150">
      {/* 1. EN-TÊTE ÉPURÉ */}
      <header className="sticky top-0 z-40 bg-[#0D2B52] dark:bg-slate-900 text-white px-4 py-3 shadow-md flex items-center justify-between no-print border-b border-blue-950/40 dark:border-slate-800">
        <div>
          <h1 className="text-base font-black tracking-tight leading-none">
            🕒 Ma Badgeuse
          </h1>
          <p className="text-[11px] text-blue-200 dark:text-slate-400 mt-0.5 font-medium">
            Mon pointage • Mes compteurs • Mes preuves
          </p>
        </div>

        <div className="flex items-center space-x-1.5">
          {/* BOUTON RAPIDE CHANGEMENT DE THÈME (Clair -> Sombre -> Auto) */}
          <button
            type="button"
            onClick={handleCycleTheme}
            title={
              appTheme === 'LIGHT'
                ? "Thème d'affichage : Clair (Cliquer pour Sombre)"
                : appTheme === 'DARK'
                ? "Thème d'affichage : Sombre (Cliquer pour Automatique)"
                : "Thème d'affichage : Automatique (Suit votre système/téléphone - Cliquer pour Clair)"
            }
            className="h-8 px-2 rounded-xl bg-blue-900/90 hover:bg-blue-800 dark:bg-slate-800 dark:hover:bg-slate-700 text-blue-100 hover:text-white flex items-center space-x-1 text-xs font-bold transition border border-blue-700/60 dark:border-slate-700 active:scale-95"
          >
            {appTheme === 'LIGHT' ? (
              <>
                <Sun className="w-3.5 h-3.5 text-amber-300" />
                <span className="hidden md:inline">Clair</span>
              </>
            ) : appTheme === 'DARK' ? (
              <>
                <Moon className="w-3.5 h-3.5 text-blue-300" />
                <span className="hidden md:inline">Sombre</span>
              </>
            ) : (
              <>
                <Monitor className="w-3.5 h-3.5 text-emerald-300" />
                <span className="hidden md:inline">Auto</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={() => {
              loadAnnualData(annualStartYear);
              setShowAnnualModal(true);
            }}
            title="Consulter le bilan annuel et le décompte de mon quota d'heures (Septembre à Août)"
            className="h-8 px-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white flex items-center space-x-1.5 text-xs font-bold transition shadow-xs active:scale-95"
          >
            <span>🎯</span>
            <span className="hidden sm:inline">Bilan Annuel</span>
          </button>

          <button
            onClick={() => {
              setPeriodForm({
                label: '🏖️ Jour à 0 h (Congés)',
                startDate: selectedDate,
                endDate: selectedDate,
                reasonId: 'JOUR_ZERO',
                impact: 'NEUTRAL',
                skipWeekends: true
              });
              setShowPeriodModal(true);
            }}
            title="Poser des jours à 0h, congés ou vacances sur plusieurs jours"
            className="h-8 px-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white flex items-center space-x-1.5 text-xs font-bold transition shadow-xs active:scale-95"
          >
            <span>🏖️</span>
            <span>Jours à 0h / Congés</span>
          </button>

          <button
            onClick={() => {
              setHabitualForm(habitualSchedule);
              setSettingsTab('SCHEDULE');
              setShowHabitualModal(true);
            }}
            title="Modifier mes horaires ou gérer la base de données"
            className="h-8 px-2.5 rounded-xl bg-blue-900/90 hover:bg-blue-800 dark:bg-slate-800 dark:hover:bg-slate-700 text-blue-200 dark:text-blue-300 hover:text-white flex items-center space-x-1 text-xs font-bold transition border border-blue-700/60 dark:border-slate-700"
          >
            <Settings className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Réglages</span>
          </button>

          <button
            onClick={handleUndo}
            title="Annuler ma dernière erreur"
            className="h-8 px-2.5 rounded-xl bg-blue-900/90 hover:bg-blue-800 dark:bg-slate-800 dark:hover:bg-slate-700 text-blue-200 dark:text-blue-300 hover:text-white flex items-center space-x-1 text-xs font-bold transition border border-blue-700/60 dark:border-slate-700"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Annuler</span>
          </button>

          <button
            onClick={() => setShowShareModal(true)}
            title="Transmettre ma feuille de pointage par WhatsApp, Email ou SMS"
            className="h-8 px-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white flex items-center space-x-1.5 text-xs font-bold transition shadow-xs active:scale-95"
          >
            <Share2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Transmettre</span>
          </button>

          <button
            onClick={handlePrintMonthly}
            title="Imprimer mon relevé officiel mensuel pour l'employeur"
            className="w-8 h-8 rounded-xl bg-blue-600 hover:bg-blue-500 text-white flex items-center justify-center transition shadow-xs"
          >
            <Printer className="w-4 h-4" />
          </button>

          {/* BOUTON ACCÈS ADMIN (CODE PIN) */}
          <button
            type="button"
            onClick={() => {
              if (isAdminUnlocked) {
                handleLockAdmin();
                alert("Mode administrateur verrouillé.");
              } else {
                setAdminPinInput('');
                setAdminPinError(null);
                setShowAdminPinModal(true);
              }
            }}
            title={
              isAdminUnlocked
                ? "Mode Administrateur DÉVERROUILLÉ (Cliquer pour verrouiller)"
                : "Déverrouiller le Mode Administrateur (Sauvegardes et Maintenance)"
            }
            className={`h-8 px-2 rounded-xl flex items-center space-x-1 text-xs font-bold transition border active:scale-95 ${
              isAdminUnlocked
                ? 'bg-amber-600 hover:bg-amber-500 text-white border-amber-400 shadow-sm'
                : 'bg-blue-900/90 hover:bg-blue-800 dark:bg-slate-800 dark:hover:bg-slate-700 text-blue-200 dark:text-blue-300 hover:text-white border-blue-700/60 dark:border-slate-700'
            }`}
          >
            {isAdminUnlocked ? <Unlock className="w-3.5 h-3.5 text-amber-200" /> : <Lock className="w-3.5 h-3.5" />}
            <span className="hidden lg:inline">{isAdminUnlocked ? 'Admin 🔓' : 'Admin'}</span>
          </button>

          {/* BADGE UTILISATEUR & CHANGEMENT DE COMPTE / DÉCONNEXION */}
          <div className="flex items-center pl-1.5 ml-1 border-l border-blue-800/80 dark:border-slate-700">
            <button
              type="button"
              onClick={handleLogout}
              title={`Connecté en tant que ${currentUser.display_name} (@${currentUser.username}). Cliquez pour changer de compte ou vous déconnecter.`}
              className="h-8 px-2.5 rounded-xl bg-blue-900/90 hover:bg-rose-600/90 dark:bg-slate-800 dark:hover:bg-rose-700/80 text-white flex items-center space-x-1.5 text-xs font-semibold transition border border-blue-700/60 dark:border-slate-700 group active:scale-95"
            >
              <UserCheck className="w-3.5 h-3.5 text-emerald-400 group-hover:hidden" />
              <LogOut className="w-3.5 h-3.5 text-white hidden group-hover:inline" />
              <span className="max-w-[70px] sm:max-w-[110px] truncate">{currentUser.display_name}</span>
              <span className="text-[10px] text-blue-200 group-hover:text-white hidden md:inline">Sortir</span>
            </button>
          </div>
        </div>
      </header>

      {/* CONTENU PRINCIPAL */}
      <main className="max-w-xl mx-auto p-3.5 space-y-4 no-print">
        {/* BANDEAU POINTAGE RAPIDE D'AUJOURD'HUI */}
        {(() => {
          const dayNum = new Date().getDay();
          const isWeekday = dayNum >= 1 && dayNum <= 5;
          const isTodayRecorded = entries.some((e) => e.entry_date === todayStr);
          if (!isWeekday || isTodayRecorded || currentMonth !== todayMonth) return null;

          return (
            <div className="bg-gradient-to-r from-amber-500/15 via-orange-500/10 to-amber-500/15 border-2 border-amber-400 rounded-3xl p-3.5 flex items-center justify-between shadow-xs animate-in fade-in">
              <div className="flex items-center space-x-2.5">
                <div className="w-9 h-9 rounded-2xl bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-xs">
                  <Zap className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center space-x-1.5">
                    <strong className="text-xs font-black text-amber-950">Aujourd'hui non pointé</strong>
                    <span className="text-[10px] font-bold text-amber-700 bg-amber-100 px-1.5 py-0.2 rounded">En attente</span>
                  </div>
                  <p className="text-[11px] text-amber-900 font-medium mt-0.5">
                    Avez-vous fait vos {habitualSchedule.expectedHours}h ({habitualSchedule.startTime} - {habitualSchedule.endTime}) ?
                  </p>
                </div>
              </div>

              <button
                type="button"
                disabled={quickBadgingToday}
                onClick={handleQuickBadgeToday}
                className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 active:scale-95 text-white font-black text-xs transition shadow-md whitespace-nowrap shrink-0 flex items-center space-x-1"
              >
                <span>{quickBadgingToday ? 'Validation...' : 'Valider en 1 clic ⚡'}</span>
              </button>
            </div>
          );
        })()}
        {/* ========================================================= */}
        {/* BLOC 1 : NAVIGATION MOIS PAR MOIS & OBJECTIF DU MOIS      */}
        {/* ========================================================= */}
        <section className="bg-white dark:bg-slate-900 rounded-3xl p-4 shadow-sm border border-slate-200 dark:border-slate-800 space-y-3">
          {/* BARRE DE CHANGEMENT DE MOIS */}
          <div className="flex items-center justify-between gap-1.5">
            <button
              type="button"
              onClick={handlePrevMonth}
              title="Mois précédent"
              className="px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-bold flex items-center space-x-1 transition active:scale-95 shadow-2xs"
            >
              <ChevronLeft className="w-4 h-4" />
              <span className="hidden sm:inline">Précédent</span>
            </button>

            {/* SÉLECTEUR DIRECT DE MOIS & RETOUR AU MOIS EN COURS */}
            <div className="flex items-center space-x-1.5">
              <input
                type="month"
                value={currentMonth}
                onChange={(e) => handleSelectMonth(e.target.value)}
                className="px-2.5 py-1 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 font-black text-sm text-slate-900 dark:text-slate-100 rounded-xl border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-blue-500 cursor-pointer shadow-2xs text-center"
                title="Cliquer pour choisir un mois directement dans le calendrier"
              />
              {currentMonth !== todayMonth && (
                <button
                  type="button"
                  onClick={handleCurrentMonth}
                  className="px-2 py-1 rounded-xl bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/60 dark:hover:bg-blue-900 text-blue-700 dark:text-blue-300 font-bold text-xs border border-blue-200 dark:border-blue-800 transition active:scale-95 flex items-center space-x-1"
                  title="Revenir au mois en cours"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span className="hidden sm:inline">Ce mois</span>
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={handleNextMonth}
              title="Mois suivant"
              className="px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-bold flex items-center space-x-1 transition active:scale-95 shadow-2xs"
            >
              <span className="hidden sm:inline">Suivant</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* BADGE CONGÉS / JOURS À 0H POSÉS CE MOIS */}
          {cpDaysThisMonth > 0 && (
            <div className="flex items-center justify-between bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 px-3 py-1.5 rounded-2xl text-xs text-emerald-900 dark:text-emerald-200 font-bold">
              <span className="flex items-center space-x-1.5">
                <span>🏖️</span>
                <span>Jours à 0 h / congés en {monthDisplay} : <strong>{cpDaysThisMonth} jour{cpDaysThisMonth > 1 ? 's' : ''}</strong></span>
              </span>
              <button
                type="button"
                onClick={() => {
                  setPeriodForm({
                    label: '🏖️ Jour à 0 h (Congés)',
                    startDate: `${currentMonth}-01`,
                    endDate: `${currentMonth}-15`,
                    reasonId: 'JOUR_ZERO',
                    impact: 'NEUTRAL',
                    skipWeekends: true
                  });
                  setShowPeriodModal(true);
                }}
                className="text-[11px] text-emerald-700 hover:text-emerald-950 dark:text-emerald-400 dark:hover:text-emerald-300 underline font-semibold"
              >
                + Ajouter des jours à 0h
              </button>
            </div>
          )}

          {/* CARTE QUOTA ANNUEL SCOLAIRE (SEPTEMBRE À AOÛT) AVEC DÉCOMPTE D'HEURES */}
          <div className="bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/30 rounded-2xl p-3 border-2 border-amber-300 dark:border-amber-800/60 shadow-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5">
            <div className="flex items-start sm:items-center space-x-2.5">
              <div className="w-9 h-9 rounded-xl bg-amber-500 text-white flex items-center justify-center font-bold text-base shadow-xs shrink-0">
                🎯
              </div>
              <div>
                <div className="flex items-center space-x-1.5 flex-wrap">
                  <span className="text-xs font-black text-amber-950 dark:text-amber-200 uppercase tracking-tight">
                    Quota Annuel Scolaire ({annualSummary ? annualSummary.school_year : `${annualStartYear} - ${annualStartYear + 1}`})
                  </span>
                  <span className="text-[10px] px-1.5 py-0.2 rounded-md bg-amber-200/80 dark:bg-amber-900/60 text-amber-900 dark:text-amber-300 font-extrabold">
                    Sept. - Août
                  </span>
                </div>
                <p className="text-xs text-amber-900 dark:text-amber-300 font-bold mt-0.5">
                  {annualSummary ? (
                    annualSummary.remaining_contract_hours > 0 ? (
                      <>
                        <strong>{formatDuration(annualSummary.total_worked_hours)}</strong> faites sur <strong>{formatDuration(annualSummary.annual_contract_hours)}</strong> • Reste <strong className="text-amber-700 dark:text-amber-400 font-black">{formatDuration(annualSummary.remaining_contract_hours)}</strong> à faire
                      </>
                    ) : (
                      <>
                        🎉 Quota de <strong>{formatDuration(annualSummary.annual_contract_hours)}</strong> complété ! (<strong>+{formatDuration(annualSummary.overtime_contract_hours)}</strong> de surplus)
                      </>
                    )
                  ) : (
                    'Chargement du décompte annuel...'
                  )}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                loadAnnualData(annualStartYear);
                setShowAnnualModal(true);
              }}
              className="px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs shadow-xs active:scale-95 transition flex items-center justify-center space-x-1 shrink-0 self-end sm:self-auto"
            >
              <span>Voir le bilan</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* BARRE DE PROGRESSION DU MOIS (OBJECTIF PLANNING vs EFFECTUÉ) */}
          <div className="bg-gradient-to-br from-blue-50 to-indigo-50/70 dark:from-slate-900/90 dark:to-slate-800/90 rounded-3xl p-4 border-2 border-blue-300 dark:border-blue-900/60 shadow-sm space-y-3.5">
            {/* ENCART PRINCIPAL TRÈS VISIBLE : HEURES DEMANDÉES AU PLANNING */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl p-3.5 border-2 border-blue-500 dark:border-blue-600 shadow-md flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <span className="text-xs font-black text-blue-950 dark:text-blue-200 uppercase tracking-tight flex items-center space-x-1.5">
                  <span className="text-base">🎯</span>
                  <span>Heures demandées au planning ({monthDisplay}) :</span>
                </span>
                <p className="text-[11px] text-slate-600 dark:text-slate-400 font-medium mt-0.5">
                  Objectif de votre planning mairie (ex : 88h ou 46h39 — modifiable à tout moment)
                </p>
              </div>

              {/* RÉGLAGE GRAND FORMAT TRÈS VISIBLE ET CONFORTABLE SUR MOBILE */}
              <div className="flex items-center space-x-2 self-end sm:self-auto">
                <button
                  type="button"
                  onClick={() => {
                    const val = Math.max(0, Math.round((monthlyTargetInput - 5) * 100) / 100);
                    handleSaveMonthlyTarget(val);
                  }}
                  className="w-11 h-11 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 border-2 border-slate-300 dark:border-slate-700 font-black text-slate-800 dark:text-slate-200 text-base flex items-center justify-center active:scale-95 shadow-xs"
                  title="Diminuer de 5 heures"
                >
                  -5
                </button>

                <div className="flex items-center bg-blue-50 dark:bg-slate-800 border-2 border-blue-600 dark:border-blue-500 rounded-xl px-2.5 h-11 shadow-inner" title="Tapez vos heures du planning (ex: 88 ou 46h39)">
                  <input
                    type="text"
                    value={targetInputStr}
                    onChange={(e) => setTargetInputStr(e.target.value)}
                    onBlur={() => handleSaveMonthlyTarget(targetInputStr)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleSaveMonthlyTarget(targetInputStr);
                      }
                    }}
                    placeholder="46h39"
                    className="w-24 h-8 text-center font-black text-xl text-blue-950 dark:text-blue-100 bg-transparent focus:outline-none"
                  />
                </div>

                <button
                  type="button"
                  onClick={() => {
                    const val = Math.round((monthlyTargetInput + 5) * 100) / 100;
                    handleSaveMonthlyTarget(val);
                  }}
                  className="w-11 h-11 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 border-2 border-slate-300 dark:border-slate-700 font-black text-slate-800 dark:text-slate-200 text-base flex items-center justify-center active:scale-95 shadow-xs"
                  title="Augmenter de 5 heures"
                >
                  +5
                </button>
              </div>
            </div>

            {/* BARRE DE PROGRESSION VISUELLE */}
            <div className="space-y-1">
              <div className="flex justify-between text-[11px] font-bold text-blue-950 dark:text-blue-200 px-1">
                <span>Progression : <strong>{formatDuration(totalWorkedThisMonth)}</strong> faites sur <strong>{formatPlanningHours(targetThisMonth)}</strong></span>
                <span className="text-blue-700 dark:text-blue-300 font-black bg-white dark:bg-slate-800 px-2 py-0.5 rounded-lg border border-blue-200 dark:border-slate-700 text-xs shadow-2xs">
                  {monthProgressPercent}% effectué
                </span>
              </div>
              <div className="w-full bg-blue-200/80 dark:bg-slate-700 rounded-full h-4 overflow-hidden p-0.5 shadow-inner">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    totalWorkedThisMonth >= targetThisMonth
                      ? 'bg-emerald-500'
                      : 'bg-blue-600'
                  }`}
                  style={{ width: `${monthProgressPercent}%` }}
                />
              </div>
            </div>

            {/* LES 3 TUILLES GRAND FORMAT */}
            <div className="grid grid-cols-3 gap-2.5 text-center pt-1 text-xs">
              <div className="bg-white dark:bg-slate-800/90 p-2.5 rounded-2xl border-2 border-blue-200 dark:border-slate-700 shadow-2xs">
                <span className="text-[10px] text-slate-500 dark:text-slate-400 block font-bold uppercase tracking-tight">Demandé planning</span>
                <strong className="text-base font-black text-slate-900 dark:text-slate-100">{formatPlanningHours(targetThisMonth)}</strong>
              </div>
              <div className="bg-white dark:bg-slate-800/90 p-2.5 rounded-2xl border-2 border-blue-400 dark:border-blue-500/80 shadow-2xs">
                <span className="text-[10px] text-blue-700 dark:text-blue-300 block font-bold uppercase tracking-tight">Effectué</span>
                <strong className="text-base font-black text-blue-700 dark:text-blue-300">{formatDuration(totalWorkedThisMonth)}</strong>
              </div>
              <div className="bg-white dark:bg-slate-800/90 p-2.5 rounded-2xl border-2 border-indigo-200 dark:border-indigo-800/60 shadow-2xs">
                <span className="text-[10px] text-slate-500 dark:text-slate-400 block font-bold uppercase tracking-tight">
                  {totalWorkedThisMonth >= targetThisMonth ? 'Heures en rab' : 'Reste à faire'}
                </span>
                <strong
                  className={`text-base font-black ${
                    totalWorkedThisMonth >= targetThisMonth
                      ? 'text-emerald-700 dark:text-emerald-400'
                      : 'text-indigo-700 dark:text-indigo-300'
                  }`}
                >
                  {totalWorkedThisMonth >= targetThisMonth
                    ? `+${formatDuration(monthOvertimeHours)}`
                    : `${formatDuration(monthRemainingHours)}`}
                </strong>
              </div>
            </div>

            {/* EXPLICATION SIMPLE SOUS LA JAUGE */}
            <p className="text-[11px] text-blue-950 dark:text-blue-200 font-medium leading-snug bg-blue-100/70 dark:bg-slate-800/80 p-2.5 rounded-xl border border-blue-200 dark:border-slate-700">
              💡 <strong>Suivi de votre mois :</strong> Sur vos <strong>{formatPlanningHours(targetThisMonth)}</strong> demandées au planning pour le mois, vous avez effectué <strong>{formatDuration(totalWorkedThisMonth)}</strong> ({monthProgressPercent}%). {totalWorkedThisMonth >= targetThisMonth ? `Objectif atteint avec +${formatDuration(monthOvertimeHours)} de rab !` : `Il vous reste ${formatDuration(monthRemainingHours)} à effectuer d'ici la fin du mois.`}
            </p>
          </div>
        </section>

        {/* ========================================================= */}
        {/* BLOC 2 : LES 2 COMPTEURS GÉANTS ("ON ME DOIT" vs "JE DOIS") */}
        {/* ========================================================= */}
        <section className="bg-slate-900 text-white rounded-3xl p-4 shadow-xl border border-slate-800 space-y-3">
          <div className="text-[11px] uppercase tracking-wider text-slate-400 font-bold flex items-center justify-between border-b border-slate-800 pb-2">
            <span>Mes soldes d'heures (Surplus vs À rattraper)</span>
            <span className="text-emerald-400 text-xs">● À jour</span>
          </div>

          {/* RAPPEL DE CLARTÉ : DIFFÉRENCE AVEC L'OBJECTIF DU MOIS */}
          <div className="bg-slate-800/70 border border-slate-700/60 rounded-2xl p-2.5 text-[11px] text-slate-300 leading-snug">
            💡 <strong>Règle simple :</strong> Vos heures normales (10h45 - 14h45 = 4h) avancent votre <strong>objectif de 80h (Bloc 1 ci-dessus)</strong>. Ce volet ne comptabilise <strong>STRICTEMENT que les heures faites en surplus</strong> (au-delà du prévu) et les <strong>heures d'absence à rattraper</strong>.
          </div>

          <div className="grid grid-cols-2 gap-3">
            {/* COMPTEUR POSITIF : ON ME DOIT */}
            <div className="bg-emerald-950/60 border border-emerald-500/40 rounded-2xl p-3.5 flex flex-col justify-between">
              <div>
                <div className="flex items-center space-x-1.5 text-emerald-400">
                  <ArrowUpRight className="w-4 h-4" />
                  <span className="text-xs font-black uppercase tracking-tight">On me doit</span>
                </div>
                <p className="text-[10px] text-emerald-200/80 font-medium mt-0.5">
                  Uniquement surplus en rab
                </p>
                <div className="text-2xl sm:text-3xl font-black text-emerald-300 mt-1.5 tracking-tight">
                  {formatHours(summary?.total_positive_balance || 0)}
                </div>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => handleOpenAdjustment('POSITIVE', 'ADD')}
                  className="py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-black transition text-center shadow-xs active:scale-95 flex items-center justify-center space-x-1"
                  title="Rajouter manuellement des heures sup (report de solde, mission non pointée...)"
                >
                  <span>➕ Rajouter</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleOpenAdjustment('POSITIVE', 'SETTLE')}
                  className="py-2 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-200 border border-emerald-500/30 rounded-xl text-xs font-bold transition text-center shadow-xs active:scale-95"
                  title="Déduire des heures supplémentaires payées ou récupérées"
                >
                  <span>✓ C'est réglé</span>
                </button>
              </div>
            </div>

            {/* COMPTEUR NÉGATIF : JE DOIS */}
            <div className="bg-rose-950/60 border border-rose-500/40 rounded-2xl p-3.5 flex flex-col justify-between">
              <div>
                <div className="flex items-center space-x-1.5 text-rose-400">
                  <ArrowDownRight className="w-4 h-4" />
                  <span className="text-xs font-black uppercase tracking-tight">Je dois</span>
                </div>
                <p className="text-[10px] text-rose-200/80 font-medium mt-0.5">
                  Uniquement heures à rattraper
                </p>
                <div className="text-2xl sm:text-3xl font-black text-rose-300 mt-1.5 tracking-tight">
                  {formatHours(-Math.abs(summary?.total_negative_balance || 0))}
                </div>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => handleOpenAdjustment('NEGATIVE', 'ADD')}
                  className="py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-black transition text-center shadow-xs active:scale-95 flex items-center justify-center space-x-1"
                  title="Rajouter manuellement des heures dues / à rattraper (report antérieur...)"
                >
                  <span>➕ Rajouter</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleOpenAdjustment('NEGATIVE', 'SETTLE')}
                  className="py-2 bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 border border-rose-500/30 rounded-xl text-xs font-bold transition text-center shadow-xs active:scale-95"
                  title="Déduire des heures rattrapées"
                >
                  <span>✓ C'est rattrapé</span>
                </button>
              </div>
            </div>
          </div>

          {/* BANDEAU EXPLICATIF : TRANSPARENCE DES COMPTEURS */}
          {summary && ((summary.gross_positive_hours || 0) > 0 || (summary.gross_negative_hours || 0) > 0) && (
            <div className="bg-slate-800/80 border border-slate-700/60 rounded-xl p-2.5 text-[11px] text-slate-300 flex items-center justify-between">
              <div>
                <span className="text-slate-400 font-medium">Cumul total :</span>{' '}
                <strong className="text-emerald-300">+{summary.gross_positive_hours || 0}h</strong> sup •{' '}
                <strong className="text-rose-300">-{summary.gross_negative_hours || 0}h</strong> absence
              </div>
              <div>
                {(summary.gross_positive_hours || 0) > 0 && (summary.gross_negative_hours || 0) > 0 ? (
                  <span className="text-emerald-400 font-bold bg-emerald-950/80 px-2 py-0.5 rounded-md border border-emerald-600/40">
                    ✓ Déduction automatique appliquée
                  </span>
                ) : (
                  <span className="text-slate-400 font-medium">Solde direct</span>
                )}
              </div>
            </div>
          )}

          {/* LISTE DES RÈGLEMENTS MANUELS FILTRÉS PAR LE MOIS ACTIF */}
          {(() => {
            const monthRegularizations = regularizationsList.filter((r) => r.reg_date?.startsWith(currentMonth));
            const displayList = showAllRegularizations ? regularizationsList : monthRegularizations;

            if (displayList.length === 0 && !showAllRegularizations && regularizationsList.length === 0) {
              return null;
            }

            return (
              <div className="bg-slate-800/90 border border-amber-500/40 rounded-2xl p-3 text-xs text-amber-200 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-[11px] uppercase tracking-wide text-amber-400">
                    ⚖️ Règlements {showAllRegularizations ? 'historiques complets' : `de ${monthDisplay}`} ({displayList.length}) :
                  </span>
                  {regularizationsList.length > monthRegularizations.length && (
                    <button
                      type="button"
                      onClick={() => setShowAllRegularizations(!showAllRegularizations)}
                      className="text-[10px] text-blue-300 hover:text-white underline font-semibold transition"
                    >
                      {showAllRegularizations
                        ? `Afficher seulement ${monthDisplay}`
                        : `Voir tout l'historique (${regularizationsList.length})`}
                    </button>
                  )}
                </div>

                {displayList.length === 0 ? (
                  <p className="text-[11px] text-slate-400 italic">
                    Aucun règlement manuel enregistré pour le mois de {monthDisplay}.
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {displayList.map((r) => {
                      const isAdd = r.operation_type === 'ADD';
                      let badge = '';
                      let badgeClass = '';

                      if (r.counter_type === 'POSITIVE') {
                        if (isAdd) {
                          badge = `➕ +${r.amount_hours}h ajoutées au crédit`;
                          badgeClass = 'text-emerald-300 font-black';
                        } else {
                          badge = `✓ -${r.amount_hours}h payées / réglées`;
                          badgeClass = 'text-emerald-400 font-bold';
                        }
                      } else {
                        if (isAdd) {
                          badge = `➕ -${r.amount_hours}h de dette ajoutée`;
                          badgeClass = 'text-rose-300 font-black';
                        } else {
                          badge = `✓ +${r.amount_hours}h rattrapées / déduites`;
                          badgeClass = 'text-rose-400 font-bold';
                        }
                      }

                      return (
                        <div key={r.id} className="flex items-center justify-between bg-slate-900/90 px-3 py-1.5 rounded-xl border border-slate-700/60 text-xs">
                          <span>
                            📅 {r.reg_date} : <strong className={badgeClass}>{badge}</strong> <span className="opacity-75">({r.reason})</span>
                          </span>
                          <button
                            type="button"
                            onClick={async () => {
                              if (confirm(`Annuler cette opération de ${r.amount_hours}h ?`)) {
                                await deleteRegularization(r.id);
                                await loadMonthData();
                              }
                            }}
                            className="px-2 py-0.5 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30 rounded-lg text-[10px] font-bold transition active:scale-95"
                          >
                            Annuler
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })()}
        </section>

        {/* ========================================================= */}
        {/* BLOC 3 : LE POINTAGE DU JOUR (TRAVAIL OU ABSENCE AU CHOIX)*/}
        {/* ========================================================= */}
        <section
          ref={formSectionRef}
          className={`bg-white dark:bg-slate-900 rounded-3xl p-4 shadow-sm border transition duration-200 space-y-3.5 ${
            editingEntryDate === selectedDate
              ? 'border-amber-400 ring-2 ring-amber-400/40'
              : 'border-slate-200 dark:border-slate-800'
          }`}
        >
          {/* BANNIÈRE DE MODIFICATION EN COURS OU BADGE CALME DE JOURNÉE DÉJÀ POINTÉE */}
          {editingEntryDate === selectedDate ? (
            <div className="bg-amber-100 dark:bg-amber-950/60 border-2 border-amber-400 text-amber-950 dark:text-amber-200 p-3 rounded-2xl flex items-center justify-between shadow-xs">
              <div className="flex items-center space-x-2.5">
                <Edit2 className="w-5 h-5 text-amber-700 dark:text-amber-400 animate-pulse shrink-0" />
                <div>
                  <span className="font-black text-xs uppercase tracking-wide block">
                    Mode Modification en cours
                  </span>
                  <span className="text-[11px] text-amber-900 dark:text-amber-300 font-semibold">
                    Vous modifiez la journée du <strong>{selectedDate}</strong>
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={handleCancelEdit}
                className="px-2.5 py-1 bg-white dark:bg-slate-800 hover:bg-amber-50 dark:hover:bg-slate-700 text-amber-950 dark:text-amber-200 font-bold text-xs rounded-xl border border-amber-300 dark:border-slate-700 shadow-xs flex items-center space-x-1"
              >
                <X className="w-3.5 h-3.5" />
                <span>Annuler</span>
              </button>
            </div>
          ) : existingEntry ? (
            <div className="bg-blue-50/80 dark:bg-slate-800/80 border border-blue-200 dark:border-slate-700 text-blue-950 dark:text-blue-200 px-3.5 py-2.5 rounded-2xl flex items-center justify-between text-xs">
              <div className="flex items-center space-x-2">
                <CheckCircle2 className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                <div>
                  <span className="font-bold text-slate-800 dark:text-slate-100">
                    Journée déjà enregistrée
                  </span>
                  <span className="text-[11px] text-slate-600 dark:text-slate-400 block">
                    {existingEntry.status_id
                      ? `Absence : ${existingEntry.notes || 'Déclarée'}`
                      : `${existingEntry.actual_hours}h faites (${existingEntry.start_time} - ${existingEntry.end_time})`}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleDeleteDay(selectedDate)}
                className="px-2.5 py-1 text-rose-600 hover:text-rose-800 dark:text-rose-400 dark:hover:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-xs font-bold rounded-xl border border-rose-200 dark:border-rose-900/60 transition"
              >
                🗑️ Effacer
              </button>
            </div>
          ) : null}

          {/* SÉLECTEUR DE LA DATE & NAVIGATION DANS LE TEMPS */}
          <div className="space-y-1.5 pb-2.5 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center justify-between gap-1.5">
              {/* FLÈCHE JOUR PRÉCÉDENT */}
              <button
                type="button"
                onClick={handlePrevDay}
                title="Jour précédent"
                className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 flex items-center justify-center font-bold text-slate-700 dark:text-slate-200 transition shrink-0 active:scale-95 shadow-2xs"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              {/* SÉLECTEUR DE DATE NATIF */}
              <div className="relative flex-1">
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => handleSelectDate(e.target.value)}
                  className="w-full h-9 px-2 bg-slate-50 hover:bg-slate-100/80 dark:bg-slate-800 dark:hover:bg-slate-700 font-black text-xs sm:text-sm text-slate-900 dark:text-slate-100 rounded-xl border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-blue-500 cursor-pointer text-center shadow-2xs"
                  title="Cliquer pour choisir n'importe quelle date dans le calendrier"
                />
              </div>

              {/* FLÈCHE JOUR SUIVANT */}
              <button
                type="button"
                onClick={handleNextDay}
                title="Jour suivant"
                className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 flex items-center justify-center font-bold text-slate-700 dark:text-slate-200 transition shrink-0 active:scale-95 shadow-2xs"
              >
                <ChevronRight className="w-4 h-4" />
              </button>

              {/* BOUTON RAPIDE AUJOURD'HUI */}
              {selectedDate === todayStr ? (
                <span className="px-2.5 py-1 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 rounded-xl text-xs font-black shrink-0 flex items-center space-x-1">
                  <span>✓</span>
                  <span>Aujourd'hui</span>
                </span>
              ) : (
                <button
                  type="button"
                  onClick={handleGoToToday}
                  className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition shrink-0 flex items-center space-x-1 shadow-xs active:scale-95"
                  title="Revenir directement à la journée d'aujourd'hui"
                >
                  <Calendar className="w-3.5 h-3.5" />
                  <span>Aujourd'hui</span>
                </button>
              )}
            </div>

            {/* DATE LISIBLE EN FRANÇAIS + STATUT TEMPOREL */}
            <div className="flex items-center justify-between text-xs px-1 font-semibold text-slate-600 dark:text-slate-400">
              <span className="text-slate-800 dark:text-slate-200 font-bold">
                📅 {formatDateFrench(selectedDate)}
              </span>
              {selectedDate !== todayStr && (
                <span
                  className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                    selectedDate < todayStr
                      ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-900 dark:text-amber-300 border border-amber-200 dark:border-amber-800'
                      : 'bg-blue-100 dark:bg-blue-950/60 text-blue-900 dark:text-blue-300 border border-blue-200 dark:border-blue-800'
                  }`}
                >
                  {selectedDate < todayStr ? 'Jour passé' : 'Jour futur'}
                </span>
              )}
            </div>
          </div>

          {/* RAPPEL DES HORAIRES HABITUELS ET MODIFICATION */}
          <div className="bg-slate-50/90 dark:bg-slate-800/80 px-3 py-2 rounded-2xl border border-slate-200 dark:border-slate-700 flex items-center justify-between text-xs">
            <div className="flex items-center space-x-1.5 truncate">
              <span className="text-slate-500 dark:text-slate-400 font-medium">Horaires habituels :</span>
              <strong className="text-blue-900 dark:text-blue-300 font-black">
                {habitualSchedule.startTime} - {habitualSchedule.endTime} ({habitualSchedule.expectedHours}h/j)
              </strong>
            </div>
            <button
              type="button"
              onClick={() => {
                setHabitualForm(habitualSchedule);
                setShowHabitualModal(true);
              }}
              className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 font-bold text-xs flex items-center space-x-1 shrink-0 ml-2 hover:underline"
            >
              <Settings className="w-3.5 h-3.5" />
              <span>Modifier</span>
            </button>
          </div>

          {/* DEUX CHOIX LIMPIDES : J'AI TRAVAILLÉ OU JE N'AI PAS TRAVAILLÉ */}
          <div className="grid grid-cols-2 gap-2 bg-slate-100 dark:bg-slate-800 p-1.5 rounded-2xl">
            <button
              type="button"
              onClick={() => setDayType('WORKED')}
              className={`py-2 px-3 rounded-xl text-xs font-black transition flex items-center justify-center space-x-1.5 ${
                dayType === 'WORKED'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Briefcase className="w-4 h-4" />
              <span>J'ai travaillé</span>
            </button>

            <button
              type="button"
              onClick={() => setDayType('ABSENT')}
              className={`py-2 px-3 rounded-xl text-xs font-black transition flex items-center justify-center space-x-1.5 ${
                dayType === 'ABSENT'
                  ? 'bg-amber-600 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <AlertCircle className="w-4 h-4" />
              <span>Absence / Exceptionnel</span>
            </button>
          </div>

          <form onSubmit={handleSaveDay} className="space-y-3">
            {dayType === 'WORKED' ? (
              /* CAS 1 : JOURNÉE TRAVAILLÉE NORMALE */
              <div className="space-y-3">
                {/* HORAIRES D'ARRIVÉE ET DE DÉPART */}
                <div className="bg-slate-50 dark:bg-slate-800/60 p-3 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-2.5">
                  <label className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase block">
                    Mes horaires réels (arrivée et départ) :
                  </label>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 block mb-0.5">
                        Heure d'arrivée
                      </span>
                      <input
                        type="time"
                        value={startTime}
                        onChange={(e) => setStartTime(e.target.value)}
                        className="w-full h-11 bg-white dark:bg-slate-900 rounded-xl border border-slate-300 dark:border-slate-700 font-black text-center text-base text-slate-900 dark:text-slate-100"
                      />
                    </div>
                    <div>
                      <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 block mb-0.5">
                        Heure de départ
                      </span>
                      <input
                        type="time"
                        value={endTime}
                        onChange={(e) => setEndTime(e.target.value)}
                        className="w-full h-11 bg-white dark:bg-slate-900 rounded-xl border border-slate-300 dark:border-slate-700 font-black text-center text-base text-slate-900 dark:text-slate-100"
                      />
                    </div>
                  </div>

                  {/* 3. PAUSE REPAS JUSQU'À 1 HEURE ET MODIFIABLE SUR MESURE */}
                  <div className="bg-white dark:bg-slate-900 p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-slate-700 dark:text-slate-200">
                        Pause repas (non payée) :
                      </span>
                      <span className="text-xs font-black text-blue-900 dark:text-blue-300 bg-blue-50 dark:bg-slate-800 px-2 py-0.5 rounded border border-blue-200 dark:border-slate-700">
                        {breakMinutes === 0
                          ? 'Aucune pause (0 min)'
                          : breakMinutes === 60
                          ? '1 h 00 (60 min)'
                          : `${breakMinutes} min`}
                      </span>
                    </div>

                    {/* Boutons rapides jusqu'à 1 heure (60 min) */}
                    <div className="grid grid-cols-5 gap-1">
                      {[0, 15, 30, 45, 60].map((m) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => setBreakMinutes(m)}
                          className={`py-1.5 rounded-lg text-xs font-bold border transition ${
                            breakMinutes === m
                              ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                              : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700'
                          }`}
                        >
                          {m === 60 ? '1h (60m)' : `${m}m`}
                        </button>
                      ))}
                    </div>

                    {/* Ajustement précis et modifiable si besoin */}
                    <div className="pt-1.5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                      <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">
                        Ajuster précisément (modifiable) :
                      </span>
                      <div className="flex items-center space-x-1.5">
                        <button
                          type="button"
                          onClick={() => setBreakMinutes((bm) => Math.max(0, bm - 5))}
                          className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 text-xs font-bold flex items-center justify-center active:scale-95"
                        >
                          -5m
                        </button>
                        <input
                          type="number"
                          min="0"
                          max="180"
                          step="5"
                          value={breakMinutes}
                          onChange={(e) => setBreakMinutes(Math.max(0, parseInt(e.target.value, 10) || 0))}
                          className="w-14 h-7 text-center font-black text-xs bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-1 focus:ring-blue-500"
                        />
                        <span className="text-xs font-bold text-slate-600 dark:text-slate-400">min</span>
                        <button
                          type="button"
                          onClick={() => setBreakMinutes((bm) => bm + 5)}
                          className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 text-xs font-bold flex items-center justify-center active:scale-95"
                        >
                          +5m
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* CALCUL EN DIRECT */}
                  <div className="pt-2 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between text-xs">
                    <div>
                      <span className="text-slate-500 dark:text-slate-400">Temps réellement fait : </span>
                      <strong className="text-slate-900 dark:text-slate-100 text-sm font-black">{formatDuration(calculatedActual)}</strong>
                    </div>
                    <div>
                      <span className="text-slate-500 dark:text-slate-400">Écart : </span>
                      <span
                        className={`font-black text-sm px-2.5 py-0.5 rounded-lg ${
                          dayDelta > 0
                            ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300'
                            : dayDelta < 0
                            ? 'bg-rose-100 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        {formatHours(dayDelta)}
                      </span>
                    </div>
                  </div>

                  {/* ALERTE DE SÉCURITÉ ANTI-INVERSION HEURE D'ARRIVÉE / DÉPART */}
                  {calculatedActual >= 12 && (
                    <div className="p-3 bg-amber-50 dark:bg-amber-950/60 border-2 border-amber-400 rounded-xl text-xs text-amber-950 dark:text-amber-200 flex items-start space-x-2.5 shadow-2xs">
                      <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                      <div>
                        <strong className="block font-black text-amber-900 dark:text-amber-300">
                          Attention : Durée calculée très élevée ({calculatedActual} h) !
                        </strong>
                        <p className="text-[11px] text-amber-800 dark:text-amber-400 mt-0.5 leading-snug">
                          Avez-vous accidentellement inversé l'heure d'arrivée ({startTime}) et de départ ({endTime}) ?
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                {/* PRÉCISION FACULTATIVE */}
                <div>
                  <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 block mb-1">
                    Précision facultative (ex: récurage cantine, livraison...)
                  </span>
                  <input
                    type="text"
                    placeholder="Note personnelle"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="w-full h-10 px-3 bg-white dark:bg-slate-800 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 text-xs"
                  />
                </div>

                <button
                  type="submit"
                  disabled={savingDay}
                  className="w-full h-12 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm shadow-md transition active:scale-98 flex items-center justify-center space-x-2"
                >
                  <CheckCircle2 className="w-5 h-5" />
                  <span>
                    {savingDay
                      ? 'Enregistrement...'
                      : existingEntry
                      ? `💾 Mettre à jour cette journée (${selectedDate})`
                      : `Enregistrer ma journée de travail (${selectedDate})`}
                  </span>
                </button>
              </div>
            ) : (
              /* CAS 2 : ABSENCE / EXCEPTIONNEL AVEC CHOIX DE L'IMPACT */
              <div className="bg-amber-50/70 dark:bg-slate-800/60 p-3.5 rounded-2xl border border-amber-200 dark:border-amber-900/40 space-y-3">
                {/* RACCOURCI POSER PLUSIEURS JOURS / CONGÉS */}
                <div className="bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800/60 p-2.5 rounded-2xl flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <span className="text-xl">🏖️</span>
                    <div>
                      <span className="font-black text-emerald-950 dark:text-emerald-200 text-xs block">Besoin de poser plusieurs jours à 0 h / congés ?</span>
                      <span className="text-[10px] text-emerald-800 dark:text-emerald-400 font-medium">Pour 1 ou 2 semaines de vacances sans pointer jour par jour</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setPeriodForm({
                        label: '🏖️ Jour à 0 h (Congés)',
                        startDate: selectedDate,
                        endDate: selectedDate,
                        reasonId: 'JOUR_ZERO',
                        impact: 'NEUTRAL',
                        skipWeekends: true
                      });
                      setShowPeriodModal(true);
                    }}
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition shrink-0 shadow-xs active:scale-95"
                  >
                    Poser des jours à 0 h
                  </button>
                </div>

                <div>
                  <p className="text-xs font-bold text-amber-950 dark:text-amber-200 mb-1.5">
                    1. Choisissez le motif d'absence :
                  </p>
                  <div className="grid grid-cols-2 gap-1.5 max-h-48 overflow-y-auto p-1 bg-white/80 dark:bg-slate-800/80 rounded-xl border border-amber-200 dark:border-slate-700">
                    {ABSENCE_REASONS.map((r) => (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => {
                          setAbsenceReasonId(r.id);
                          setAbsenceImpact(r.defaultRule as any);
                        }}
                        className={`p-2 rounded-xl border text-left text-xs font-bold transition ${
                          absenceReasonId === r.id
                            ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                            : 'bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
                        }`}
                      >
                        <span className="truncate block">{r.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* 2. COMMENT COMPTE CETTE JOURNÉE ? (LE CHOIX ESSENTIEL) */}
                <div className="bg-white dark:bg-slate-900 p-3 rounded-xl border border-amber-300 dark:border-slate-700 space-y-2.5">
                  <span className="text-xs font-bold text-slate-900 dark:text-slate-100 block">
                    2. Comment cette journée doit-elle compter sur vos heures ?
                  </span>

                  <div className="grid grid-cols-3 gap-1.5">
                    <button
                      type="button"
                      onClick={() => setAbsenceImpact('COUNTED_AS_WORKED')}
                      className={`p-2.5 rounded-xl border text-center text-xs font-bold transition ${
                        absenceImpact === 'COUNTED_AS_WORKED'
                          ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                          : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700'
                      }`}
                    >
                      <span className="block text-base">🟢</span>
                      <span className="block mt-0.5 leading-tight text-xs font-black">Validé au mois</span>
                      <span className="text-[9px] font-normal block opacity-80">Compte au contrat</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setAbsenceImpact('TO_RECOVER')}
                      className={`p-2.5 rounded-xl border text-center text-xs font-bold transition ${
                        absenceImpact === 'TO_RECOVER'
                          ? 'bg-rose-600 text-white border-rose-600 shadow-xs'
                          : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700'
                      }`}
                    >
                      <span className="block text-base">🔴</span>
                      <span className="block mt-0.5 leading-tight text-xs font-black">À rattraper</span>
                      <span className="text-[9px] font-normal block opacity-80">Je dois les h</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setAbsenceImpact('NEUTRAL')}
                      className={`p-2.5 rounded-xl border text-center text-xs font-bold transition ${
                        absenceImpact === 'NEUTRAL'
                          ? 'bg-slate-800 dark:bg-slate-700 text-white border-slate-800 dark:border-slate-600 shadow-xs'
                          : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700'
                      }`}
                    >
                      <span className="block text-base">⚪</span>
                      <span className="block mt-0.5 leading-tight text-xs font-black">Neutre</span>
                      <span className="text-[9px] font-normal block opacity-80">Ne change rien</span>
                    </button>
                  </div>

                  {/* SI À RATTRAPER OU COMPTÉ FAIT : INDIQUER LE VOLUME D'HEURES */}
                  {absenceImpact !== 'NEUTRAL' && (
                    <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-700 dark:text-slate-200">
                        {absenceImpact === 'TO_RECOVER' ? 'Nombre d\'heures à devoir :' : 'Nombre d\'heures créditées :'}
                      </span>
                      <div className="flex items-center space-x-1.5">
                        <button
                          type="button"
                          onClick={() => setAbsenceHours((h) => Math.max(0.5, Math.round((h - 0.5) * 10) / 10))}
                          className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 text-xs font-bold"
                        >
                          -0.5
                        </button>
                        <input
                          type="number"
                          step="0.5"
                          min="0.5"
                          max="24"
                          value={absenceHours}
                          onChange={(e) => setAbsenceHours(parseFloat(e.target.value) || 0)}
                          className="w-16 h-8 text-center font-black text-sm bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
                        />
                        <span className="text-xs font-bold text-slate-700 dark:text-slate-300">h</span>
                        <button
                          type="button"
                          onClick={() => setAbsenceHours((h) => Math.round((h + 0.5) * 10) / 10)}
                          className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 text-xs font-bold"
                        >
                          +0.5
                        </button>
                      </div>
                    </div>
                  )}

                  {/* CALCUL ET CONSÉQUENCE EN DIRECT IMMÉDIATE */}
                  <div className="pt-2 border-t border-amber-200 dark:border-slate-800">
                    {absenceImpact === 'TO_RECOVER' && (
                      <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 rounded-xl text-xs space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="font-black text-rose-900 dark:text-rose-200">🔴 Conséquence sur vos compteurs :</span>
                          <span className="font-black text-rose-700 dark:text-rose-300 bg-rose-100 dark:bg-rose-900/60 px-2 py-0.5 rounded-lg text-sm">
                            - {absenceHours} h 00
                          </span>
                        </div>
                        <p className="text-[11px] text-rose-800 dark:text-rose-300 leading-relaxed">
                          Ces <strong>{absenceHours}h</strong> seront automatiquement déduites de vos heures supplémentaires en réserve (ou ajoutées à vos heures à rattraper si votre réserve d'heures sup est insuffisante).
                        </p>
                      </div>
                    )}

                    {absenceImpact === 'COUNTED_AS_WORKED' && (
                      <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/60 rounded-xl text-xs space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="font-black text-emerald-900 dark:text-emerald-200">🟢 Conséquence sur vos compteurs :</span>
                          <span className="font-black text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-900/60 px-2 py-0.5 rounded-lg text-sm">
                            + {absenceHours} h faites
                          </span>
                        </div>
                        <p className="text-[11px] text-emerald-800 dark:text-emerald-300 leading-relaxed">
                          Ces <strong>{absenceHours}h</strong> seront comptabilisées dans vos heures faites du mois. Vos compteurs "Je dois" et "On me doit" ne changent pas.
                        </p>
                      </div>
                    )}

                    {absenceImpact === 'NEUTRAL' && (
                      <div className="p-3 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-xs space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="font-black text-slate-800 dark:text-slate-200">⚪ Conséquence sur vos compteurs :</span>
                          <span className="font-black text-slate-700 dark:text-slate-300 bg-slate-200 dark:bg-slate-700 px-2 py-0.5 rounded-lg text-sm">
                            0 h 00
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
                          Journée neutralisée (0h attendue, 0h faite) : aucun impact sur vos compteurs ni sur les heures du mois.
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 block mb-1">
                    Précision facultative (ex: grippe, cantine fermée...)
                  </span>
                  <input
                    type="text"
                    placeholder="Note personnelle"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="w-full h-10 px-3 bg-white dark:bg-slate-800 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 text-xs"
                  />
                </div>

                <button
                  type="submit"
                  disabled={savingDay}
                  className="w-full h-12 rounded-2xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-sm shadow-md transition active:scale-98 flex items-center justify-center space-x-2"
                >
                  <CheckCircle2 className="w-5 h-5" />
                  <span>
                    {savingDay
                      ? 'Enregistrement...'
                      : existingEntry
                      ? `💾 Mettre à jour l'absence (${selectedDate})`
                      : `Enregistrer cette absence (${selectedDate})`}
                  </span>
                </button>
              </div>
            )}
          </form>
        </section>

        {/* ========================================================= */}
        {/* BLOC 4 : LE LIVRE DE PREUVES POUR L'EMPLOYEUR             */}
        {/* ========================================================= */}
        <section className="bg-white dark:bg-slate-900 rounded-3xl p-4 shadow-sm border border-slate-200 dark:border-slate-800 space-y-3">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
            <div>
              <h2 className="text-sm font-black text-slate-900 dark:text-slate-100 flex items-center space-x-1.5">
                <span>📋 Livre de Preuves ({monthDisplay})</span>
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Arrivée • Départ • Pause • Heures faites • Écart daté
              </p>
            </div>
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
              {entries.length} journée(s)
            </span>
          </div>

          {/* BILAN DU MOIS PROFESSIONNEL : HEURES FAITES vs DUES */}
          <div className="bg-slate-50 dark:bg-slate-800/80 p-3 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-2 text-xs">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <span className="text-[10px] text-emerald-700 dark:text-emerald-400 font-bold uppercase block">Heures sup faites</span>
                <span className="text-sm font-black text-emerald-800 dark:text-emerald-300">+{monthPositiveHours} h</span>
              </div>
              <div>
                <span className="text-[10px] text-rose-700 dark:text-rose-400 font-bold uppercase block">Heures à rattraper</span>
                <span className="text-sm font-black text-rose-800 dark:text-rose-300">
                  {monthNegativeHours > 0 ? `-${monthNegativeHours} h` : '0 h'}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-blue-700 dark:text-blue-400 font-bold uppercase block">Solde net compensé</span>
                <span
                  className={`text-sm font-black inline-block px-2 py-0.5 rounded-lg ${
                    monthNetBalance > 0
                      ? 'text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-950/60'
                      : monthNetBalance < 0
                      ? 'text-rose-700 dark:text-rose-300 bg-rose-100 dark:bg-rose-950/60'
                      : 'text-blue-700 dark:text-blue-300 bg-blue-100 dark:bg-blue-950/60'
                  }`}
                >
                  {monthNetBalance > 0
                    ? `+${monthNetBalance} h (On me doit)`
                    : monthNetBalance < 0
                    ? `${monthNetBalance} h (Je dois)`
                    : '0 h (Compensé)'}
                </span>
              </div>
            </div>

            {/* DÉCOMPTE SUR LES JOURS POINTÉS */}
            <div className="pt-2 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between text-[11px] text-slate-600 dark:text-slate-300">
              <span>
                Sur les <strong>{entries.length} jour(s) pointé(s)</strong> : 
                {' '}{totalExpectedThisMonth}h prévues • {totalWorkedThisMonth}h réelles faites
              </span>
              <span className="font-bold">
                Solde net :{' '}
                <strong className={monthNetBalance > 0 ? 'text-emerald-700 dark:text-emerald-400' : monthNetBalance < 0 ? 'text-rose-700 dark:text-rose-400' : 'text-blue-700 dark:text-blue-400'}>
                  {monthNetBalance > 0
                    ? `+${monthNetBalance} h en votre faveur`
                    : monthNetBalance < 0
                    ? `${monthNetBalance} h à compenser`
                    : '0 h (Parfaitement équilibré)'}
                </strong>
              </span>
            </div>
          </div>

          {/* LISTE DES JOURS AVEC ARRIVÉE, DÉPART ET MOTIFS CLAIRS */}
          <div className="space-y-2">
            {entries.length === 0 ? (
              <div className="p-6 text-center text-slate-400 dark:text-slate-500 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-dashed border-slate-200 dark:border-slate-700 text-xs font-semibold">
                Aucune journée enregistrée pour {monthDisplay}.
              </div>
            ) : (
              entries.map((e) => {
                const delta = e.delta_hours || 0;
                const isAbsent = Boolean(e.status_id);
                const isCurrentlyEditing = editingEntryDate === e.entry_date;

                return (
                  <div
                    key={e.entry_date}
                    className={`p-3 rounded-2xl border flex items-center justify-between text-xs transition duration-200 ${
                      isCurrentlyEditing
                        ? 'bg-amber-50/90 dark:bg-amber-950/60 border-amber-400 ring-2 ring-amber-400/50 shadow-md'
                        : 'bg-slate-50/90 dark:bg-slate-800/80 border-slate-200 dark:border-slate-700 hover:border-blue-400 dark:hover:border-blue-500'
                    }`}
                    style={{
                      borderLeftColor:
                        delta > 0 ? '#10B981' : delta < 0 ? '#F43F5E' : isAbsent ? '#D97706' : '#3B82F6',
                      borderLeftWidth: '5px'
                    }}
                  >
                    <div>
                      <div className="flex items-center space-x-1.5">
                        <strong className="text-slate-900 dark:text-slate-100 text-xs">
                          {e.entry_date}
                        </strong>
                        {isAbsent ? (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-950/60 text-amber-900 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                            Absence
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-blue-100 dark:bg-blue-950/60 text-blue-900 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                            Travaillé
                          </span>
                        )}
                        {isCurrentlyEditing && (
                          <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-amber-400 text-amber-950 animate-pulse">
                            En cours de modif
                          </span>
                        )}
                      </div>

                      {/* LIGNE DES HEURES OU MOTIF D'ABSENCE */}
                      <div className="text-slate-600 dark:text-slate-300 text-[11px] mt-1 space-y-0.5">
                        {isAbsent ? (
                          <div>
                            <span className="font-bold text-amber-900 dark:text-amber-300">
                              {e.notes || 'Absence déclarée'}
                            </span>
                            {delta < 0 ? (
                              <span className="ml-1.5 text-rose-700 dark:text-rose-400 font-bold">
                                (À rattraper : {Math.abs(delta)}h)
                              </span>
                            ) : e.actual_hours > 0 ? (
                              <span className="ml-1.5 text-emerald-700 dark:text-emerald-400 font-bold">
                                (Compté fait : {e.actual_hours}h)
                              </span>
                            ) : (
                              <span className="ml-1.5 text-slate-500 dark:text-slate-400 font-medium">
                                (Neutre)
                              </span>
                            )}
                          </div>
                        ) : e.start_time && e.end_time ? (
                          <div className="font-semibold text-slate-800 dark:text-slate-200">
                            Arrivée : <span className="font-bold text-blue-900 dark:text-blue-300">{e.start_time}</span> • Départ : <span className="font-bold text-blue-900 dark:text-blue-300">{e.end_time}</span>
                            {e.break_minutes > 0 && (
                              <span className="text-slate-400 dark:text-slate-500 ml-1">(pause {e.break_minutes}m)</span>
                            )}
                          </div>
                        ) : (
                          <div className="font-semibold text-slate-700 dark:text-slate-300">Pointage direct</div>
                        )}

                        <div className="text-slate-500 dark:text-slate-400 text-[10px]">
                          Prévu : <strong>{e.expected_hours}h</strong> • Fait : <strong>{e.actual_hours}h</strong>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center space-x-2">
                      <div className="text-right">
                        <span
                          className={`font-black text-xs px-2 py-1 rounded-xl block ${
                            delta > 0
                              ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300'
                              : delta < 0
                              ? 'bg-rose-100 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300'
                              : 'bg-slate-200/80 dark:bg-slate-700 text-slate-700 dark:text-slate-200'
                          }`}
                        >
                          {formatHours(delta)}
                        </span>
                        <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400">
                          {formatDuration(e.actual_hours)}
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleStartEdit(e)}
                        title="Modifier cette journée"
                        className={`px-2.5 py-1.5 rounded-xl font-bold text-xs flex items-center space-x-1 transition shadow-xs ${
                          isCurrentlyEditing
                            ? 'bg-amber-500 text-white ring-2 ring-amber-300'
                            : 'bg-blue-50 dark:bg-slate-800 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-slate-700 border border-blue-200 dark:border-slate-700'
                        }`}
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                        <span>Modifier</span>
                      </button>

                      <button
                        onClick={() => handleDeleteDay(e.entry_date)}
                        title="Effacer"
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>

        {/* ========================================================= */}
        {/* BLOC 5 : TRANSMETTRE & EXPORTER MA FEUILLE DE POINTAGE     */}
        {/* ========================================================= */}
        <section className="bg-gradient-to-br from-[#0D2B52] to-indigo-950 text-white rounded-3xl p-4.5 shadow-md border border-blue-900/40 space-y-3.5">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <h2 className="text-sm font-black tracking-tight flex items-center space-x-2">
                <span className="text-base">📤</span>
                <span>Transmettre ma feuille de pointage</span>
              </h2>
              <p className="text-[11px] text-blue-200">
                Envoyez votre récapitulatif de {monthDisplay} en 1 clic à votre mairie ou responsable.
              </p>
            </div>
            <button
              onClick={() => setShowShareModal(true)}
              className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold transition flex items-center space-x-1.5 border border-white/20 active:scale-95"
            >
              <Share2 className="w-3.5 h-3.5" />
              <span>Options</span>
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <button
              onClick={handleSendWhatsApp}
              className="py-2.5 px-3 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex flex-col items-center justify-center space-y-1 transition active:scale-95 shadow-xs"
              title="Envoyer le pointage directement par WhatsApp"
            >
              <span className="text-base">💬</span>
              <span>WhatsApp</span>
            </button>

            <button
              onClick={handleSendEmail}
              className="py-2.5 px-3 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs flex flex-col items-center justify-center space-y-1 transition active:scale-95 shadow-xs"
              title="Préparer un e-mail officiel complet"
            >
              <Mail className="w-4 h-4" />
              <span>Par Email</span>
            </button>

            <button
              onClick={handleSendSMS}
              className="py-2.5 px-3 rounded-2xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs flex flex-col items-center justify-center space-y-1 transition active:scale-95 shadow-xs"
              title="Envoyer un résumé par SMS"
            >
              <MessageSquare className="w-4 h-4" />
              <span>Par SMS</span>
            </button>

            <button
              onClick={handleCopyShareText}
              className={`py-2.5 px-3 rounded-2xl font-bold text-xs flex flex-col items-center justify-center space-y-1 transition active:scale-95 shadow-xs ${
                copiedShare
                  ? 'bg-emerald-500 text-white'
                  : 'bg-white/15 hover:bg-white/25 text-white border border-white/20'
              }`}
              title="Copier tout le texte pour le coller où vous voulez"
            >
              {copiedShare ? <Check className="w-4 h-4 text-white" /> : <Copy className="w-4 h-4" />}
              <span>{copiedShare ? 'Copié !' : 'Copier'}</span>
            </button>
          </div>

          <div className="pt-1 flex items-center justify-between text-[11px] text-blue-200/90 border-t border-white/10">
            <span>📋 Récapitulatif clair et vérifiable</span>
            <button
              onClick={() => window.print()}
              className="text-white hover:underline flex items-center space-x-1 font-bold"
            >
              <Printer className="w-3.5 h-3.5 inline mr-1" />
              <span>Imprimer la feuille d'émargement papier</span>
            </button>
          </div>
        </section>
      </main>

      {/* ========================================================= */}
      {/* MODALE : MES HORAIRES HABITUELS (OPTION PERSONNALISABLE)  */}
      {/* ========================================================= */}
      {showHabitualModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-3 no-print">
          <div className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-3xl p-5 shadow-2xl border border-slate-200 dark:border-slate-800 animate-in zoom-in-95 space-y-4 text-xs text-slate-700 dark:text-slate-200 max-h-[92vh] overflow-y-auto">
            {/* EN-TÊTE MODALE */}
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
              <div className="flex items-center space-x-2">
                <Settings className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                <div>
                  <h3 className="text-base font-black text-slate-900 dark:text-slate-100 leading-tight">
                    Réglages & Données
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Mes horaires par défaut & Maintenance de la base
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowHabitualModal(false)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 flex items-center justify-center text-slate-500 dark:text-slate-400"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* ONGLETS : HORAIRES vs BASE DE DONNÉES */}
            <div className="flex rounded-2xl bg-slate-100 dark:bg-slate-800 p-1 border border-slate-200 dark:border-slate-700">
              <button
                type="button"
                onClick={() => setSettingsTab('SCHEDULE')}
                className={`flex-1 py-2 rounded-xl font-bold text-xs flex items-center justify-center space-x-1.5 transition ${
                  settingsTab === 'SCHEDULE'
                    ? 'bg-white dark:bg-slate-900 text-blue-950 dark:text-blue-200 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Settings className="w-3.5 h-3.5" />
                <span>Mes horaires & Mon compte</span>
              </button>

              {isAdminUnlocked ? (
                <button
                  type="button"
                  onClick={() => {
                    setSettingsTab('DATABASE');
                    loadDatabaseDetails();
                    loadAdminUsers();
                  }}
                  className={`flex-1 py-2 rounded-xl font-bold text-xs flex items-center justify-center space-x-1.5 transition ${
                    settingsTab === 'DATABASE'
                      ? 'bg-amber-600 text-white shadow-xs'
                      : 'text-amber-700 dark:text-amber-300 hover:text-amber-900 dark:hover:text-amber-100'
                  }`}
                >
                  <Unlock className="w-3.5 h-3.5" />
                  <span>🛠️ Maintenance & Serveur</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setAdminPinInput('');
                    setAdminPinError(null);
                    setShowAdminPinModal(true);
                  }}
                  className="px-3 py-2 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 text-xs font-semibold flex items-center gap-1 transition"
                  title="Déverrouiller l'administration serveur avec le code PIN"
                >
                  <Lock className="w-3.5 h-3.5" />
                  <span>Mode Admin</span>
                </button>
              )}
            </div>

            {/* CONTENU ONGLET 1 : HORAIRES HABITUELS */}
            {settingsTab === 'SCHEDULE' && (
              <div className="space-y-4">
                <form onSubmit={handleSaveHabitualSchedule} className="space-y-3.5">
                <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed bg-blue-50/60 dark:bg-slate-800/60 p-2.5 rounded-xl border border-blue-100 dark:border-slate-700">
                  💡 Ces horaires s'appliqueront <strong>automatiquement par défaut</strong> lorsque vous saisirez une nouvelle journée.
                </p>

                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-200 block mb-1">
                    Nom & Prénom de l'agent (pour le relevé officiel) :
                  </label>
                  <input
                    type="text"
                    placeholder="Ex : Marie Dupont"
                    value={userName}
                    onChange={(e) => setUserName(e.target.value)}
                    className="w-full h-10 px-3 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-300 dark:border-slate-700 font-bold text-xs text-slate-900 dark:text-slate-100"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="font-bold text-slate-700 dark:text-slate-200 block mb-1">
                      Arrivée habituelle :
                    </label>
                    <input
                      type="time"
                      value={habitualForm.startTime}
                      onChange={(e) =>
                        setHabitualForm({ ...habitualForm, startTime: e.target.value })
                      }
                      className="w-full h-11 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-300 dark:border-slate-700 font-black text-center text-base text-slate-900 dark:text-slate-100"
                      required
                    />
                  </div>

                  <div>
                    <label className="font-bold text-slate-700 dark:text-slate-200 block mb-1">
                      Départ habituel :
                    </label>
                    <input
                      type="time"
                      value={habitualForm.endTime}
                      onChange={(e) =>
                        setHabitualForm({ ...habitualForm, endTime: e.target.value })
                      }
                      className="w-full h-11 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-300 dark:border-slate-700 font-black text-center text-base text-slate-900 dark:text-slate-100"
                      required
                    />
                  </div>
                </div>

                {/* PAUSE REPAS HABITUELLE */}
                <div className="bg-slate-50 dark:bg-slate-800/60 p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="font-bold text-slate-700 dark:text-slate-200">
                      Pause repas habituelle :
                    </label>
                    <span className="font-black text-blue-900 dark:text-blue-300 bg-white dark:bg-slate-900 px-2 py-0.5 rounded border border-blue-200 dark:border-slate-700">
                      {habitualForm.breakMinutes === 0
                        ? 'Aucune (0m)'
                        : habitualForm.breakMinutes === 60
                        ? '1h00 (60m)'
                        : `${habitualForm.breakMinutes} min`}
                    </span>
                  </div>

                  <div className="grid grid-cols-5 gap-1">
                    {[0, 15, 30, 45, 60].map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setHabitualForm({ ...habitualForm, breakMinutes: m })}
                        className={`py-1.5 rounded-lg text-xs font-bold border transition ${
                          habitualForm.breakMinutes === m
                            ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                            : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700'
                        }`}
                      >
                        {m === 60 ? '1h (60m)' : `${m}m`}
                      </button>
                    ))}
                  </div>

                  <div className="pt-1.5 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between">
                    <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">
                      Ajuster précisément :
                    </span>
                    <div className="flex items-center space-x-1.5">
                      <button
                        type="button"
                        onClick={() =>
                          setHabitualForm((hf) => ({
                            ...hf,
                            breakMinutes: Math.max(0, hf.breakMinutes - 5)
                          }))
                        }
                        className="w-7 h-7 rounded-lg bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-700 text-xs font-bold flex items-center justify-center active:scale-95 shadow-2xs text-slate-800 dark:text-slate-200"
                      >
                        -5m
                      </button>
                      <input
                        type="number"
                        min="0"
                        max="180"
                        step="5"
                        value={habitualForm.breakMinutes}
                        onChange={(e) =>
                          setHabitualForm({
                            ...habitualForm,
                            breakMinutes: Math.max(0, parseInt(e.target.value, 10) || 0)
                          })
                        }
                        className="w-14 h-7 text-center font-black text-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-1 focus:ring-blue-500"
                      />
                      <span className="text-xs font-bold text-slate-600 dark:text-slate-400">min</span>
                      <button
                        type="button"
                        onClick={() =>
                          setHabitualForm((hf) => ({
                            ...hf,
                            breakMinutes: Math.min(180, hf.breakMinutes + 5)
                          }))
                        }
                        className="w-7 h-7 rounded-lg bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-700 text-xs font-bold flex items-center justify-center active:scale-95 shadow-2xs text-slate-800 dark:text-slate-200"
                      >
                        +5m
                      </button>
                    </div>
                  </div>
                </div>

                {/* HEURES ATTENDUES PAR JOUR */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="font-bold text-slate-700 dark:text-slate-200">
                      Heures attendues par jour :
                    </label>
                    <span className="font-black text-blue-900 dark:text-blue-300 bg-blue-50 dark:bg-slate-800 px-2 py-0.5 rounded border border-blue-200 dark:border-slate-700">
                      {habitualForm.expectedHours} h
                    </span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <button
                      type="button"
                      onClick={() =>
                        setHabitualForm((hf) => ({
                          ...hf,
                          expectedHours: Math.max(0.5, Math.round((hf.expectedHours - 0.5) * 10) / 10)
                        }))
                      }
                      className="w-10 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-700 text-xs font-bold text-slate-800 dark:text-slate-200"
                    >
                      -0.5
                    </button>
                    <input
                      type="number"
                      step="0.25"
                      min="0.5"
                      max="24"
                      value={habitualForm.expectedHours}
                      onChange={(e) =>
                        setHabitualForm({
                          ...habitualForm,
                          expectedHours: parseFloat(e.target.value) || 0
                        })
                      }
                      className="flex-1 h-9 text-center font-black text-base bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-slate-100"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setHabitualForm((hf) => ({
                          ...hf,
                          expectedHours: Math.round((hf.expectedHours + 0.5) * 10) / 10
                        }))
                      }
                      className="w-10 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-700 text-xs font-bold text-slate-800 dark:text-slate-200"
                    >
                      +0.5
                    </button>
                  </div>
                </div>

                {/* RAPPEL CALCULÉ */}
                <div className="p-2.5 bg-blue-50/80 dark:bg-slate-800/80 rounded-xl border border-blue-200 dark:border-slate-700 text-xs text-blue-950 dark:text-blue-200 font-medium">
                  👉 Avec ces horaires, une journée type fait <strong>{habitualForm.expectedHours} heures</strong> de travail (ex: {habitualForm.startTime} à {habitualForm.endTime}{habitualForm.breakMinutes > 0 ? ` sans ${habitualForm.breakMinutes}m de pause` : ''}).
                </div>

                {/* SECTION RAPPELS DE POINTAGE AUTOMATIQUES */}
                <div className="bg-amber-50/70 dark:bg-slate-800/60 p-3 rounded-2xl border border-amber-200/90 dark:border-amber-900/40 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <div className="w-7 h-7 rounded-lg bg-amber-500/15 flex items-center justify-center text-amber-700 dark:text-amber-400">
                        <Bell className="w-4 h-4" />
                      </div>
                      <div>
                        <span className="font-bold text-slate-800 dark:text-slate-100 text-xs block">Rappel d'oubli de pointage</span>
                        <span className="text-[10px] text-slate-500 dark:text-slate-400">M'avertir sur mon écran si je n'ai pas badgé</span>
                      </div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={reminderConfig.enabled}
                        onChange={(e) => handleToggleReminder(e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-9 h-5 bg-slate-200 dark:bg-slate-700 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-amber-500"></div>
                    </label>
                  </div>

                  {reminderConfig.enabled && (
                    <div className="space-y-2.5 pt-2 border-t border-amber-200/60 dark:border-slate-700">
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-[11px] font-bold text-slate-700 dark:text-slate-200">Quand me rappeler ?</label>
                          <span className="text-[11px] font-black text-amber-900 dark:text-amber-200 bg-amber-100 dark:bg-amber-950/60 px-2 py-0.5 rounded border border-amber-300 dark:border-amber-800">
                            Rappel à {reminderConfig.mode === 'AFTER_END' ? computeReminderTimeFromEnd(habitualForm.endTime, reminderConfig.delayMinutes) : reminderConfig.time}
                          </span>
                        </div>

                        {/* Choix du délai après la fin de poste */}
                        <div className="grid grid-cols-4 gap-1 mb-2">
                          {[15, 30, 45, 60].map((mins) => (
                            <button
                              key={mins}
                              type="button"
                              onClick={() => {
                                const updated = {
                                  ...reminderConfig,
                                  mode: 'AFTER_END' as const,
                                  delayMinutes: mins,
                                  time: computeReminderTimeFromEnd(habitualForm.endTime, mins)
                                };
                                setReminderConfig(updated);
                                saveStoredReminderConfig(updated);
                              }}
                              className={`py-1 rounded-lg text-xs font-bold border transition ${
                                reminderConfig.mode === 'AFTER_END' && reminderConfig.delayMinutes === mins
                                  ? 'bg-amber-500 text-white border-amber-500 shadow-xs'
                                  : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700'
                              }`}
                            >
                              +{mins} min
                            </button>
                          ))}
                        </div>

                        {/* Option heure personnalisée */}
                        <div className="flex items-center justify-between bg-white dark:bg-slate-800 p-2 rounded-xl border border-slate-200 dark:border-slate-700">
                          <span className="text-[10px] text-slate-600 dark:text-slate-400 font-medium">Ou choisir une heure fixe :</span>
                          <input
                            type="time"
                            value={reminderConfig.time}
                            onChange={(e) => {
                              const updated = {
                                ...reminderConfig,
                                mode: 'CUSTOM_TIME' as const,
                                time: e.target.value
                              };
                              setReminderConfig(updated);
                              saveStoredReminderConfig(updated);
                            }}
                            className="h-7 px-2 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg font-bold text-xs text-slate-800 dark:text-slate-100 text-center"
                          />
                        </div>
                      </div>

                      <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-snug italic">
                        💡 Si votre journée est déjà enregistrée ou posée en congé/0h, <strong>aucun rappel n'est envoyé</strong>.
                      </p>

                      <div className="flex items-center justify-between pt-1 border-t border-amber-200/50 dark:border-slate-700">
                        <span className="text-[10px] text-slate-600 dark:text-slate-400 font-medium italic">
                          {notificationPermission === 'granted' ? '✓ Notifications autorisées' : '⚠️ Autorisation requise'}
                        </span>
                        <button
                          type="button"
                          disabled={testingNotification}
                          onClick={handleTestReminder}
                          className="px-2.5 py-1.5 bg-white dark:bg-slate-800 hover:bg-amber-100 dark:hover:bg-slate-700 text-amber-900 dark:text-amber-200 text-[11px] font-bold rounded-xl border border-amber-300 dark:border-slate-700 transition active:scale-95 shadow-2xs flex items-center space-x-1"
                        >
                          <BellRing className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                          <span>{testingNotification ? 'Envoi...' : '🔔 Tester sur mon téléphone'}</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* SECTION THÈME & APPARENCE */}
                <div className="bg-slate-50 dark:bg-slate-800/60 p-3 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <div className="w-7 h-7 rounded-lg bg-blue-500/15 dark:bg-blue-400/20 flex items-center justify-center text-blue-700 dark:text-blue-300">
                        {appTheme === 'LIGHT' ? (
                          <Sun className="w-4 h-4 text-amber-500" />
                        ) : appTheme === 'DARK' ? (
                          <Moon className="w-4 h-4 text-indigo-400" />
                        ) : (
                          <Monitor className="w-4 h-4 text-emerald-500" />
                        )}
                      </div>
                      <div>
                        <span className="font-bold text-slate-800 dark:text-slate-100 text-xs block">
                          Thème d'affichage
                        </span>
                        <span className="text-[10px] text-slate-500 dark:text-slate-400">
                          Mode clair, sombre ou automatique
                        </span>
                      </div>
                    </div>
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-blue-100 dark:bg-blue-900/60 text-blue-800 dark:text-blue-200">
                      {appTheme === 'LIGHT' ? '☀️ Mode Clair' : appTheme === 'DARK' ? '🌙 Mode Sombre' : '📱 Automatique'}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-1.5 pt-1">
                    <button
                      type="button"
                      onClick={() => handleChangeTheme('LIGHT')}
                      className={`py-2 px-1.5 rounded-xl border flex flex-col items-center justify-center space-y-1 transition text-xs font-bold ${
                        appTheme === 'LIGHT'
                          ? 'bg-amber-500 text-white border-amber-600 shadow-xs'
                          : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700'
                      }`}
                    >
                      <Sun className="w-4 h-4" />
                      <span>☀️ Clair</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleChangeTheme('DARK')}
                      className={`py-2 px-1.5 rounded-xl border flex flex-col items-center justify-center space-y-1 transition text-xs font-bold ${
                        appTheme === 'DARK'
                          ? 'bg-indigo-600 text-white border-indigo-700 shadow-xs'
                          : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700'
                      }`}
                    >
                      <Moon className="w-4 h-4" />
                      <span>🌙 Sombre</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleChangeTheme('SYSTEM')}
                      className={`py-2 px-1.5 rounded-xl border flex flex-col items-center justify-center space-y-1 transition text-xs font-bold ${
                        appTheme === 'SYSTEM'
                          ? 'bg-emerald-600 text-white border-emerald-700 shadow-xs'
                          : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700'
                      }`}
                    >
                      <Monitor className="w-4 h-4" />
                      <span>📱 Auto</span>
                    </button>
                  </div>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 italic leading-snug">
                    {appTheme === 'SYSTEM'
                      ? "💡 Mode Automatique : L'application s'adapte automatiquement au réglage jour/nuit de votre smartphone ou ordinateur."
                      : appTheme === 'DARK'
                      ? '💡 Mode Sombre : Idéal pour reposer vos yeux le soir ou en faible luminosité.'
                      : '💡 Mode Clair : Affichage classique lumineux.'}
                  </p>
                </div>

                <div className="pt-2 flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={() => setShowHabitualModal(false)}
                    className="flex-1 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold transition"
                  >
                    Fermer
                  </button>
                  <button
                    type="submit"
                    disabled={savingHabitual}
                    className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold transition shadow-md flex items-center justify-center space-x-1"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>{savingHabitual ? 'Enregistrement...' : 'Enregistrer mes horaires'}</span>
                  </button>
                </div>
              </form>

              {/* REMISE À ZÉRO DE MON ESPACE PERSONNEL (ISOLÉE À CE COMPTE) */}
              <div className="bg-rose-50/80 dark:bg-rose-950/40 p-4 rounded-2xl border-2 border-rose-200 dark:border-rose-900/60 space-y-2.5 text-rose-950 dark:text-rose-200">
                <div className="flex items-center space-x-1.5 text-rose-800 dark:text-rose-300">
                  <Trash2 className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
                  <span className="font-black text-xs uppercase tracking-tight">
                    Remise à zéro de MON espace personnel ({currentUser?.display_name || currentUser?.username})
                  </span>
                </div>
                <p className="text-[11px] text-rose-900/90 dark:text-rose-200 leading-snug">
                  🛡️ <strong>Garantie d'étanchéité absolue :</strong> Cette action efface <u>uniquement vos propres pointages, congés et régularisations</u>. Les heures et les comptes des autres membres de la famille restent <strong>100% intacts et protégés</strong>.
                </p>
                <p className="text-[10px] text-rose-800 dark:text-rose-300 italic">
                  📦 <strong>Sécurité anti-erreur :</strong> Une copie de sauvegarde de vos données est automatiquement créée et conservée sur le serveur avant l'effacement.
                </p>
                <div className="pt-1 space-y-1.5">
                  <label className="text-[10px] font-bold text-rose-900 dark:text-rose-200 block">
                    Pour débloquer, tapez <code className="bg-white dark:bg-slate-900 px-1.5 py-0.5 rounded border border-rose-300 dark:border-rose-800 font-mono font-black text-rose-700 dark:text-rose-400">RESET</code> ci-dessous :
                  </label>
                  <input
                    type="text"
                    placeholder="Tapez RESET"
                    value={resetConfirmationInput}
                    onChange={(e) => setResetConfirmationInput(e.target.value)}
                    className="w-full h-8 px-2.5 bg-white dark:bg-slate-900 border border-rose-300 dark:border-rose-800 rounded-xl font-mono font-bold text-xs text-rose-900 dark:text-rose-200 uppercase text-center"
                  />
                  <button
                    type="button"
                    disabled={resetConfirmationInput.trim() !== 'RESET' || isResetting}
                    onClick={handleResetMyPersonalData}
                    className="w-full py-2.5 bg-rose-600 hover:bg-rose-700 disabled:bg-slate-200 dark:disabled:bg-slate-800 disabled:text-slate-400 dark:disabled:text-slate-600 text-white font-black rounded-xl transition shadow-xs text-xs flex items-center justify-center space-x-1.5 active:scale-95"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>{isResetting ? 'Réinitialisation en cours...' : 'Effacer uniquement mes pointages personnels'}</span>
                  </button>
                </div>
              </div>
            </div>
          )}

            {/* CONTENU ONGLET 2 : SAUVEGARDE & BASE DE DONNÉES (ADMINISTRATEUR) */}
            {settingsTab === 'DATABASE' && isAdminUnlocked && (
              <div className="space-y-4">
                {/* 1. SANTÉ DE LA BASE */}
                <div className="bg-slate-50 dark:bg-slate-800/60 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-800 dark:text-slate-100 flex items-center space-x-1.5">
                      <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                      <span>État de santé de la base SQLite</span>
                    </span>
                    <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                      ● {dbStatus?.integrity === 'ok' ? 'Base saine' : 'Vérifiée'}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-[11px] pt-1">
                    <div className="bg-white dark:bg-slate-800 p-2 rounded-xl border border-slate-200 dark:border-slate-700">
                      <span className="text-slate-500 dark:text-slate-400 block">Taille du fichier :</span>
                      <strong className="text-slate-800 dark:text-slate-100 text-xs font-black">
                        {dbStatus ? `${dbStatus.databaseSizeKb} Ko` : 'Chargement...'}
                      </strong>
                    </div>
                    <div className="bg-white dark:bg-slate-800 p-2 rounded-xl border border-slate-200 dark:border-slate-700">
                      <span className="text-slate-500 dark:text-slate-400 block">Pointages stockés :</span>
                      <strong className="text-slate-800 dark:text-slate-100 text-xs font-black">
                        {dbStatus ? `${dbStatus.totalEntries} journées` : 'Chargement...'}
                      </strong>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleOptimizeDb}
                    className="w-full py-2 rounded-xl bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-blue-700 dark:text-blue-300 font-bold border border-blue-200 dark:border-slate-700 flex items-center justify-center space-x-1.5 transition active:scale-95 shadow-2xs"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Optimiser & Compacter la base (VACUUM)</span>
                  </button>
                </div>

                {/* 2. SAUVEGARDE SUR PC & SAUVEGARDE AUTOMATIQUE DU SERVEUR */}
                <div className="bg-slate-50 dark:bg-slate-800/60 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-2.5">
                  <div>
                    <span className="font-bold text-slate-800 dark:text-slate-100 block flex items-center space-x-1.5">
                      <HardDrive className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                      <span>Sauvegardes (PC & Serveur)</span>
                    </span>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">
                      🟢 <strong>Sauvegarde auto active</strong> : le serveur crée une copie quotidienne et garde les 14 derniers jours.
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <a
                      href="/api/backup/export-current"
                      download
                      className="py-2.5 px-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl flex items-center justify-center space-x-1.5 transition shadow-xs text-center"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Télécharger (.sqlite)</span>
                    </a>

                    <button
                      type="button"
                      onClick={handleCreateServerBackup}
                      className="py-2.5 px-2 bg-slate-800 dark:bg-slate-700 hover:bg-slate-900 dark:hover:bg-slate-600 text-white font-bold rounded-xl flex items-center justify-center space-x-1.5 transition shadow-xs text-center"
                    >
                      <span>➕ Copie serveur</span>
                    </button>
                  </div>

                  {/* LISTE DES SAUVEGARDES DISPONIBLES SUR LE SERVEUR */}
                  <div className="pt-2 border-t border-slate-200 dark:border-slate-700 space-y-1.5">
                    <span className="text-[11px] font-bold text-slate-700 dark:text-slate-200 block">
                      Sauvegardes récentes sur le serveur ({backupsList.length}) :
                    </span>
                    {backupsList.length === 0 ? (
                      <p className="text-[10px] text-slate-400 italic">Aucune sauvegarde trouvée sur le serveur.</p>
                    ) : (
                      <div className="max-h-32 overflow-y-auto space-y-1 pr-1">
                        {backupsList.slice(0, 5).map((b) => {
                          const dateStr = new Date(b.createdAt).toLocaleString('fr-FR');
                          const sizeKo = Math.round(b.sizeBytes / 1024);
                          return (
                            <div
                              key={b.filename}
                              className="bg-white dark:bg-slate-800 p-2 rounded-xl border border-slate-200 dark:border-slate-700 flex items-center justify-between text-[11px]"
                            >
                              <div>
                                <span className="font-bold text-slate-800 dark:text-slate-100 block truncate max-w-[170px]" title={b.filename}>
                                  {b.filename}
                                </span>
                                <span className="text-[10px] text-slate-500 dark:text-slate-400">
                                  {dateStr} • {sizeKo} Ko {b.isAuto && <span className="text-emerald-700 dark:text-emerald-400 font-bold">(Auto)</span>}
                                </span>
                              </div>
                              <button
                                type="button"
                                onClick={() => handleRestoreServerBackup(b.filename)}
                                className="px-2 py-1 bg-slate-100 hover:bg-blue-50 dark:bg-slate-700 dark:hover:bg-slate-600 text-blue-700 hover:text-blue-900 dark:text-blue-300 dark:hover:text-blue-200 rounded-lg font-bold text-[10px] border border-slate-200 dark:border-slate-600"
                              >
                                Restaurer
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>

                {/* 3. RESTAURATION DEPUIS UN FICHIER PC/SMARTPHONE */}
                <form onSubmit={handleUploadRestore} className="bg-slate-50 dark:bg-slate-800/60 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-2">
                  <span className="font-bold text-slate-800 dark:text-slate-100 block">
                    Restaurer une sauvegarde depuis un fichier :
                  </span>
                  <input
                    type="file"
                    accept=".sqlite,.db"
                    onChange={(e) => setSelectedRestoreFile(e.target.files ? e.target.files[0] : null)}
                    className="w-full text-xs text-slate-600 dark:text-slate-300 file:mr-2 file:py-1 file:px-2.5 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-blue-50 dark:file:bg-slate-700 file:text-blue-700 dark:file:text-blue-300 hover:file:bg-blue-100"
                  />
                  <button
                    type="submit"
                    disabled={!selectedRestoreFile || isRestoringUpload}
                    className="w-full py-2 bg-slate-700 hover:bg-slate-800 dark:bg-slate-700 dark:hover:bg-slate-600 disabled:opacity-50 text-white font-bold rounded-xl transition text-xs flex items-center justify-center space-x-1"
                  >
                    <span>{isRestoringUpload ? 'Restauration...' : 'Importer et restaurer la base'}</span>
                  </button>
                </form>

                {/* 4. ZONE DE DANGER : RESET COMPLET DU SERVEUR (ADMIN UNIQUEMENT) */}
                <div className="bg-rose-50/80 dark:bg-rose-950/40 p-3.5 rounded-2xl border-2 border-rose-300 dark:border-rose-900 space-y-2 text-rose-950 dark:text-rose-200">
                  <div className="flex items-center space-x-1.5 text-rose-800 dark:text-rose-300">
                    <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
                    <span className="font-black text-xs uppercase tracking-tight">
                      Zone Administrateur : Remise à zéro TOTALE du serveur (TOUS les comptes)
                    </span>
                  </div>
                  <p className="text-[10px] text-rose-900/90 dark:text-rose-300 leading-snug">
                    ⚠️ <strong>Attention maximale :</strong> Cette action réservée à l'administrateur efface les pointages et plannings de <u>tous les utilisateurs enregistrés</u>. Une sauvegarde complète de sécurité est automatiquement créée sur le serveur avant l'opération.
                  </p>

                  <div className="pt-1 space-y-1.5">
                    <label className="text-[10px] font-bold text-rose-900 dark:text-rose-200 block">
                      Pour confirmer, tapez exactement <code className="bg-white dark:bg-slate-900 px-1.5 py-0.5 rounded border border-rose-300 dark:border-rose-800 font-mono font-black text-rose-700 dark:text-rose-400">RESET_SERVEUR</code> ci-dessous :
                    </label>
                    <input
                      type="text"
                      placeholder="Tapez RESET_SERVEUR"
                      value={resetServerInput}
                      onChange={(e) => setResetServerInput(e.target.value)}
                      className="w-full h-8 px-2.5 bg-white dark:bg-slate-900 border border-rose-300 dark:border-rose-800 rounded-xl font-mono font-bold text-xs text-rose-900 dark:text-rose-200 uppercase text-center"
                    />
                    <button
                      type="button"
                      disabled={resetServerInput.trim() !== 'RESET_SERVEUR' || isResetting}
                      onClick={handleResetServerAll}
                      className="w-full py-2.5 bg-rose-600 hover:bg-rose-700 disabled:bg-slate-200 dark:disabled:bg-slate-800 disabled:text-slate-400 dark:disabled:text-slate-600 disabled:border-slate-300 dark:disabled:border-slate-700 text-white font-black rounded-xl transition shadow-xs text-xs flex items-center justify-center space-x-1.5 active:scale-95"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>{isResetting ? 'Réinitialisation serveur...' : 'Effacer toutes les données du serveur'}</span>
                    </button>
                  </div>
                </div>

                {/* 5. GESTION DES COMPTES DE LA FAMILLE (ADMIN) */}
                <div className="bg-slate-50 dark:bg-slate-800/60 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-800 dark:text-slate-100 flex items-center space-x-1.5">
                      <Users className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                      <span>Comptes enregistrés sur le serveur ({adminUsersList.length})</span>
                    </span>
                    <button
                      type="button"
                      onClick={loadAdminUsers}
                      className="text-[10px] text-blue-600 dark:text-blue-400 hover:underline font-bold"
                    >
                      {loadingAdminUsers ? 'Chargement...' : 'Actualiser'}
                    </button>
                  </div>

                  <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                    {adminUsersList.map((u) => (
                      <div
                        key={u.id}
                        className="flex items-center justify-between bg-white dark:bg-slate-800 p-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs"
                      >
                        <div>
                          <strong className="text-slate-900 dark:text-white font-bold block">{u.display_name}</strong>
                          <span className="text-[10px] text-slate-400 font-mono">@{u.username}</span>
                        </div>
                        {u.id !== 1 && (
                          <button
                            type="button"
                            onClick={() => handleDeleteUser(u)}
                            className="px-2 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:hover:bg-rose-900/60 dark:text-rose-300 rounded-lg text-[10px] font-bold border border-rose-200 dark:border-rose-900 transition flex items-center gap-1"
                          >
                            <Trash2 className="w-3 h-3" />
                            Supprimer
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* 6. MODIFIER LE CODE PIN ADMINISTRATEUR */}
                <form onSubmit={handleChangePin} className="bg-slate-50 dark:bg-slate-800/60 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-2.5">
                  <span className="font-bold text-slate-800 dark:text-slate-100 block flex items-center space-x-1.5">
                    <Key className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                    <span>Modifier le Code PIN Administrateur</span>
                  </span>

                  {pinChangeSuccess && (
                    <div className="p-2 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 text-xs rounded-lg font-medium border border-emerald-200 dark:border-emerald-800">
                      {pinChangeSuccess}
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <label className="text-[10px] text-slate-500 block mb-0.5">Ancien PIN :</label>
                      <input
                        type="password"
                        placeholder="Ex: 1234"
                        value={adminOldPinInput}
                        onChange={(e) => setAdminOldPinInput(e.target.value)}
                        className="w-full h-8 px-2 bg-white dark:bg-slate-800 rounded-lg border border-slate-300 dark:border-slate-700 font-mono text-center text-xs"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-slate-500 block mb-0.5">Nouveau PIN (4+ car.) :</label>
                      <input
                        type="password"
                        placeholder="Nouveau PIN"
                        value={adminNewPinInput}
                        onChange={(e) => setAdminNewPinInput(e.target.value)}
                        className="w-full h-8 px-2 bg-white dark:bg-slate-800 rounded-lg border border-slate-300 dark:border-slate-700 font-mono text-center text-xs"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={savingNewPin}
                    className="w-full py-2 bg-slate-800 hover:bg-slate-900 dark:bg-slate-700 dark:hover:bg-slate-600 text-white font-bold rounded-xl text-xs transition active:scale-95 shadow-xs"
                  >
                    {savingNewPin ? 'Modification...' : 'Enregistrer le nouveau code PIN'}
                  </button>
                </form>

                <div className="pt-2 flex items-center justify-between border-t border-slate-200 dark:border-slate-700">
                  <button
                    type="button"
                    onClick={handleLockAdmin}
                    className="px-3 py-1.5 rounded-xl bg-amber-100 hover:bg-amber-200 dark:bg-amber-950/60 dark:hover:bg-amber-900/80 text-amber-900 dark:text-amber-200 font-bold text-xs transition flex items-center space-x-1"
                  >
                    <Lock className="w-3.5 h-3.5" />
                    <span>Verrouiller le Mode Admin</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowHabitualModal(false)}
                    className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold text-xs transition"
                  >
                    Fermer
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODALE DE SAISIE DU CODE PIN ADMINISTRATEUR */}
      {showAdminPinModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 no-print animate-fadeIn">
          <div className="bg-white dark:bg-slate-800 rounded-3xl max-w-sm w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-700 animate-in zoom-in-95">
            <div className="flex items-center space-x-3 mb-4">
              <div className="w-10 h-10 rounded-2xl bg-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center">
                <Lock className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 dark:text-white text-base">Accès Administrateur</h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">Maintenance serveur & sauvegardes</p>
              </div>
            </div>

            <form onSubmit={handleVerifyAdminPin} className="space-y-4">
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                Entrez le code secret administrateur pour déverrouiller la gestion des sauvegardes et la maintenance du serveur.
              </p>

              {adminPinError && (
                <div className="p-2.5 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 rounded-xl text-red-700 dark:text-red-300 text-xs font-medium">
                  {adminPinError}
                </div>
              )}

              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Code PIN Administrateur :
                </label>
                <input
                  type="password"
                  autoFocus
                  value={adminPinInput}
                  onChange={(e) => setAdminPinInput(e.target.value)}
                  placeholder="Ex : 1234"
                  className="w-full h-11 px-3 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-300 dark:border-slate-700 font-mono text-center text-lg tracking-widest text-slate-900 dark:text-slate-100 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
                  required
                />
                <p className="text-[10px] text-slate-400 mt-1 text-center italic">
                  (Code par défaut : 1234 - modifiable une fois déverrouillé)
                </p>
              </div>

              <div className="flex items-center space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAdminPinModal(false)}
                  className="flex-1 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 font-bold text-xs transition"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={verifyingAdminPin}
                  className="flex-1 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs shadow-md shadow-amber-600/30 transition flex items-center justify-center space-x-1 active:scale-95"
                >
                  {verifyingAdminPin ? 'Vérification...' : 'Déverrouiller'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODALE D'AJUSTEMENT : RAJOUTER OU DÉDUIRE DU COMPTEUR     */}
      {/* ========================================================= */}
      {settleModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4 no-print">
          <div className="bg-white dark:bg-slate-900 w-full max-w-sm rounded-3xl p-5 shadow-2xl border border-slate-200 dark:border-slate-800 animate-in zoom-in-95 space-y-3.5 text-xs text-slate-700 dark:text-slate-200">
            {/* EN-TÊTE MODALE AVEC ONGLET AJOUT vs DÉDUCTION */}
            <div className="space-y-2">
              <h3 className="text-base font-black text-slate-900 dark:text-slate-100 leading-tight">
                {settleModal.type === 'POSITIVE'
                  ? (settleModal.operation === 'ADD' ? '➕ Rajouter des heures supplémentaires' : '✓ Régler des heures supplémentaires')
                  : (settleModal.operation === 'ADD' ? '➕ Rajouter des heures à rattraper' : '✓ Rattraper des heures dues')}
              </h3>

              {/* ONGLET DE SÉLECTION D'OPÉRATION */}
              <div className="flex rounded-xl bg-slate-100 dark:bg-slate-800 p-1 border border-slate-200 dark:border-slate-700">
                <button
                  type="button"
                  onClick={() => setSettleModal({ ...settleModal, operation: 'ADD', amountToSettle: 4, reason: settleModal.type === 'POSITIVE' ? 'Report solde heures sup' : 'Report heures à rattraper' })}
                  className={`flex-1 py-1.5 rounded-lg font-bold text-xs transition ${
                    settleModal.operation === 'ADD'
                      ? (settleModal.type === 'POSITIVE' ? 'bg-emerald-600 text-white shadow-xs' : 'bg-rose-600 text-white shadow-xs')
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  ➕ Rajouter
                </button>
                <button
                  type="button"
                  onClick={() => setSettleModal({ ...settleModal, operation: 'SETTLE', amountToSettle: settleModal.totalDue, reason: settleModal.type === 'POSITIVE' ? 'Payé sur ma fiche de paie' : 'Heures rattrapées' })}
                  className={`flex-1 py-1.5 rounded-lg font-bold text-xs transition ${
                    settleModal.operation === 'SETTLE'
                      ? 'bg-slate-800 dark:bg-slate-700 text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  ✓ Déduire / Régler
                </button>
              </div>
            </div>

            <div className={`p-2.5 rounded-xl border ${
              settleModal.type === 'POSITIVE'
                ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-950 dark:text-emerald-200'
                : 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800 text-rose-950 dark:text-rose-200'
            }`}>
              <span className="opacity-80 block text-[11px] font-semibold">
                {settleModal.type === 'POSITIVE' ? 'Compteur « On me doit » actuel :' : 'Compteur « Je dois » actuel :'}
              </span>
              <strong className="text-base font-black">
                {settleModal.type === 'POSITIVE'
                  ? formatHours(summary?.total_positive_balance || 0)
                  : formatHours(-Math.abs(summary?.total_negative_balance || 0))}
              </strong>
            </div>

            <form onSubmit={handleConfirmSettle} className="space-y-3">
              <div>
                <label className="font-bold block mb-1 text-slate-800 dark:text-slate-200">
                  {settleModal.operation === 'ADD'
                    ? "Combien d'heures voulez-vous rajouter ?"
                    : "Combien d'heures voulez-vous déduire ?"}
                </label>
                <div className="flex items-center space-x-2">
                  <input
                    type="number"
                    step="0.25"
                    min="0.25"
                    max={settleModal.operation === 'ADD' ? 999 : (Math.abs(settleModal.totalDue) || 999)}
                    value={settleModal.amountToSettle}
                    onChange={(e) =>
                      setSettleModal({
                        ...settleModal,
                        amountToSettle: parseFloat(e.target.value) || 0
                      })
                    }
                    className="w-full h-11 px-3 bg-white dark:bg-slate-800 rounded-xl border border-blue-400 dark:border-blue-500 font-black text-xl text-blue-950 dark:text-blue-100 text-center"
                    required
                  />
                  <span className="font-bold text-slate-700 dark:text-slate-300 text-sm">heures</span>
                </div>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 italic">
                  {settleModal.operation === 'ADD'
                    ? (settleModal.type === 'POSITIVE'
                        ? "Ces heures viendront alimenter votre crédit d'heures sup (ou compenser vos éventuelles heures dues)."
                        : "Ces heures viendront alimenter votre total d'heures à rattraper.")
                    : "Exemple : sur 4h, si vous tapez 2h, il en restera 2h sur votre compteur !"}
                </p>
              </div>

              <div>
                <label className="font-bold block mb-1 text-slate-800 dark:text-slate-200">Motif (Preuve)</label>
                <input
                  type="text"
                  placeholder={
                    settleModal.operation === 'ADD'
                      ? (settleModal.type === 'POSITIVE' ? "Ex: Report d'heures sup, fête de l'école..." : "Ex: Dette initiale à rattraper, absence convenue...")
                      : (settleModal.type === 'POSITIVE' ? "Ex: Payé sur paie de novembre" : "Ex: Rattrapé samedi matin")
                  }
                  value={settleModal.reason}
                  onChange={(e) =>
                    setSettleModal({ ...settleModal, reason: e.target.value })
                  }
                  className="w-full h-10 px-3 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-300 dark:border-slate-700 font-semibold text-slate-900 dark:text-slate-100"
                  required
                />
              </div>

              <div>
                <label className="font-bold block mb-1 text-slate-800 dark:text-slate-200">Date</label>
                <input
                  type="date"
                  value={settleModal.date}
                  onChange={(e) =>
                    setSettleModal({ ...settleModal, date: e.target.value })
                  }
                  className="w-full h-10 px-3 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-300 dark:border-slate-700 font-semibold text-slate-900 dark:text-slate-100"
                  required
                />
              </div>

              <div className="pt-2 flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => setSettleModal({ ...settleModal, isOpen: false })}
                  className="flex-1 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold transition"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className={`flex-1 py-2.5 rounded-xl text-white font-bold transition shadow-md ${
                    settleModal.operation === 'ADD'
                      ? (settleModal.type === 'POSITIVE' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-rose-600 hover:bg-rose-700')
                      : 'bg-blue-600 hover:bg-blue-700'
                  }`}
                >
                  {settleModal.operation === 'ADD' ? "Valider l'ajout" : 'Valider la déduction'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODALE POUR POSER UNE PÉRIODE (MULTI-JOURS)               */}
      {/* ========================================================= */}
      {showPeriodModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-3 no-print">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-md w-full p-4.5 space-y-4 shadow-2xl border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
              <div>
                <h3 className="text-base font-black text-slate-900 dark:text-slate-100 flex items-center space-x-1.5">
                  <span className="text-lg">🏖️</span>
                  <span>Poser mes jours à 0 h / Congés / Vacances</span>
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Enregistrer des jours à 0h, vacances ou absence sur plusieurs jours en 1 clic
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowPeriodModal(false)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 flex items-center justify-center text-slate-500 dark:text-slate-400"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSavePeriod} className="space-y-3.5 text-xs">
              {/* DATES DE DÉBUT ET DE FIN */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-200 block mb-1">Du (Date début) :</label>
                  <input
                    type="date"
                    value={periodForm.startDate}
                    onChange={(e) => setPeriodForm({ ...periodForm, startDate: e.target.value })}
                    className="w-full h-10 px-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl font-bold text-xs text-slate-900 dark:text-slate-100"
                    required
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-200 block mb-1">Au (Date fin) :</label>
                  <input
                    type="date"
                    value={periodForm.endDate}
                    onChange={(e) => setPeriodForm({ ...periodForm, endDate: e.target.value })}
                    className="w-full h-10 px-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl font-bold text-xs text-slate-900 dark:text-slate-100"
                    required
                  />
                </div>
              </div>

              {/* MOTIF D'ABSENCE / CONGÉS */}
              <div>
                <label className="font-bold text-slate-700 dark:text-slate-200 block mb-1">Motif :</label>
                <select
                  value={periodForm.reasonId}
                  onChange={(e) => {
                    const r = ABSENCE_REASONS.find((item) => item.id === e.target.value) || ABSENCE_REASONS[0];
                    setPeriodForm({
                      ...periodForm,
                      reasonId: r.id,
                      label: r.label,
                      impact: r.defaultRule as any
                    });
                  }}
                  className="w-full h-10 px-3 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl font-bold text-xs text-slate-800 dark:text-slate-100"
                >
                  {ABSENCE_REASONS.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* IMPACT SUR LE COMPTEUR */}
              <div className="space-y-1">
                <span className="font-bold text-slate-700 dark:text-slate-200 block">Comment compter ces journées ?</span>
                <div className="grid grid-cols-3 gap-1.5">
                  <button
                    type="button"
                    onClick={() => setPeriodForm({ ...periodForm, impact: 'NEUTRAL' })}
                    className={`p-2 rounded-xl border text-center text-xs font-bold transition ${
                      periodForm.impact === 'NEUTRAL'
                        ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                        : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700'
                    }`}
                  >
                    <span className="block text-sm">🏖️</span>
                    <span className="block text-[11px] font-black">Jour à 0 h</span>
                    <span className="text-[9px] block opacity-80">0h faite / 0h due</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPeriodForm({ ...periodForm, impact: 'COUNTED_AS_WORKED' })}
                    className={`p-2 rounded-xl border text-center text-xs font-bold transition ${
                      periodForm.impact === 'COUNTED_AS_WORKED'
                        ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                        : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700'
                    }`}
                  >
                    <span className="block text-sm">🟢</span>
                    <span className="block text-[11px] font-black">Compté travaillé</span>
                    <span className="text-[9px] block opacity-80">Ajoute les heures</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPeriodForm({ ...periodForm, impact: 'TO_RECOVER' })}
                    className={`p-2 rounded-xl border text-center text-xs font-bold transition ${
                      periodForm.impact === 'TO_RECOVER'
                        ? 'bg-rose-600 text-white border-rose-600 shadow-xs'
                        : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700'
                    }`}
                  >
                    <span className="block text-sm">🔴</span>
                    <span className="block text-[11px] font-black">À rattraper</span>
                    <span className="text-[9px] block opacity-80">Heures dues</span>
                  </button>
                </div>
                <p className="text-[11px] text-slate-600 dark:text-slate-300 font-medium bg-slate-50 dark:bg-slate-800/80 p-2 rounded-xl border border-slate-200 dark:border-slate-700 mt-1">
                  {periodForm.impact === 'NEUTRAL' && "💡 Conforme au planning mairie : les jours à 0h ne gonflent pas le compteur d'heures faites et ne créent aucune dette."}
                  {periodForm.impact === 'COUNTED_AS_WORKED' && "💡 Les heures habituelles seront créditées comme du travail effectué dans le mois."}
                  {periodForm.impact === 'TO_RECOVER' && "💡 Vous devrez rattraper ces heures plus tard sur d'autres journées."}
                </p>
              </div>

              {/* OPTION EXCLURE WEEKENDS */}
              <label className="flex items-start space-x-2.5 p-2.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl cursor-pointer">
                <input
                  type="checkbox"
                  checked={periodForm.skipWeekends}
                  onChange={(e) => setPeriodForm({ ...periodForm, skipWeekends: e.target.checked })}
                  className="mt-0.5 rounded text-blue-600 focus:ring-blue-500 w-4 h-4"
                />
                <div>
                  <span className="font-bold text-slate-800 dark:text-slate-100 block text-xs">
                    Exclure les samedis et dimanches
                  </span>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
                    Recommandé pour les écoles et cantines scolaires fermées le week-end.
                  </p>
                </div>
              </label>

              {/* BOUTONS D'ACTION */}
              <div className="pt-2 flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => setShowPeriodModal(false)}
                  className="flex-1 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold transition text-xs"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={savingPeriod}
                  className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold transition shadow-md flex items-center justify-center space-x-1.5 text-xs"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{savingPeriod ? 'Enregistrement...' : 'Valider mes congés'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODALE DE TRANSMISSION (WHATSAPP, EMAIL, SMS, COPIER)     */}
      {/* ========================================================= */}
      {showShareModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 no-print">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-lg w-full p-5 space-y-4 shadow-2xl border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2.5">
              <div>
                <h3 className="text-base font-black text-slate-900 dark:text-slate-100 flex items-center space-x-2">
                  <span className="text-lg">📤</span>
                  <span>Transmettre ma feuille de pointage</span>
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Mois de {monthDisplay} • {userName || 'Salarié(e)'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowShareModal(false)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 flex items-center justify-center text-slate-500 dark:text-slate-400"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* COORDONNÉES DU RESPONSABLE / DESTINATAIRE (MÉMORISÉES) */}
            <div className="bg-slate-50 dark:bg-slate-800/60 p-3 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-2 text-xs">
              <span className="font-bold text-slate-800 dark:text-slate-100 block">
                Destinataire (Mairie / École / Responsable) :
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] text-slate-500 dark:text-slate-400 block mb-0.5 font-medium">
                    Numéro de téléphone (SMS / WhatsApp) :
                  </label>
                  <div className="relative">
                    <Phone className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
                    <input
                      type="tel"
                      placeholder="Ex: 06 12 34 56 78"
                      value={recipientPhone}
                      onChange={(e) => handleUpdateRecipientPhone(e.target.value)}
                      className="w-full h-8 pl-8 pr-2.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl font-bold text-xs text-slate-800 dark:text-slate-100"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[11px] text-slate-500 dark:text-slate-400 block mb-0.5 font-medium">
                    Adresse e-mail (Service RH / Direction) :
                  </label>
                  <div className="relative">
                    <Mail className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
                    <input
                      type="email"
                      placeholder="Ex: mairie@commune.fr"
                      value={recipientEmail}
                      onChange={(e) => handleUpdateRecipientEmail(e.target.value)}
                      className="w-full h-8 pl-8 pr-2.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl font-bold text-xs text-slate-800 dark:text-slate-100"
                    />
                  </div>
                </div>
              </div>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 italic">
                💡 Renseignés une seule fois, ces contacts restent enregistrés pour les prochains mois.
              </p>
            </div>

            {/* BOUTONS D'ENVOI DIRECT */}
            <div className="space-y-1.5">
              <span className="font-bold text-slate-800 dark:text-slate-100 block text-xs">Choisir le moyen d'envoi :</span>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={handleSendWhatsApp}
                  className="py-3 px-3 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center justify-center space-x-2 transition shadow-xs active:scale-95"
                >
                  <span className="text-lg leading-none">💬</span>
                  <span>WhatsApp</span>
                </button>

                <button
                  type="button"
                  onClick={handleSendEmail}
                  className="py-3 px-3 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center justify-center space-x-2 transition shadow-xs active:scale-95"
                >
                  <Mail className="w-4 h-4" />
                  <span>Email</span>
                </button>

                <button
                  type="button"
                  onClick={handleSendSMS}
                  className="py-3 px-3 rounded-2xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs flex items-center justify-center space-x-2 transition shadow-xs active:scale-95"
                >
                  <MessageSquare className="w-4 h-4" />
                  <span>SMS</span>
                </button>

                <button
                  type="button"
                  onClick={handleCopyShareText}
                  className={`py-3 px-3 rounded-2xl font-bold text-xs flex items-center justify-center space-x-2 transition shadow-xs active:scale-95 ${
                    copiedShare
                      ? 'bg-emerald-500 text-white'
                      : 'bg-slate-800 dark:bg-slate-700 hover:bg-slate-900 dark:hover:bg-slate-600 text-white'
                  }`}
                >
                  {copiedShare ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  <span>{copiedShare ? 'Copié !' : 'Copier tout'}</span>
                </button>

                <button
                  type="button"
                  onClick={handleNativeShare}
                  className="py-3 px-3 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs flex items-center justify-center space-x-2 transition shadow-xs active:scale-95 col-span-2 sm:col-span-2"
                >
                  <Share2 className="w-4 h-4" />
                  <span>Partager (Menu du téléphone)</span>
                </button>
              </div>
            </div>

            {/* APERÇU DU TEXTE PRÉPARÉ */}
            <div className="space-y-1 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-700 dark:text-slate-200">Aperçu du message transmis :</span>
                <button
                  type="button"
                  onClick={handleCopyShareText}
                  className="text-blue-600 dark:text-blue-400 hover:underline font-semibold text-[11px] flex items-center space-x-1"
                >
                  {copiedShare ? <Check className="w-3 h-3 text-emerald-600 dark:text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedShare ? 'Copié dans le presse-papier !' : 'Copier'}</span>
                </button>
              </div>
              <textarea
                readOnly
                value={generateShareMessage()}
                rows={9}
                className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-2xl font-mono text-[11px] text-slate-800 dark:text-slate-100 leading-relaxed resize-none focus:outline-hidden"
              />
            </div>

            <div className="pt-1 flex justify-end">
              <button
                type="button"
                onClick={() => setShowShareModal(false)}
                className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold text-xs transition"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODALE DU BILAN ANNUEL SCOLAIRE (SEPTEMBRE À AOÛT)         */}
      {/* ========================================================= */}
      {showAnnualModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 no-print animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-2xl w-full p-4 sm:p-6 space-y-4 shadow-2xl border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 max-h-[92vh] overflow-y-auto">
            {/* EN-TÊTE MODALE */}
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center space-x-2.5">
                <div className="w-10 h-10 rounded-2xl bg-amber-500 text-white flex items-center justify-center text-xl shadow-xs shrink-0 font-bold">
                  🎯
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-black text-slate-900 dark:text-slate-100 leading-tight">
                    Bilan & Décompte Annuel Scolaire
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Période du 1er Septembre au 31 Août • Suivi du contrat d'annualisation
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowAnnualModal(false)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 flex items-center justify-center text-slate-500 dark:text-slate-400 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* SÉLECTEUR D'ANNÉE SCOLAIRE */}
            <div className="flex items-center justify-between bg-slate-50 dark:bg-slate-800/60 p-2 rounded-2xl border border-slate-200 dark:border-slate-700">
              <button
                type="button"
                onClick={() => handleChangeAnnualYear(-1)}
                className="px-3 py-1.5 rounded-xl bg-white dark:bg-slate-700 hover:bg-slate-100 dark:hover:bg-slate-600 font-bold text-xs text-slate-700 dark:text-slate-200 shadow-2xs border border-slate-200 dark:border-slate-600 transition flex items-center space-x-1"
              >
                <ChevronLeft className="w-4 h-4" />
                <span>{annualStartYear - 1} - {annualStartYear}</span>
              </button>

              <div className="text-center px-2">
                <span className="text-[10px] uppercase font-black tracking-wider text-slate-400 dark:text-slate-500 block">
                  Année scolaire
                </span>
                <span className="text-sm font-black text-slate-900 dark:text-slate-100">
                  {annualSummary ? annualSummary.school_year : `${annualStartYear} - ${annualStartYear + 1}`}
                </span>
              </div>

              <button
                type="button"
                onClick={() => handleChangeAnnualYear(1)}
                className="px-3 py-1.5 rounded-xl bg-white dark:bg-slate-700 hover:bg-slate-100 dark:hover:bg-slate-600 font-bold text-xs text-slate-700 dark:text-slate-200 shadow-2xs border border-slate-200 dark:border-slate-600 transition flex items-center space-x-1"
              >
                <span>{annualStartYear + 1} - {annualStartYear + 2}</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {/* QUOTA ANNUEL CONTRACTUEL MODIFIABLE */}
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-slate-800 dark:to-slate-800/80 p-3.5 rounded-2xl border border-blue-200 dark:border-blue-900/60 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <span className="text-xs font-black text-blue-950 dark:text-blue-200 uppercase tracking-tight flex items-center space-x-1.5">
                  <span>📋</span>
                  <span>Mon Quota Contractuel Annuel :</span>
                </span>
                <p className="text-[11px] text-slate-600 dark:text-slate-400 font-medium mt-0.5">
                  Nombre d'heures prévues à votre contrat pour l'année scolaire (ex: 800h, 950h, 1200h)
                </p>
              </div>

              <div className="flex items-center space-x-2 shrink-0">
                {isEditingAnnualTarget ? (
                  <div className="flex items-center space-x-1.5">
                    <input
                      type="text"
                      value={annualTargetStr}
                      onChange={(e) => setAnnualTargetStr(e.target.value)}
                      placeholder="800h"
                      className="w-24 h-9 px-2.5 rounded-xl border-2 border-blue-500 bg-white dark:bg-slate-900 font-black text-center text-sm text-slate-900 dark:text-slate-100 shadow-inner"
                    />
                    <button
                      type="button"
                      disabled={isSavingAnnualTarget}
                      onClick={handleSaveAnnualTarget}
                      className="h-9 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-xs transition"
                    >
                      {isSavingAnnualTarget ? '...' : 'Valider'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIsEditingAnnualTarget(false);
                        setAnnualTargetStr(formatPlanningHours(annualSummary?.annual_contract_hours || 800));
                      }}
                      className="h-9 px-2 rounded-xl bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 font-bold text-xs text-slate-700 dark:text-slate-200"
                    >
                      Annuler
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center space-x-2">
                    <span className="px-3 py-1.5 bg-blue-600 text-white font-black text-base rounded-xl shadow-xs">
                      {formatPlanningHours(annualSummary?.annual_contract_hours || 800)}
                    </span>
                    <button
                      type="button"
                      onClick={() => setIsEditingAnnualTarget(true)}
                      className="px-2.5 py-1.5 rounded-xl bg-white dark:bg-slate-700 hover:bg-slate-100 dark:hover:bg-slate-600 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 font-bold text-xs shadow-2xs transition flex items-center space-x-1"
                    >
                      <Edit2 className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                      <span>Modifier</span>
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* BANDEAU PRINCIPAL DE DÉCOMPTE & PROGRESSION */}
            {annualSummary && (
              <div className="space-y-3">
                <div
                  className={`p-4 rounded-3xl border-2 shadow-sm ${
                    annualSummary.remaining_contract_hours > 0
                      ? 'bg-gradient-to-br from-amber-500/10 via-orange-500/10 to-amber-500/15 border-amber-400 dark:border-amber-700'
                      : 'bg-gradient-to-br from-emerald-500/10 via-teal-500/10 to-emerald-500/15 border-emerald-400 dark:border-emerald-700'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-black uppercase tracking-tight text-slate-900 dark:text-slate-100 flex items-center space-x-1.5">
                      <span>{annualSummary.remaining_contract_hours > 0 ? '⏳' : '🎉'}</span>
                      <span>État du décompte annuel</span>
                    </span>
                    <span
                      className={`text-xs px-2.5 py-0.5 rounded-full font-black ${
                        annualSummary.remaining_contract_hours > 0
                          ? 'bg-amber-500 text-white'
                          : 'bg-emerald-600 text-white'
                      }`}
                    >
                      {annualSummary.progress_percent}% réalisé
                    </span>
                  </div>

                  {annualSummary.remaining_contract_hours > 0 ? (
                    <div>
                      <div className="text-xl sm:text-2xl font-black text-amber-950 dark:text-amber-200">
                        Il vous reste {formatDuration(annualSummary.remaining_contract_hours)} à effectuer
                      </div>
                      <p className="text-xs text-amber-900 dark:text-amber-300 font-medium mt-0.5">
                        Vous avez validé <strong>{formatDuration(annualSummary.total_worked_hours)}</strong> sur vos <strong>{formatDuration(annualSummary.annual_contract_hours)}</strong> contractuelles d'ici le 31 août {annualSummary.end_year}.
                      </p>
                    </div>
                  ) : (
                    <div>
                      <div className="text-xl sm:text-2xl font-black text-emerald-950 dark:text-emerald-200">
                        Objectif contractuel atteint ! (+{formatDuration(annualSummary.overtime_contract_hours)} de surplus)
                      </div>
                      <p className="text-xs text-emerald-900 dark:text-emerald-300 font-medium mt-0.5">
                        Félicitations ! Vous avez dépassé votre quota annuel contractuel de <strong>{formatDuration(annualSummary.annual_contract_hours)}</strong>.
                      </p>
                    </div>
                  )}

                  {/* BARRE DE PROGRESSION */}
                  <div className="mt-3.5 space-y-1">
                    <div className="w-full bg-slate-200 dark:bg-slate-700 h-4 rounded-full overflow-hidden shadow-inner p-0.5">
                      <div
                        className={`h-full rounded-full transition-all duration-700 ${
                          annualSummary.remaining_contract_hours > 0
                            ? 'bg-gradient-to-r from-amber-500 to-orange-500'
                            : 'bg-gradient-to-r from-emerald-500 to-teal-500'
                        }`}
                        style={{ width: `${annualSummary.progress_percent}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-[11px] font-bold text-slate-500 dark:text-slate-400 px-0.5">
                      <span>0h (1er Septembre)</span>
                      <span>{formatDuration(annualSummary.total_worked_hours)} faites</span>
                      <span>{formatDuration(annualSummary.annual_contract_hours)} (31 Août)</span>
                    </div>
                  </div>
                </div>

                {/* 4 CARTES MÉTRIQUES CLÉS */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  <div className="bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800/60 p-3 rounded-2xl text-center">
                    <span className="text-[10px] uppercase font-black text-blue-900 dark:text-blue-300 block">
                      Total Réalisé
                    </span>
                    <span className="text-base sm:text-lg font-black text-blue-950 dark:text-blue-100 block mt-0.5">
                      {formatDuration(annualSummary.total_worked_hours)}
                    </span>
                    <span className="text-[10px] text-blue-700 dark:text-blue-400 font-medium">heures travaillées</span>
                  </div>

                  <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 p-3 rounded-2xl text-center">
                    <span className="text-[10px] uppercase font-black text-amber-900 dark:text-amber-300 block">
                      Reste à faire
                    </span>
                    <span className="text-base sm:text-lg font-black text-amber-950 dark:text-amber-100 block mt-0.5">
                      {formatDuration(annualSummary.remaining_contract_hours)}
                    </span>
                    <span className="text-[10px] text-amber-700 dark:text-amber-400 font-medium">d'ici fin août</span>
                  </div>

                  <div className="bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 p-3 rounded-2xl text-center">
                    <span className="text-[10px] uppercase font-black text-emerald-900 dark:text-emerald-300 block">
                      Heures Sup / Surplus
                    </span>
                    <span className="text-base sm:text-lg font-black text-emerald-700 dark:text-emerald-300 block mt-0.5">
                      +{formatDuration(annualSummary.overtime_contract_hours)}
                    </span>
                    <span className="text-[10px] text-emerald-700 dark:text-emerald-400 font-medium">cumulées</span>
                  </div>

                  <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 p-3 rounded-2xl text-center">
                    <span className="text-[10px] uppercase font-black text-slate-700 dark:text-slate-300 block">
                      Jours Travaillés
                    </span>
                    <span className="text-base sm:text-lg font-black text-slate-900 dark:text-slate-100 block mt-0.5">
                      {annualSummary.total_worked_days} j
                    </span>
                    <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">
                      ({annualSummary.total_absence_days} j congés/0h)
                    </span>
                  </div>
                </div>

                {/* TABLEAU DES 12 MOIS (SEPTEMBRE À AOÛT) */}
                <div className="space-y-1.5 pt-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black uppercase tracking-tight text-slate-800 dark:text-slate-200">
                      📅 Répartition Mois par Mois (Septembre à Août)
                    </span>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400 italic">
                      Cliquer sur "Voir" pour basculer sur un mois
                    </span>
                  </div>

                  <div className="border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden shadow-2xs">
                    <div className="overflow-x-auto max-h-72 overflow-y-auto">
                      <table className="w-full text-xs text-left">
                        <thead className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-black text-[11px] sticky top-0 border-b border-slate-200 dark:border-slate-700">
                          <tr>
                            <th className="p-2 sm:p-2.5">Mois</th>
                            <th className="p-2 sm:p-2.5 text-right">Prévu</th>
                            <th className="p-2 sm:p-2.5 text-right">Fait</th>
                            <th className="p-2 sm:p-2.5 text-right">Écart</th>
                            <th className="p-2 sm:p-2.5 text-center hidden sm:table-cell">Jours</th>
                            <th className="p-2 sm:p-2.5 text-center">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                          {annualSummary.months.map((m) => {
                            const isCurrent = m.year_month === currentMonth;
                            return (
                              <tr
                                key={m.year_month}
                                className={`hover:bg-slate-50 dark:hover:bg-slate-800/50 transition ${
                                  isCurrent ? 'bg-blue-50/70 dark:bg-blue-950/30 font-bold' : ''
                                }`}
                              >
                                <td className="p-2 sm:p-2.5">
                                  <div className="flex items-center space-x-1.5">
                                    <span className="font-bold text-slate-900 dark:text-slate-100">
                                      {m.month_name}
                                    </span>
                                    {isCurrent && (
                                      <span className="px-1.5 py-0.2 rounded-md bg-blue-600 text-white text-[9px] font-black uppercase">
                                        Mois actif
                                      </span>
                                    )}
                                  </div>
                                </td>
                                <td className="p-2 sm:p-2.5 text-right text-slate-600 dark:text-slate-400">
                                  {formatDuration(m.expected_hours)}
                                </td>
                                <td className="p-2 sm:p-2.5 text-right font-black text-slate-900 dark:text-slate-100">
                                  {formatDuration(m.actual_hours)}
                                </td>
                                <td className="p-2 sm:p-2.5 text-right font-black">
                                  {m.delta_hours > 0 ? (
                                    <span className="text-emerald-600 dark:text-emerald-400">+{m.delta_hours} h</span>
                                  ) : m.delta_hours < 0 ? (
                                    <span className="text-rose-600 dark:text-rose-400">{m.delta_hours} h</span>
                                  ) : (
                                    <span className="text-slate-400">0 h</span>
                                  )}
                                </td>
                                <td className="p-2 sm:p-2.5 text-center text-[11px] text-slate-500 dark:text-slate-400 hidden sm:table-cell">
                                  {m.worked_days} j trav. • {m.absence_days} j congés
                                </td>
                                <td className="p-2 sm:p-2.5 text-center">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      handleSelectMonth(m.year_month);
                                      setShowAnnualModal(false);
                                    }}
                                    className="px-2 py-1 rounded-lg bg-blue-100 hover:bg-blue-200 dark:bg-blue-900/60 dark:hover:bg-blue-800 text-blue-700 dark:text-blue-300 font-bold text-[11px] transition shadow-2xs active:scale-95"
                                  >
                                    Voir ➔
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                        <tfoot className="bg-slate-100 dark:bg-slate-800/80 font-black border-t-2 border-slate-300 dark:border-slate-700">
                          <tr>
                            <td className="p-2 sm:p-2.5 text-slate-900 dark:text-slate-100">
                              TOTAL ANNUEL (12 MOIS)
                            </td>
                            <td className="p-2 sm:p-2.5 text-right text-slate-600 dark:text-slate-300">
                              {formatDuration(annualSummary.total_expected_hours)}
                            </td>
                            <td className="p-2 sm:p-2.5 text-right text-blue-700 dark:text-blue-300 text-sm">
                              {formatDuration(annualSummary.total_worked_hours)}
                            </td>
                            <td className="p-2 sm:p-2.5 text-right text-slate-900 dark:text-slate-100">
                              {annualSummary.overtime_contract_hours > 0 ? (
                                <span className="text-emerald-600 dark:text-emerald-400">
                                  +{formatDuration(annualSummary.overtime_contract_hours)}
                                </span>
                              ) : (
                                <span className="text-slate-600 dark:text-slate-400">0 h</span>
                              )}
                            </td>
                            <td className="p-2 sm:p-2.5 text-center text-[11px] text-slate-700 dark:text-slate-300 hidden sm:table-cell">
                              {annualSummary.total_worked_days} j • {annualSummary.total_absence_days} j
                            </td>
                            <td className="p-2 sm:p-2.5"></td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* BOUTONS D'ACTION DU BAS DE LA MODALE */}
            <div className="pt-2 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-2 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={handlePrintAnnual}
                className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs flex items-center justify-center space-x-2 transition shadow-xs active:scale-95"
              >
                <Printer className="w-4 h-4" />
                <span>Imprimer le Bilan Annuel Officiel</span>
              </button>

              <button
                type="button"
                onClick={() => setShowAnnualModal(false)}
                className="px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold text-xs transition"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* IMPRESSION : RELEVÉ MENSUEL OU BILAN ANNUEL OFFICIEL      */}
      {/* ========================================================= */}
      <div className="print-only p-8 text-black bg-white text-xs font-sans max-w-4xl mx-auto">
        {printMode === 'ANNUAL' && annualSummary ? (
          <div>
            {/* EN-TÊTE FORMEL ANNUEL */}
            <div className="border-b-2 border-slate-900 pb-4 mb-4 flex justify-between items-start">
              <div>
                <h1 className="text-xl font-black uppercase tracking-wide text-slate-900">
                  Bilan Annuel d'Activité et Décompte du Temps de Travail
                </h1>
                <p className="text-xs text-slate-600 font-semibold mt-1">
                  Relevé annuel officiel du contrat d'annualisation (Septembre à Août)
                </p>
                <p className="text-xs text-slate-500 italic mt-0.5">
                  Établissement / Collectivité : Restauration scolaire & Entretien des locaux
                </p>
              </div>
              <div className="text-right border border-slate-800 p-2.5 rounded bg-slate-50">
                <div className="text-xs font-bold text-slate-600">ANNÉE SCOLAIRE</div>
                <div className="text-base font-black text-slate-900 uppercase">{annualSummary.school_year}</div>
                <div className="text-[10px] text-slate-500 mt-1">Édité le : {new Date().toLocaleDateString('fr-FR')}</div>
              </div>
            </div>

            {/* IDENTIFICATION DE L'AGENT */}
            <div className="grid grid-cols-2 gap-4 mb-4 bg-slate-50 p-3 rounded border border-slate-300 text-xs">
              <div>
                <span className="font-bold text-slate-700 block">Agent / Salarié(e) :</span>
                <span className="text-sm font-black text-slate-900">{userName || 'Agent de cantine et service scolaire'}</span>
                <span className="text-xs text-slate-600 block mt-0.5">Contrat de référence : {formatDuration(annualSummary.annual_contract_hours)} / an</span>
              </div>
              <div>
                <span className="font-bold text-slate-700 block">Période scolaire légale :</span>
                <span className="text-xs font-bold text-slate-800">Du 1er Septembre {annualSummary.start_year} au 31 Août {annualSummary.end_year}</span>
                <span className="text-[11px] text-slate-600 block mt-0.5">Annualisation du temps de travail</span>
              </div>
            </div>

            {/* SYNTHÈSE DU DÉCOMPTE ANNUEL */}
            <div className="grid grid-cols-4 gap-2 text-center border-2 border-slate-800 p-3 rounded mb-4">
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-600 block">Quota contractuel</span>
                <span className="text-base font-black text-slate-900">{formatDuration(annualSummary.annual_contract_hours)}</span>
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold text-blue-900 block">Heures réalisées</span>
                <span className="text-base font-black text-blue-900">{formatDuration(annualSummary.total_worked_hours)}</span>
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold text-amber-800 block">Reste à faire</span>
                <span className="text-base font-black text-amber-800">{formatDuration(annualSummary.remaining_contract_hours)}</span>
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold text-emerald-800 block">Surplus / Heures Sup</span>
                <span className="text-base font-black text-emerald-800">+{formatDuration(annualSummary.overtime_contract_hours)}</span>
              </div>
            </div>

            {/* TABLEAU RÉCAPITULATIF DES 12 MOIS */}
            <table className="w-full text-[10px] border-collapse border border-slate-700 print-table mb-4">
              <thead>
                <tr className="bg-slate-200 text-slate-900 font-black">
                  <th className="border border-slate-700 p-1 text-left">Mois</th>
                  <th className="border border-slate-700 p-1 text-right">Heures prévues</th>
                  <th className="border border-slate-700 p-1 text-right">Heures effectuées</th>
                  <th className="border border-slate-700 p-1 text-right">Écart</th>
                  <th className="border border-slate-700 p-1 text-center">Jours travaillés</th>
                  <th className="border border-slate-700 p-1 text-center">Jours absences / 0h</th>
                </tr>
              </thead>
              <tbody>
                {annualSummary.months.map((m) => (
                  <tr key={m.year_month}>
                    <td className="border border-slate-700 p-1 font-bold">{m.month_name}</td>
                    <td className="border border-slate-700 p-1 text-right">{formatDuration(m.expected_hours)}</td>
                    <td className="border border-slate-700 p-1 text-right font-bold">{formatDuration(m.actual_hours)}</td>
                    <td className="border border-slate-700 p-1 text-right font-black">
                      {m.delta_hours > 0 ? `+${m.delta_hours} h` : m.delta_hours < 0 ? `${m.delta_hours} h` : '0 h'}
                    </td>
                    <td className="border border-slate-700 p-1 text-center">{m.worked_days} j</td>
                    <td className="border border-slate-700 p-1 text-center">{m.absence_days} j</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-slate-100 font-black">
                  <td className="border border-slate-700 p-1">TOTAL ANNUEL</td>
                  <td className="border border-slate-700 p-1 text-right">{formatDuration(annualSummary.total_expected_hours)}</td>
                  <td className="border border-slate-700 p-1 text-right text-blue-900 font-black">{formatDuration(annualSummary.total_worked_hours)}</td>
                  <td className="border border-slate-700 p-1 text-right font-black">
                    +{formatDuration(annualSummary.overtime_contract_hours)}
                  </td>
                  <td className="border border-slate-700 p-1 text-center">{annualSummary.total_worked_days} j</td>
                  <td className="border border-slate-700 p-1 text-center">{annualSummary.total_absence_days} j</td>
                </tr>
              </tfoot>
            </table>

            {/* CADRE SIGNATURES ET VISAS POUR L'EMPLOYEUR */}
            <div className="grid grid-cols-2 gap-8 pt-4 border-t-2 border-slate-900 mt-6 page-break-inside-avoid">
              <div className="border border-slate-700 p-4 rounded min-h-[120px] flex flex-col justify-between">
                <div>
                  <span className="font-bold text-slate-800 text-xs block uppercase">Visa de l'agent / salarié(e) :</span>
                  <p className="text-[10px] text-slate-500 italic mt-0.5">Mention manuscrite "Bon pour accord du bilan annuel" :</p>
                </div>
                <div className="text-[10px] text-slate-600 pt-8 border-t border-dashed border-slate-300 flex justify-between">
                  <span>Date : ...........................</span>
                  <span>Signature :</span>
                </div>
              </div>

              <div className="border border-slate-700 p-4 rounded min-h-[120px] flex flex-col justify-between">
                <div>
                  <span className="font-bold text-slate-800 text-xs block uppercase">Visa de l'Employeur / Responsable :</span>
                  <p className="text-[10px] text-slate-500 italic mt-0.5">Cachet de la mairie / de l'établissement et signature :</p>
                </div>
                <div className="text-[10px] text-slate-600 pt-8 border-t border-dashed border-slate-300 flex justify-between">
                  <span>Date : ...........................</span>
                  <span>Signature & Cachet :</span>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div>
            {/* EN-TÊTE FORMEL */}
            <div className="border-b-2 border-slate-900 pb-4 mb-4 flex justify-between items-start">
              <div>
                <h1 className="text-xl font-black uppercase tracking-wide text-slate-900">
                  Relevé Mensuel d'Activité et Décompte du Temps de Travail
                </h1>
                <p className="text-xs text-slate-600 font-semibold mt-1">
                  Feuille d'émargement et relevé mensuel des heures de présence
                </p>
                <p className="text-xs text-slate-500 italic mt-0.5">
                  Établissement / Collectivité : Restauration scolaire & Entretien des locaux
                </p>
              </div>
              <div className="text-right border border-slate-800 p-2.5 rounded bg-slate-50">
                <div className="text-xs font-bold text-slate-600">PÉRIODE CONCERNÉE</div>
                <div className="text-base font-black text-slate-900 uppercase">{monthDisplay}</div>
                <div className="text-[10px] text-slate-500 mt-1">Date d'édition : {new Date().toLocaleDateString('fr-FR')}</div>
              </div>
            </div>

            {/* IDENTIFICATION DE L'AGENT & HORAIRES DE RÉFÉRENCE */}
            <div className="grid grid-cols-2 gap-4 mb-4 bg-slate-50 p-3 rounded border border-slate-300 text-xs">
              <div>
                <span className="font-bold text-slate-700 block">Agent / Salarié(e) :</span>
                <span className="text-sm font-black text-slate-900">{userName || 'Agent de service cantine & entretien'}</span>
                <span className="text-xs text-slate-600 block mt-0.5">Contrat horaire de référence : {habitualSchedule.expectedHours} h / jour travaillé</span>
              </div>
              <div>
                <span className="font-bold text-slate-700 block">Horaires contractuels habituels :</span>
                <span className="text-xs font-bold text-slate-800">
                  {habitualSchedule.startTime} - {habitualSchedule.endTime}
                  {habitualSchedule.breakMinutes > 0 ? ` (pause décomptée : ${habitualSchedule.breakMinutes} min)` : ''}
                </span>
                <span className="text-[11px] text-slate-600 block mt-0.5">Volume cible mensuel : {formatPlanningHours(targetThisMonth)}</span>
              </div>
            </div>

            {/* RÉCAPITULATIF SYNTHÉTIQUE DU MOIS */}
            <div className="grid grid-cols-4 gap-2 text-center border-2 border-slate-800 p-2.5 rounded mb-4">
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-600 block">Base planning</span>
                <span className="text-base font-black text-slate-900">{formatPlanningHours(targetThisMonth)}</span>
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold text-emerald-800 block">Heures sup faites</span>
                <span className="text-base font-black text-emerald-800">+{monthPositiveHours} h</span>
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold text-rose-800 block">Heures dues</span>
                <span className="text-base font-black text-rose-800">{monthNegativeHours > 0 ? `-${monthNegativeHours} h` : '0 h'}</span>
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold text-blue-900 block">Solde net du mois</span>
                <span className="text-base font-black text-blue-900">
                  {monthNetBalance >= 0 ? `+${monthNetBalance} h` : `${monthNetBalance} h`}
                </span>
              </div>
            </div>

            {/* SOLDES CUMULÉS HISTORIQUES GLOBAUX (DISTINCT DU MOIS) */}
            <div className="grid grid-cols-2 gap-3 mb-4 bg-slate-50 p-2.5 rounded border border-slate-300 text-xs">
              <div className="flex items-center justify-between px-2">
                <span className="font-semibold text-slate-700">Cumul historique Heures Sup (dû par l'employeur) :</span>
                <strong className="text-emerald-700 font-black">{formatHours(summary?.total_positive_balance || 0)}</strong>
              </div>
              <div className="flex items-center justify-between px-2">
                <span className="font-semibold text-slate-700">Cumul historique À rattraper (dû à l'employeur) :</span>
                <strong className="text-rose-700 font-black">{formatHours(-Math.abs(summary?.total_negative_balance || 0))}</strong>
              </div>
            </div>

            {/* TABLEAU DÉTAILLÉ DU MOIS */}
            <table className="w-full text-[10px] border-collapse border border-slate-700 print-table mb-4">
              <thead>
                <tr className="bg-slate-200 text-slate-900 font-black">
                  <th className="border border-slate-700 p-1 text-left">Date</th>
                  <th className="border border-slate-700 p-1 text-left">Jour</th>
                  <th className="border border-slate-700 p-1 text-center">Arrivée</th>
                  <th className="border border-slate-700 p-1 text-center">Départ</th>
                  <th className="border border-slate-700 p-1 text-center">Pause</th>
                  <th className="border border-slate-700 p-1 text-right">Prévu</th>
                  <th className="border border-slate-700 p-1 text-right">Fait</th>
                  <th className="border border-slate-700 p-1 text-right">Écart</th>
                  <th className="border border-slate-700 p-1 text-left">Statut / Motif</th>
                  <th className="border border-slate-700 p-1 text-left">Observations</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => {
                  const delta = e.delta_hours || 0;
                  const [y, m, d] = e.entry_date.split('-').map(Number);
                  const dateObj = new Date(y, m - 1, d);
                  const dayName = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'][dateObj.getDay()];
                  
                  return (
                    <tr key={e.entry_date} className={e.status_id ? 'bg-slate-50' : ''}>
                      <td className="border border-slate-700 p-1 font-mono font-bold whitespace-nowrap">{e.entry_date}</td>
                      <td className="border border-slate-700 p-1 font-semibold">{dayName}</td>
                      <td className="border border-slate-700 p-1 text-center">{e.start_time || '—'}</td>
                      <td className="border border-slate-700 p-1 text-center">{e.end_time || '—'}</td>
                      <td className="border border-slate-700 p-1 text-center">{e.break_minutes > 0 ? `${e.break_minutes}m` : '0'}</td>
                      <td className="border border-slate-700 p-1 text-right font-medium">{formatDuration(e.expected_hours)}</td>
                      <td className="border border-slate-700 p-1 text-right font-bold">{formatDuration(e.actual_hours)}</td>
                      <td className="border border-slate-700 p-1 text-right font-black">
                        {formatHours(delta)}
                      </td>
                      <td className="border border-slate-700 p-1 font-semibold">{e.status_label || (e.actual_hours > 0 ? 'Travaillé' : 'Repos')}</td>
                      <td className="border border-slate-700 p-1 italic text-slate-600">{e.notes || ''}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* CADRE SIGNATURES ET VISAS POUR L'EMPLOYEUR */}
            <div className="grid grid-cols-2 gap-8 pt-4 border-t-2 border-slate-900 mt-6 page-break-inside-avoid">
              <div className="border border-slate-700 p-4 rounded min-h-[120px] flex flex-col justify-between">
                <div>
                  <span className="font-bold text-slate-800 text-xs block uppercase">Visa de l'agent / salarié(e) :</span>
                  <p className="text-[10px] text-slate-500 italic mt-0.5">Mention manuscrite "Bon pour accord des heures effectuées" :</p>
                </div>
                <div className="text-[10px] text-slate-600 pt-8 border-t border-dashed border-slate-300 flex justify-between">
                  <span>Date : ...........................</span>
                  <span>Signature :</span>
                </div>
              </div>

              <div className="border border-slate-700 p-4 rounded min-h-[120px] flex flex-col justify-between">
                <div>
                  <span className="font-bold text-slate-800 text-xs block uppercase">Visa de l'Employeur / Responsable :</span>
                  <p className="text-[10px] text-slate-500 italic mt-0.5">Cachet de la mairie / de l'établissement et signature :</p>
                </div>
                <div className="text-[10px] text-slate-600 pt-8 border-t border-dashed border-slate-300 flex justify-between">
                  <span>Date : ...........................</span>
                  <span>Signature & Cachet :</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default App;
