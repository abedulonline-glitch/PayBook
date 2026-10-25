import { db } from "./firebase-init.js";
import { collection, addDoc, query, where, getDocs, doc, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { IMGBB_API_KEY } from "./config.js";

const mobile = localStorage.getItem("paybook_mobile");
if (!mobile) window.location.href = "index.html";

const partyContainer = document.getElementById("party-container");
const addPartyForm = document.getElementById("add-party-form");
const profilePic = document.getElementById("profile-pic");
const profileUpload = document.getElementById("profile-upload");

// ইমেজ আপলোড ফাংশন (ImgBB)
async function uploadToImgBB(file) {
  const formData = new FormData();
  formData.append("image", file);
  const res = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, { method: "POST", body: formData });
  const data = await res.json();
  if (!data.success) throw new Error("ইমেজ আপলোড ব্যর্থ");
  return data.data.url;
}

// প্রোফাইল পিকচার লোড করা
async function loadProfile() {
  const userSnap = await getDoc(doc(db, "users", mobile));
  if (userSnap.exists() && userSnap.data().profilePic) {
    profilePic.src = userSnap.data().profilePic;
  }
}

// প্রোফাইল পিকচার আপলোড
profilePic.addEventListener("click", () => profileUpload.click());
profileUpload.addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return alert("ছবি সিলেক্ট করুন");
  
  try {
    profilePic.style.opacity = "0.5";
    const url = await uploadToImgBB(file);
    await updateDoc(doc(db, "users", mobile), { profilePic: url });
    profilePic.src = url;
    profilePic.style.opacity = "1";
    alert("প্রোফাইল ছবি আপডেট হয়েছে!");
  } catch (err) {
    alert("সমস্যা: " + err.message);
    profilePic.style.opacity = "1";
  }
});

async function loadDashboard() {
  try {
    const partiesRef = collection(db, "parties");
    const partyQuery = query(partiesRef, where("ownerMobile", "==", mobile));
    const partySnapshot = await getDocs(partyQuery);

    const txRef = collection(db, "transactions");
    const txQuery = query(txRef, where("ownerMobile", "==", mobile));
    const txSnapshot = await getDocs(txQuery);

    let totalGiven = 0, totalReceived = 0;
    const partyBalances = {};

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

    document.getElementById("total-given").innerText = `₹${totalGiven}`;
    document.getElementById("total-received").innerText = `₹${totalReceived}`;

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
      
      const balanceData = partyBalances[doc.id] || { given: 0, received: 0 };
      const netBalance = balanceData.received - balanceData.given;
      
      let balanceText = "₹0", balanceClass = "";
      if (netBalance > 0) {
        balanceText = `₹${netBalance}`;
        balanceClass = "received";
      } else if (netBalance < 0) {
        balanceText = `₹${Math.abs(netBalance)}`;
        balanceClass = "given";
      }

      div.innerHTML = `
        <div style="display: flex; align-items: center; gap: 12px;">
          <div style="width: 40px; height: 40px; border-radius: 50%; background: #E8F5E9; color: #2E7D32; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 18px;">${initial}</div>
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

document.getElementById("save-party-btn").addEventListener("click", async () => {
  const name = document.getElementById("new-party-name").value.trim();
  const partyMobile = document.getElementById("new-party-mobile").value.trim();
  
  if (!name) return alert("পার্টির নাম দিন");
  if (!/^[0-9]{10}$/.test(partyMobile)) return alert("সঠিক ১০-ডিজিটের মোবাইল নম্বর দিন");
  
  // ১. ইউজার নিজের নম্বর দিয়ে পার্টি বানাতে পারবে না
  if (partyMobile === mobile) {
    return alert("আপনি নিজের মোবাইল নম্বর দিয়ে পার্টি তৈরি করতে পারবেন না!");
  }

  try {
    // ২. চেক করা: এই নম্বরটি আগে থেকেই এই ইউজারের কোনো পার্টি হিসেবে আছে কি না
    const partiesRef = collection(db, "parties");
    const checkQuery = query(
      partiesRef, 
      where("ownerMobile", "==", mobile), 
      where("mobile", "==", partyMobile)
    );
    const querySnapshot = await getDocs(checkQuery);

    if (!querySnapshot.empty) {
      const existingParty = querySnapshot.docs[0].data();
      return alert(`এই মোবাইল নম্বরটি ইতিমধ্যে "${existingParty.name}" নামে সেভ করা আছে!`);
    }

    // ৩. কোনো ডুপ্লিকেট না থাকলে নতুন পার্টি সেভ হবে
    await addDoc(collection(db, "parties"), { 
      ownerMobile: mobile, 
      name: name, 
      mobile: partyMobile, 
      createdAt: new Date() 
    });
    
    addPartyForm.style.display = "none";
    document.getElementById("new-party-name").value = "";
    document.getElementById("new-party-mobile").value = "";
    loadDashboard();
    
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

let lastTap = 0;
document.getElementById("app-logo").addEventListener("click", () => {
  const currentTime = new Date().getTime();
  const tapLength = currentTime - lastTap;
  if (tapLength < 500 && tapLength > 0) window.location.href = "panic.html";
  lastTap = currentTime;
});

loadProfile();
loadDashboard();
