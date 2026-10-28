import { db } from "./firebase-init.js";
import { collection, addDoc, query, where, getDocs, doc, getDoc, updateDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { IMGBB_API_KEY } from "./config.js";

const mobile = localStorage.getItem("paybook_mobile");
if (!mobile) window.location.href = "index.html";

let currentTab = "customer";
let currentAccountType = "paka";
let allParties = [];
let allTransactions = [];
let isPanicActive = sessionStorage.getItem("panic_unlock_until") && Date.now() < parseInt(sessionStorage.getItem("panic_unlock_until"));

const partyContainer = document.getElementById("party-container");
const addPartyForm = document.getElementById("add-party-form");

// ১. মিররিং ও সিঙ্ক (ডুপ্লিকেট ফিক্স সহ)
async function syncCrossPartyData() {
  try {
    // ১. আমার নম্বরটি কার কার লিস্টে আছে খুঁজি
    const q = query(collection(db, "parties"), where("mobile", "==", mobile));
    const snap = await getDocs(q);
    
    for (const d of snap.docs) {
      const otherParty = d.data();
      if (otherParty.ownerMobile === mobile) continue; 

      // ২. আমার লিস্টে ওই পার্টি আছে কি?
      const myPartiesQuery = query(collection(db, "parties"), where("ownerMobile", "==", mobile), where("mobile", "==", otherParty.ownerMobile));
      let myPartiesSnap = await getDocs(myPartiesQuery);
      let myPartyId = null;

      if (myPartiesSnap.empty) {
        const newType = otherParty.partyType === "customer" ? "supplier" : "customer";
        const newDocRef = doc(collection(db, "parties")); 
        await setDoc(newDocRef, {
          ownerMobile: mobile,
          name: otherParty.ownerMobile, 
          mobile: otherParty.ownerMobile,
          partyType: newType,
          isAutoSynced: true,
          createdAt: new Date()
        });
        myPartyId = newDocRef.id;
      } else {
        myPartyId = myPartiesSnap.docs[0].id;
      }

    // ৩. ট্রানজেকশন মিররিং
const txQuery = query(collection(db, "transactions"), where("ownerMobile", "==", otherParty.ownerMobile), where("counterpartyMobile", "==", mobile));
const txSnap = await getDocs(txQuery);

for (const txDoc of txSnap.docs) {
  const tx = txDoc.data();
  
  // 🛑 ডুপ্লিকেট চেক (অরিজিনাল আইডি এবং মিরর আইডি দুটোই চেক)
  const checkMirrored = query(collection(db, "transactions"), where("ownerMobile", "==", mobile), where("originalTxId", "==", txDoc.id));
  const mirrorSnap = await getDocs(checkMirrored);

  if (mirrorSnap.empty) {
    await addDoc(collection(db, "transactions"), {
      ownerMobile: mobile,
      partyId: myPartyId,
      counterpartyMobile: otherParty.ownerMobile,
      accountType: tx.accountType,
      direction: tx.direction === "given" ? "received" : "given", 
      visibleAmount: tx.visibleAmount,
      imageUrls: tx.imageUrls || [],
      note: tx.note,
      date: tx.date,
      isDeleted: false,
      isMirrored: true,
      isPending: true, // 👁️ মিরর ট্রানজেকশনে পেন্ডিং সেট করা হলো
      originalTxId: txDoc.id, 
      deletedBy: [],
      verifiedBy: []
    });
  }
}
   
    }
  } catch (err) { 
    console.error("Sync error", err); 
  }
}

// ২. ডেটা লোড
async function loadData() {
  try {
    await syncCrossPartyData();

    const partiesRef = collection(db, "parties");
    const partyQuery = query(partiesRef, where("ownerMobile", "==", mobile));
    const partySnapshot = await getDocs(partyQuery);
    allParties = partySnapshot.docs.map(d => ({ id: d.id, ...d.data(), partyType: d.data().partyType || "customer" }));

    const txRef = collection(db, "transactions");
    const txQuery = query(txRef, where("ownerMobile", "==", mobile));
    const txSnapshot = await getDocs(txQuery);
    allTransactions = txSnapshot.docs.map(d => d.data());

    if (isPanicActive) {
      document.getElementById("account-type-tabs").style.display = "flex";
    }
    renderDashboard();
    loadProfile();
    loadGlobalSettingsAndBalance();
  } catch (err) { 
    partyContainer.innerHTML = `<p style='color:red; text-align:center;'>লোড সমস্যা: ${err.message}</p>`; 
  }
}

// ৩. গ্লোবাল সেটিংস ও ব্যালেন্স লোড
async function loadGlobalSettingsAndBalance() {
  try {
    const settingsSnap = await getDoc(doc(db, "settings", "global"));
    if (settingsSnap.exists()) {
      window.appSettings = settingsSnap.data();
    }

    const userSnap = await getDoc(doc(db, "users", mobile));
    if (userSnap.exists()) {
      const bal = userSnap.data().walletBalance || 0;
      document.getElementById("header-balance").innerText = `₹${bal}`;
      window.userWalletBalance = bal;
    }
  } catch (e) { console.log("Settings error", e); }
}

// ৪. রেন্ডার ও ফিল্টার
function renderDashboard() {
  const filteredParties = allParties.filter(p => p.partyType === currentTab);
  const filteredPartyIds = new Set(filteredParties.map(p => p.id));
  
  let totalGiven = 0;
  let totalReceived = 0;
  const partyBalances = {};

  allTransactions.forEach(tx => {
    if (filteredPartyIds.has(tx.partyId) && !tx.isDeleted) {
      if (!isPanicActive && tx.accountType === "kacha") return;
      if (isPanicActive && currentAccountType !== "both" && tx.accountType !== currentAccountType) return;

      let amount = tx.visibleAmount;
      if (tx.accountType === "kacha") amount = amount / 100;

      if (!partyBalances[tx.partyId]) partyBalances[tx.partyId] = { given: 0, received: 0 };
      if (tx.direction === "given") {
        totalGiven += amount;
        partyBalances[tx.partyId].given += amount;
      } else {
        totalReceived += amount;
        partyBalances[tx.partyId].received += amount;
      }
    }
  });

  let headerText = "পাকা";
  if (isPanicActive && currentAccountType === "kacha") headerText = "কাঁচা (ফেক)";
  if (isPanicActive && currentAccountType === "both") headerText = "উভয়";

  document.querySelector('.summary .received h3').innerText = `মোট প্রাপ্য (${headerText})`;
  document.querySelector('.summary .given h3').innerText = `মোট প্রদেয় (${headerText})`;
  document.getElementById("total-given").innerText = `₹${totalGiven.toFixed(2)}`;
  document.getElementById("total-received").innerText = `₹${totalReceived.toFixed(2)}`;

  if (filteredParties.length === 0) {
    partyContainer.innerHTML = `<p style='text-align:center; color:#666; padding: 20px 0;'>কোনো ${currentTab === 'customer' ? 'কাস্টমার' : 'সাপ্লায়ার'} নেই।</p>`;
    return;
  }
  
  partyContainer.innerHTML = "";
  filteredParties.forEach((party) => {
    const div = document.createElement("div");
    div.className = "party-item";
    
    let avatarHtml = `<div style="width: 40px; height: 40px; border-radius: 50%; background: #E8F5E9; color: #2E7D32; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 18px;">${party.name.charAt(0).toUpperCase()}</div>`;
    if (party.profilePic) {
      avatarHtml = `<img src="${party.profilePic}" style="width: 40px; height: 40px; border-radius: 50%; object-fit: cover; border: 1px solid #ddd;">`;
    }

    const balanceData = partyBalances[party.id] || { given: 0, received: 0 };
    const netBalance = balanceData.received - balanceData.given;
    
    let balanceText = "₹0", balanceClass = "";
    if (netBalance > 0) { balanceText = `₹${netBalance.toFixed(2)}`; balanceClass = "received"; }
    else if (netBalance < 0) { balanceText = `₹${Math.abs(netBalance).toFixed(2)}`; balanceClass = "given"; }

    div.innerHTML = `
      <div style="display: flex; align-items: center; gap: 12px;">
        ${avatarHtml}
        <div>
          <div class="party-name">${party.name}</div>
          <div style="font-size: 11px; color: #777;">${party.partyType === 'customer' ? 'Customer' : 'Supplier'}</div>
        </div>
      </div>
      <span class="party-balance ${balanceClass}">${balanceText}</span>
    `;
    div.onclick = () => window.location.href = `ledger.html?partyId=${party.id}&name=${encodeURIComponent(party.name)}`;
    partyContainer.appendChild(div);
  });
}

// ৫. ট্যাব সুইচ
window.switchTab = function(tab) {
  currentTab = tab;
  document.getElementById("tab-customer").classList.remove("active");
  document.getElementById("tab-supplier").classList.remove("active");
  document.getElementById(`tab-${tab}`).classList.add("active");
  document.getElementById("list-title").innerText = tab === "customer" ? "কাস্টমার লিস্ট" : "সাপ্লায়ার লিস্ট";
  document.getElementById("add-party-heading").innerText = tab === "customer" ? "নতুন কাস্টমার যোগ করুন" : "নতুন সাপ্লায়ার যোগ করুন";
  renderDashboard();
};

window.switchAccountType = function(type) {
  currentAccountType = type;
  document.getElementById("acc-paka").classList.remove("active");
  document.getElementById("acc-kacha").classList.remove("active");
  document.getElementById("acc-both").classList.remove("active");
  document.getElementById(`acc-${type}`).classList.add("active");
  renderDashboard();
};

// ৬. রিপোর্ট ডাউনলোড
window.downloadReport = async function(format) {
  if (allParties.length === 0) return alert("ডেটা নেই!");
  
  let pin = prompt("রিপোর্ট ডাউনলোড করতে ৬-ডিজিটের প্যানিক পিন দিন:");
  if (!pin) return;

  try {
    const userSnap = await getDoc(doc(db, "users", mobile));
    const user = userSnap.data();
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey("raw", enc.encode(pin), "PBKDF2", false, ["deriveBits"]);
    const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt: enc.encode(user.salt), iterations: 100000, hash: "SHA-256" }, keyMaterial, 256);
    if (btoa(String.fromCharCode(...new Uint8Array(bits))) !== user.panicPinHash) return alert("ভুল প্যানিক পিন!");

    let csvContent = "data:text/csv;charset=utf-8,";
    let reportTitle = (isPanicActive && currentAccountType === 'both') ? "Both" : currentAccountType;
    
    if (format === 'excel') {
      csvContent += `Report Type: ${reportTitle}\nParty Name,Type,Paka Given,Paka Received,Kacha Given,Kacha Received\n`;
      allParties.forEach(p => {
        let pg=0, pr=0, kg=0, kr=0;
        allTransactions.forEach(tx => {
          if (tx.partyId === p.id && !tx.isDeleted) {
            if (tx.accountType === "paka") { if (tx.direction === "given") pg += tx.visibleAmount; else pr += tx.visibleAmount; }
            else { if (tx.direction === "given") kg += tx.visibleAmount; else kr += tx.visibleAmount; }
          }
        });
        csvContent += `${p.name},${p.partyType},${pg},${pr},${kg},${kr}\n`;
      });
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement("a");
      link.setAttribute("href", encodedUri);
      link.setAttribute("download", `paybook_report_${Date.now()}.csv`);
      document.body.appendChild(link); link.click(); document.body.removeChild(link);
    } 
    else if (format === 'pdf') {
      let printWindow = window.open('', '_blank');
      let html = `<html><head><title>PayBook Report</title><style>body{font-family: sans-serif;} table{width:100%; border-collapse: collapse; margin-top:20px;} th,td{border:1px solid #ddd; padding:8px; text-align:left;} th{background:#f2f2f2;}</style></head><body>`;
      html += `<h2>PayBook Report - ${reportTitle}</h2>`;
      html += `<table><tr><th>Party Name</th><th>Type</th><th>Paka Given</th><th>Paka Received</th><th>Kacha Given</th><th>Kacha Received</th></tr>`;
      allParties.forEach(p => {
        let pg=0, pr=0, kg=0, kr=0;
        allTransactions.forEach(tx => {
          if (tx.partyId === p.id && !tx.isDeleted) {
            if (tx.accountType === "paka") { if (tx.direction === "given") pg += tx.visibleAmount; else pr += tx.visibleAmount; }
            else { if (tx.direction === "given") kg += tx.visibleAmount; else kr += tx.visibleAmount; }
          }
        });
        html += `<tr><td>${p.name}</td><td>${p.partyType}</td><td>₹${pg}</td><td>₹${pr}</td><td>₹${kg}</td><td>₹${kr}</td></tr>`;
      });
      html += `</table></body></html>`;
      printWindow.document.write(html);
      printWindow.document.close();
      printWindow.print();
    }
  } catch (e) { alert("সমস্যা: " + e.message); }
};

