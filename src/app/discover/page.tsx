import { redirect } from "next/navigation";

/** Legacy route — personalized ranking now lives on /recommend?tab=ranked */
export default function DiscoverPage() {
  redirect("/recommend?tab=ranked");
}
