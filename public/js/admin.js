import { db } from "./firebase-init.js";
import { doc, getDoc, setDoc, collection, query, where, getDocs, updateDoc, increment } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// আপাতত সিকিউরিটির জন্য একটি স্ট্যাটিক পিন, চাইলে পরিবর্তন করতে পারেন
const ADMIN_PIN = "1234"; 

window.checkAdminPin = function() {
  const pin = document.getElementById("admin-pin").value;
  if (pin === ADMIN_PIN) {
    document.getElementById("login-screen").classList.add("hidden");
    document.getElementById("admin-panel").classList.remove("hidden");
    loadSettings();
    loadRequests();
  } else {
    alert("ভুল পিন!");
  }
};

// ১. সেটিংস লোড ও সেভ
async function loadSettings() {
  const docSnap = await getDoc(doc(db, "settings", "global"));
  if (docSnap.exists()) {
    const data = docSnap.data();
    document.getElementById("set-upi").value = data.adminUpi || "";
    document.getElementById("set-whatsapp").value = data.adminWhatsapp || "";
    document.getElementById("set-edit-price").value = data.editSubPrice || "";
    document.getElementById("set-partner-price").value = data.partnerAccessPrice || "";
    document.getElementById("set-monthly-price").value = data.monthlySubPrice || "";
  }
}

window.saveSettings = async function() {
  const upi = document.getElementById("set-upi").value.trim();
  const wa = document.getElementById("set-whatsapp").value.trim();
  const editPrice = parseFloat(document.getElementById("set-edit-price").value) || 0;
  const partnerPrice = parseFloat(document.getElementById("set-partner-price").value) || 0;
  const monthlyPrice = parseFloat(document.getElementById("set-monthly-price").value) || 0;

  try {
    await setDoc(doc(db, "settings", "global"), {
      adminUpi: upi,
      adminWhatsapp: wa,
      editSubPrice: editPrice,
      partnerAccessPrice: partnerPrice,
      monthlySubPrice: monthlyPrice
    }, { merge: true });
    alert("সেটিংস সফলভাবে সেভ হয়েছে!");
  } catch (e) {
    alert("সেভ করতে সমস্যা: " + e.message);
  }
};

// ২. ওয়ালেট রিকোয়েস্ট লোড
async function loadRequests() {
  const reqRef = collection(db, "wallet_requests");
  const q = query(reqRef, where("status", "==", "pending"));
  const snap = await getDocs(q);
  
  const container = document.getElementById("requests-container");
  if (snap.empty) {
    container.innerHTML = "<p style='text-align:center; color:#666;'>কোনো পেন্ডিং রিকোয়েস্ট নেই।</p>";
    return;
  }

  container.innerHTML = "";
  snap.forEach(docSnap => {
    const req = docSnap.data();
    const div = document.createElement("div");
    div.className = "request-item";
    div.innerHTML = `
      <div class="req-details">
        <strong>মোবাইল:</strong> ${req.userMobile}<br>
        <strong>টাকা:</strong> ₹${req.amount}<br>
        <strong>UTR:</strong> ${req.utr}<br>
        <a href="${req.screenshotUrl}" target="_blank" style="color: var(--primary); text-decoration: underline;">প্রুফ দেখুন</a>
      </div>
      <div class="req-actions">
        <button class="btn-approve" onclick="approveRequest('${docSnap.id}', '${req.userMobile}', ${req.amount})">Approve</button>
        <button class="btn-reject" onclick="rejectRequest('${docSnap.id}')">Reject</button>
      </div>
    `;
    container.appendChild(div);
  });
}

// ৩. রিকোয়েস্ট Approve (ইউজারের ওয়ালেটে টাকা যোগ হবে)
window.approveRequest = async function(reqId, userMobile, amount) {
  if (!confirm("আপনি কি নিশ্চিত টাকাটি আপনার ব্যাংকে এসেছে?")) return;

  try {
    // রিকোয়েস্ট স্ট্যাটাস আপডেট
    await updateDoc(doc(db, "wallet_requests", reqId), { status: "approved" });
    
    // ইউজারের ওয়ালেটে টাকা যোগ
    await updateDoc(doc(db, "users", userMobile), {
      walletBalance: increment(amount)
    });

    alert("ওয়ালেটে টাকা যোগ হয়েছে!");
    loadRequests(); // রিফ্রেশ
  } catch (e) {
    alert("সমস্যা: " + e.message);
  }
};

// ৪. রিকোয়েস্ট Reject
window.rejectRequest = async function(reqId) {
  if (!confirm("আপনি কি এই রিকোয়েস্টটি রিজেক্ট করতে চান?")) return;
  try {
    await updateDoc(doc(db, "wallet_requests", reqId), { status: "rejected" });
    loadRequests(); // রিফ্রেশ
  } catch (e) {
    alert("সমস্যা: " + e.message);
  }
};
