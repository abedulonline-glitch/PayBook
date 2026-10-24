import { db } from "./firebase-init.js";
import { collection, addDoc, query, where, getDocs } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const mobile = localStorage.getItem("paybook_mobile");
if (!mobile) window.location.href = "index.html"; // সেশন না থাকলে লগইনে পাঠাবে

const partyContainer = document.getElementById("party-container");
const addPartyForm = document.getElementById("add-party-form");

// পার্টি লিস্ট লোড করা
async function loadParties() {
  const partiesRef = collection(db, "parties");
  const q = query(partiesRef, where("ownerMobile", "==", mobile));
  
  try {
    const snapshot = await getDocs(q);
    if (snapshot.empty) {
      partyContainer.innerHTML = "<p style='text-align:center; color:#666;'>কোনো পার্টি নেই। নতুন যোগ করুন।</p>";
      return;
    }
    
    partyContainer.innerHTML = "";
    snapshot.forEach((doc) => {
      const party = doc.data();
      const div = document.createElement("div");
      div.className = "party-item";
      // আপাতত ব্যালেন্স 0 দেখাচ্ছি, ট্রানজেকশন পার্টে এটি আপডেট হবে
      div.innerHTML = `
        <span class="party-name">${party.name}</span>
        <span class="party-balance">₹0</span>
      `;
      // ক্লিক করলে পার্টির লেজারে যাবে
      div.onclick = () => window.location.href = `ledger.html?partyId=${doc.id}&name=${encodeURIComponent(party.name)}`;
      partyContainer.appendChild(div);
    });
  } catch (err) {
    console.error(err);
    partyContainer.innerHTML = "<p style='color:red;'>পার্টি লোড করতে সমস্যা হয়েছে।</p>";
  }
}

// নতুন পার্টি সেভ
document.getElementById("save-party-btn").addEventListener("click", async () => {
  const name = document.getElementById("new-party-name").value.trim();
  const partyMobile = document.getElementById("new-party-mobile").value.trim();

  if (!name) return alert("পার্টির নাম দিন");

  try {
    await addDoc(collection(db, "parties"), {
      ownerMobile: mobile,
      name: name,
      mobile: partyMobile || null,
      createdAt: new Date()
    });
    addPartyForm.style.display = "none";
    document.getElementById("new-party-name").value = "";
    document.getElementById("new-party-mobile").value = "";
    loadParties(); // লিস্ট রিফ্রেশ
  } catch (err) {
    alert("সেভ করতে সমস্যা: " + err.message);
  }
});

// UI টগল
document.getElementById("show-add-party").addEventListener("click", () => {
  addPartyForm.style.display = addPartyForm.style.display === "none" ? "block" : "none";
});

// লগআউট
document.getElementById("logout-btn").addEventListener("click", () => {
  localStorage.removeItem("paybook_mobile");
  window.location.href = "index.html";
});

// পেজ লোড হলে পার্টি লোড করবে
loadParties();
