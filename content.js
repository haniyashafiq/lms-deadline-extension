/* global chrome */

// Prevent duplicate runs in a frame
if (window.__LMS_ASSIGNMENT_SCRAPER__) {
  console.log('⏭ content.js already loaded');
  // keep listener below active if already loaded, but don't re-run main flow
} else {
  window.__LMS_ASSIGNMENT_SCRAPER__ = true;
  console.log('📌 LMS content script loaded');
}

/**
 * Scrape assignments from the currently visible assignments table.
 * Returns an array of objects: { title, course, deadlineText, deadline, link }
 */
function scrapeAssignmentsFromDOM() {
  // Defensive: only run on Assignments.php page
  if (!location.pathname.includes('Assignments.php')) {
    return [];
  }

  const rows = Array.from(document.querySelectorAll('table tr'));
  const data = [];

  // Try to derive current course label from dropdown
  const courseSelect =
    document.querySelector('#courseId') ||
    document.querySelector('#course') ||
    document.querySelector("select[name='courseName']") ||
    null;
  const courseName = courseSelect?.selectedOptions?.[0]?.innerText?.trim?.() || '';

  for (const r of rows) {
    const cols = r.querySelectorAll('td');
    if (!cols || cols.length < 2) continue; // header or invalid row

    // This LMS layout: col[0]=no, col[1]=title, ... last col = deadline
    // Validate title
    const title = cols[1]?.innerText?.trim?.();
    if (!title) continue;

    // Deadline is the last column; it often contains two small boxes (label + datetime)
    const lastCol = cols[cols.length - 1];
    let deadlineText = lastCol?.innerText?.trim?.() || '';

    // Try to extract a reasonable date string from the last column:
    // The view shows something like: "17 October 2025 - 12:00 pm\n12 October 2025-11:55 pm"
    // We'll prefer the last line that looks like a date-time.
    let lines = deadlineText
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length > 1) {
      // prefer the line containing a month name or time
      const monthRegex =
        /\b(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/i;
      const candidate = lines.find((l) => monthRegex.test(l)) || lines[0];
      deadlineText = candidate;
    } else if (lines.length === 1) {
      deadlineText = lines[0];
    } else {
      deadlineText = '';
    }

    // Normalise common separators
    deadlineText = deadlineText.replace(/\s+-\s+/g, ' ').replace(/\u2013|\u2014/g, ' ');

    // Try parse date
    let deadline = null;
    if (deadlineText) {
      const tryDate = Date.parse(deadlineText);
      if (!isNaN(tryDate)) {
        deadline = new Date(tryDate);
      } else {
        // Fallback attempt: try to remove trailing labels
        const isoMatch = deadlineText.match(/\d{1,2}\s+\w+\s+\d{4}.*$/);
        const pick = isoMatch ? isoMatch[0] : deadlineText;
        const parsed = Date.parse(pick);
        if (!isNaN(parsed)) deadline = new Date(parsed);
      }
    }

    // Check submission status from column 3
    // "No Submission" = not submitted (include it)
    // "Submission" = submitted (exclude it)
    // "Added Submission" or similar = submitted (exclude it)
    const submissionCol = cols[3]?.innerText?.trim?.() || '';
    const noSubmission = /no\s+submission/i.test(submissionCol);
    const hasSubmission = submissionCol && !noSubmission && /submission/i.test(submissionCol);
    const isSubmitted = hasSubmission;

    // Debug log for troubleshooting
    console.log(`Assignment: ${title}, Status: "${submissionCol}", isSubmitted: ${isSubmitted}`);

    // Skip submitted assignments
    if (isSubmitted) {
      console.log(`  → Skipping (submitted)`);
      continue;
    }

    const obj = {
      title,
      course: courseName,
      deadlineText: deadlineText || null,
      deadline: deadline ? deadline.toISOString() : null,
      link: location.href,
      status: submissionCol, // Store for reference
    };

    data.push(obj);
  }

  return data;
}

// Send course options on load so background can decide to iterate automatically
// CHANGED: Now just sends options but doesn't trigger auto-iteration
try {
  // Reduced delay from 350ms to 150ms for faster scraping
  setTimeout(() => {
    // Only scrape the current page view, don't send course options that trigger iteration
    const assignments = scrapeAssignmentsFromDOM();
    if (assignments.length > 0) {
      console.log('📨 Auto-scraped', assignments.length, 'assignments from current view');
      chrome.runtime.sendMessage({
        type: 'lms_assignments',
        assignments,
      });
    }
  }, 150);
} catch (e) {
  console.warn('Could not auto-scrape:', e);
}

// Observe DOM changes for manual scraping support
// (Removed automatic course observer that triggered iteration)

// Listen for messages from background
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || !msg.type) return;
  if (msg.type === 'scrape_now') {
    // background asked this tab to scrape immediately
    const assignments = scrapeAssignmentsFromDOM();
    // reply directly if sender expects response
    // also send a broadcast for background listeners
    chrome.runtime.sendMessage({ type: 'lms_assignments_partial', assignments });
    // optional direct response
    sendResponse({ ok: true, assignments });
    return true; // indicate async response possible
  } else if (msg.type === 'get_course_options') {
    const select =
      document.querySelector('#courseId') ||
      document.querySelector('#course') ||
      document.querySelector("select[name='courseName']") ||
      null;
    const opts = select
      ? Array.from(select.options).map((o) => ({ value: o.value, label: o.innerText.trim() }))
      : [];
    sendResponse({ ok: true, options: opts, current: select?.value || '' });
    return true;
  } else if (msg.type === 'run_local_scrape') {
    // debug trigger that returns results
    const assignments = scrapeAssignmentsFromDOM();
    sendResponse({ ok: true, assignments });
    return true;
  }
});
