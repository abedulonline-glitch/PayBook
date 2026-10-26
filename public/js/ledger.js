import { db } from "./firebase-init.js";
import { collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const urlParams = new URLSearchParams(window.location.search);
const partyId = urlParams.get("partyId");
const partyName = urlParams.get("name");
const mobile = localStorage.getItem("paybook_mobile");

if (!partyId || !mobile) window.location.href = "dashboard.html";
document.getElementById("party-name").innerText = partyName;

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
      
      // পুরনো ডেটার জন্য (imageUrl) এবং নতুন ডেটার জন্য (imageUrls) হ্যান্ডেল করা
      let imgHtml = "";
      let images = tx.imageUrls || (tx.imageUrl ? [tx.imageUrl] : []);

      if (images.length > 0) {
        let overlay = "";
        if (images.length > 1) {
          overlay = `<div style="position: absolute; bottom: 8px; right: 8px; background: rgba(0,0,0,0.6); color: white; padding: 2px 8px; border-radius: 12px; font-size: 12px; font-weight: bold;">+${images.length - 1}</div>`;
        }
        imgHtml = `
          <div class="tx-img-wrapper" style="position: relative;" onclick="viewImages('${images.join(',')}')">
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

// ফুল স্ক্রিনে ছবি দেখার ফাংশন
window.viewImages = function(urlsString) {
  const urls = urlsString.split(',');
  const viewer = document.getElementById('image-viewer');
  const fullImage = document.getElementById('full-image');
  
  // আপাতত প্রথম ছবিটি দেখাবে (ভবিষ্যতে এখানে স্লাইডার করা যাবে)
  fullImage.src = urls[0];
  viewer.style.display = 'flex';
};

loadTransactions();
