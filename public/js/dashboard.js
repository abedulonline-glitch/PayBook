import { db } from "./firebase-init.js";
import { collection, addDoc, query, where, getDocs, doc, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { IMGBB_API_KEY } from "./config.js";

const mobile = localStorage.getItem("paybook_mobile");
if (!mobile) window.location.href = "index.html";

let currentTab = "customer"; // ডিফল্ট ট্যাব
let allParties = []; // সব পার্টি এখানে জমা থাকবে
let allTransactions = []; // সব লেনদেন এখানে জমা থাকবে

const partyContainer = document.getElementById("party-container");
const addPartyForm = document.getElementById("add-party-form");

// ট্যাব পরিবর্তন করার ফাংশন
window.switchTab = function(tab) {
  currentTab = tab;
  
  // UI আপডেট
  document.getElementById("tab-customer").classList.remove("active");
  document.getElementById("tab-supplier").classList.remove("active");
  document.getElementById(`tab-${tab}`).classList.add("active");
  
  document.getElementById("list-title").innerText = tab === "customer" ? "কাস্টমার লিস্ট" : "সাপ্লায়ার লিস্ট";
  
  // শুধু ফর্মের হেডিং আপডেট হবে (ড্রপডাউনের কোড বাদ দেওয়া হলো)
  const formHeading = document.getElementById("add-party-heading");
  if (tab === "supplier") {
    formHeading.innerText = "নতুন সাপ্লায়ার যোগ করুন";
  } else {
    formHeading.innerText = "নতুন কাস্টমার যোগ করুন";
  }

  renderDashboard(); // ডেটা রি-রেন্ডার
};


// ডেটা লোড করা
async function loadData() {
  try {
    // ১. সব পার্টি লোড
    const partiesRef = collection(db, "parties");
    const partyQuery = query(partiesRef, where("ownerMobile", "==", mobile));
    const partySnapshot = await getDocs(partyQuery);
    
    allParties = partySnapshot.docs.map(doc => {
      let data = doc.data();
      // পুরনো পার্টি যাদের partyType নেই, তাদের ডিফল্ট 'customer' ধরা হবে
      if (!data.partyType) data.partyType = "customer"; 
      return { id: doc.id, ...data };
    });

    // ২. সব ট্রানজেকশন লোড
    const txRef = collection(db, "transactions");
    const txQuery = query(txRef, where("ownerMobile", "==", mobile));
    const txSnapshot = await getDocs(txQuery);
    allTransactions = txSnapshot.docs.map(doc => doc.data());

    renderDashboard();
    loadProfile();
  } catch (err) {
    partyContainer.innerHTML = `<p style='color:red; text-align:center;'>লোড করতে সমস্যা: ${err.message}</p>`;
  }
}

// ড্যাশবোর্ড রেন্ডার (ট্যাব অনুযায়ী)
function renderDashboard() {
  // বর্তমান ট্যাবের পার্টি ফিল্টার
  const filteredParties = allParties.filter(p => p.partyType === currentTab);
  
  let totalGiven = 0;
  let totalReceived = 0;
  const partyBalances = {};

  // শুধু ফিল্টার করা পার্টিদের লেনদেন হিসাব করা
  const filteredPartyIds = new Set(filteredParties.map(p => p.id));
  
  allTransactions.forEach(tx => {
    if (filteredPartyIds.has(tx.partyId)) {
      if (!partyBalances[tx.partyId]) partyBalances[tx.partyId] = { given: 0, received: 0 };
      
      if (tx.direction === "given") {
        totalGiven += tx.visibleAmount;
        partyBalances[tx.partyId].given += tx.visibleAmount;
      } else {
        totalReceived += tx.visibleAmount;
        partyBalances[tx.partyId].received += tx.visibleAmount;
      }
    }
  });

  document.getElementById("total-given").innerText = `₹${totalGiven}`;
  document.getElementById("total-received").innerText = `₹${totalReceived}`;

  if (filteredParties.length === 0) {
    partyContainer.innerHTML = `<p style='text-align:center; color:#666; padding: 20px 0;'>কোনো ${currentTab === 'customer' ? 'কাস্টমার' : 'সাপ্লায়ার'} নেই।</p>`;
    return;
  }
  
  partyContainer.innerHTML = "";
  filteredParties.forEach((party) => {
    const div = document.createElement("div");
    div.className = "party-item";
    const initial = party.name.charAt(0).toUpperCase();
    
    const balanceData = partyBalances[party.id] || { given: 0, received: 0 };
    const netBalance = balanceData.received - balanceData.given;
    
    let balanceText = "₹0", balanceClass = "";
    if (netBalance > 0) {
      balanceText = `₹${netBalance}`;
      balanceClass = "received"; 
    } else if (netBalance < 0) {
      balanceText = `₹${Math.abs(netBalance)}`;
      balanceClass = "given"; 
    }

    // পার্টির নামের নিচে টাইপ (কাস্টমার/সাপ্লায়ার)
    const typeText = party.partyType === 'customer' ? 'Customer' : 'Supplier';

    div.innerHTML = `
      <div style="display: flex; align-items: center; gap: 12px;">
        <div style="width: 40px; height: 40px; border-radius: 50%; background: #E8F5E9; color: #2E7D32; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 18px;">${initial}</div>
        <div>
          <div class="party-name">${party.name}</div>
          <div style="font-size: 11px; color: #777;">${typeText}</div>
        </div>
      </div>
      <span class="party-balance ${balanceClass}">${balanceText}</span>
    `;
    div.onclick = () => window.location.href = `ledger.html?partyId=${party.id}&name=${encodeURIComponent(party.name)}`;
    partyContainer.appendChild(div);
  });
}

// প্রোফাইল পিকচার লজিক (আগের মতোই)
async function loadProfile() {
  const userSnap = await getDoc(doc(db, "users", mobile));
  if (userSnap.exists() && userSnap.data().profilePic) {
    document.getElementById("profile-pic").src = userSnap.data().profilePic;
  }
}
document.getElementById("profile-pic").addEventListener("click", () => document.getElementById("profile-upload").click());
document.getElementById("profile-upload").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const formData = new FormData(); formData.append("image", file);
    const res = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, { method: "POST", body: formData });
    const data = await res.json();
    if(data.success) {
      await updateDoc(doc(db, "users", mobile), { profilePic: data.data.url });
      document.getElementById("profile-pic").src = data.data.url;
    }
  } catch(e) { alert("ছবি আপলোডে সমস্যা"); }
});

