/* global chrome */
console.log('🔥 Background service worker loaded');

// --- existing settings & helper functions kept (reminder offsets, assignId, storage helpers) ---
const REMINDER_OFFSETS = [
  { key: 'reminder_3d', ms: 3 * 24 * 60 * 60 * 1000 },
  { key: 'reminder_2d', ms: 2 * 24 * 60 * 60 * 1000 },
  // "Today" reminder: trigger at the deadline time
  { key: 'reminder_today', ms: 0 },
];

function normalize(str) {
  return (str || '').trim().toLowerCase();
}

function assignmentId(a) {
  // Deduplicate by title + deadline only (ignore course to merge duplicates across courses)
  const s = `${normalize(a.title)}||${normalize(a.deadline)}`;
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i);
    h |= 0;
  }
  return 'a_' + Math.abs(h);
}

async function getStoredAssignments() {
  return new Promise((res) => {
    chrome.storage.local.get(['assignments'], (data) => {
      res(data.assignments || []);
    });
  });
}

async function setStoredAssignments(list) {
  return new Promise((res) => {
    chrome.storage.local.set({ assignments: list }, () => res());
  });
}

async function getShownNotifications() {
  return new Promise((res) => {
    chrome.storage.local.get(['shownNotifications'], (data) => {
      res(data.shownNotifications || {});
    });
  });
}

async function markNotificationShown(assignmentId, offsetKey) {
  const shown = await getShownNotifications();
  const key = `${assignmentId}::${offsetKey}`;
  shown[key] = Date.now();
  return new Promise((res) => {
    chrome.storage.local.set({ shownNotifications: shown }, () => res());
  });
}

async function clearShownNotificationsForAssignment(assignmentId) {
  const shown = await getShownNotifications();
  let mutated = false;
  Object.keys(shown).forEach((key) => {
    if (key.startsWith(`${assignmentId}::`)) {
      delete shown[key];
      mutated = true;
    }
  });
  if (!mutated) return;
  return new Promise((res) => {
    chrome.storage.local.set({ shownNotifications: shown }, () => res());
  });
}

function clearActiveNotificationsForAssignment(assignmentId) {
  REMINDER_OFFSETS.forEach((offset) => {
    const notificationId = `${assignmentId}::${offset.key}`;
    chrome.notifications.clear(notificationId);
  });
}

async function removeAssignmentById(assignmentId) {
  if (!assignmentId) return null;
  const assignments = await getStoredAssignments();
  const idx = assignments.findIndex((a) => a.id === assignmentId);
  if (idx === -1) return null;
  const [removed] = assignments.splice(idx, 1);
  await setStoredAssignments(assignments);
  clearAlarmsForAssignmentId(assignmentId);
  await clearShownNotificationsForAssignment(assignmentId);
  clearActiveNotificationsForAssignment(assignmentId);
  return removed;
}

async function openAssignmentLinkFromStorage(assignmentId) {
  if (!assignmentId) return;
  const assignments = await getStoredAssignments();
  const assignment = assignments.find((a) => a.id === assignmentId);
  const targetUrl = assignment?.link || 'https://lms.bahria.edu.pk/Student/Assignments.php';
  chrome.tabs.create({ url: targetUrl });
}

function formatDueDateString(deadlineMs) {
  try {
    const d = new Date(deadlineMs);
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

function setAlarmsForAssignment(a) {
  if (!a.deadline) return;
  const due = new Date(a.deadline).getTime();
  if (isNaN(due)) return;
  const id = assignmentId(a);
  for (const offset of REMINDER_OFFSETS) {
    const when = due - offset.ms;
    if (when > Date.now()) {
      const alarmName = `${id}::${offset.key}`;
      chrome.alarms.create(alarmName, { when });
    }
  }
}

function clearAlarmsForAssignmentId(aid) {
  chrome.alarms.getAll((alarms) => {
    const related = alarms.filter((al) => al.name && al.name.startsWith(aid + '::'));
    related.forEach((a) => chrome.alarms.clear(a.name));
  });
}

function ensureContentScript(tabId) {
  return new Promise((resolve, reject) => {
    if (!chrome.scripting || typeof chrome.scripting.executeScript !== 'function') {
      resolve(false);
      return;
    }
    chrome.scripting.executeScript(
      {
        target: { tabId },
        files: ['content.js'],
      },
      () => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(true);
        }
      }
    );
  });
}

