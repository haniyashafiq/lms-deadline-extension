/* eslint-disable no-unused-vars */
/* global chrome */

import React from "react";
import { Calendar, LinkIcon, Clock, AlertCircle } from "lucide-react";
import { motion } from "framer-motion";

export default function AssignmentCard({ a, onOpen, diff }) {
  const borderColor = {
    urgent: "border-red-500",
    expired: "border-gray-400",
    soon: "border-orange-400",
    normal: "border-green-500",
    none: "border-slate-300",
  }[diff.level];

  const textColor = {
    urgent: "text-red-600",
    expired: "text-gray-500",
    soon: "text-orange-600",
    normal: "text-green-600",
    none: "text-gray-600",
  }[diff.level];

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className={`border-l-4 ${borderColor} bg-white shadow-sm rounded-xl p-4 mb-3`}
    >
      <div className="flex justify-between items-start mb-1">
        <h3 className="text-sm font-semibold">{a.title}</h3>
        <span className={`text-xs font-medium ${textColor}`}>
          <Clock className="w-3.5 h-3.5 inline-block mr-1" />
          {diff.label}
        </span>
      </div>

      <div className="text-xs text-gray-600">{a.course}</div>

      <div className="flex justify-between items-center mt-3">
        <div className="flex items-center text-xs text-gray-700">
          <Calendar className="w-3.5 h-3.5 mr-1" />
          {a.deadlineDate ? a.deadlineDate.toLocaleString() : a.deadlineText}
        </div>

        <button
          onClick={onOpen}
          className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition"
        >
          <LinkIcon className="w-3.5 h-3.5" />
          Open
        </button>
      </div>
    </motion.div>
  );
}
