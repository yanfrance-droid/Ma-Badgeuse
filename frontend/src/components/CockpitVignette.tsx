import React from 'react';
import { CockpitSummary } from '../types';
import { ArrowUpRight, ArrowDownRight, Clock, Target, CalendarDays, Filter } from 'lucide-react';

interface Props {
  summary: CockpitSummary | null;
  activeFilter: 'ALL' | 'ABOVE' | 'BELOW' | 'ZERO';
  onFilterChange: (filter: 'ALL' | 'ABOVE' | 'BELOW' | 'ZERO') => void;
  onOpenRegularize: (type: 'POSITIVE' | 'NEGATIVE') => void;
}

export function formatHours(hoursDecimal: number): string {
  if (Math.abs(hoursDecimal) < 0.001) {
    return '0 h 00';
  }
  const isNeg = hoursDecimal < 0;
  const absHours = Math.abs(hoursDecimal);
  let h = Math.floor(absHours);
  let m = Math.round((absHours - h) * 60);
  if (m >= 60) {
    h += 1;
    m = 0;
  }
  const sign = isNeg ? '-' : '+';
  return `${sign} ${h} h ${m.toString().padStart(2, '0')}`;
}

export function formatSimpleHours(hoursDecimal: number): string {
  if (Math.abs(hoursDecimal) < 0.001) {
    return '0h00';
  }
  const isNeg = hoursDecimal < 0;
  const absHours = Math.abs(hoursDecimal);
  let h = Math.floor(absHours);
  let m = Math.round((absHours - h) * 60);
  if (m >= 60) {
    h += 1;
    m = 0;
  }
  const sign = isNeg ? '-' : '';
  return `${sign}${h}h${m.toString().padStart(2, '0')}`;
}

/**
 * Formatage spécifique planning scolaire/mairie (ex: "88h", "46h39", "0h")
 */
export function formatPlanningHours(hoursDecimal: number): string {
  if (Math.abs(hoursDecimal) < 0.001) {
    return '0h';
  }
  const isNeg = hoursDecimal < 0;
  const absHours = Math.abs(hoursDecimal);
  let h = Math.floor(absHours);
  let m = Math.round((absHours - h) * 60);
  if (m >= 60) {
    h += 1;
    m = 0;
  }
  const sign = isNeg ? '-' : '';
  if (m === 0) {
    return `${sign}${h}h`;
  }
  return `${sign}${h}h${m.toString().padStart(2, '0')}`;
}

/**
 * Conversion d'une saisie texte (ex: "88", "88h", "46h39", "46:39", "46.65") en décimal
 */
export function parsePlanningHours(str: string | number): number {
  if (typeof str === 'number') return str;
  if (!str) return 0;
  const clean = str.trim().toLowerCase().replace(/\s+/g, '');
  if (clean.includes('h') || clean.includes(':')) {
    const parts = clean.split(/[h:]/);
    const h = parseFloat(parts[0]) || 0;
    const m = parseFloat(parts[1]) || 0;
    return Math.round((h + m / 60) * 100) / 100;
  }
  return Math.round((parseFloat(clean) || 0) * 100) / 100;
}

/**
 * Affiche la durée lisible en heures et minutes (ex: 4h15 au lieu de 4.25h)
 */
export function formatDuration(hoursDecimal: number): string {
  const abs = Math.abs(hoursDecimal);
  let h = Math.floor(abs);
  let m = Math.round((abs - h) * 60);
  if (m >= 60) {
    h += 1;
    m = 0;
  }
  if (m === 0) {
    return `${h} h`;
  }
  return `${h} h ${m.toString().padStart(2, '0')}`;
}