function sendMessageToTab(tabId, payload) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, payload, (resp) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(resp);
    });
  });
}

function reloadTabAndWait(tabId, { timeoutMs = 20000 } = {}) {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(onUpdated);
      reject(new Error('Timed out waiting for LMS tab to reload'));
    }, timeoutMs);

    function cleanup(err) {
      chrome.tabs.onUpdated.removeListener(onUpdated);
      clearTimeout(timeoutId);
      if (err) {
        reject(err);
      } else {
        setTimeout(resolve, 250);
      }
    }

    function onUpdated(updatedTabId, changeInfo) {
      if (updatedTabId === tabId && changeInfo.status === 'complete') {
        cleanup();
      }
    }

    chrome.tabs.onUpdated.addListener(onUpdated);
    chrome.tabs.reload(tabId, { bypassCache: true }, () => {
      if (chrome.runtime.lastError) {
        cleanup(new Error(chrome.runtime.lastError.message));
      }
    });
  });
}

async function getCourseOptionsWithRecovery(tabId) {
  async function attempt() {
    const resp = await sendMessageToTab(tabId, { type: 'get_course_options' });
    const options = Array.isArray(resp?.options) ? resp.options : null;
    if (!options || options.length === 0) {
      throw new Error('No courses found on the LMS page');
    }
    return options;
  }

  let lastErr = null;
  let attemptsLeft = 4;

  while (attemptsLeft > 0) {
    try {
      return await attempt();
    } catch (err) {
      lastErr = err;
      attemptsLeft -= 1;

      const message = err?.message || '';
      const missingReceiver = /Receiving end does not exist/i.test(message);

      if (!missingReceiver) {
        throw err;
      }

      const step = attemptsLeft;
      if (step === 3) {
        try {
          const injected = await ensureContentScript(tabId);
          if (!injected) {
            console.warn('scripting API unavailable; skipping reinjection');
          }
        } catch (reinjectionErr) {
          console.warn('Content script reinjection failed:', reinjectionErr);
        }
      } else if (step === 2) {
        try {
          await reloadTabAndWait(tabId);
        } catch (reloadErr) {
          console.warn('Reloading LMS tab failed:', reloadErr);
        }
      } else if (step === 1) {
        try {
          const newTab = await openAssignmentsTab();
          tabId = newTab.id;
        } catch (openErr) {
          console.warn('Opening fresh LMS tab failed:', openErr);
        }
      } else {
        break;
      }
    }
  }

  throw lastErr || new Error('Could not get course options from page');
}

function openAssignmentsTab() {
  const targetUrl = 'https://lms.bahria.edu.pk/Student/Assignments.php';
  return new Promise((resolve, reject) => {
    chrome.tabs.create({ url: targetUrl, active: true }, (tab) => {
      if (chrome.runtime.lastError || !tab?.id) {
        reject(new Error(chrome.runtime.lastError?.message || 'Could not open LMS tab'));
        return;
      }

      const tabId = tab.id;
      const timeoutId = setTimeout(() => {
        chrome.tabs.onUpdated.removeListener(onUpdated);
        reject(new Error('Timed out waiting for LMS tab to open'));
      }, 20000);

      function cleanup(err) {
        chrome.tabs.onUpdated.removeListener(onUpdated);
        clearTimeout(timeoutId);
        if (err) {
          reject(err);
          return;
        }
        chrome.tabs.get(tabId, (latest) => {
          if (chrome.runtime.lastError || !latest) {
            reject(new Error(chrome.runtime.lastError?.message || 'Could not read LMS tab'));
            return;
          }
          resolve(latest);
        });
      }

      function onUpdated(updatedTabId, changeInfo) {
        if (updatedTabId === tabId && changeInfo.status === 'complete') {
          setTimeout(() => cleanup(), 250);
        }
      }

      chrome.tabs.onUpdated.addListener(onUpdated);
    });
  });
}

