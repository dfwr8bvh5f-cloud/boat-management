import { redirect } from "next/navigation";

export default async function TechnicalIndexPage() {
  redirect("/technical/issues");
}
