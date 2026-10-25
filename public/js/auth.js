import { db } from "./firebase-init.js";
import { doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const signupForm = document.getElementById("signup-form");
const loginForm = document.getElementById("login-form");
const authMessage = document.getElementById("auth-message");

// মেসেজ দেখানোর ফাংশন
function showMessage(msg, type) {
  authMessage.style.display = "block";
  authMessage.textContent = msg;
  authMessage.className = type;
}

// পিন হ্যাশ (এখানেই hashPin ফাংশনটি আছে)
async function hashPin(pin, salt) {
  try {
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey("raw", enc.encode(pin), "PBKDF2", false, ["deriveBits"]);
    const bits = await crypto.subtle.deriveBits(
      { name: "PBKDF2", salt: enc.encode(salt), iterations: 100000, hash: "SHA-256" },
      keyMaterial, 256
    );
    return btoa(String.fromCharCode(...new Uint8Array(bits)));
  } catch (e) {
    alert("পিন হ্যাশ করতে সমস্যা হচ্ছে: " + e.message);
    return null;
  }
}

// সাইন-আপ
signupForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const mobile = document.getElementById("signup-mobile").value.trim();
  const name = document.getElementById("signup-name").value.trim();
  const pin = document.getElementById("signup-pin").value;
  const panicPin = document.getElementById("signup-panic-pin").value;
  const qId = document.getElementById("signup-security-q").value;
  const answer = document.getElementById("signup-security-a").value.trim();

  if (!/^[0-9]{10}$/.test(mobile)) return showMessage("সঠিক ১০-ডিজিট মোবাইল নম্বর দিন", "error");
  if (pin.length !== 6) return showMessage("পিন ৬ ডিজিটের হতে হবে", "error");

  try {
    showMessage("ডেটাবেসে চেক করা হচ্ছে...", "success");
    const userRef = doc(db, "users", mobile);
    const existing = await getDoc(userRef);
    
    if (existing.exists()) return showMessage("এই নম্বর দিয়ে ইতিমধ্যে অ্যাকাউন্ট আছে", "error");

    showMessage("অ্যাকাউন্ট তৈরি হচ্ছে...", "success");
    const salt = crypto.randomUUID();
    const pinHash = await hashPin(pin, salt);
    
    if (!pinHash) return; // হ্যাশ ব্যর্থ হলে থেমে যাবে

    const panicPinHash = await hashPin(panicPin, salt);
    const answerHash = await hashPin(answer.toLowerCase(), salt);

    await setDoc(userRef, {
      mobile, name, salt, pinHash, panicPinHash,
      panicQId: qId, panicAHash: answerHash,
      panicTimeout: 60, language: "bn", createdAt: new Date()
    });

    localStorage.setItem("paybook_mobile", mobile);
    showMessage("সাইন-আপ সফল! ড্যাশবোর্ডে যাচ্ছে...", "success");
    setTimeout(() => window.location.href = "dashboard.html", 1500);
    
  } catch (err) {
    alert("সাইন-আপ এরর: " + err.message); // এলার্ট দিয়ে আসল এরর দেখাবে
    showMessage("সাইন-আপ এরর: " + err.message, "error");
  }
});

// লগইন
loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const mobile = document.getElementById("login-mobile").value.trim();
  const pin = document.getElementById("login-pin").value;

  try {
    showMessage("লগইন চেক করা হচ্ছে...", "success");
    const userRef = doc(db, "users", mobile);
    const snap = await getDoc(userRef);
    
    if (!snap.exists()) return showMessage("অ্যাকাউন্ট পাওয়া যায়নি", "error");

    const user = snap.data();
    const enteredHash = await hashPin(pin, user.salt);
    
    if (enteredHash !== user.pinHash) return showMessage("ভুল পিন", "error");

    localStorage.setItem("paybook_mobile", mobile);
    showMessage("লগইন সফল!", "success");
    setTimeout(() => window.location.href = "dashboard.html", 1000);
    
  } catch (err) {
    alert("লগইন এরর: " + err.message); // এলার্ট দিয়ে আসল এরর দেখাবে
    showMessage("লগইন এরর: " + err.message, "error");
  }
});
