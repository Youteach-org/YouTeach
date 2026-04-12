import { db } from "./firebase.js";
import { ref, get, update } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

export async function fixNicknames() {
  const snap = await get(ref(db, "students"));
  const students = snap.val() || {};
  const updates = {};

  for (const [key, student] of Object.entries(students)) {
    const full = student.fullName || student.name || "";
    const firstName = full.split(" ")[0];
    updates[`students/${key}/nickname`] = firstName;
  }

  await update(ref(db), updates);
  console.log("Nicknames fixed");
}
