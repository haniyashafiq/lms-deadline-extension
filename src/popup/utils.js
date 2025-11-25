export function parseISO(iso) {
  try {
    return new Date(iso);
  } catch {
    return null;
  }
}

export function timeDiff(now, deadline) {
  if (!deadline) return { label: "No date", level: "none" };

  const diff = deadline - now;
  if (diff <= 0) return { label: "Deadline passed", level: "expired" };

  const mins = Math.round(diff / 60000);
  if (mins < 60) return { label: `${mins} min left`, level: "urgent" };

  const hours = Math.round(mins / 60);
  if (hours < 48) return { label: `${hours} hr left`, level: "soon" };

  const days = Math.round(hours / 24);
  return { label: `${days} day${days > 1 ? "s" : ""} left`, level: "normal" };
}
