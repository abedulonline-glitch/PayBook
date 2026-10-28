import { db } from "./firebase-init.js";
import { collection, query, where, onSnapshot, doc, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { IMGBB_API_KEY } from "./config.js";

const urlParams = new URLSearchParams(window.location.search);
const partyId = urlParams.get("partyId");
const mobile = localStorage.getItem("paybook_mobile");

if (!partyId || !mobile) window.location.href = "dashboard.html";

let isPanicActive = sessionStorage.getItem("panic_unlock_until") && Date.now() < parseInt(sessionStorage.getItem("panic_unlock_until"));
let currentImages = [];
let currentImageIndex = 0;
let partyData = {};

// পার্টির ডিটেইলস
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

// ✅ রিয়েল-টাইম লেনদেন লোড
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

  // ✅ WhatsApp আইকন (শুধু আইকন)
  const waText = encodeURIComponent(`PayBook Ledger:\n${partyData.name}\nAmount: ₹${displayAmount}\nType: ${isGiven ? 'Given' : 'Received'}\nDate: ${dateStr}`);
  const waBtn = `<button onclick="window.open('https://wa.me/${partyData.mobile}?text=${waText}', '_blank')" style="background: transparent; border: none; font-size: 16px; cursor: pointer; margin-left: 8px;" title="Share on WhatsApp">🟢</button>`;

  // ✅ এডিট বাটন (২৪ ঘণ্টার ফ্রি লজিক)
  const hoursDiff = (new Date() - dateObj) / (1000 * 60 * 60);
  let editBtn = "";
  if (hoursDiff <= 24) {
    editBtn = `<button onclick="editTransaction('${txDoc.id}', '${tx.visibleAmount}', '${tx.accountType}')" style="background: transparent; border: none; font-size: 16px; cursor: pointer; margin-left: 5px;" title="Edit">✏️</button>`;
  } else {
    editBtn = `<button onclick="checkSubscriptionToEdit('${txDoc.id}')" style="background: transparent; border: none; font-size: 16px; cursor: pointer; margin-left: 5px; opacity: 0.5;" title="Locked (Requires Subscription)">🔒</button>`;
  }

  // 👁️ এপ্রুভাল আইকন
  let approvalHtml = "";
  if (tx.isPending) {
    approvalHtml = `
      <button onclick="approveTransaction('${txDoc.id}')" style="background: var(--success); color: white; border: none; padding: 4px 8px; border-radius: 4px; font-size: 12px; margin-left: 5px;">👁️ Approve</button>
      <button onclick="rejectTransaction('${txDoc.id}')" style="background: var(--danger); color: white; border: none; padding: 4px 8px; border-radius: 4px; font-size: 12px; margin-left: 5px;">❌ Reject</button>
    `;
  }

  const card = document.createElement("div");
  card.className = `timeline-item ${isGiven ? 'given-item' : 'received-item'}`;
  const isDeleted = tx.isDeleted ? "opacity: 0.5; text-decoration: line-through;" : "";

  card.innerHTML = `
    <div class="timeline-date"><span>${dateStr}</span></div>
    <div class="tx-card-inner" style="${isDeleted}">
      <div class="tx-card-header ${isGiven ? 'header-given' : 'header-received'}" style="flex-wrap: wrap;">
        
        <div style="display: flex; align-items: center;">
          <span class="tx-amount ${colorClass}">${isGiven ? '↑' : '↓'} ₹${displayAmount} ${typeLabel}</span>
          ${waBtn}
          ${editBtn}
        </div>
        
        <div style="display: flex; flex-direction: column; align-items: flex-end;">
           <span class="tx-time">${timeStr}</span>
           ${approvalHtml}
        </div>

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

// এপ্রুভ ও রিজেক্ট লজিক
window.approveTransaction = async function(txId, partyId) {
  if(!confirm("আপনি কি এই লেনদেনটি এপ্রুভ করতে চান?")) return;
  await updateDoc(doc(db, "transactions", txId), { isPending: false });
  // মিরর আপডেট করতে হবে
  const q = query(collection(db, "transactions"), where("originalTxId", "==", txId));
  const snap = await getDocs(q);
  snap.forEach(async (d) => {
    await updateDoc(doc(db, "transactions", d.id), { isPending: false });
  });
  alert("লেনদেন এপ্রুভ করা হয়েছে!");
};

window.rejectTransaction = async function(txId) {
  if(!confirm("আপনি কি এই লেনদেনটি রিজেক্ট করতে চান?")) return;
  await updateDoc(doc(db, "transactions", txId), { isDeleted: true, isPending: false });
  // মিরর আপডেট
  const q = query(collection(db, "transactions"), where("originalTxId", "==", txId));
  const snap = await getDocs(q);
  snap.forEach(async (d) => {
    await updateDoc(doc(db, "transactions", d.id), { isDeleted: true, isPending: false });
  });
  alert("লেনদেন রিজেক্ট করা হয়েছে!");
};

// ইমেজ ভিউয়ার
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

window.editTransaction = async function(txId, currentAmount, accType) {
  const newAmount = prompt("নতুন অ্যামাউন্ট লিখুন (₹):", currentAmount);
  if (newAmount && !isNaN(newAmount)) {
    try {
      await updateDoc(doc(db, "transactions", txId), { visibleAmount: parseFloat(newAmount) });
      alert("এডিট সফল হয়েছে!");
    } catch (e) { alert("সমস্যা: " + e.message); }
  }
};

// সাবস্ক্রিপশন চেক করে এডিট
window.checkSubscriptionToEdit = async function(txId) {
  const userSnap = await getDoc(doc(db, "users", mobile));
  const user = userSnap.data();
  if (user.editSubValidUntil && new Date() < user.editSubValidUntil.toDate()) {
    window.editTransaction(txId); // সাবস্ক্রিপশন আছে, এডিট করতে দাও
  } else {
    alert("২৪ ঘণ্টা পার হয়ে গেছে। এডিট করতে সাবস্ক্রিপশন নিতে হবে। (ওয়ালেট মেনু থেকে রিচার্জ করুন)");
  }
};

// এপ্রুভ/রিজেক্ট (আগের মতো)
window.approveTransaction = async function(txId) {
  if(!confirm("এপ্রুভ করবেন?")) return;
  await updateDoc(doc(db, "transactions", txId), { isPending: false });
  alert("এপ্রুভ হয়েছে!");
};

window.rejectTransaction = async function(txId) {
  if(!confirm("রিজেক্ট করবেন?")) return;
  await updateDoc(doc(db, "transactions", txId), { isDeleted: true, isPending: false });
  alert("রিজেক্ট হয়েছে!");
};
