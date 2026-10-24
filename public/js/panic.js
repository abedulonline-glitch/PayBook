
import { db } from "./firebase-init.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const mobile = localStorage.getItem("paybook_mobile");
if (!mobile) window.location.href = "index.html";

// পিন হ্যাশ ফাংশন (auth.js থেকে কপি করা)
async function hashPin(pin, salt) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey("raw", enc.encode(pin), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: enc.encode(salt), iterations: 100000, hash: "SHA-256" },
    keyMaterial, 256
  );
  return btoa(String.fromCharCode(...new Uint8Array(bits)));
}

document.getElementById("unlock-btn").addEventListener("click", async () => {
  const pin = document.getElementById("panic-pin").value;
  const errorEl = document.getElementById("panic-error");
  errorEl.innerText = "";

  if (pin.length !== 6) {
    errorEl.innerText = "৬-ডিজিটের পিন দিন";
    return;
  }

  try {
    const userRef = doc(db, "users", mobile);
    const snap = await getDoc(userRef);
    const user = snap.data();
    
    // প্যানিক পিন হ্যাশ মিলিয়ে দেখা
    const enteredHash = await hashPin(pin, user.salt);
    if (enteredHash !== user.panicPinHash) {
      errorEl.innerText = "ভুল পিন!";
      document.getElementById("panic-pin").value = "";
      return;
    }

    // সফল হলে সেশন স্টোরেজে ৬০ সেকেন্ডের টাইমার সেট হবে
    const timeout = user.panicTimeout || 60; // সেটিংস থেকে নেওয়া
    sessionStorage.setItem("panic_unlock_until", Date.now() + (timeout * 1000));
    
    // ড্যাশবোর্ড বা লেজারে ফিরে যাবে
    window.location.href = "dashboard.html";

  } catch (err) {
    errorEl.innerText = "সমস্যা হয়েছে: " + err.message;
  }
});

// ক্যানসেল বাটন
document.getElementById("cancel-btn").addEventListener("click", () => {
  window.location.href = "dashboard.html";
});
