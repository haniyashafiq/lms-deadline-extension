/* global chrome */
import React, { useEffect, useState } from "react";
import AssignmentCard from "./AssignmentCard";
import { parseISO, timeDiff } from "./utils";
import { AlertCircle } from "lucide-react";
export default function Popup() {
  const [assignments, setAssignments] = useState([]);
  const [now, setNow] = useState(new Date());

  // Update time every minute
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(t);
  }, []);

  // Load assignments from storage
  useEffect(() => {
    chrome.storage.local.get(["assignments"], (data) => {
      const arr = (data.assignments || []).map((a) => ({
        ...a,
        deadlineDate: parseISO(a.deadline),
      }));

      arr.sort(
        (x, y) =>
          (x.deadlineDate?.getTime() || Infinity) -
          (y.deadlineDate?.getTime() || Infinity)
      );

      setAssignments(arr);
    });
  }, []);

  function openLink(a) {
    chrome.tabs.create({
      url:
        a.link ||
        "https://lms.bahria.edu.pk/Student/Assignments.php",
    });
  }

  return (
    <div className="w-[370px] p-4 font-sans bg-slate-50 min-h-[450px]">
      {/* HEADER */}
      <div className="mb-4">
        <h1 className="text-lg font-bold text-slate-800 tracking-tight">
          📚 LMS Assignments
        </h1>
        <p className="text-xs text-slate-600">
          Automatically synced from your LMS.
        </p>
      </div>

      {/* EMPTY STATE */}
      {assignments.length === 0 && (
        <div className="mt-10 text-center text-slate-600">
          <AlertCircle className="w-8 h-8 mx-auto mb-2 text-gray-500" />
          <p>No assignments found.</p>
          <p className="text-xs mt-1">
            Open your LMS assignments page to sync.
          </p>
        </div>
      )}

      {/* ASSIGNMENT LIST */}
      <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
        {assignments.map((a) => {
          const diff = timeDiff(now, a.deadlineDate);
          return (
            <AssignmentCard
              key={a.id}
              a={a}
              diff={diff}
              onOpen={() => openLink(a)}
            />
          );
        })}
      </div>

      {/* FOOTER TIP */}
      <div className="text-[11px] mt-3 text-slate-500 text-center">
        Tip: Visit the LMS Assignments page to automatically sync.
      </div>
    </div>
  );
}
