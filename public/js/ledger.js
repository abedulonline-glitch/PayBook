import { db } from "./firebase-init.js";
import { collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const urlParams = new URLSearchParams(window.location.search);
const partyId = urlParams.get("partyId");
const partyName = urlParams.get("name");
const mobile = localStorage.getItem("paybook_mobile");

if (!partyId || !mobile) window.location.href = "dashboard.html";
document.getElementById("party-name").innerText = partyName;

// গ্লোবাল ভিউয়ার ভেরিয়েবল
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
      
      // পুরনো ও নতুন ডেটা দুটোই হ্যান্ডেল করা
      let images = tx.imageUrls || (tx.imageUrl ? [tx.imageUrl] : []);
      let imgHtml = "";

      if (images.length > 0) {
        let overlay = images.length > 1 
          ? `<div style="position: absolute; bottom: 8px; right: 8px; background: rgba(0,0,0,0.7); color: white; padding: 4px 10px; border-radius: 12px; font-size: 13px; font-weight: bold;">+${images.length - 1}</div>` 
          : "";
        
        // ছবিতে ক্লিক করলে viewImages ফাংশনটি কল হবে
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

// ফুল স্ক্রিন ইমেজ ভিউয়ার ওপেন করা
window.viewImages = function(imagesArray) {
  currentImages = imagesArray;
  currentImageIndex = 0;
  
  const viewer = document.getElementById('image-viewer');
  const fullImage = document.getElementById('full-image');
  const counter = document.getElementById('image-counter');
  
  fullImage.src = currentImages[0];
  counter.innerText = `1 / ${currentImages.length}`;
  viewer.style.display = 'flex';
};

// ডান-বাম নেভিগেশন (স্লাইডার)
window.nextImage = function(e) {
  e.stopPropagation();
  if (currentImages.length <= 1) return;
  currentImageIndex = (currentImageIndex + 1) % currentImages.length;
  document.getElementById('full-image').src = currentImages[currentImageIndex];
  document.getElementById('image-counter').innerText = `${currentImageIndex + 1} / ${currentImages.length}`;
};

window.prevImage = function(e) {
  e.stopPropagation();
  if (currentImages.length <= 1) return;
  currentImageIndex = (currentImageIndex - 1 + currentImages.length) % currentImages.length;
  document.getElementById('full-image').src = currentImages[currentImageIndex];
  document.getElementById('image-counter').innerText = `${currentImageIndex + 1} / ${currentImages.length}`;
};

loadTransactions();
