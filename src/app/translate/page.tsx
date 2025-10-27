"use server";

import { redirect } from "next/navigation";

export default function TranslateRedirect() {
  redirect("/#upload");
}
