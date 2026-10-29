import { db } from "./firebase-init.js";
import { collection, query, where, onSnapshot, doc, getDoc, updateDoc, getDocs } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { IMGBB_API_KEY } from "./config.js";

const urlParams = new URLSearchParams(window.location.search);
const partyId = urlParams.get("partyId");
const mobile = localStorage.getItem("paybook_mobile");

if (!partyId || !mobile) window.location.href = "dashboard.html";

let isPanicActive = sessionStorage.getItem("panic_unlock_until") && Date.now() < parseInt(sessionStorage.getItem("panic_unlock_until"));
let currentImages = [];
let currentImageIndex = 0;
let partyData = {};

// ১. পার্টির ডিটেইলস
async function loadPartyDetails() {
  const docSnap = await getDoc(doc(db, "parties", partyId));
  if (docSnap.exists()) {
    partyData = docSnap.data();
    document.getElementById("party-name").innerText = partyData.name;
    const type = partyData.partyType || "customer";
    document.getElementById("party-type-label").innerText = type === "customer" ? "Customer (কাস্টমার)" : "Supplier (সাপ্লায়ার)";
    
    const initial = partyData.name.charAt(0).toUpperCase();
    if (partyData.profilePic) {
      document.getElementById("avatar-text").style.display = "none";
      document.getElementById("avatar-img").src = partyData.profilePic;
      document.getElementById("avatar-img").style.display = "block";
    } else {
      document.getElementById("avatar-text").innerText = initial;
    }
  }
}

