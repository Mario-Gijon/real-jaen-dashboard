import { redirect } from "next/navigation";

/** No generic home: the analyst starts on Partidos. */
export default function Home() {
  redirect("/matches");
}
