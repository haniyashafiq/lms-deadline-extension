// background.js
/* global chrome */
console.log('🔥 Background service worker loaded');

// --- existing settings & helper functions kept (reminder offsets, assignId, storage helpers) ---
const REMINDER_OFFSETS = [
  { key: 'reminder_11d', ms: 11 * 24 * 60 * 60 * 1000 },
  { key: 'reminder_24h', ms: 24 * 60 * 60 * 1000 },
  { key: 'reminder_6h', ms: 6 * 60 * 60 * 1000 },
  { key: 'reminder_1h', ms: 60 * 60 * 1000 },
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

function formatTimeRemaining(ms) {
  const days = Math.floor(ms / (1000 * 60 * 60 * 24));
  const hours = Math.floor((ms % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));

  if (days > 0) {
    return hours > 0
      ? `${days} day${days > 1 ? 's' : ''} ${hours} hour${hours > 1 ? 's' : ''}`
      : `${days} day${days > 1 ? 's' : ''}`;
  } else if (hours > 0) {
    return minutes > 30
      ? `${hours + 1} hour${hours + 1 > 1 ? 's' : ''}`
      : `${hours} hour${hours > 1 ? 's' : ''}`;
  } else if (minutes > 0) {
    return `${minutes} minute${minutes > 1 ? 's' : ''}`;
  } else {
    return 'less than a minute';
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
    const now = Date.now();

    for (const a of assignments) {
      if (!a.deadline) continue;
      const deadline = new Date(a.deadline).getTime();
      if (isNaN(deadline)) continue;

      const timeUntilDeadline = deadline - now;

      // Check each reminder threshold
      for (const offset of REMINDER_OFFSETS) {
        const notificationKey = `${a.id}::${offset.key}`;

        // Skip if already shown
        if (shown[notificationKey]) continue;

        // Check if we're within the notification window (e.g., less than 11 days but more than 10 days)
        // Give a 6-hour window after crossing the threshold to catch it
        const windowMs = 6 * 60 * 60 * 1000; // 6 hours
        const crossedThreshold = timeUntilDeadline <= offset.ms;
        const stillInWindow = timeUntilDeadline > offset.ms - windowMs;

        if (crossedThreshold && stillInWindow) {
          const actualTimeRemaining = formatTimeRemaining(timeUntilDeadline);

          const title = `Upcoming due: ${a.title}`;
          const message = `${a.course ? a.course + ' — ' : ''}Due in ${actualTimeRemaining}`;

          chrome.notifications.create(
            notificationKey,
            {
              type: 'basic',
              title,
              message,
              iconUrl: 'public/icon128.png',
            },
            () => {
              console.log(`📬 Periodic notification shown: ${a.title} (${offset.key})`);
            }
          );

          // Mark as shown
          await markNotificationShown(a.id, offset.key);
        }
      }
    }
  } catch (err) {
    console.error('Error in periodic deadline check:', err);
  }
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

  const collected = [];

  for (const opt of options) {
    if (!opt.value) continue; // skip "Select Course" empty
    const targetUrl = buildUrlWithOc(baseUrl, opt.value);
    console.log('→ Navigating to', opt.label, opt.value, targetUrl);

    // Navigate the existing tab (faster than creating new tabs)
    try {
      await new Promise((resolveNav, rejectNav) => {
        // Listen for tab update that indicates load complete
        function onUpdated(updatedTabId, changeInfo) {
          if (updatedTabId !== tabId) return;
          if (changeInfo.status === 'complete') {
            chrome.tabs.onUpdated.removeListener(onUpdated);
            // Reduced wait time from 200ms to 100ms
            setTimeout(resolveNav, 100);
          }
        }
        chrome.tabs.onUpdated.addListener(onUpdated);
        chrome.tabs.update(tabId, { url: targetUrl }, () => {
          if (chrome.runtime.lastError) {
            chrome.tabs.onUpdated.removeListener(onUpdated);
            rejectNav(chrome.runtime.lastError);
          } else {
            // navigation started; onUpdated handler will resolve when done
          }
        });
        // Reduced safety timeout from 15s to 8s
        setTimeout(() => {
          chrome.tabs.onUpdated.removeListener(onUpdated);
          resolveNav();
        }, 8000);
      });
    } catch (navErr) {
      console.warn('Navigation error for', opt.value, navErr);
      continue;
    }

    // After load, ask the content script on that tab to scrape
    try {
      const partial = await new Promise((resolve) => {
        let resolved = false;

        // Handler for partial responses
        function onMsg(msg) {
          if (!msg || msg.type !== 'lms_assignments_partial') return;
          // Accept messages from any sender
          resolved = true;
          chrome.runtime.onMessage.removeListener(onMsg);
          resolve(msg.assignments || []);
        }

        chrome.runtime.onMessage.addListener(onMsg);

        // Ask the content script to run a scrape now
        chrome.tabs.sendMessage(tabId, { type: 'scrape_now' }, () => {
          // resp may be undefined if no content script reply
          if (chrome.runtime.lastError) {
            // no content script present; remove listener and resolve empty
            chrome.runtime.onMessage.removeListener(onMsg);
            resolve([]);
          } else {
            // Reduced timeout from 3s to 1.5s
            setTimeout(() => {
              if (!resolved) {
                chrome.runtime.onMessage.removeListener(onMsg);
                resolve([]);
              }
            }, 1500);
          }
        });
      });

      console.log('Collected', partial.length, 'items from', opt.label || opt.value);
      appendUniqueAggregate(collected, partial);
    } catch (err) {
      console.warn('Error collecting partial for', opt.value, err);
    }

    // Reduced delay between requests from 100ms to 50ms
    await wait(50);
  }

  // Clear old data and replace with fresh collected assignments
  try {
    console.log('Replacing storage with fresh collected assignments:', collected.length);
    // Clear existing assignments first to remove submitted/old ones
    await setStoredAssignments([]);
    // Now add the fresh collected assignments
    await mergeAssignments(collected);
    console.log('🔔 Full collection finished and storage updated.');
  } catch (err) {
    console.error('Error updating collected assignments:', err);
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
    // The orchestrator above listens to this via runtime.onMessage too
    console.log('📩 Background received partial:', (msg.assignments || []).length);
    // No merging here; the orchestrator will merge collected array after iterating
    // But also merge direct partials (if desired) so the popup is updated as soon as possible:
    if (Array.isArray(msg.assignments) && msg.assignments.length) {
      mergeAssignments(msg.assignments).catch((err) => console.error(err));
    }
    return;
  }

  // Course options reported by content script
  if (msg.type === 'course_options') {
    // sender.tab contains which tab provided the options
    const options = Array.isArray(msg.options) ? msg.options : [];
    const tabId = sender?.tab?.id;
    console.log('📚 Received course options:', options.length, 'from tab', tabId);

    // DISABLED: Automatic full collection (was annoying - page kept navigating)
    // To enable manual collection, add a button in the popup that sends 'collect_all_courses'
    // if (options.length > 0 && tabId && currentUrl) {
    //   collectAllCoursesFromTab(tabId, currentUrl, options).catch(e => {
    //     console.error("Error during full collection:", e);
    //   });
    // }
    return;
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

      // Ask the tab for course options and then start
      chrome.tabs.sendMessage(t.id, { type: 'get_course_options' }, (resp) => {
        if (chrome.runtime.lastError || !resp || !resp.options) {
          const error =
            chrome.runtime.lastError?.message || 'Could not get course options from page';
          sendResponse({ ok: false, error });
          return;
        }

        if (!resp.options || resp.options.length === 0) {
          sendResponse({ ok: false, error: 'No courses found on the LMS page' });
          return;
        }

        collectAllCoursesFromTab(t.id, t.url, resp.options)
          .then(() => sendResponse({ ok: true }))
          .catch((err) => {
            console.error(err);
            sendResponse({ ok: false, error: String(err) });
          });
      });
    });
    return true; // indicate we'll send response asynchronously
  }
});

// Existing alarms + notifications handling (unchanged)
chrome.onNotificationShown?.(console.log); // no-op in some runtimes

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

      // Calculate actual time remaining
      const deadline = new Date(a.deadline).getTime();
      const timeRemaining = deadline - Date.now();
      const actualTimeRemaining = formatTimeRemaining(timeRemaining);

      const title = `Upcoming due: ${a.title}`;
      const message = `${a.course ? a.course + ' — ' : ''}Due in ${actualTimeRemaining}`;

      chrome.notifications.create(
        a.id + '::' + offsetKey,
        {
          type: 'basic',
          title,
          message,
          iconUrl: 'public/icon128.png',
        },
        async () => {
          // Mark as shown to prevent duplicate from periodic check
          await markNotificationShown(a.id, offsetKey);
        }
      );
    });
  } catch (err) {
    console.error('Alarm error:', err);
  }
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