// ২. রিয়েল-টাইম লেনদেন লোড
function loadTransactions() {
  const txRef = collection(db, "transactions");
  const q = query(txRef, where("ownerMobile", "==", mobile), where("partyId", "==", partyId));
  
  onSnapshot(q, (snapshot) => {
    const timeline = document.getElementById("timeline-container");
    
    if (snapshot.empty) {
      timeline.innerHTML = "<p style='text-align:center; color:#999; margin-top:50px;'>এখনো কোনো লেনদেন নেই</p>";
      return;
    }
    
    timeline.innerHTML = "";
    const docs = snapshot.docs.sort((a, b) => b.data().date.toDate() - a.data().date.toDate());

    // ডুপ্লিকেট ফিল্টার
    const uniqueDocs = [];
    const seenIds = new Set();
    docs.forEach(d => {
      const data = d.data();
      const uniqueId = data.originalTxId || d.id; 
      if (!seenIds.has(uniqueId)) {
        seenIds.add(uniqueId);
        uniqueDocs.push(d);
      }
    });

    // ৩. কার্ড তৈরি
    uniqueDocs.forEach((txDoc) => {
      const tx = txDoc.data();
      if (!isPanicActive && tx.accountType === "kacha") return;

      const dateObj = tx.date && tx.date.toDate ? tx.date.toDate() : new Date(tx.date || Date.now());
      const dateStr = dateObj.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric' });
      const timeStr = dateObj.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: true });
      
      let images = tx.imageUrls || (tx.imageUrl ? [tx.imageUrl] : []);
      let imgHtml = "";
      
      if (images.length > 0) {
        let overlay = images.length > 1 
          ? `<div style="position:absolute;bottom:8px;right:8px;background:rgba(0,0,0,0.7);color:white;padding:4px 10px;border-radius:12px;font-size:13px;">+${images.length-1}</div>` : "";
        
        imgHtml = `
          <div class="tx-img-wrapper" style="position: relative; cursor: pointer;" onclick='viewImages(${JSON.stringify(images)})'>
            <img src="${images[0]}">
            ${overlay}
          </div>
        `;
      }

      const isGiven = tx.direction === "given";
      const colorClass = isGiven ? "given" : "received";
      
      let displayAmount = tx.visibleAmount;
      let typeLabel = "";
      if (tx.accountType === "kacha") {
        displayAmount = (tx.visibleAmount / 100).toFixed(2);
        typeLabel = `<span style="font-size:12px; background:#f0f0f0; padding:2px 6px; border-radius:8px; margin-left:8px;">কাঁচা</span>`;
      }

      // WhatsApp মেসেজ ফরম্যাট
      const waMessage = `*PayBook Ledger - ${partyData.name}*\n\nতারিখ: ${dateStr} (${timeStr})\nটাইপ: ${isGiven ? '↑ Given (প্রদেয়)' : '↓ Received (প্রাপ্য)'}\nপরিমাণ: ₹${displayAmount}\n${tx.note ? `নোট: ${tx.note}\n` : ''}\n_এই মেসেজটি PayBook অ্যাপ থেকে পাঠানো হয়েছে।_`;
      const waText = encodeURIComponent(waMessage);
      
      let waNumber = partyData.mobile;
      if (waNumber && !waNumber.startsWith('91')) waNumber = '91' + waNumber;

      const waBtn = `<button onclick="window.open('https://wa.me/${waNumber}?text=${waText}', '_blank')" style="background: transparent; border: none; font-size: 18px; cursor: pointer; margin-left: 8px;" title="Share">🟢</button>`;

      // ২৪ ঘণ্টার এডিট বাটন
      const hoursDiff = (new Date() - dateObj) / (1000 * 60 * 60);
      let editBtn = "";
      if (hoursDiff <= 24) {
        editBtn = `<button onclick="editTransaction('${txDoc.id}', '${tx.visibleAmount}', '${tx.accountType}')" style="background: transparent; border: none; font-size: 16px; cursor: pointer; margin-left: 5px;" title="Edit">✏️</button>`;
      } else {
        editBtn = `<button onclick="checkSubscriptionToEdit('${txDoc.id}')" style="background: transparent; border: none; font-size: 16px; cursor: pointer; margin-left: 5px; opacity: 0.5;" title="Locked">🔒</button>`;
      }

      // 🗑️ ডিলিট বাটন
      let deleteBtn = "";
      if (!tx.isDeleted) {
        deleteBtn = `<button onclick="deleteTransaction('${txDoc.id}')" style="background: transparent; border: none; font-size: 16px; cursor: pointer; margin-left: 5px;" title="Delete">🗑️</button>`;
      }

      // 👁️ এপ্রুভাল বাটন
      let approvalHtml = "";
      if (tx.isPending) {
        approvalHtml = `
          <div style="margin-top: 8px; display: flex; gap: 5px; width: 100%;">
            <button onclick="approveTransaction('${txDoc.id}')" style="flex: 1; background: var(--success); color: white; border: none; padding: 6px; border-radius: 6px; font-size: 12px; font-weight: bold;">👁️ Approve</button>
            <button onclick="rejectTransaction('${txDoc.id}')" style="flex: 1; background: var(--danger); color: white; border: none; padding: 6px; border-radius: 6px; font-size: 12px; font-weight: bold;">❌ Reject</button>
          </div>
        `;
      }

      const card = document.createElement("div");
      card.className = `timeline-item ${isGiven ? 'given-item' : 'received-item'}`;
      const isDeleted = tx.isDeleted ? "opacity: 0.5; text-decoration: line-through;" : "";

      card.innerHTML = `
        <div class="timeline-date"><span>${dateStr}</span></div>
        <div class="tx-card-inner" style="${isDeleted}">
          <div class="tx-card-header ${isGiven ? 'header-given' : 'header-received'}" style="flex-wrap: wrap;">
            
            <div style="display: flex; align-items: center; width: 100%; justify-content: space-between;">
              <div>
                <span class="tx-amount ${colorClass}">${isGiven ? '↑' : '↓'} ₹${displayAmount} ${typeLabel}</span>
                ${waBtn}
                ${editBtn}
                ${deleteBtn}
              </div>
              <span class="tx-time">${timeStr}</span>
            </div>
            ${approvalHtml}
          </div>
          ${imgHtml}
          ${tx.note ? `<div class="tx-note">${tx.note}</div>` : ''}
        </div>
      `;
      timeline.appendChild(card);
    });
    
    setTimeout(() => window.scrollTo(0, document.body.scrollHeight), 300);
  });
}