async function mergeAssignments(incoming) {
  if (!incoming || !incoming.length) return;
  const stored = await getStoredAssignments();
  const map = new Map();
  for (const s of stored) {
    map.set(assignmentId(s), s);
  }
  for (const a of incoming) {
    const id = assignmentId(a);
    const existing = map.get(id);
    if (existing) {
      // Merge: keep all unique course names
      const courses = new Set();
      if (existing.course) courses.add(existing.course);
      if (a.course) courses.add(a.course);
      const mergedCourses = Array.from(courses).join(', ');
      map.set(id, Object.assign({}, existing, a, { id, course: mergedCourses }));
    } else {
      map.set(id, Object.assign({}, a, { id }));
    }
  }
  const merged = Array.from(map.values());
  await setStoredAssignments(merged);
  // Recreate alarms
  merged.forEach((m) => {
    clearAlarmsForAssignmentId(m.id);
    setAlarmsForAssignment(m);
  });
}

// Periodic check: scan all assignments and show notifications if they cross thresholds
async function checkAndNotifyUpcomingDeadlines() {
  try {
    const assignments = await getStoredAssignments();
    const shown = await getShownNotifications();

    const msInDay = 24 * 60 * 60 * 1000;
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    for (const a of assignments) {
      if (!a.deadline) continue;
      const deadline = new Date(a.deadline).getTime();
      if (isNaN(deadline)) continue;

      const dueDay = new Date(deadline);
      dueDay.setHours(0, 0, 0, 0);
      const dayDiff = Math.round((dueDay.getTime() - todayStart.getTime()) / msInDay);

      let keyToUse = null;
      let messageSuffix = '';
      if (dayDiff === 3) {
        keyToUse = 'reminder_3d';
        messageSuffix = `Due in 3 days • ${formatDueDateString(deadline)}`;
      } else if (dayDiff === 2) {
        keyToUse = 'reminder_2d';
        messageSuffix = `Due in 2 days • ${formatDueDateString(deadline)}`;
      } else if (dayDiff === 0) {
        keyToUse = 'reminder_today';
        messageSuffix = `Due today`;
      }

      if (!keyToUse) continue;

      const notificationKey = `${a.id}::${keyToUse}`;
      if (shown[notificationKey]) continue;

      const title = `Upcoming due: ${a.title}`;
      const message = `${a.course ? a.course + ' — ' : ''}${messageSuffix}`;

      chrome.notifications.create(
        notificationKey,
        {
          type: 'basic',
          title,
          message,
          iconUrl: chrome.runtime.getURL('icon128.png'),
          requireInteraction: true,
          priority: 2,
          buttons: [{ title: 'Mark submitted' }, { title: 'Open assignment' }],
        },
        () => {
          console.log(`📬 Periodic notification shown: ${a.title} (${keyToUse})`);
        }
      );

      await markNotificationShown(a.id, keyToUse);
    }
  } catch (err) {
    console.error('Error in periodic deadline check:', err);
  }
}

// Send progress updates to popup
function sendSyncProgress(current, total, courseName) {
  chrome.runtime
    .sendMessage({
      type: 'sync_progress',
      current,
      total,
      courseName,
    })
    .catch(() => {}); // Ignore errors if popup is closed
}

// --- END helpers ---

// We'll track if a full-collection job is running so we don't run concurrent crawls.
let isCollectingAll = false;

// Wait utility
function wait(ms) {
  return new Promise((res) => setTimeout(res, ms));
}

