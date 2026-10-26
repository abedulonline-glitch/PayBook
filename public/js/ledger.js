import { db } from "./firebase-init.js";
import { collection, query, where, getDocs, doc, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { IMGBB_API_KEY } from "./config.js";

const urlParams = new URLSearchParams(window.location.search);
const partyId = urlParams.get("partyId");
const partyNameParam = urlParams.get("name");
const mobile = localStorage.getItem("paybook_mobile");

if (!partyId || !mobile) window.location.href = "dashboard.html";
document.getElementById("party-name").innerText = partyNameParam;

let currentImages = [];
let currentImageIndex = 0;
let partyData = {}; // পার্টির সব ডেটা এখানে থাকবে

// ১. পার্টির ডিটেইলস লোড করা (নাম, নম্বর, ছবি)
async function loadPartyDetails() {
  try {
    const docSnap = await getDoc(doc(db, "parties", partyId));
    if (docSnap.exists()) {
      partyData = docSnap.data();
      
      // নাম ও টাইপ আপডেট
      document.getElementById("party-name").innerText = partyData.name;
      const type = partyData.partyType || "customer";
      document.getElementById("party-type-label").innerText = type === "customer" ? "Customer (কাস্টমার)" : "Supplier (সাপ্লায়ার)";
      
      // ছবি আপডেট (যদি থাকে)
      const initial = partyData.name.charAt(0).toUpperCase();
      if (partyData.profilePic) {
        document.getElementById("avatar-text").style.display = "none";
        const img = document.getElementById("avatar-img");
        img.src = partyData.profilePic;
        img.style.display = "block";
      } else {
        document.getElementById("avatar-text").innerText = initial;
      }
    }
  } catch (e) { console.log("Error loading party:", e); }
}

// ২. প্রোফাইল মোডাল ওপেন/ক্লোজ
window.openProfileModal = function() {
  // মোডালে ডেটা বসানো
  document.getElementById("modal-party-name").innerText = partyData.name;
  document.getElementById("modal-party-mobile").innerText = partyData.mobile;
  document.getElementById("modal-party-type").innerText = partyData.partyType === "supplier" ? "Supplier" : "Customer";
  
  const initial = partyData.name.charAt(0).toUpperCase();
  if (partyData.profilePic) {
    document.getElementById("modal-avatar-text").style.display = "none";
    const img = document.getElementById("modal-avatar-img");
    img.src = partyData.profilePic;
    img.style.display = "block";
  } else {
    document.getElementById("modal-avatar-text").innerText = initial;
    document.getElementById("modal-avatar-img").style.display = "none";
  }

  document.getElementById("profile-modal").style.display = "flex";
};

window.closeProfileModal = function() {
  document.getElementById("profile-modal").style.display = "none";
};

// ৩. প্রোফাইল ছবি জুম করা
window.zoomProfileImage = function() {
  if (partyData.profilePic) {
    window.viewImages([partyData.profilePic]);
  }
};

// ৪. নতুন প্রোফাইল ছবি আপলোড করা
document.getElementById("avatar-upload").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const btn = e.target.previousElementSibling;
  btn.innerText = "আপলোড হচ্ছে...";
  btn.disabled = true;

  try {
    const formData = new FormData();
    formData.append("image", file);
    const res = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, { method: "POST", body: formData });
    const data = await res.json();
    
    if (data.success) {
      const newUrl = data.data.url;
      // ফায়ারস্টোরে আপডেট
      await updateDoc(doc(db, "parties", partyId), { profilePic: newUrl });
      
      // লোকাল ভেরিয়েবল আপডেট
      partyData.profilePic = newUrl;
      
      // UI আপডেট
      document.getElementById("avatar-text").style.display = "none";
      document.getElementById("avatar-img").src = newUrl;
      document.getElementById("avatar-img").style.display = "block";
      
      document.getElementById("modal-avatar-text").style.display = "none";
      document.getElementById("modal-avatar-img").src = newUrl;
      document.getElementById("modal-avatar-img").style.display = "block";

      alert("প্রোফাইল ছবি আপডেট হয়েছে!");
    }
  } catch (err) {
    alert("ছবি আপলোডে সমস্যা: " + err.message);
  } finally {
    btn.innerText = "📷 প্রোফাইল ছবি পরিবর্তন করুন";
    btn.disabled = false;
  }
});

// ৫. লেনদেন লোড করা
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

// ইমেজ ভিউয়ার (জুম)
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

// স্লাইড ও জুম লজিক
let touchStartX = 0;
let touchEndX = 0;
const imgElement = document.getElementById('full-image');

imgElement.addEventListener('touchstart', e => { touchStartX = e.changedTouches[0].screenX; }, {passive: true});
imgElement.addEventListener('touchend', e => { touchEndX = e.changedTouches[0].screenX; handleSwipe(); }, {passive: true});
imgElement.addEventListener('mousedown', e => { touchStartX = e.screenX; });
imgElement.addEventListener('mouseup', e => { touchEndX = e.screenX; handleSwipe(); });

function handleSwipe() {
  if (currentImages.length <= 1) return;
  const swipeThreshold = 50;
  if (touchEndX < touchStartX - swipeThreshold) {
    currentImageIndex = (currentImageIndex + 1) % currentImages.length;
    updateImageViewer();
  } else if (touchEndX > touchStartX + swipeThreshold) {
    currentImageIndex = (currentImageIndex - 1 + currentImages.length) % currentImages.length;
    updateImageViewer();
  }
}

loadPartyDetails();
loadTransactions();
