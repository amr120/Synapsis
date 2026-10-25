import { redirect } from "next/navigation";

// The seller studio sign-in now lives on the Sellers page.
export default function StudioSignIn() {
  redirect("/sellers");
}