// ৪. ডিলিট ফাংশন
window.deleteTransaction = async function(txId) {
  if (!confirm("আপনি কি এই লেনদেনটি ডিলিট করতে চান? এটি হিসাব থেকে বাদ যাবে।")) return;
  try {
    // মূল ট্রানজেকশন আপডেট
    await updateDoc(doc(db, "transactions", txId), { isDeleted: true });
    
    // মিরর ট্রানজেকশন আপডেট
    const q = query(collection(db, "transactions"), where("originalTxId", "==", txId));
    const snap = await getDocs(q);
    snap.forEach(async (d) => {
      await updateDoc(doc(db, "transactions", d.id), { isDeleted: true });
    });
    alert("লেনদেন ডিলিট করা হয়েছে।");
  } catch (e) { alert("সমস্যা: " + e.message); }
};

// ৫. এপ্রুভ/রিজেক্ট
window.approveTransaction = async function(txId) {
  if(!confirm("এপ্রুভ করবেন?")) return;
  await updateDoc(doc(db, "transactions", txId), { isPending: false });
  const q = query(collection(db, "transactions"), where("originalTxId", "==", txId));
  const snap = await getDocs(q);
  snap.forEach(async (d) => { await updateDoc(doc(db, "transactions", d.id), { isPending: false }); });
  alert("এপ্রুভ হয়েছে!");
};

window.rejectTransaction = async function(txId) {
  if(!confirm("রিজেক্ট করবেন?")) return;
  await updateDoc(doc(db, "transactions", txId), { isDeleted: true, isPending: false });
  const q = query(collection(db, "transactions"), where("originalTxId", "==", txId));
  const snap = await getDocs(q);
  snap.forEach(async (d) => { await updateDoc(doc(db, "transactions", d.id), { isDeleted: true, isPending: false }); });
  alert("রিজেক্ট হয়েছে!");
};

// ৬. এডিট
window.editTransaction = async function(txId, currentAmount, accType) {
  const newAmount = prompt("নতুন অ্যামাউন্ট লিখুন (₹):", currentAmount);
  if (newAmount && !isNaN(newAmount)) {
    try {
      await updateDoc(doc(db, "transactions", txId), { visibleAmount: parseFloat(newAmount) });
      alert("এডিট সফল হয়েছে!");
    } catch (e) { alert("সমস্যা: " + e.message); }
  }
};

window.checkSubscriptionToEdit = async function(txId) {
  const userSnap = await getDoc(doc(db, "users", mobile));
  const user = userSnap.data();
  if (user.editSubValidUntil && new Date() < user.editSubValidUntil.toDate()) {
    window.editTransaction(txId);
  } else {
    alert("২৪ ঘণ্টা পার হয়ে গেছে। এডিট করতে সাবস্ক্রিপশন নিতে হবে।");
  }
};

// ৭. ইমেজ ভিউয়ার (আগের মতোই)
window.viewImages = function(imagesArray) {
  currentImages = imagesArray; 
  currentImageIndex = 0;
  document.getElementById('full-image').src = currentImages[0];
  document.getElementById('image-counter').innerText = `1 / ${currentImages.length}`;
  document.getElementById('image-viewer').style.display = 'flex';
};

let touchStartX = 0, touchEndX = 0;
const imgElement = document.getElementById('full-image');
imgElement.addEventListener('touchstart', e => { touchStartX = e.changedTouches[0].screenX; }, {passive: true});
imgElement.addEventListener('touchend', e => { touchEndX = e.changedTouches[0].screenX; handleSwipe(); }, {passive: true});
imgElement.addEventListener('mousedown', e => { touchStartX = e.screenX; });
imgElement.addEventListener('mouseup', e => { touchEndX = e.screenX; handleSwipe(); });

function handleSwipe() {
  if (currentImages.length <= 1) return;
  if (touchEndX < touchStartX - 50) {
    currentImageIndex = (currentImageIndex + 1) % currentImages.length;
  } else if (touchEndX > touchStartX + 50) {
    currentImageIndex = (currentImageIndex - 1 + currentImages.length) % currentImages.length;
  } else return;
  document.getElementById('full-image').src = currentImages[currentImageIndex];
  document.getElementById('image-counter').innerText = `${currentImageIndex + 1} / ${currentImages.length}`;
}

loadPartyDetails();
loadTransactions();