// Replace or add/merge partial results into aggregate array
function appendUniqueAggregate(aggregate, list) {
  if (!Array.isArray(list) || !list.length) return;
  for (const a of list) {
    aggregate.push(a);
  }
}

// Build assignments page URL with new oc param
function buildUrlWithOc(baseUrl, ocValue) {
  try {
    const u = new URL(baseUrl);
    // set oc parameter
    u.searchParams.set('oc', ocValue);
    return u.toString();
  } catch (e) {
    console.warn('Invalid base URL for building oc:', baseUrl, e);
    return baseUrl;
  }
}

// Orchestrator: visit each course option in the provided tab and collect assignments.
async function collectAllCoursesFromTab(tabId, baseUrl, options) {
  if (!Array.isArray(options) || options.length === 0) {
    console.log('No course options to collect.');
    return;
  }
  if (isCollectingAll) {
    console.log('Collection already running. Aborting duplicate request.');
    return;
  }
  isCollectingAll = true;
  console.log('🔄 Starting full collection of all courses...');

  // Clear old assignments before starting fresh sync
  await setStoredAssignments([]);
  console.log('🗑️ Cleared old assignments from storage');

  const collected = [];
  const failedCourses = [];
  const totalCourses = options.length;

  for (let i = 0; i < options.length; i++) {
    const opt = options[i];
    if (!opt.value) continue; // skip "Select Course" empty

    const targetUrl = buildUrlWithOc(baseUrl, opt.value);
    const courseName = opt.label || `Course ${i + 1}`;

    console.log(`→ [${i + 1}/${totalCourses}] Navigating to`, courseName, targetUrl);

    // Send progress update
    sendSyncProgress(i + 1, totalCourses, courseName);

    let retryCount = 0;
    let success = false;

    // Retry logic: try up to 2 times (1 initial + 1 retry)
    while (retryCount < 2 && !success) {
      try {
        // Navigate the existing tab (faster than creating new tabs)
        await new Promise((resolveNav, rejectNav) => {
          const startTime = Date.now();

          // Listen for tab update that indicates load complete
          function onUpdated(updatedTabId, changeInfo) {
            if (updatedTabId !== tabId) return;
            if (changeInfo.status === 'complete') {
              chrome.tabs.onUpdated.removeListener(onUpdated);
              const loadTime = Date.now() - startTime;
              // Dynamic wait: fast connection = short wait, slow = longer wait
              const waitTime = loadTime > 3000 ? 200 : 100;
              setTimeout(resolveNav, waitTime);
            }
          }
          chrome.tabs.onUpdated.addListener(onUpdated);
          chrome.tabs.update(tabId, { url: targetUrl }, () => {
            if (chrome.runtime.lastError) {
              chrome.tabs.onUpdated.removeListener(onUpdated);
              rejectNav(chrome.runtime.lastError);
            }
          });

          // Adaptive timeout: 15s for slow connections, but resolves early if page loads fast
          setTimeout(() => {
            chrome.tabs.onUpdated.removeListener(onUpdated);
            resolveNav();
          }, 15000);
        });

        // After load, ask the content script on that tab to scrape
        const partial = await new Promise((resolve) => {
          let resolved = false;

          // Handler for partial responses
          function onMsg(msg) {
            if (!msg || msg.type !== 'lms_assignments_partial') return;
            resolved = true;
            chrome.runtime.onMessage.removeListener(onMsg);
            resolve(msg.assignments || []);
          }

          chrome.runtime.onMessage.addListener(onMsg);

          // Ask the content script to run a scrape now
          chrome.tabs.sendMessage(tabId, { type: 'scrape_now' }, () => {
            if (chrome.runtime.lastError) {
              chrome.runtime.onMessage.removeListener(onMsg);
              resolve([]);
            } else {
              // 2.5s timeout for scrape (increased from 1.5s)
              setTimeout(() => {
                if (!resolved) {
                  chrome.runtime.onMessage.removeListener(onMsg);
                  resolve([]);
                }
              }, 2500);
            }
          });
        });

        console.log(`✓ Collected ${partial.length} items from ${courseName}`);
        appendUniqueAggregate(collected, partial);

        // Incremental update: merge immediately so popup updates in real-time
        if (partial.length > 0) {
          await mergeAssignments(partial);
        }

        success = true;
      } catch (err) {
        retryCount++;
        console.warn(`⚠️ Attempt ${retryCount} failed for ${courseName}:`, err);

        if (retryCount < 2) {
          console.log(`🔄 Retrying ${courseName}...`);
          await wait(1000); // Wait 1s before retry
        } else {
          console.error(`✗ Failed ${courseName} after ${retryCount} attempts`);
          failedCourses.push(courseName);
        }
      }
    }

    // Small delay between courses
    await wait(50);
  }

  // Final update
  try {
    console.log(`📊 Collection complete: ${collected.length} total assignments`);
    if (failedCourses.length > 0) {
      console.warn(`⚠️ Failed courses (${failedCourses.length}):`, failedCourses.join(', '));
    }

    // Send completion message to popup
    chrome.runtime
      .sendMessage({
        type: 'sync_complete',
        totalAssignments: collected.length,
        failedCourses,
      })
      .catch(() => {});

    console.log('🔔 Full collection finished and storage updated.');
  } catch (err) {
    console.error('Error in final collection update:', err);
  } finally {
    isCollectingAll = false;
  }
}

