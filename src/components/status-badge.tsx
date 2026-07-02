const LABELS: Record<string, string> = {
  active: "פעילה",
  maintenance: "בתחזוקה",
  inactive: "לא פעילה",
  planned: "מתוכננת",
  in_progress: "בביצוע",
  completed: "הושלם",
  pending: "ממתין לאישור",
  approved: "מאושר",
  confirmed: "מאושר",
  cancelled: "בוטל",
  income: "הכנסה",
  expense: "הוצאה",
  insurance: "ביטוח",
  license: "רישיון",
  registration: "רישום",
  safety: "ציוד בטיחות",
  myba_contract: "חוזה MYBA",
  other: "אחר",
};

const COLORS: Record<string, string> = {
  active: "text-fleet-moss border-fleet-moss",
  maintenance: "text-fleet-brass border-fleet-brass",
  inactive: "text-fleet-ink border-fleet-ink",
  planned: "text-fleet-brass border-fleet-brass",
  in_progress: "text-fleet-brass border-fleet-brass",
  completed: "text-fleet-moss border-fleet-moss",
  pending: "text-fleet-brass border-fleet-brass",
  approved: "text-fleet-moss border-fleet-moss",
  confirmed: "text-fleet-moss border-fleet-moss",
  cancelled: "text-fleet-coral border-fleet-coral",
  income: "text-fleet-moss border-fleet-moss",
  expense: "text-fleet-coral border-fleet-coral",
  insurance: "text-fleet-brass border-fleet-brass",
  license: "text-fleet-brass border-fleet-brass",
  registration: "text-fleet-ink border-fleet-ink",
  other: "text-fleet-ink border-fleet-ink",
};

export function StatusBadge({ value }: { value: string }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-full border-[1.5px] bg-white px-2.5 py-1 text-[11px] font-bold ${
        COLORS[value] ?? "text-fleet-ink border-fleet-ink"
      }`}
    >
      {LABELS[value] ?? value}
    </span>
  );
}