// ৭. পার্টি সেভ ও অন্যান্য
document.getElementById("save-party-btn").addEventListener("click", async () => {
  const name = document.getElementById("new-party-name").value.trim();
  const partyMobile = document.getElementById("new-party-mobile").value.trim();
  if (!name) return alert("পার্টির নাম দিন");
  if (!/^[0-9]{10}$/.test(partyMobile)) return alert("সঠিক ১০-ডিজিটের মোবাইল নম্বর দিন");
  if (partyMobile === mobile) return alert("নিজের নম্বর দিতে পারবেন না!");

  try {
    const q = query(collection(db, "parties"), where("ownerMobile", "==", mobile));
    const snap = await getDocs(q);
    if (snap.docs.some(d => d.data().mobile === partyMobile)) return alert("নম্বরটি আগে থেকেই সেভ করা আছে!");

    await addDoc(collection(db, "parties"), { 
      ownerMobile: mobile, name: name, mobile: partyMobile, partyType: currentTab, createdAt: new Date() 
    });
    addPartyForm.style.display = "none";
    document.getElementById("new-party-name").value = "";
    document.getElementById("new-party-mobile").value = "";
    loadData(); 
  } catch (err) { alert("সেভ সমস্যা: " + err.message); }
});

document.getElementById("show-add-party").addEventListener("click", () => {
  addPartyForm.style.display = addPartyForm.style.display === "none" ? "block" : "none";
});
document.getElementById("logout-btn").addEventListener("click", () => { localStorage.removeItem("paybook_mobile"); window.location.href = "index.html"; });
let lastTap = 0;
document.getElementById("app-logo").addEventListener("click", () => { if (new Date().getTime() - lastTap < 500) window.location.href = "panic.html"; lastTap = new Date().getTime(); });

// প্রোফাইল
async function loadProfile() {
  const userSnap = await getDoc(doc(db, "users", mobile));
  if (userSnap.exists() && userSnap.data().profilePic) document.getElementById("profile-pic").src = userSnap.data().profilePic;
}
document.getElementById("profile-pic").addEventListener("click", () => document.getElementById("profile-upload").click());
document.getElementById("profile-upload").addEventListener("change", async (e) => {
  const file = e.target.files[0]; if (!file) return;
  try {
    const formData = new FormData(); formData.append("image", file);
    const res = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, { method: "POST", body: formData });
    const data = await res.json();
    if(data.success) { await updateDoc(doc(db, "users", mobile), { profilePic: data.data.url }); document.getElementById("profile-pic").src = data.data.url; }
  } catch(e) { alert("ছবি সমস্যা"); }
});

loadData();
