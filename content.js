// content.js
/* global chrome */
console.log('Extension ID:', chrome.runtime.id);

(function () {
  if (window.top !== window.self) {
  console.log("⏭ Skipping content.js inside iframe");
  return;
}
  if (window.__ASSIGNMENT_SCRIPT_LOADED__) {
  console.log("⚠ content.js already injected");
  return;
}
window.__ASSIGNMENT_SCRIPT_LOADED__ = true;
  // Helper: try to parse a date string into a JS Date
  function parseDateString(s) {
    if (!s) return null;
    // Normalize separators and common tokens
    let text = s
      .replace(/\s+-\s+/g, ' ')
      .replace(/\s+–\s+/g, ' ')
      .trim();
    // Some CMS show "19 September 2025-12:00 am" or "19 September 2025 - 12:00 am"
    text = text.replace(/(\d)([ap]m)/i, '$1 $2');
    // Replace long dash artifacts
    text = text.replace(/\u2013|\u2014/g, ' ');
    // Try Date.parse first
    let d = Date.parse(text);
    if (!isNaN(d)) return new Date(d);

    // Try to extract `DD Month YYYY` and optional time
    const regex =
      /(\d{1,2})\s*(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec|January|February|March|April|May|June|July|August|September|October|November|December)\w*\s*(\d{4})(?:[\s,-]*([0-9:.apmAPM ]+))?/;
    const m = text.match(regex);
    if (m) {
      let dateStr = `${m[1]} ${m[2]} ${m[3]} ${m[4] || ''}`;
      d = Date.parse(dateStr);
      if (!isNaN(d)) return new Date(d);
    }
    // Fallback: try to extract ISO-like fragments
    const iso = text.match(/\d{4}-\d{2}-\d{2}T?\d{2}:\d{2}/);
    if (iso) {
      d = Date.parse(iso[0]);
      if (!isNaN(d)) return new Date(d);
    }
    return null;
  }

  // Heuristic: find assignment rows in page tables
  function findAssignmentRows() {
    const rows = Array.from(document.querySelectorAll('table tr'));
    // filter out header rows by checking for numeric first cell or presence of deadline-like text
    return rows.filter((row) => {
      const tds = Array.from(row.querySelectorAll('td'));
      if (tds.length < 2) return false;
      const text = row.innerText;
      const monthRegex =
        /\b(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/i;
      return monthRegex.test(text); // likely contains a deadline
    });
  }

  function extractFromRow(row) {
    const tds = Array.from(row.querySelectorAll('td'));
    // Basic heuristics based on the screenshot:
    // - Title likely in 2nd column
    // - Deadline likely in last column or inside a blue badge
    let title = null;
    let deadlineText = null;
    let link = null;
    let course = null;

    // try to find title by looking for anchor or text in 2nd or 1st columns
    for (let i = 0; i < Math.min(tds.length, 4); i++) {
      const a = tds[i].querySelector('a');
      const t = tds[i].innerText.trim();
      if (!title && t && t.length < 200 && /Lab|Assignment|Task|Project|Quiz|Exam/i.test(t)) {
        title = t;
        if (a && a.href) link = a.href;
        break;
      }
    }

    // fallback: first non-empty td (excluding number column)
    if (!title) {
      const candidate = tds.find((td, idx) => idx !== 0 && td.innerText.trim().length > 3);
      if (candidate) title = candidate.innerText.trim();
      const a = candidate?.querySelector('a');
      if (a) link = a.href;
    }

    // deadline: search through tds for month names
    const monthRegex =
      /\b(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/i;
    for (let i = tds.length - 1; i >= 0; i--) {
      const t = tds[i].innerText.trim();
      if (monthRegex.test(t) || /due|deadline|due date/i.test(t)) {
        deadlineText = t;
        break;
      }
      // also check for elements styled as badges (blue)
      const badge = tds[i].querySelector('.text-primary, .badge, .btn, .label, .deadline');
      if (badge && monthRegex.test(badge.innerText)) {
        deadlineText = badge.innerText.trim();
        break;
      }
    }

    // course: try to get breadcrumb or select value on the page
    const courseEl = document.querySelector(
      'select, .course-title, .breadcrumb, #coursename, .course_name'
    );
    if (courseEl) {
      course = courseEl.value || courseEl.innerText || null;
      if (course) course = course.trim();
    }

    return {
      title: title || 'Untitled assignment',
      deadlineText: deadlineText || null,
      deadline: parseDateString(deadlineText) ? parseDateString(deadlineText).toISOString() : null,
      link,
      course,
    };
  }

  function collectAssignments() {
    const rows = findAssignmentRows();
    const assignments = rows.map(extractFromRow).filter((a) => a.deadline); // only keep rows where a deadline was found
    return assignments;
  }

  // Send to background if there are assignments
  function sendIfChanged(assignments) {
    if (!assignments || assignments.length === 0) return;
    console.log("📨 Sending assignments to background:", assignments);
    chrome.runtime.sendMessage({ type: 'lms_assignments', assignments });
  }

  // Run now, and again after a short delay (in case page loads more)
  try {
    const list = collectAssignments();
    if (list.length > 0) sendIfChanged(list);
    // Re-run after 2s & 6s to pick up any late DOM inserts (defensive)
    setTimeout(() => {
      const list2 = collectAssignments();
      if (list2.length > 0) sendIfChanged(list2);
    }, 2000);
    setTimeout(() => {
      const list3 = collectAssignments();
      if (list3.length > 0) sendIfChanged(list3);
    }, 6000);
  } catch (err) {
    console.error('Content script error:', err);
  }
})();
