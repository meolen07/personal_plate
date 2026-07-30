import { redirect } from "next/navigation";

/** Legacy route — ranking now lives on /recommend */
export default function DiscoverPage() {
  redirect("/recommend");
}
