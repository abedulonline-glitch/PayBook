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

// (প্রোফাইল ও এডিট মোডালের ফাংশনগুলো আগের মতোই থাকবে)
window.openProfileModal = function() { /* ... আগের কোড ... */ };
window.closeProfileModal = function() { document.getElementById("profile-modal").style.display = "none"; };
window.zoomProfileImage = function() { if (partyData.profilePic) window.viewImages([partyData.profilePic]); };
window.editPartyName = async function() { /* ... আগের কোড ... */ };

document.getElementById("avatar-upload").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  // ... আগের প্রোফাইল আপলোড লজিক ...
});

// ✅ রিয়েল-টাইম লেনদেন লোড (ছবি ঠিকমতো আসবে)
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
      
      // ব্যাকগ্রাউন্ড আপলোড লজিক বাদ দেওয়া হলো, এখন শুধু লিংক থাকলেই ছবি দেখাবে
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

      const card = document.createElement("div");
      card.className = `timeline-item ${isGiven ? 'given-item' : 'received-item'}`;
      
      const isDeleted = tx.isDeleted ? "opacity: 0.5; text-decoration: line-through;" : "";

      card.innerHTML = `
        <div class="timeline-date"><span>${dateStr}</span></div>
        <div class="tx-card-inner" style="${isDeleted}">
          <div class="tx-card-header ${isGiven ? 'header-given' : 'header-received'}">
            <span class="tx-amount ${colorClass}">${isGiven ? '↑' : '↓'} ₹${displayAmount} ${typeLabel}</span>
            <span class="tx-time">${timeStr} ${tx.isDeleted ? '(Deleted)' : ''}</span>
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
