import { db } from "./firebase-init.js";
import { doc, getDoc, collection, addDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { IMGBB_API_KEY } from "./config.js";

const mobile = localStorage.getItem("paybook_mobile");
if (!mobile) window.location.href = "index.html";

let adminUpi = "";
let adminName = "PayBook"; // UPI অ্যাপে যে নামটি দেখাবে

// ১. সেটিংস ও ব্যালেন্স লোড
async function loadWalletData() {
  try {
    const settingsSnap = await getDoc(doc(db, "settings", "global"));
    if (settingsSnap.exists()) {
      adminUpi = settingsSnap.data().adminUpi || "Not Set";
      document.getElementById("admin-upi").innerText = adminUpi;
    }

    const userSnap = await getDoc(doc(db, "users", mobile));
    if (userSnap.exists()) {
      document.getElementById("current-balance").innerText = `₹${userSnap.data().walletBalance || 0}`;
    }
  } catch (e) { alert("ডেটা লোডে সমস্যা: " + e.message); }
}

// ২. UPI কপি
window.copyUpi = function() {
  if (!adminUpi) return;
  navigator.clipboard.writeText(adminUpi);
  alert("UPI কপি হয়েছে: " + adminUpi);
};

// ৩. UPI অ্যাপ ওপেন করার লজিক (Deep Linking)
window.payViaUpi = function() {
  const amount = document.getElementById("recharge-amount").value;
  if (!amount || amount <= 0) return alert("প্রথমে টাকার পরিমাণ লিখুন!");

  // স্ট্যান্ডার্ড UPI ডিপ লিংক ফরম্যাট
  const upiUrl = `upi://pay?pa=${adminUpi}&pn=${encodeURIComponent(adminName)}&am=${amount}&cu=INR`;
  
  // মোবাইলে UPI অ্যাপ ওপেন করার চেষ্টা করবে
  window.location.href = upiUrl;

  // ইউজার পেমেন্ট অ্যাপে চলে যাওয়ার পর ফিরে এলে প্রুফ সেকশনটি দেখাবে
  setTimeout(() => {
    document.getElementById("proof-section").classList.remove("hidden");
    document.getElementById("proof-section").scrollIntoView({ behavior: 'smooth' });
  }, 2000); 
};

// ৪. ImgBB আপলোড (স্ক্রিনশট)
async function uploadToImgBB(file) {
  const formData = new FormData();
  formData.append("image", file);
  const res = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, { method: "POST", body: formData });
  const data = await res.json();
  if (!data.success) throw new Error("ইমেজ আপলোড ব্যর্থ");
  return data.data.url;
}

// ৫. রিকোয়েস্ট সাবমিট (UTR ও স্ক্রিনশট বাধ্যতামূলক)
document.getElementById("submit-recharge-btn").addEventListener("click", async () => {
  const amount = document.getElementById("recharge-amount").value;
  const utr = document.getElementById("utr-input").value.trim();
  const fileInput = document.getElementById("proof-input");
  const file = fileInput.files[0];

  if (!amount || amount <= 0) return alert("টাকার পরিমাণ দিন");
  if (!utr) return alert("UTR বা Transaction ID দিন");
  if (!file) return alert("পেমেন্টের স্ক্রিনশট আপলোড করা বাধ্যতামূলক!");

  const btn = document.getElementById("submit-recharge-btn");
  btn.innerText = "পাঠানো হচ্ছে..."; btn.disabled = true;

  try {
    const imgUrl = await uploadToImgBB(file);

    // ফায়ারবেসে রিকোয়েস্ট সেভ
    await addDoc(collection(db, "wallet_requests"), {
      userMobile: mobile,
      amount: parseFloat(amount),
      utr: utr,
      screenshotUrl: imgUrl,
      status: "pending",
      date: new Date()
    });

    alert("রিকোয়েস্ট পাঠানো হয়েছে! এডমিন যাচাই করে অ্যাপ্রুভ করলে ব্যালেন্স যোগ হবে।");
    document.getElementById("recharge-amount").value = "";
    document.getElementById("utr-input").value = "";
    fileInput.value = "";
    document.getElementById("proof-section").classList.add("hidden");
    loadWalletData();
  } catch (e) {
    alert("সমস্যা: " + e.message);
  } finally {
    btn.innerText = "রিচার্জ রিকোয়েস্ট পাঠান"; btn.disabled = false;
  }
});

loadWalletData();
