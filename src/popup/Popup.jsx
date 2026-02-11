/* global chrome */
import { AlertCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import AssignmentCard from './AssignmentCard';
import { parseISO, timeDiff } from './utils';

export default function Popup() {
  const [assignments, setAssignments] = useState([]);
  const [now, setNow] = useState(new Date());
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState({ current: 0, total: 0, courseName: '' });
  const [syncPhase, setSyncPhase] = useState('');

  useEffect(() => {
    function fetchAssignments() {
      chrome.storage.local.get(['assignments'], (data) => {
        let list = Array.isArray(data.assignments) ? data.assignments : [];

        const nowDate = new Date();
        const todayStart = new Date(nowDate);
        todayStart.setHours(0, 0, 0, 0);

        const unsubmitted = list
          .filter((a) => {
            const deadline = a.deadline ? parseISO(a.deadline) : null;
            // Include assignments due today or in the future
            const notOverdue = !deadline || deadline >= todayStart;
            // Check if not submitted: status should be "No Submission" or empty
            // Submitted statuses include: "Submission", "Added Submission", etc.
            const notSubmitted = !a.status || /no\s+submission/i.test(a.status);
            return notOverdue && notSubmitted;
          })
          .map((a) => ({ ...a, deadlineDate: a.deadline ? parseISO(a.deadline) : null }));

        unsubmitted.sort(
          (x, y) =>
            (x.deadlineDate?.getTime() || Infinity) - (y.deadlineDate?.getTime() || Infinity)
        );

        setAssignments(unsubmitted);
      });
    }

    fetchAssignments();
    const int = setInterval(() => setNow(new Date()), 30000);

    // Listen for storage changes to auto-refresh
    const storageListener = (changes) => {
      if (changes.assignments) {
        fetchAssignments();
      }
    };
    chrome.storage.onChanged.addListener(storageListener);

    // Listen for sync progress updates
    const messageListener = (msg) => {
      if (msg.type === 'sync_progress') {
        setSyncProgress({ current: msg.current, total: msg.total, courseName: msg.courseName });
      } else if (msg.type === 'sync_complete') {
        setIsSyncing(false);
        setSyncPhase('');
        setSyncProgress({ current: 0, total: 0, courseName: '' });
        fetchAssignments();

        if (msg.failedCourses && msg.failedCourses.length > 0) {
          alert(
            `Sync complete with ${
              msg.failedCourses.length
            } failed course(s):\n${msg.failedCourses.join(', ')}`
          );
        }
      }
    };
    chrome.runtime.onMessage.addListener(messageListener);

    return () => {
      clearInterval(int);
      chrome.storage.onChanged.removeListener(storageListener);
      chrome.runtime.onMessage.removeListener(messageListener);
    };
  }, []);

  function openLink(a) {
    chrome.tabs.create({ url: a.link || 'https://lms.bahria.edu.pk/Student/Assignments.php' });
  }

  async function markAsSubmitted(a) {
    if (!a?.id) return;
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'mark_assignment_submitted',
        assignmentId: a.id,
      });
      if (!response?.ok) {
        throw new Error(response?.error || 'Update failed');
      }
      setAssignments((prev) => prev.filter((item) => item.id !== a.id));
    } catch (err) {
      console.error('Failed to mark submitted:', err);
      alert('Could not mark assignment as submitted. Please refresh and try again.');
    }
  }

  async function syncAllCourses() {
    if (isSyncing) return;
    setIsSyncing(true);
    setSyncPhase('Checking LMS tab');
    setSyncProgress({ current: 0, total: 0, courseName: '' });
    try {
      const tabs = await chrome.tabs.query({ url: '*://lms.bahria.edu.pk/*' });
      if (!tabs || tabs.length === 0) {
        setSyncPhase('Opening assignments page');
        await chrome.tabs.create({ url: 'https://lms.bahria.edu.pk/Student/Assignments.php' });
        setSyncPhase('Page opened. Click Refresh again after load.');
        setIsSyncing(false);
        return;
      }
      let targetTab = tabs.find((t) => /Assignments\.php/i.test(t.url)) || tabs[0];

      if (!/Assignments\.php/i.test(targetTab.url)) {
        setSyncPhase('Navigating to assignments page');
        await new Promise((resolve) => {
          const listener = (tabId, changeInfo) => {
            if (tabId === targetTab.id && changeInfo.status === 'complete') {
              chrome.tabs.onUpdated.removeListener(listener);
              setTimeout(resolve, 250);
            }
          };
          chrome.tabs.onUpdated.addListener(listener);
          chrome.tabs.update(targetTab.id, {
            url: 'https://lms.bahria.edu.pk/Student/Assignments.php',
          });
          setTimeout(() => {
            chrome.tabs.onUpdated.removeListener(listener);
            resolve();
          }, 15000);
        });
        targetTab = await chrome.tabs.get(targetTab.id);
      }

      if (targetTab.status !== 'complete') {
        setSyncPhase('Waiting for page load');
        await new Promise((resolve) => {
          const listener = (tabId, changeInfo) => {
            if (tabId === targetTab.id && changeInfo.status === 'complete') {
              chrome.tabs.onUpdated.removeListener(listener);
              setTimeout(resolve, 200);
            }
          };
          chrome.tabs.onUpdated.addListener(listener);
          setTimeout(() => {
            chrome.tabs.onUpdated.removeListener(listener);
            resolve();
          }, 15000);
        });
      }

      setSyncPhase('Requesting course list');
      let response = await chrome.runtime.sendMessage({ type: 'collect_all_courses' });

      if (!response.ok && /course options|No courses/i.test(response.error || '')) {
        setSyncPhase('Retry: reloading page');
        await chrome.tabs.reload(targetTab.id, { bypassCache: true });
        await new Promise((resolve) => {
          const listener = (tabId, changeInfo) => {
            if (tabId === targetTab.id && changeInfo.status === 'complete') {
              chrome.tabs.onUpdated.removeListener(listener);
              setTimeout(resolve, 300);
            }
          };
          chrome.tabs.onUpdated.addListener(listener);
          setTimeout(() => {
            chrome.tabs.onUpdated.removeListener(listener);
            resolve();
          }, 15000);
        });
        setSyncPhase('Retry: requesting course list');
        response = await chrome.runtime.sendMessage({ type: 'collect_all_courses' });
      }

      if (!response.ok) throw new Error(response.error || 'Sync failed');
      // Background will send sync_progress and sync_complete messages
    } catch (err) {
      console.error('Sync error:', err);
      const errorMsg = err.message || 'Unknown';
      alert(`Sync error: ${errorMsg}`);
      setIsSyncing(false);
      setSyncPhase('');
      setSyncProgress({ current: 0, total: 0, courseName: '' });
    }
  }

  return (
    <div className="w-[400px] font-sans bg-gradient-to-br from-slate-50 to-slate-100 min-h-[500px]">
      {/* Header with original orange theme */}
      <div className="bg-[#f39c12] p-5 shadow-lg">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-white tracking-tight">Pending Assignments</h1>
            <p className="text-xs text-blue-100 mt-1">Stay on top of your deadlines</p>
          </div>
          <button
            onClick={syncAllCourses}
            disabled={isSyncing}
            className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-blue-50 disabled:bg-gray-300 disabled:text-gray-500 rounded-lg transition-all shadow-md hover:shadow-lg flex items-center gap-2"
            title="Sync assignments from all courses"
          >
            {isSyncing ? (
              <>
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                    fill="none"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                Syncing...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                  />
                </svg>
                Refresh
              </>
            )}
          </button>
        </div>
        {(isSyncing || syncPhase) && (
          <div className="mt-3 text-[10px] text-white/90 space-y-1">
            {syncPhase && <div>{syncPhase}</div>}
            {isSyncing && syncProgress.total > 0 && (
              <div>
                Course {syncProgress.current}/{syncProgress.total}: {syncProgress.courseName}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Content area */}
      <div className="p-4">
        {assignments.length === 0 ? (
          <div className="mt-16 mb-16 text-center">
            <div className="bg-white rounded-2xl p-8 shadow-sm border border-slate-200">
              <AlertCircle className="w-12 h-12 mx-auto mb-3 text-slate-400" />
              <p className="text-slate-700 font-semibold mb-1">No pending assignments</p>
              <p className="text-xs text-slate-500 mt-2 max-w-[250px] mx-auto">
                Click "Refresh" above or visit your LMS assignments page to load your assignments.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-3 max-h-[380px] overflow-y-auto pr-2 custom-scrollbar">
            {assignments.map((a) => {
              const diff = timeDiff(now, a.deadlineDate);
              return (
                <AssignmentCard
                  key={a.id}
                  a={a}
                  diff={diff}
                  onOpen={() => openLink(a)}
                  onMarkSubmitted={() => markAsSubmitted(a)}
                />
              );
            })}
          </div>
        )}

        <div className="text-[10px] mt-4 text-slate-500 text-center px-2 pb-2">
          💡 Tip: Mark a card as submitted or press "Refresh" to update the list instantly.
        </div>
      </div>
    </div>
  );
}
