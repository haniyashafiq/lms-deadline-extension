// background.js
/* global chrome */
console.log("🔥 Background service worker loaded");
const REMINDER_OFFSETS = [
  { key: "reminder_24h", ms: 24 * 60 * 60 * 1000 },
  { key: "reminder_6h", ms: 6 * 60 * 60 * 1000 },
  { key: "reminder_1h", ms: 60 * 60 * 1000 }
];

// Utility: create a stable id for an assignment (title + deadline + course)
function assignmentId(a) {
  const s = `${a.title}||${a.deadline || ""}||${a.course || ""}`;
  // simple hash:
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h) + s.charCodeAt(i);
    h |= 0;
  }
  return "a_" + Math.abs(h);
}

async function getStoredAssignments() {
  return new Promise(res => {
    chrome.storage.local.get(["assignments"], data => {
      res(data.assignments || []);
    });
  });
}

async function setStoredAssignments(list) {
  return new Promise(res => {
    chrome.storage.local.set({ assignments: list }, () => res());
  });
}

// Create alarm IDs with assignment id + offset key
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

// Remove existing alarms for an assignment (if updated)
function clearAlarmsForAssignmentId(aid) {
  chrome.alarms.getAll(alarms => {
    const related = alarms.filter(al => al.name && al.name.startsWith(aid + "::"));
    related.forEach(a => chrome.alarms.clear(a.name));
  });
}

// Merge incoming assignments with stored ones
async function mergeAssignments(incoming) {
  if (!incoming || !incoming.length) return;
  const stored = await getStoredAssignments();
  const map = new Map();
  // store existing so we keep any custom fields later
  for (const s of stored) {
    map.set(assignmentId(s), s);
  }
  for (const a of incoming) {
    const id = assignmentId(a);
    // keep link updates and deadlines; prefer latest deadline if changed
    map.set(id, Object.assign({}, map.get(id) || {}, a, { id }));
  }
  const merged = Array.from(map.values());
  await setStoredAssignments(merged);
  // Recreate alarms
  merged.forEach(m => {
    clearAlarmsForAssignmentId(m.id);
    setAlarmsForAssignment(m);
  });
}

// Listener for messages from content script
chrome.runtime.onMessage.addListener((msg) => {
    console.log("📩 Background received:", msg);

  if (msg && msg.type === "lms_assignments" && Array.isArray(msg.assignments)) {
    mergeAssignments(msg.assignments).catch(err => console.error(err));
  }
});

// On install, set up default settings
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(["settings"], data => {
    if (!data.settings) {
      chrome.storage.local.set({ settings: { reminders: ["reminder_24h", "reminder_6h", "reminder_1h"] }});
    }
  });
});

// Alarm handler -> show notification
chrome.alarms.onAlarm.addListener(alarm => {
  try {
    const name = alarm.name;
    // alarm.name looks like "a_12345::reminder_24h"
    const parts = name.split("::");
    if (parts.length !== 2) return;
    const aid = parts[0];
    const offsetKey = parts[1];

    chrome.storage.local.get(["assignments"], data => {
      const assignments = data.assignments || [];
      const a = assignments.find(x => x.id === aid);
      if (!a) return;

      const whenText = offsetKey === "reminder_24h" ? "24 hours" :
                       offsetKey === "reminder_6h" ? "6 hours" :
                       offsetKey === "reminder_1h" ? "1 hour" : "";

      const title = `Upcoming due: ${a.title}`;
      const message = `${a.course ? a.course + " — " : ""}Due in ~${whenText}`;

      chrome.notifications.create(a.id + "::" + offsetKey, {
        type: "basic",
        title,
        message,
        iconUrl: "public/icon128.png"
      }, () => {});
    });
  } catch (err) {
    console.error("Alarm error:", err);
  }
});