// Message routing: handle messages from content script or popup
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || !msg.type) return;

  // Regular assignment delivery from content script (single-page scrapes)
  if (msg.type === 'lms_assignments' && Array.isArray(msg.assignments)) {
    console.log('📩 Background received (lms_assignments)', msg.assignments.length);
    mergeAssignments(msg.assignments).catch((err) => console.error(err));
    return;
  }

  // Partial assignments response from content script (when asked to scrape)
  if (msg.type === 'lms_assignments_partial') {
    console.log('📩 Background received partial:', (msg.assignments || []).length);
    if (Array.isArray(msg.assignments) && msg.assignments.length) {
      mergeAssignments(msg.assignments).catch((err) => console.error(err));
    }
    return;
  }

  // Course options reported by content script
  if (msg.type === 'course_options') {
    const options = Array.isArray(msg.options) ? msg.options : [];
    const tabId = sender?.tab?.id;
    console.log('📚 Received course options:', options.length, 'from tab', tabId);
    return;
  }

  if (msg.type === 'mark_assignment_submitted') {
    const assignmentId = msg.assignmentId;
    if (!assignmentId) {
      sendResponse({ ok: false, error: 'Missing assignmentId' });
      return;
    }
    (async () => {
      try {
        const removed = await removeAssignmentById(assignmentId);
        sendResponse({ ok: !!removed });
      } catch (err) {
        console.error('Failed to mark assignment submitted:', err);
        sendResponse({ ok: false, error: err?.message || 'Failed to update assignment' });
      }
    })();
    return true;
  }

  // Popup (or user) requested an on-demand full collection from a specific tab
  if (msg.type === 'collect_all_courses') {
    // First try to find any LMS tab
    chrome.tabs.query({ url: '*://lms.bahria.edu.pk/*' }, (lmsTabs) => {
      if (!lmsTabs || lmsTabs.length === 0) {
        sendResponse({
          ok: false,
          error: 'No LMS page open. Please open lms.bahria.edu.pk first.',
        });
        return;
      }

      // Use the first LMS tab found
      const t = lmsTabs[0];
      (async () => {
        try {
          const options = await getCourseOptionsWithRecovery(t.id);
          await collectAllCoursesFromTab(t.id, t.url, options);
          sendResponse({ ok: true });
        } catch (err) {
          const message = err?.message || 'Could not get course options from page';
          sendResponse({ ok: false, error: message });
        }
      })();
    });
    return true; // indicate we'll send response asynchronously
  }
});

