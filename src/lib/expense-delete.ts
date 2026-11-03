import "server-only";
import type { createClient } from "@/lib/supabase/server";

// Deletes one expense row plus its attachment records and stored files. Shared
// by the boat page's deleteExpense (which refuses an expense that is managed
// from /mys/debts) and by the MYS debts page's own delete actions (which are
// the one place such an expense may be deleted from). Not a server action:
// callers do their own access check, guard and revalidation.
export async function deleteExpenseRow(
  supabase: Awaited<ReturnType<typeof createClient>>,
  expenseId: string,
  receiptPath: string | null,
  photoPath: string | null
) {
  const { data: attachments } = await supabase.from("expense_attachments").select("file_path").eq("expense_id", expenseId);

  const { error } = await supabase.from("expenses").delete().eq("id", expenseId);
  if (error) throw new Error(error.message);

  const toRemove = [receiptPath, photoPath, ...(attachments ?? []).map((a) => a.file_path)].filter((p): p is string => Boolean(p));
  if (toRemove.length) await supabase.storage.from("receipts").remove(toRemove);
}
