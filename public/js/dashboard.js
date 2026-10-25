import { db } from "./firebase-init.js";
import { collection, addDoc, query, where, getDocs } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const mobile = localStorage.getItem("paybook_mobile");
if (!mobile) window.location.href = "index.html";

const partyContainer = document.getElementById("party-container");
const addPartyForm = document.getElementById("add-party-form");

async function loadDashboard() {
  try {
    // ১. সব পার্টি লোড করা
    const partiesRef = collection(db, "parties");
    const partyQuery = query(partiesRef, where("ownerMobile", "==", mobile));
    const partySnapshot = await getDocs(partyQuery);

    // ২. সব ট্রানজেকশন লোড করা (ব্যালেন্স ক্যালকুলেট করার জন্য)
    const txRef = collection(db, "transactions");
    const txQuery = query(txRef, where("ownerMobile", "==", mobile));
    const txSnapshot = await getDocs(txQuery);

    let totalGiven = 0;
    let totalReceived = 0;
    const partyBalances = {}; // { partyId: balance }

    // ট্রানজেকশন থেকে হিসাব বের করা
    txSnapshot.forEach((doc) => {
      const tx = doc.data();
      if (!partyBalances[tx.partyId]) partyBalances[tx.partyId] = { given: 0, received: 0 };
      
      if (tx.direction === "given") {
        totalGiven += tx.visibleAmount;
        partyBalances[tx.partyId].given += tx.visibleAmount;
      } else {
        totalReceived += tx.visibleAmount;
        partyBalances[tx.partyId].received += tx.visibleAmount;
      }
    });

    // ড্যাশবোর্ডের উপরের কার্ডে টোটাল দেখানো
    document.getElementById("total-given").innerText = `₹${totalGiven}`;
    document.getElementById("total-received").innerText = `₹${totalReceived}`;

    // পার্টি লিস্ট দেখানো
    if (partySnapshot.empty) {
      partyContainer.innerHTML = "<p style='text-align:center; color:#666; padding: 20px 0;'>কোনো পার্টি নেই। নতুন যোগ করুন।</p>";
      return;
    }
    
    partyContainer.innerHTML = "";
    partySnapshot.forEach((doc) => {
      const party = doc.data();
      const div = document.createElement("div");
      div.className = "party-item";
      
      const initial = party.name.charAt(0).toUpperCase();
      
      // পার্টির ব্যালেন্স হিসাব
      const balanceData = partyBalances[doc.id] || { given: 0, received: 0 };
      const netBalance = balanceData.received - balanceData.given;
      
      let balanceText = "₹0";
      let balanceClass = "";
      if (netBalance > 0) {
        balanceText = `₹${netBalance}`;
        balanceClass = "received"; // আপনার পাওনা
      } else if (netBalance < 0) {
        balanceText = `₹${Math.abs(netBalance)}`;
        balanceClass = "given"; // আপনার দেওয়া
      }

      div.innerHTML = `
        <div style="display: flex; align-items: center; gap: 12px;">
          <div style="width: 40px; height: 40px; border-radius: 50%; background: #E8F5E9; color: #2E7D32; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 18px;">
            ${initial}
          </div>
          <span class="party-name">${party.name}</span>
        </div>
        <span class="party-balance ${balanceClass}">${balanceText}</span>
      `;
      
      div.onclick = () => window.location.href = `ledger.html?partyId=${doc.id}&name=${encodeURIComponent(party.name)}`;
      partyContainer.appendChild(div);
    });
  } catch (err) {
    partyContainer.innerHTML = `<p style='color:red; text-align:center;'>লোড করতে সমস্যা: ${err.message}</p>`;
  }
}

// নতুন পার্টি সেভ
document.getElementById("save-party-btn").addEventListener("click", async () => {
  const name = document.getElementById("new-party-name").value.trim();
  const partyMobile = document.getElementById("new-party-mobile").value.trim();

  if (!name) return alert("পার্টির নাম দিন");
  if (!/^[0-9]{10}$/.test(partyMobile)) return alert("সঠিক ১০-ডিজিটের মোবাইল নম্বর দিন");

  try {
    await addDoc(collection(db, "parties"), {
      ownerMobile: mobile, name: name, mobile: partyMobile, createdAt: new Date()
    });
    addPartyForm.style.display = "none";
    document.getElementById("new-party-name").value = "";
    document.getElementById("new-party-mobile").value = "";
    loadDashboard(); // রিফ্রেশ
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

// প্যানিক ট্রিগার
let lastTap = 0;
document.getElementById("app-logo").addEventListener("click", () => {
  const currentTime = new Date().getTime();
  const tapLength = currentTime - lastTap;
  if (tapLength < 500 && tapLength > 0) window.location.href = "panic.html";
  lastTap = currentTime;
});

loadDashboard();