// নতুন পার্টি সেভ
// নতুন পার্টি সেভ
document.getElementById("save-party-btn").addEventListener("click", async () => {
  const name = document.getElementById("new-party-name").value.trim();
  const partyMobile = document.getElementById("new-party-mobile").value.trim();
  
  // dropdown থেকে না নিয়ে, সরাসরি currentTab ব্যবহার করা হচ্ছে
  const type = currentTab; 

  if (!name) return alert("পার্টির নাম দিন");
  if (!/^[0-9]{10}$/.test(partyMobile)) return alert("সঠিক ১০-ডিজিটের মোবাইল নম্বর দিন");
  if (partyMobile === mobile) return alert("নিজের নম্বর দিতে পারবেন না!");

  try {
    const q = query(collection(db, "parties"), where("ownerMobile", "==", mobile));
    const snap = await getDocs(q);
    let isDuplicate = false;

    snap.forEach(d => { if (d.data().mobile === partyMobile) isDuplicate = true; });
    if (isDuplicate) return alert("এই নম্বরটি আগে থেকেই সেভ করা আছে!");

    // partyType: type (যা currentTab থেকে আসছে) সহ সেভ
    await addDoc(collection(db, "parties"), { 
      ownerMobile: mobile, 
      name: name, 
      mobile: partyMobile, 
      partyType: type, 
      createdAt: new Date() 
    });
    
    addPartyForm.style.display = "none";
    document.getElementById("new-party-name").value = "";
    document.getElementById("new-party-mobile").value = "";
    
    // ডেটা রিলোড
    loadData(); 
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
  if (currentTime - lastTap < 500) window.location.href = "panic.html";
  lastTap = currentTime;
});

loadData();
