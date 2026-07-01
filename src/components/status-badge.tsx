const LABELS: Record<string, string> = {
  active: "פעילה",
  maintenance: "בתחזוקה",
  inactive: "לא פעילה",
  planned: "מתוכננת",
  in_progress: "בביצוע",
  completed: "הושלם",
  pending: "ממתין",
  confirmed: "מאושר",
  cancelled: "בוטל",
  income: "הכנסה",
  expense: "הוצאה",
  insurance: "ביטוח",
  license: "רישיון",
  registration: "רישום",
  other: "אחר",
};

const COLORS: Record<string, string> = {
  active: "bg-emerald-100 text-emerald-800",
  maintenance: "bg-amber-100 text-amber-800",
  inactive: "bg-slate-200 text-slate-700",
  planned: "bg-sky-100 text-sky-800",
  in_progress: "bg-amber-100 text-amber-800",
  completed: "bg-emerald-100 text-emerald-800",
  pending: "bg-amber-100 text-amber-800",
  confirmed: "bg-emerald-100 text-emerald-800",
  cancelled: "bg-red-100 text-red-800",
  income: "bg-emerald-100 text-emerald-800",
  expense: "bg-red-100 text-red-800",
  insurance: "bg-sky-100 text-sky-800",
  license: "bg-violet-100 text-violet-800",
  registration: "bg-slate-200 text-slate-700",
  other: "bg-slate-100 text-slate-600",
};

export function StatusBadge({ value }: { value: string }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-xs font-medium ${
        COLORS[value] ?? "bg-slate-100 text-slate-600"
      }`}
    >
      {LABELS[value] ?? value}
    </span>
  );
}