// Existing alarms + notifications handling (unchanged)
chrome.alarms.onAlarm.addListener((alarm) => {
  try {
    const name = alarm.name;

    // Handle periodic deadline check
    if (name === 'periodic_deadline_check') {
      console.log('⏰ Running periodic deadline check...');
      checkAndNotifyUpcomingDeadlines();
      return;
    }

    const parts = name.split('::');
    if (parts.length !== 2) return;
    const aid = parts[0];
    const offsetKey = parts[1];

    chrome.storage.local.get(['assignments'], (data) => {
      const assignments = data.assignments || [];
      const a = assignments.find((x) => x.id === aid);
      if (!a) return;
      const deadline = new Date(a.deadline).getTime();
      getShownNotifications().then((shown) => {
        const notificationKey = `${a.id}::${offsetKey}`;
        if (shown[notificationKey]) return; // Avoid duplicate if periodic already showed

        const title = `Upcoming due: ${a.title}`;
        let messageSuffix = '';
        if (offsetKey === 'reminder_3d') {
          messageSuffix = `Due in 3 days • ${formatDueDateString(deadline)}`;
        } else if (offsetKey === 'reminder_2d') {
          messageSuffix = `Due in 2 days • ${formatDueDateString(deadline)}`;
        } else if (offsetKey === 'reminder_today') {
          messageSuffix = 'Due today';
        } else {
          // Fallback if unknown key
          messageSuffix = `Due ${formatDueDateString(deadline)}`;
        }
        const message = `${a.course ? a.course + ' — ' : ''}${messageSuffix}`;

        chrome.notifications.create(
          notificationKey,
          {
            type: 'basic',
            title,
            message,
            iconUrl: chrome.runtime.getURL('icon128.png'),
            requireInteraction: true,
            priority: 2,
            buttons: [{ title: 'Mark submitted' }, { title: 'Open assignment' }],
          },
          async () => {
            // Mark as shown to prevent duplicate from periodic check
            await markNotificationShown(a.id, offsetKey);
          }
        );
      });
    });
  } catch (err) {
    console.error('Alarm error:', err);
  }
});

chrome.notifications.onButtonClicked.addListener((notificationId, buttonIndex) => {
  if (!notificationId) return;
  const parts = notificationId.split('::');
  if (parts.length < 2) return;
  const assignmentId = parts[0];
  if (buttonIndex === 0) {
    removeAssignmentById(assignmentId)
      .then(() => {
        chrome.notifications.clear(notificationId);
      })
      .catch((err) => console.error('Failed to handle notification action:', err));
  } else if (buttonIndex === 1) {
    openAssignmentLinkFromStorage(assignmentId);
  }
});

chrome.notifications.onClicked.addListener((notificationId) => {
  if (!notificationId) return;
  const parts = notificationId.split('::');
  if (parts.length < 2) return;
  const assignmentId = parts[0];
  openAssignmentLinkFromStorage(assignmentId);
});

// On install: default settings and periodic alarm
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(['settings'], (data) => {
    if (!data.settings) {
      chrome.storage.local.set({
        settings: { reminders: ['reminder_11d', 'reminder_24h', 'reminder_6h', 'reminder_1h'] },
      });
    }
  });

  // Set up periodic check every 3 hours
  chrome.alarms.create('periodic_deadline_check', {
    periodInMinutes: 180, // 3 hours
  });

  // Run initial check immediately
  console.log('🚀 Running initial deadline check...');
  checkAndNotifyUpcomingDeadlines();
});

// Also set up periodic alarm on startup (in case service worker was restarted)
chrome.alarms.get('periodic_deadline_check', (alarm) => {
  if (!alarm) {
    chrome.alarms.create('periodic_deadline_check', {
      periodInMinutes: 180,
    });
    console.log('🚀 Periodic alarm created on startup');
  }
});
