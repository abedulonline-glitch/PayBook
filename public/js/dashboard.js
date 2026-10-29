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

// ✅ ১. সিঙ্ক ও মিররিং (ইনডেক্স এরর ছাড়াই)
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

      // ৩. তার লেনদেনগুলো খুঁজি (ইনডেক্স এরর এড়াতে শুধু ownerMobile দিয়ে কুয়েরি করে ফিল্টার করব)
      const txQuery = query(collection(db, "transactions"), where("ownerMobile", "==", otherParty.ownerMobile));
      const txSnap = await getDocs(txQuery);

      for (const txDoc of txSnap.docs) {
        const tx = txDoc.data();
        
        // যদি লেনদেনটি আমার সাথে হয় এবং অরিজিনাল হয়
        if (tx.counterpartyMobile === mobile && !tx.isMirrored) {
          
          // 🛑 ডাবল এন্ট্রি বন্ধ করতে ফিক্সড আইডি (mirror_আইডি_নম্বর)
          const mirrorDocId = `mirror_${txDoc.id}_${mobile}`;
          const mirrorDocRef = doc(db, "transactions", mirrorDocId);

          // setDoc merge:true দিলে একই ডেটা বারবার চেক করলেও ডুপ্লিকেট হবে না
          await setDoc(mirrorDocRef, {
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
            status: tx.status || "pending", 
            originalTxId: txDoc.id, 
            deletedBy: [],
            verifiedBy: []
          }, { merge: true }); 
        }
      }
    }
  } catch (err) { 
    console.error("Sync error", err); 
  }
}

// ✅ ২. ডেটা লোড
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
    partyContainer.innerHTML = `<p style='color:red; text-align:center; padding: 20px;'>লোড সমস্যা: ${err.message}</p>`; 
  }
}

// ✅ ৩. গ্লোবাল সেটিংস ও ব্যালেন্স
async function loadGlobalSettingsAndBalance() {
  try {
    const settingsSnap = await getDoc(doc(db, "settings", "global"));
    if (settingsSnap.exists()) window.appSettings = settingsSnap.data();

    const userSnap = await getDoc(doc(db, "users", mobile));
    if (userSnap.exists()) {
      const bal = userSnap.data().walletBalance || 0;
      document.getElementById("header-balance").innerText = `₹${bal}`;
      window.userWalletBalance = bal;
    }
  } catch (e) { console.log("Settings error", e); }
}

