// content.js 
/* global chrome */
console.log("Extension ID:", chrome.runtime.id);

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

  //---------------------------------------------
  // Utils
  //---------------------------------------------
  function parseDateString(s) {
    if (!s) return null;
    let text = s
      .replace(/\s+-\s+/g, " ")
      .replace(/\s+–\s+/g, " ")
      .trim();

    text = text.replace(/(\d)([ap]m)/i, "$1 $2");
    text = text.replace(/\u2013|\u2014/g, " ");

    let d = Date.parse(text);
    if (!isNaN(d)) return new Date(d);

    const regex =
      /(\d{1,2})\s*(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec|January|February|March|April|May|June|July|August|September|October|November|December)\w*\s*(\d{4})(?:[\s,-]*([0-9:.apmAPM ]+))?/;

    const m = text.match(regex);
    if (m) {
      const dateStr = `${m[1]} ${m[2]} ${m[3]} ${m[4] || ""}`;
      d = Date.parse(dateStr);
      if (!isNaN(d)) return new Date(d);
    }

    const iso = text.match(/\d{4}-\d{2}-\d{2}T?\d{2}:\d{2}/);
    if (iso) {
      d = Date.parse(iso[0]);
      if (!isNaN(d)) return new Date(d);
    }
    return null;
  }

  //---------------------------------------------
  // Find table rows that contain assignments
  //---------------------------------------------
  function findAssignmentRows() {
    return Array.from(document.querySelectorAll("table tr")).filter((row) => {
      const tds = row.querySelectorAll("td");
      if (tds.length < 6) return false;

      // The LMS assignment rows always contain:
      // - A title
      // - A submission column
      // - A marking column
      // - A deadline-status column
      // - An "Actual deadline (<small>)" column
      return row.innerText.includes("Deadline") || row.innerText.match(/\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\b/i);
    });
  }

  //---------------------------------------------
  // Parse one assignment row
  //---------------------------------------------
  function extractFromRow(row) {
    const tds = Array.from(row.querySelectorAll("td"));

    // 1️⃣ TITLE (2nd column)
    let title = tds[1]?.innerText.trim() || "Untitled assignment";

    // 2️⃣ ASSIGNMENT LINK
    const assignmentLink = tds[1]?.querySelector("a")?.href || null;

    // 3️⃣ SUBMISSION LINK (3rd column)
    const submissionLink = tds[2]?.querySelector("a")?.href || null;

    // 4️⃣ SUBMISSION STATUS
    // If there is no submission uploaded or text says "Not available", "Not submitted", etc.
    let submissionStatus = tds[2]?.innerText.trim().toLowerCase();
    const isSubmitted =
      submissionStatus.includes("submitted") ||
      submissionStatus.includes("marked") ||
      submissionStatus.includes("graded") ||
      submissionStatus.includes("checked");

    // 5️⃣ DEADLINE STATUS (6th column)
    const deadlineStatus = tds[5]?.innerText.trim() || "";

    const deadlineExceeded =
      deadlineStatus.toLowerCase().includes("exceeded");

    // 6️⃣ ACTUAL DEADLINE (7th column <small>)
    const deadlineSmall = tds[6]?.querySelector("small")?.innerText.trim();
    const deadlineDate = parseDateString(deadlineSmall);
    const deadlineISO = deadlineDate ? deadlineDate.toISOString() : null;

    // 7️⃣ COURSE FROM URL (&oc=xxxxx)
    const urlParams = new URLSearchParams(window.location.search);
    const course = urlParams.get("oc") || "Unknown Course";

    // Unique ID for this assignment
    const id = `${course}::${title}::${deadlineISO}`;

    return {
      id,
      title,
      course,
      link: assignmentLink,
      submissionLink,
      submitted: isSubmitted,
      submissionStatus,
      deadlineStatus,
      deadlineText: deadlineSmall,
      deadline: deadlineISO,
      deadlineExceeded,
    };
  }

  //---------------------------------------------
  // Main extraction
  //---------------------------------------------
  function collectAssignments() {
    const rows = findAssignmentRows();
    const assignments = rows.map(extractFromRow);

    // Only keep rows with a real deadline
    return assignments.filter((a) => a.deadline);
  }

  //---------------------------------------------
  // Send to background
  //---------------------------------------------
  function send(assignments) {
    if (!assignments?.length) return;
    console.log("📨 Sending assignments:", assignments);
    chrome.runtime.sendMessage({
      type: "lms_assignments",
      assignments,
    });
  }

  //---------------------------------------------
  // Run now + delayed retries
  //---------------------------------------------
  try {
    send(collectAssignments());

    setTimeout(() => send(collectAssignments()), 2000);
    setTimeout(() => send(collectAssignments()), 6000);
  } catch (err) {
    console.error("Content script error:", err);
  }
})();
