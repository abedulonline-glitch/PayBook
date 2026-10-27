import { db } from "./firebase-init.js";
import { doc, getDoc, collection, addDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { IMGBB_API_KEY } from "./config.js";

const mobile = localStorage.getItem("paybook_mobile");
if (!mobile) window.location.href = "index.html";

let adminUpi = "";

// ১. সেটিংস ও ব্যালেন্স লোড
async function loadWalletData() {
  try {
    // গ্লোবাল সেটিংস থেকে UPI নিন
    const settingsSnap = await getDoc(doc(db, "settings", "global"));
    if (settingsSnap.exists()) {
      adminUpi = settingsSnap.data().adminUpi || "Not Set";
      document.getElementById("admin-upi").innerText = adminUpi;
    }

    // ইউজারের বর্তমান ব্যালেন্স
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

// ৩. ImgBB আপলোড (স্ক্রিনশট)
async function uploadToImgBB(file) {
  const formData = new FormData();
  formData.append("image", file);
  const res = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, { method: "POST", body: formData });
  const data = await res.json();
  if (!data.success) throw new Error("ইমেজ আপলোড ব্যর্থ");
  return data.data.url;
}

// ৪. রিকোয়েস্ট সাবমিট
document.getElementById("submit-recharge-btn").addEventListener("click", async () => {
  const utr = document.getElementById("utr-input").value.trim();
  const fileInput = document.getElementById("proof-input");
  const file = fileInput.files[0];

  if (!utr) return alert("UTR বা Transaction ID দিন");

  const btn = document.getElementById("submit-recharge-btn");
  btn.innerText = "পাঠানো হচ্ছে..."; btn.disabled = true;

  try {
    let imgUrl = "";
    if (file) {
      imgUrl = await uploadToImgBB(file);
    }

    // ফায়ারবেসে রিকোয়েস্ট সেভ
    await addDoc(collection(db, "wallet_requests"), {
      userMobile: mobile,
      utr: utr,
      screenshotUrl: imgUrl,
      status: "pending",
      date: new Date()
    });

    alert("রিকোয়েস্ট পাঠানো হয়েছে! এডমিন চেক করে অ্যাপ্রুভ করলে ব্যালেন্স যোগ হবে।");
    document.getElementById("utr-input").value = "";
    fileInput.value = "";
    loadWalletData();
  } catch (e) {
    alert("সমস্যা: " + e.message);
  } finally {
    btn.innerText = "রিচার্জ রিকোয়েস্ট পাঠান"; btn.disabled = false;
  }
});

loadWalletData();
