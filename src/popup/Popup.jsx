/* global chrome */
import { AlertCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import AssignmentCard from './AssignmentCard';
import { parseISO, timeDiff } from './utils';

export default function Popup() {
  const [assignments, setAssignments] = useState([]);
  const [now, setNow] = useState(new Date());
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    function fetchAssignments() {
      chrome.storage.local.get(['assignments'], (data) => {
        let list = Array.isArray(data.assignments) ? data.assignments : [];

        const nowDate = new Date();
        const unsubmitted = list
          .filter((a) => {
            const deadline = a.deadline ? parseISO(a.deadline) : null;
            const notOverdue = !deadline || deadline > nowDate;
            const notSubmitted = !a.status || !/submitted/i.test(a.status);
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

    // Listen for storage changes to refresh immediately when data is updated
    const storageListener = (changes, areaName) => {
      if (areaName === 'local' && changes.assignments) {
        fetchAssignments();
      }
    };
    chrome.storage.onChanged.addListener(storageListener);

    const interval = setInterval(fetchAssignments, 30000); // refresh every 30s
    return () => {
      clearInterval(interval);
      chrome.storage.onChanged.removeListener(storageListener);
    };
  }, []);

  function openLink(a) {
    chrome.tabs.create({ url: a.link || 'https://lms.bahria.edu.pk/Student/Assignments.php' });
  }

  async function syncAllCourses() {
    setIsSyncing(true);
    try {
      // First check if there's an LMS tab open
      const tabs = await chrome.tabs.query({ url: '*://lms.bahria.edu.pk/*' });

      if (tabs.length === 0) {
        // No LMS tab open, open one and show message
        await chrome.tabs.create({ url: 'https://lms.bahria.edu.pk/Student/Assignments.php' });
        alert('LMS page opened. Please wait for it to load, then click "Sync All" again.');
        setIsSyncing(false);
        return;
      }

      // Check if tab is already fully loaded
      const targetTab = tabs[0];
      const needsReload = targetTab.status !== 'complete';

      if (needsReload) {
        // Only reload if page isn't fully loaded
        await chrome.tabs.reload(targetTab.id, { bypassCache: true });

        // Wait for the tab to finish loading
        await new Promise((resolve) => {
          const listener = (tabId, changeInfo) => {
            if (tabId === targetTab.id && changeInfo.status === 'complete') {
              chrome.tabs.onUpdated.removeListener(listener);
              // Reduced from 800ms to 300ms
              setTimeout(resolve, 300);
            }
          };
          chrome.tabs.onUpdated.addListener(listener);

          // Safety timeout
          setTimeout(() => {
            chrome.tabs.onUpdated.removeListener(listener);
            resolve();
          }, 10000);
        });
      } else {
        // Page already loaded, just wait briefly for content script to be ready
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ type: 'collect_all_courses' }, (response) => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else if (response && response.ok) {
            resolve();
          } else {
            reject(new Error(response?.error || 'Failed to sync'));
          }
        });
      });

      // Success feedback
      console.log('Sync completed successfully');
    } catch (err) {
      console.error('Sync error:', err);
      const errorMsg = err.message || String(err);

      if (errorMsg.includes('no options from page') || errorMsg.includes('no active tab')) {
        alert('Please open the LMS Assignments page first, then try syncing again.');
      } else {
        alert(`Sync failed: ${errorMsg}\n\nMake sure you're logged into the LMS.`);
      }
    } finally {
      setIsSyncing(false);
    }
  }

  return (
    <div className="w-[400px] font-sans bg-gradient-to-br from-slate-50 to-slate-100 min-h-[500px]">
      {/* Header with gradient */}
      <div className="bg-[#f39c12] p-5 shadow-lg">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg sm:text-xl font-bold text-white tracking-tight">
              Pending Assignments
            </h1>
            <p className="text-xs sm:text-sm text-blue-100 mt-1">Stay on top of your deadlines</p>
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
      </div>

      {/* Content area */}
      <div className="p-4">
        {assignments.length === 0 ? (
          <div className="mt-16 mb-16 text-center">
            <div className="bg-white rounded-2xl p-8 shadow-sm border border-slate-200">
              <AlertCircle className="w-12 h-12 mx-auto mb-3 text-slate-400" />
              <p className="text-slate-700 font-semibold mb-1">No pending assignments</p>
              <p className="text-xs text-slate-500 mt-2 max-w-[250px] mx-auto">
                Click "Sync All" above or visit your LMS assignments page to load your assignments.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-3 max-h-[calc(100vh-180px)] overflow-y-auto pr-2 custom-scrollbar">
            {assignments.map((a) => {
              const diff = timeDiff(now, a.deadlineDate);
              return <AssignmentCard key={a.id} a={a} diff={diff} onOpen={() => openLink(a)} />;
            })}
          </div>
        )}

        <div className="text-[10px] mt-4 text-slate-500 text-center px-2 pb-2">
          💡 Tip: Click "Sync All" after submitting assignments to update the list
        </div>
      </div>
    </div>
  );
}