// ✅ ৪. রেন্ডার ও ফিল্টার
function renderDashboard() {
  if(!partyContainer) return;

  const filteredParties = allParties.filter(p => p.partyType === currentTab);
  const filteredPartyIds = new Set(filteredParties.map(p => p.id));
  
  let totalGiven = 0;
  let totalReceived = 0;
  const partyBalances = {};

  allTransactions.forEach(tx => {
    // শুধু ডিলিট না হওয়া এবং রিজেক্টেড না হওয়া ট্রানজেকশন হিসাবে যোগ হবে
    if (filteredPartyIds.has(tx.partyId) && !tx.isDeleted && tx.status !== "rejected") {
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

// UI ট্যাব সুইচ
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

// ✅ ৫. রিপোর্ট ডাউনলোড (Excel/PDF)
// ✅ ৫. রিপোর্ট ডাউনলোড (প্যানিক পিন ছাড়াই, WhatsApp ফরম্যাটে)
window.downloadReport = async function(format) {
  if (allParties.length === 0) return alert("ডাউনলোড করার মতো কোনো ডেটা নেই!");

  try {
    let rows = [];
    
    // টেবিলের হেডার (হোয়াটসঅ্যাপের মতো)
    rows.push(["Date", "Party Name", "Type", "Given", "Received", "Balance", "Note"]);

    // প্রতিটি পার্টির লেনদেন প্রসেস করা
    allParties.forEach(p => {
      let partyTx = allTransactions.filter(tx => tx.partyId === p.id && !tx.isDeleted && tx.status !== "rejected");
      
      // পুরনো থেকে নতুন সাজানো
      partyTx.sort((a, b) => a.date.toDate() - b.date.toDate());
      
      let runningBalance = 0;
      
      partyTx.forEach(tx => {
        // প্যানিক মোড না থাকলে কাঁচা বাদ যাবে
        if (!isPanicActive && tx.accountType === "kacha") return;
        // যদি প্যানিক মোডে 'both' সিলেক্ট থাকে, তবে সবই আসবে
        if (isPanicActive && currentAccountType !== 'both' && tx.accountType !== currentAccountType) return;

        let amt = tx.visibleAmount;
        if (tx.accountType === "kacha") amt = amt / 100;
        
        let givenStr = tx.direction === "given" ? amt : 0;
        let recvStr = tx.direction === "received" ? amt : 0;
        
        runningBalance += (recvStr - givenStr);
        
        let dObj = tx.date.toDate();
        let dStr = dObj.toLocaleDateString('en-GB', { timeZone: 'Asia/Kolkata', day: '2-digit', month: '2-digit', year: '2-digit' });
        
        rows.push([
          dStr, 
          p.name, 
          tx.accountType === 'kacha' ? 'Kacha' : 'Paka', 
          givenStr, 
          recvStr, 
          runningBalance, 
          tx.note || "-"
        ]);
      });
    });

    if (rows.length === 1) return alert("এই ট্যাবে ডাউনলোড করার মতো কোনো লেনদেন নেই!");

    // ✅ Excel (CSV) ডাউনলোড
    if (format === 'excel') {
      let csvContent = "data:text/csv;charset=utf-8,\uFEFF"; // বাংলা লেখার জন্য BOM
      rows.forEach(row => {
        csvContent += row.map(cell => `"${cell}"`).join(",") + "\n";
      });
      
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement("a");
      link.setAttribute("href", encodedUri);
      link.setAttribute("download", `PayBook_Report_${Date.now()}.csv`);
      document.body.appendChild(link); 
      link.click(); 
      document.body.removeChild(link);
    } 
    
    // ✅ PDF ডাউনলোড
    else if (format === 'pdf') {
      let printWindow = window.open('', '_blank');
      let html = `
        <html><head><title>PayBook Report</title>
        <style>
          body{font-family: sans-serif; padding: 20px;}
          h2 { color: #97144D; text-align: center; }
          table{width:100%; border-collapse: collapse; margin-top:20px; font-size: 12px;}
          th,td{border:1px solid #ddd; padding:8px; text-align:left;}
          th{background:#f2f2f2; color: #333;}
          .given { color: #D32F2F; font-weight: bold; }
          .received { color: #2E7D32; font-weight: bold; }
        </style></head><body>
      `;
      
      html += `<h2>PayBook Ledger Report</h2>`;
      html += `<p style="text-align:center; font-size:12px; color:#555;">Generated on: ${new Date().toLocaleString()}</p>`;
      
      html += `<table><tr>`;
      rows[0].forEach(h => html += `<th>${h}</th>`);
      html += `</tr>`;
      
      for (let i = 1; i < rows.length; i++) {
        html += `<tr>`;
        html += `<td>${rows[i][0]}</td>`; // Date
        html += `<td>${rows[i][1]}</td>`; // Party Name
        html += `<td>${rows[i][2]}</td>`; // Type
        html += `<td class="given">${rows[i][3] != 0 ? rows[i][3] : '-'}</td>`; // Given
        html += `<td class="received">${rows[i][4] != 0 ? rows[i][4] : '-'}</td>`; // Received
        html += `<td><b>${rows[i][5]}</b></td>`; // Balance
        html += `<td>${rows[i][6]}</td>`; // Note
        html += `</tr>`;
      }
      html += `</table></body></html>`;
      
      printWindow.document.write(html);
      printWindow.document.close();
      printWindow.print(); // ডিভাইসের প্রিন্ট ডায়ালগ ওপেন হবে, সেখান থেকে "Save as PDF" করতে হবে
    }
  } catch (e) { 
    alert("রিপোর্ট তৈরিতে সমস্যা: " + e.message); 
  }
};

// ✅ ৬. পার্টি সেভ
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

// ড্যাশবোর্ড লোড
loadData();
