import { db } from "./firebase-init.js";
import { doc, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const mobile = localStorage.getItem("paybook_mobile");
if (!mobile) window.location.href = "index.html";

const timeoutInput = document.getElementById("panic-timeout");

// বর্তমান সেটিংস লোড করা
async function loadSettings() {
  const snap = await getDoc(doc(db, "users", mobile));
  if (snap.exists()) {
    timeoutInput.value = snap.data().panicTimeout || 60;
  }
}

// সেভ করা
document.getElementById("save-settings-btn").addEventListener("click", async () => {
  const timeout = parseInt(timeoutInput.value);
  if (timeout < 15 || timeout > 300) return alert("টাইমআউট ১৫ থেকে ৩০০ সেকেন্ডের মধ্যে হতে হবে");

  await updateDoc(doc(db, "users", mobile), { panicTimeout: timeout });
  alert("সেটিংস সেভ হয়েছে!");
});

loadSettings();
