import { db } from "./firebase-init.js";
import { collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const urlParams = new URLSearchParams(window.location.search);
const partyId = urlParams.get("partyId");
const partyName = urlParams.get("name");
const mobile = localStorage.getItem("paybook_mobile");

if (!partyId || !mobile) window.location.href = "dashboard.html";
document.getElementById("party-name").innerText = partyName;

let currentImages = [];
let currentImageIndex = 0;

async function loadTransactions() {
  const txRef = collection(db, "transactions");
  const q = query(txRef, where("ownerMobile", "==", mobile), where("partyId", "==", partyId));
  
  try {
    const snapshot = await getDocs(q);
    const timeline = document.getElementById("timeline-container");
    
    if (snapshot.empty) {
      timeline.innerHTML = "<p style='text-align:center; color:#999; margin-top:50px;'>এখনো কোনো লেনদেন নেই</p>";
      return;
    }
    
    timeline.innerHTML = "";
    const docs = snapshot.docs.sort((a, b) => a.data().date.toDate() - b.data().date.toDate());

    docs.forEach((txDoc) => {
      const tx = txDoc.data();
      const dateObj = new Date(tx.date.toDate());
      const timeStr = dateObj.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
      const dateStr = dateObj.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
      
      let images = tx.imageUrls || (tx.imageUrl ? [tx.imageUrl] : []);
      let imgHtml = "";

      if (images.length > 0) {
        let overlay = images.length > 1 
          ? `<div style="position: absolute; bottom: 8px; right: 8px; background: rgba(0,0,0,0.7); color: white; padding: 4px 10px; border-radius: 12px; font-size: 13px; font-weight: bold;">+${images.length - 1}</div>` : "";
        
        imgHtml = `
          <div class="tx-img-wrapper" style="position: relative; cursor: pointer;" onclick='viewImages(${JSON.stringify(images)})'>
            <img src="${images[0]}" alt="Proof">
            ${overlay}
          </div>
        `;
      }

      const isGiven = tx.direction === "given";
      const colorClass = isGiven ? "given" : "received";

      const card = document.createElement("div");
      card.className = `timeline-item ${isGiven ? 'given-item' : 'received-item'}`;
      
      card.innerHTML = `
        <div class="timeline-date"><span>${dateStr}</span></div>
        <div class="tx-card-inner">
          <div class="tx-card-header ${isGiven ? 'header-given' : 'header-received'}">
            <span class="tx-amount ${colorClass}">${isGiven ? '↑' : '↓'} ₹${tx.visibleAmount}</span>
            <span class="tx-time">${timeStr}</span>
          </div>
          ${imgHtml}
          ${tx.note ? `<div class="tx-note">${tx.note}</div>` : ''}
        </div>
      `;
      timeline.appendChild(card);
    });

    setTimeout(() => window.scrollTo(0, document.body.scrollHeight), 300);

  } catch (err) {
    alert("লেনদেন লোড করতে সমস্যা: " + err.message);
  }
}

// ইমেজ ভিউয়ার ওপেন
window.viewImages = function(imagesArray) {
  currentImages = imagesArray;
  currentImageIndex = 0;
  updateImageViewer();
  document.getElementById('image-viewer').style.display = 'flex';
};

function updateImageViewer() {
  document.getElementById('full-image').src = currentImages[currentImageIndex];
  document.getElementById('image-counter').innerText = `${currentImageIndex + 1} / ${currentImages.length}`;
}

// মোবাইল স্লাইড (Touch) লজিক
let touchStartX = 0;
let touchEndX = 0;
const imgElement = document.getElementById('full-image');

imgElement.addEventListener('touchstart', e => {
  touchStartX = e.changedTouches[0].screenX;
}, {passive: true});

imgElement.addEventListener('touchend', e => {
  touchEndX = e.changedTouches[0].screenX;
  handleSwipe();
}, {passive: true});

// ল্যাপটপে মাউস ড্র্যাগ লজিক
imgElement.addEventListener('mousedown', e => { touchStartX = e.screenX; });
imgElement.addEventListener('mouseup', e => {
  touchEndX = e.screenX;
  handleSwipe();
});

function handleSwipe() {
  if (currentImages.length <= 1) return;
  const swipeThreshold = 50; // ৫০ পিক্সেল স্লাইড করলেই কাজ করবে
  
  if (touchEndX < touchStartX - swipeThreshold) {
    // বাম দিকে স্লাইড (পরের ছবি)
    currentImageIndex = (currentImageIndex + 1) % currentImages.length;
    updateImageViewer();
  } else if (touchEndX > touchStartX + swipeThreshold) {
    // ডান দিকে স্লাইড (আগের ছবি)
    currentImageIndex = (currentImageIndex - 1 + currentImages.length) % currentImages.length;
    updateImageViewer();
  }
}

loadTransactions();