export const CockpitVignette: React.FC<Props> = ({
  summary,
  activeFilter,
  onFilterChange,
  onOpenRegularize
}) => {
  if (!summary) {
    return (
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-200 animate-pulse">
        <div className="h-28 bg-slate-100 rounded-xl mb-3"></div>
        <div className="h-14 bg-slate-100 rounded-xl"></div>
      </div>
    );
  }

  const { total_positive_balance, total_negative_balance, current_month, days_counts } = summary;

  return (
    <section className="space-y-3">
      {/* 1. VIGNETTE PHARE : LES DEUX COMPTEURS INDÉPENDANTS */}
      <div className="bg-gradient-to-br from-slate-900 to-slate-800 text-white rounded-2xl p-4 shadow-lg border border-slate-700">
        <div className="flex items-center justify-between mb-3 border-b border-slate-700/60 pb-2">
          <div className="flex items-center space-x-2">
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></span>
            <span className="text-xs uppercase tracking-wider font-semibold text-slate-300">
              Soldes Cumulés (Persistance Infinie)
            </span>
          </div>
          <span className="text-[11px] text-emerald-400 font-medium">Rattrapage automatique</span>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {/* COMPTEUR POSITIF */}
          <div className="bg-emerald-950/40 border border-emerald-500/30 rounded-xl p-3 flex flex-col justify-between">
            <div>
              <div className="flex items-center space-x-1.5 text-emerald-400 mb-1">
                <ArrowUpRight className="w-4 h-4" />
                <span className="text-xs font-bold uppercase tracking-tight">Heures Sup</span>
              </div>
              <p className="text-[11px] text-emerald-200/80 leading-tight">Dues par l'employeur (à payer / repos)</p>
              <div className="text-2xl font-black text-emerald-300 mt-1 tracking-tight">
                {formatHours(total_positive_balance)}
              </div>
            </div>
            <button
              onClick={() => onOpenRegularize('POSITIVE')}
              className="mt-3 w-full py-1.5 px-2 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 rounded-lg text-xs font-semibold transition border border-emerald-500/30 text-center"
            >
              Régulariser / Récupérer
            </button>
          </div>

          {/* COMPTEUR NÉGATIF */}
          <div className="bg-rose-950/40 border border-rose-500/30 rounded-xl p-3 flex flex-col justify-between">
            <div>
              <div className="flex items-center space-x-1.5 text-rose-400 mb-1">
                <ArrowDownRight className="w-4 h-4" />
                <span className="text-xs font-bold uppercase tracking-tight">À Rattraper</span>
              </div>
              <p className="text-[11px] text-rose-200/80 leading-tight">Dues à l'employeur (à rattraper)</p>
              <div className="text-2xl font-black text-rose-300 mt-1 tracking-tight">
                {total_negative_balance === 0 ? "0 h 00" : formatHours(-Math.abs(total_negative_balance))}
              </div>
            </div>
            <button
              onClick={() => onOpenRegularize('NEGATIVE')}
              className="mt-3 w-full py-1.5 px-2 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 rounded-lg text-xs font-semibold transition border border-rose-500/30 text-center"
            >
              Régulariser / Rattraper
            </button>
          </div>
        </div>
      </div>

      {/* 2. BILAN DU MOIS EN COURS & OBJECTIF CONTRACTUEL */}
      <div className="bg-white rounded-2xl p-3.5 shadow-sm border border-slate-200 text-slate-700">
        <div className="flex items-center justify-between mb-2 pb-1.5 border-b border-slate-100">
          <div className="flex items-center space-x-2 text-xs font-bold text-slate-800 uppercase tracking-wide">
            <Target className="w-4 h-4 text-blue-600" />
            <span>Mois {current_month.year_month}</span>
          </div>
          {current_month.is_validated ? (
            <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
              Validé
            </span>
          ) : (
            <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-amber-100 text-amber-800 border border-amber-200">
              En cours
            </span>
          )}
        </div>

        <div className="grid grid-cols-4 gap-2 text-center text-xs">
          <div className="bg-slate-50 p-2 rounded-xl border border-slate-100">
            <p className="text-[10px] text-slate-500 uppercase font-semibold">Contrat</p>
            <p className="text-sm font-bold text-slate-800 mt-0.5">
              {formatSimpleHours(current_month.target_hours)}
            </p>
          </div>

          <div className="bg-slate-50 p-2 rounded-xl border border-slate-100">
            <p className="text-[10px] text-slate-500 uppercase font-semibold">Prévu</p>
            <p className="text-sm font-bold text-slate-800 mt-0.5">
              {formatSimpleHours(current_month.expected_hours)}
            </p>
          </div>

          <div className="bg-slate-50 p-2 rounded-xl border border-slate-100">
            <p className="text-[10px] text-slate-500 uppercase font-semibold">Fait</p>
            <p className="text-sm font-bold text-blue-700 mt-0.5">
              {formatSimpleHours(current_month.actual_hours)}
            </p>
          </div>

          <div className={`p-2 rounded-xl border ${
            current_month.delta_hours >= 0 
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800' 
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}>
            <p className="text-[10px] uppercase font-semibold">Écart net</p>
            <p className="text-sm font-bold mt-0.5">
              {formatHours(current_month.delta_hours)}
            </p>
          </div>
        </div>
      </div>

      {/* 3. FILTRES RAPIDES EN 1 CLIC */}
      <div className="flex items-center space-x-1.5 overflow-x-auto pb-1 pt-0.5 no-scrollbar">
        <button
          onClick={() => onFilterChange('ALL')}
          className={`flex-1 py-1.5 px-2.5 rounded-xl text-xs font-semibold whitespace-nowrap transition border ${
            activeFilter === 'ALL'
              ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
              : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
          }`}
        >
          Tous ({days_counts.total_days})
        </button>

        <button
          onClick={() => onFilterChange('ABOVE')}
          className={`flex-1 py-1.5 px-2.5 rounded-xl text-xs font-semibold whitespace-nowrap transition border ${
            activeFilter === 'ABOVE'
              ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
              : 'bg-white text-emerald-700 border-emerald-200 hover:bg-emerald-50'
          }`}
        >
          En plus + ({days_counts.above_quota})
        </button>

        <button
          onClick={() => onFilterChange('BELOW')}
          className={`flex-1 py-1.5 px-2.5 rounded-xl text-xs font-semibold whitespace-nowrap transition border ${
            activeFilter === 'BELOW'
              ? 'bg-rose-600 text-white border-rose-600 shadow-sm'
              : 'bg-white text-rose-700 border-rose-200 hover:bg-rose-50'
          }`}
        >
          En moins - ({days_counts.below_quota})
        </button>

        <button
          onClick={() => onFilterChange('ZERO')}
          className={`flex-1 py-1.5 px-2.5 rounded-xl text-xs font-semibold whitespace-nowrap transition border ${
            activeFilter === 'ZERO'
              ? 'bg-slate-700 text-white border-slate-700 shadow-sm'
              : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
          }`}
        >
          0h / Abs ({days_counts.zero_or_absent})
        </button>
      </div>
    </section>
  );
};
