/* eslint-disable no-unused-vars */
/* global chrome */

import { motion } from 'framer-motion';
import { Calendar, Clock, LinkIcon } from 'lucide-react';

export default function AssignmentCard({ a, onOpen, diff }) {
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
      className={`${style.border} bg-white shadow-md hover:shadow-lg rounded-lg p-4 transition-all hover:scale-[1.01]`}
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

      <div className="text-[11px] text-slate-600 mb-3 flex items-center gap-1.5 bg-slate-50 px-2.5 py-1.5 rounded-md">
        <span className="font-semibold text-slate-700">📖</span>
        <span className="truncate">{a.course}</span>
      </div>

      <div className="flex justify-between items-center">
        <div className="flex items-center text-[11px] text-slate-600">
          <Calendar className="w-3.5 h-3.5 mr-1.5 text-slate-500" />
          <span className="font-medium">
            {a.deadlineDate ? a.deadlineDate.toLocaleString() : a.deadlineText}
          </span>
        </div>

        <button
          onClick={onOpen}
          className="flex items-center gap-1.5 text-[11px] font-semibold px-3 py-1.5 rounded-md bg-[#00C0EF] text-white hover:from-blue-700 hover:to-indigo-700 transition-all shadow-sm hover:shadow-md"
        >
          <LinkIcon className="w-3.5 h-3.5" />
          Open
        </button>
      </div>
    </motion.div>
  );
}
