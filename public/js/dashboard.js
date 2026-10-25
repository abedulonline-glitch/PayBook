import { db } from "./firebase-init.js";
import { collection, addDoc, query, where, getDocs } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const mobile = localStorage.getItem("paybook_mobile");
if (!mobile) window.location.href = "index.html";

const partyContainer = document.getElementById("party-container");
const addPartyForm = document.getElementById("add-party-form");

async function loadParties() {
  const partiesRef = collection(db, "parties");
  const q = query(partiesRef, where("ownerMobile", "==", mobile));
  
  try {
    const snapshot = await getDocs(q);
    if (snapshot.empty) {
      partyContainer.innerHTML = "<p style='text-align:center; color:#666; padding: 20px 0;'>কোনো পার্টি নেই। নতুন যোগ করুন।</p>";
      return;
    }
    
    partyContainer.innerHTML = "";
    snapshot.forEach((doc) => {
      const party = doc.data();
      const div = document.createElement("div");
      div.className = "party-item";
      
      // নামের প্রথম অক্ষর বের করা (Avatar)
      const initial = party.name.charAt(0).toUpperCase();

      div.innerHTML = `
        <div style="display: flex; align-items: center; gap: 12px;">
          <div style="width: 40px; height: 40px; border-radius: 50%; background: #E8F5E9; color: #2E7D32; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 18px;">
            ${initial}
          </div>
          <span class="party-name">${party.name}</span>
        </div>
        <span class="party-balance received">₹0</span>
      `;
      
      div.onclick = () => window.location.href = `ledger.html?partyId=${doc.id}&name=${encodeURIComponent(party.name)}`;
      partyContainer.appendChild(div);
    });
  } catch (err) {
    partyContainer.innerHTML = "<p style='color:red; text-align:center;'>পার্টি লোড করতে সমস্যা হয়েছে।</p>";
  }
}

document.getElementById("save-party-btn").addEventListener("click", async () => {
  const name = document.getElementById("new-party-name").value.trim();
  const partyMobile = document.getElementById("new-party-mobile").value.trim();

  if (!name) return alert("পার্টির নাম দিন");
  if (!/^[0-9]{10}$/.test(partyMobile)) return alert("সঠিক ১০-ডিজিটের মোবাইল নম্বর দিন"); // বাধ্যতামূলক চেক

  try {
    await addDoc(collection(db, "parties"), {
      ownerMobile: mobile,
      name: name,
      mobile: partyMobile, // এখন এটি বাধ্যতামূলক
      createdAt: new Date()
    });
    addPartyForm.style.display = "none";
    document.getElementById("new-party-name").value = "";
    document.getElementById("new-party-mobile").value = "";
    loadParties();
  } catch (err) {
    alert("সেভ করতে সমস্যা: " + err.message);
  }
});

document.getElementById("show-add-party").addEventListener("click", () => {
  addPartyForm.style.display = addPartyForm.style.display === "none" ? "block" : "none";
});

document.getElementById("logout-btn").addEventListener("click", () => {
  localStorage.removeItem("paybook_mobile");
  window.location.href = "index.html";
});

// প্যানিক ট্রিগার (লোগোতে ডাবল ক্লিক)
let lastTap = 0;
const logo = document.getElementById("app-logo");
logo.addEventListener("click", () => {
  const currentTime = new Date().getTime();
  const tapLength = currentTime - lastTap;
  if (tapLength < 500 && tapLength > 0) {
    window.location.href = "panic.html";
  }
  lastTap = currentTime;
});

loadParties();
