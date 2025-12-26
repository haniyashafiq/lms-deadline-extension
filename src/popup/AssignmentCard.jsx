/* eslint-disable no-unused-vars */
/* global chrome */

import { motion } from 'framer-motion';
import { Calendar, CheckCircle, Clock, LinkIcon } from 'lucide-react';

export default function AssignmentCard({ a, onOpen, diff, onMarkSubmitted }) {
  const urgencyStyles = {
    urgent: {
      border: 'border-l-4 border-red-500',
      badge: 'bg-red-100 text-red-700',
      icon: 'text-red-500',
    },
    expired: {
      border: 'border-l-4 border-gray-400',
      badge: 'bg-gray-100 text-gray-600',
      icon: 'text-gray-400',
    },
    soon: {
      border: 'border-l-4 border-orange-500',
      badge: 'bg-orange-100 text-orange-700',
      icon: 'text-orange-500',
    },
    normal: {
      border: 'border-l-4 border-emerald-500',
      badge: 'bg-emerald-100 text-emerald-700',
      icon: 'text-emerald-500',
    },
    none: {
      border: 'border-l-4 border-slate-300',
      badge: 'bg-slate-100 text-slate-600',
      icon: 'text-slate-400',
    },
  };

  const style = urgencyStyles[diff.level] || urgencyStyles.none;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={`${style.border} bg-white shadow-md hover:shadow-lg rounded-lg p-3.5 transition-all hover:scale-[1.01]`}
    >
      <div className="flex justify-between items-start mb-2">
        <h3 className="text-sm font-bold text-slate-800 leading-tight flex-1 pr-2">{a.title}</h3>
        <span
          className={`text-[11px] font-semibold px-2.5 py-1 rounded-full whitespace-nowrap ${style.badge} flex items-center gap-1`}
        >
          <Clock className={`w-3 h-3 ${style.icon}`} />
          {diff.label}
        </span>
      </div>

      <div className="text-[11px] text-slate-600 mb-2.5 flex items-center gap-1.5 bg-slate-50 px-2.5 py-1 rounded-md">
        <span className="font-semibold text-slate-700">📖</span>
        <span className="truncate">{a.course}</span>
      </div>

      <div className="flex justify-between items-center gap-2">
        <div className="flex items-center text-[10px] text-slate-600">
          <Calendar className="w-3.5 h-3.5 mr-1.5 text-slate-500" />
          <span className="font-medium whitespace-nowrap">
            {a.deadlineDate ? a.deadlineDate.toLocaleString() : a.deadlineText}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2 justify-end">
          <button
            onClick={onOpen}
            className="flex items-center gap-1.5 text-[11px] font-semibold px-3 py-1.5 rounded-md bg-sky-500 text-white transition-all shadow-sm hover:bg-sky-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500"
          >
            <LinkIcon className="w-3.5 h-3.5" />
            Open
          </button>

          <button
            onClick={onMarkSubmitted}
            className="flex items-center gap-1.5 text-[11px] font-semibold px-3 py-1.5 rounded-md bg-emerald-500 text-white shadow-sm hover:bg-emerald-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500"
          >
            <CheckCircle className="w-3.5 h-3.5" />
            Mark submitted
          </button>
        </div>
      </div>
    </motion.div>
  );
}
