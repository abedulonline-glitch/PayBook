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
let userHasSubscription = false;

// ✅ টেবিল সোজা করার ফাংশন
function padSpace(text, length, alignRight = true) {
  text = String(text);
  let spaces = length - text.length;
  if (spaces < 0) spaces = 0;
  let pad = " ".repeat(spaces);
  return alignRight ? pad + text : text + pad;
}

// ✅ WhatsApp নাম্বার ফরম্যাট
function formatWhatsAppNumber(number) {
  if (!number) return "";
  let cleanNumber = String(number).replace(/\D/g, '');
  if (cleanNumber.length === 10) cleanNumber = '91' + cleanNumber;
  return cleanNumber;
}

// ... (আগের ইমপোর্ট এবং ভেরিয়েবলগুলো একই থাকবে) ...
let userSalt = "";

// ... (checkSubscription ফাংশনের নিচে userSalt লোড করার ব্যবস্থা করুন) ...
async function checkSubscription() {
  const userSnap = await getDoc(doc(db, "users", mobile));
  if (userSnap.exists()) {
    const user = userSnap.data();
    userSalt = user.salt;
    if (user.editSubValidUntil && new Date() < user.editSubValidUntil.toDate()) {
      userHasSubscription = true;
    }
  }
}

// ... (loadTransactions ফাংশনের ভেতরে WhatsApp বাটনের লজিক পরিবর্তন করুন) ...
      // ✅ WhatsApp বাটন (প্যানিক পিন চেকসহ)
      let waBtn = "";
      if (waNumber) {
        waBtn = `<button onclick="shareToWhatsApp('${waNumber}', \`${waText}\`)" style="background: #E8F5E9; border: none; font-size: 16px; cursor: pointer; padding: 6px 10px; border-radius: 8px;" title="Share">🟢</button>`;
      }

// ... (লেজার ফাইলের শেষে এই ফাংশনটি যোগ করুন) ...
window.shareToWhatsApp = async function(waNumber, waMessage) {
  // যদি প্যানিক মোডে থাকে, তবে পিন চাইবে
  if (isPanicActive) {
    let pin = prompt("শেয়ার করতে প্যানিক পিন দিন:");
    if (!pin) return;
    
    try {
      const enc = new TextEncoder();
      const keyMaterial = await crypto.subtle.importKey("raw", enc.encode(pin), "PBKDF2", false, ["deriveBits"]);
      const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt: enc.encode(userSalt), iterations: 100000, hash: "SHA-256" }, keyMaterial, 256);
      const hash = btoa(String.fromCharCode(...new Uint8Array(bits)));
      
      const userSnap = await getDoc(doc(db, "users", mobile));
      if (hash !== userSnap.data().panicPinHash) return alert("ভুল প্যানিক পিন!");
    } catch(e) { return alert(e.message); }
  }
  
  // পিন সঠিক হলে WhatsApp ওপেন হবে
  window.open(`https://wa.me/${waNumber}?text=${waMessage}`, '_blank');
};
// ১. পার্টির ডিটেইলস লোড
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

// ২. প্রোফাইল মোডাল ওপেন
window.openProfileModal = function() {
  document.getElementById("modal-party-name").innerText = partyData.name + " ✏️";
  document.getElementById("modal-party-mobile").innerText = partyData.mobile;
  document.getElementById("modal-party-type").innerText = partyData.partyType === "supplier" ? "Supplier" : "Customer";
  
  const initial = partyData.name.charAt(0).toUpperCase();
  if (partyData.profilePic) {
    document.getElementById("modal-avatar-text").style.display = "none";
    document.getElementById("modal-avatar-img").src = partyData.profilePic;
    document.getElementById("modal-avatar-img").style.display = "block";
  } else {
    document.getElementById("modal-avatar-text").innerText = initial;
    document.getElementById("modal-avatar-img").style.display = "none";
  }
  document.getElementById("profile-modal").style.display = "flex";
};

window.closeProfileModal = function() { document.getElementById("profile-modal").style.display = "none"; };
window.zoomProfileImage = function() { if (partyData.profilePic) window.viewImages([partyData.profilePic]); };

// ৩. নাম এডিট করার ফাংশন
window.editPartyName = async function() {
  const newName = prompt("পার্টির নতুন নাম লিখুন:", partyData.name);
  if (newName && newName.trim() !== "" && newName !== partyData.name) {
    try {
      await updateDoc(doc(db, "parties", partyId), { name: newName.trim() });
      partyData.name = newName.trim();
      
      document.getElementById("party-name").innerText = partyData.name;
      document.getElementById("modal-party-name").innerText = partyData.name + " ✏️";
      
      const initial = partyData.name.charAt(0).toUpperCase();
      if (!partyData.profilePic) {
        document.getElementById("avatar-text").innerText = initial;
        document.getElementById("modal-avatar-text").innerText = initial;
      }
      alert("নাম আপডেট হয়েছে!");
    } catch (e) { alert("সমস্যা: " + e.message); }
  }
};

// ৪. ফোন নম্বর এডিট করার ফাংশন
window.editPartyPhone = async function() {
  const newMobile = prompt("পার্টির নতুন মোবাইল নম্বর লিখুন (১০ ডিজিট):", partyData.mobile);
  if (newMobile && /^[0-9]{10}$/.test(newMobile.trim()) && newMobile !== partyData.mobile) {
    try {
      await updateDoc(doc(db, "parties", partyId), { mobile: newMobile.trim() });
      partyData.mobile = newMobile.trim();
      document.getElementById("modal-party-mobile").innerText = partyData.mobile;
      alert("মোবাইল নম্বর আপডেট হয়েছে!");
    } catch (e) { alert("সমস্যা: " + e.message); }
  } else if (newMobile) {
    alert("সঠিক ১০ ডিজিটের মোবাইল নম্বর দিন!");
  }
};

// ৫. প্রোফাইল ছবি আপলোড
document.getElementById("avatar-upload").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const btn = e.target.previousElementSibling;
  btn.innerText = "আপলোড হচ্ছে...";
  try {
    const formData = new FormData(); formData.append("image", file);
    const res = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, { method: "POST", body: formData });
    const data = await res.json();
    if (data.success) {
      await updateDoc(doc(db, "parties", partyId), { profilePic: data.data.url });
      partyData.profilePic = data.data.url;
      document.getElementById("avatar-img").src = data.data.url; document.getElementById("avatar-img").style.display = "block"; document.getElementById("avatar-text").style.display = "none";
      document.getElementById("modal-avatar-img").src = data.data.url; document.getElementById("modal-avatar-img").style.display = "block"; document.getElementById("modal-avatar-text").style.display = "none";
    }
  } catch (err) { alert("ছবি আপলোডে সমস্যা: " + err.message); } finally { btn.innerText = "📷 প্রোফাইল ছবি পরিবর্তন করুন"; }
});

// ৬. রিয়েল-টাইম লেনদেন লোড (সব লজিক ঠিক আছে)
async function loadTransactions() {
  await checkSubscription();
  
  const txRef = collection(db, "transactions");
  const q = query(txRef, where("ownerMobile", "==", mobile), where("partyId", "==", partyId));
  
  onSnapshot(q, (snapshot) => {
    const timeline = document.getElementById("timeline-container");
    
    if (snapshot.empty) {
      timeline.innerHTML = "<p style='text-align:center; color:#999; margin-top:50px;'>এখনো কোনো লেনদেন নেই</p>";
      return;
    }
    
    timeline.innerHTML = "";

    const uniqueDocs = [];
    const seenIds = new Set();
    snapshot.docs.forEach(d => {
      const data = d.data();
      const uniqueId = data.originalTxId || d.id; 
      if (!seenIds.has(uniqueId)) {
        seenIds.add(uniqueId);
        uniqueDocs.push(d);
      }
    });

    const sortedAsc = uniqueDocs.sort((a, b) => a.data().date.toDate() - b.data().date.toDate());

    let runningBalance = 0;
    let waTable = "";

    const processedDocs = sortedAsc.map(tDoc => {
      const tx = tDoc.data();
      let amt = tx.visibleAmount;
      if (tx.accountType === "kacha") amt = amt / 100;

      const isG = tx.direction === "given";
      if (!tx.isDeleted && tx.status !== "rejected") {
        if (isG) runningBalance -= amt;
        else runningBalance += amt;
      }

      const dObj = tx.date.toDate();
      const dStr = dObj.toLocaleDateString('en-GB', { timeZone: 'Asia/Kolkata', day: '2-digit', month: '2-digit', year: '2-digit' });
      
      let givenStr = isG ? amt.toString() : "0";
      let recvStr = !isG ? amt.toString() : "0";
      let balStr = runningBalance.toString();

      if (tx.isDeleted) {
        givenStr = isG ? "X" : "0";
        recvStr = !isG ? "X" : "0";
      }

      if (isPanicActive || tx.accountType === "paka") {
        waTable += `${padSpace(dStr, 9)} | ${padSpace(givenStr, 7)} | ${padSpace(recvStr, 7)} | ${padSpace(balStr, 7)}\n`;
      }

      return { doc: tDoc, runningBalance, amt, isDeleted: tx.isDeleted };
    });

    const displayDocs = processedDocs.reverse();
    const netBalanceText = runningBalance > 0 ? `₹${runningBalance.toFixed(2)} (You Get)` : `₹${Math.abs(runningBalance).toFixed(2)} (You Give)`;

    displayDocs.forEach((item) => {
      const txDoc = item.doc;
      const tx = txDoc.data();
      
      const dateObj = tx.date.toDate();
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
      let displayAmount = item.amt;
      let typeLabel = tx.accountType === "kacha" ? `<span style="font-size:12px; background:#f0f0f0; padding:2px 6px; border-radius:8px; margin-left:8px;">কাঁচা</span>` : "";

      const waMessage = `*PayBook Ledger - ${partyData.name}*\n\nDate      | Given   | Recv    | Bal    \n-------------------------------------\n${waTable}-------------------------------------\n*Total Balance: ${netBalanceText}*`;
      const waText = encodeURIComponent(waMessage);
      let waNumber = formatWhatsAppNumber(partyData.mobile);
      
      const isPending = tx.status === "pending" || tx.isPending === true;
      const isApproved = tx.status === "approved";
      const isRejected = tx.status === "rejected";
      const isCreator = !tx.originalTxId; 
      
      let statusIcon = "";
      if (isApproved) statusIcon = `<span style="color: green; font-weight: bold; font-size: 16px;" title="Approved">✓✓</span>`;
      else if (isRejected) statusIcon = `<span style="color: red; font-weight: bold; font-size: 16px;" title="${tx.rejectReason}">❌</span>`;
      else if (isPending) statusIcon = `<span style="color: orange; font-weight: bold; font-size: 16px;" title="Pending">⏳</span>`;

      let actionBtns = "";
      
      if (waNumber) {
        actionBtns += `<button onclick="window.open('https://wa.me/${waNumber}?text=${waText}', '_blank')" style="background: #E8F5E9; border: none; font-size: 16px; cursor: pointer; padding: 6px 10px; border-radius: 8px;" title="Share">🟢</button>`;
      }

      if (isCreator) {
        if (isRejected) {
          actionBtns += `<button onclick="editTransaction('${txDoc.id}', '${tx.visibleAmount}')" style="background: #FFF3E0; border: none; font-size: 16px; cursor: pointer; padding: 6px 10px; border-radius: 8px;" title="Edit">✏️</button>`;
        }
        if (!tx.isDeleted && !isPending) {
          actionBtns += `<button onclick="deleteTransaction('${txDoc.id}')" style="background: #FFEBEE; border: none; font-size: 16px; cursor: pointer; padding: 6px 10px; border-radius: 8px;" title="Delete">🗑️</button>`;
        }
      }

      if (!isCreator && isPending) {
        if (userHasSubscription) {
          actionBtns += `<button onclick="openReviewModal('${txDoc.id}')" style="background: #E3F2FD; border: none; font-size: 16px; cursor: pointer; padding: 6px 10px; border-radius: 8px;" title="Review">👁️</button>`;
        } else {
          actionBtns += `<span style="font-size: 11px; color: #d32f2f; font-weight: bold;">রিভিউ (সাবস্ক্রিপশন)</span>`;
        }
      }

      const card = document.createElement("div");
      card.className = `timeline-item ${isGiven ? 'given-item' : 'received-item'}`;
      const isDeleted = tx.isDeleted ? "opacity: 0.5; text-decoration: line-through;" : "";

      card.innerHTML = `
        <div class="timeline-date"><span>${dateStr}</span></div>
        <div class="tx-card-inner" style="${isDeleted}">
          
          <div class="tx-card-header ${isGiven ? 'header-given' : 'header-received'}" style="display: flex; justify-content: space-between; align-items: flex-start; padding: 12px 16px;">
            
            <div style="display: flex; flex-direction: column; align-items: flex-start; gap: 4px;">
              <div style="display: flex; align-items: center;">
                <span class="tx-amount ${colorClass}" style="font-size: 20px; font-weight: 700;">${isGiven ? '↑' : '↓'} ₹${displayAmount}</span>
                ${typeLabel}
                <span style="margin-left: 8px;">${statusIcon}</span>
              </div>
              
              <div style="display: flex; gap: 8px; margin-top: 4px;">
                ${actionBtns}
              </div>
            </div>

            <span class="tx-time" style="font-size: 12px; color: #777;">${timeStr}</span>
          </div>

          ${isRejected ? `<div style="width:100%; font-size:12px; color:#d32f2f; padding: 8px 16px; background:#FFEBEE; border-top: 1px solid #ffcdd2;">কারণ: ${tx.rejectReason}</div>` : ''}
          
          ${imgHtml}
          ${tx.note ? `<div class="tx-note">${tx.note}</div>` : ''}
        </div>
      `;
      timeline.appendChild(card);
    });
    
    setTimeout(() => window.scrollTo(0, document.body.scrollHeight), 300);
  });
}

// ✅ ডাইনামিক রিভিউ মোডাল
function createReviewModal() {
  if (document.getElementById('review-modal')) return;
  const modalHtml = `
    <div id="review-modal" style="display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.6); z-index: 10000; justify-content: center; align-items: center;">
      <div style="background: #fff; width: 90%; max-width: 350px; border-radius: 16px; padding: 24px; text-align: center;">
        <h3 style="margin-bottom: 16px; color: #333;">লেনদেন রিভিউ</h3>
        <p style="margin-bottom: 20px; font-size: 14px; color: #666;">আপনি কি এই লেনদেনটি সঠিক মনে করছেন?</p>
        <div style="display: flex; gap: 10px; margin-bottom: 16px;">
          <button onclick="approveTransaction(window.currentReviewTxId)" style="flex: 1; background: var(--success); color: white; border: none; padding: 12px; border-radius: 8px; font-weight: bold;">✓ Approve</button>
          <button onclick="document.getElementById('reject-section').style.display='block'" style="flex: 1; background: var(--danger); color: white; border: none; padding: 12px; border-radius: 8px; font-weight: bold;">✕ Reject</button>
        </div>
        <div id="reject-section" style="display: none; text-align: left;">
          <label style="font-size: 12px; font-weight: bold;">রিজেক্টের কারণ:</label>
          <select id="reject-reason-dropdown" onchange="checkRejectReason()" style="width: 100%; padding: 10px; margin: 8px 0; border: 1px solid #ddd; border-radius: 8px;">
            <option value="">কারণ সিলেক্ট করুন</option>
            <option value="টাকার পরিমাণ ভুল">টাকার পরিমাণ ভুল</option>
            <option value="তারিখ ভুল">তারিখ ভুল</option>
            <option value="আমি এই লেনদেন করিনি">আমি এই লেনদেন করিনি</option>
            <option value="custom">অন্যান্য (নিজে লিখুন)</option>
          </select>
          <input type="text" id="custom-reason-input" placeholder="কারণ লিখুন..." style="display: none; width: 100%; padding: 10px; margin-bottom: 10px; border: 1px solid #ddd; border-radius: 8px;">
          <button id="confirm-reject-btn" onclick="rejectTransaction(window.currentReviewTxId)" disabled style="width: 100%; background: #ccc; color: white; border: none; padding: 12px; border-radius: 8px; font-weight: bold;">রিজেক্ট নিশ্চিত করুন</button>
        </div>
        <button onclick="document.getElementById('review-modal').style.display='none'" style="background: transparent; border: none; color: #666; margin-top: 16px;">বাতিল</button>
      </div>
    </div>
  `;
  document.body.insertAdjacentHTML('beforeend', modalHtml);
}

window.openReviewModal = function(txId) {
  window.currentReviewTxId = txId;
  document.getElementById('reject-section').style.display = 'none';
  document.getElementById('reject-reason-dropdown').value = "";
  document.getElementById('custom-reason-input').value = "";
  document.getElementById('custom-reason-input').style.display = 'none';
  document.getElementById('confirm-reject-btn').disabled = true;
  document.getElementById('confirm-reject-btn').style.background = "#ccc";
  document.getElementById('review-modal').style.display = 'flex';
};

window.checkRejectReason = function() {
  const drop = document.getElementById('reject-reason-dropdown').value;
  const customInput = document.getElementById('custom-reason-input');
  const btn = document.getElementById('confirm-reject-btn');

  if (drop === "custom") {
    customInput.style.display = 'block';
    btn.disabled = true;
    btn.style.background = "#ccc";
  } else if (drop !== "") {
    customInput.style.display = 'none';
    btn.disabled = false;
    btn.style.background = "var(--danger)";
  } else {
    customInput.style.display = 'none';
    btn.disabled = true;
    btn.style.background = "#ccc";
  }
};

window.approveTransaction = async function(txId) {
  try {
    await updateDoc(doc(db, "transactions", txId), { status: "approved" });
    const q = query(collection(db, "transactions"), where("originalTxId", "==", txId));
    const snap = await getDocs(q);
    snap.forEach(async (d) => { await updateDoc(doc(db, "transactions", d.id), { status: "approved" }); });
    document.getElementById('review-modal').style.display = 'none';
    alert("লেনদেন এপ্রুভ করা হয়েছে!");
  } catch (e) { alert("সমস্যা: " + e.message); }
};

window.rejectTransaction = async function(txId) {
  let reason = document.getElementById('reject-reason-dropdown').value;
  if (reason === "custom") reason = document.getElementById('custom-reason-input').value;
  if (!reason) return alert("কারণ লিখুন");

  try {
    await updateDoc(doc(db, "transactions", txId), { status: "rejected", rejectReason: reason });
    const q = query(collection(db, "transactions"), where("originalTxId", "==", txId));
    const snap = await getDocs(q);
    snap.forEach(async (d) => { await updateDoc(doc(db, "transactions", d.id), { status: "rejected", rejectReason: reason }); });
    document.getElementById('review-modal').style.display = 'none';
    alert("লেনদেন রিজেক্ট করা হয়েছে।");
  } catch (e) { alert("সমস্যা: " + e.message); }
};

window.deleteTransaction = async function(txId) {
  if (!confirm("আপনি কি এই লেনদেনটি ডিলিট করতে চান? এটি হিসাব থেকে বাদ যাবে।")) return;
  try {
    await updateDoc(doc(db, "transactions", txId), { isDeleted: true });
    const q = query(collection(db, "transactions"), where("originalTxId", "==", txId));
    const snap = await getDocs(q);
    snap.forEach(async (d) => { await updateDoc(doc(db, "transactions", d.id), { isDeleted: true }); });
    alert("লেনদেন ডিলিট করা হয়েছে।");
  } catch (e) { alert("সমস্যা: " + e.message); }
};

window.editTransaction = async function(txId, currentAmount) {
  const newAmount = prompt("নতুন অ্যামাউন্ট লিখুন (₹):", currentAmount);
  if (newAmount && !isNaN(newAmount)) {
    try {
      await updateDoc(doc(db, "transactions", txId), { 
        visibleAmount: parseFloat(newAmount),
        status: "pending", 
        rejectReason: "" 
      });
      alert("এডিট সফল হয়েছে! B আবার রিভিউ করবে।");
    } catch (e) { alert("সমস্যা: " + e.message); }
  }
};

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
  if (touchEndX < touchStartX - 50) currentImageIndex = (currentImageIndex + 1) % currentImages.length;
  else if (touchEndX > touchStartX + 50) currentImageIndex = (currentImageIndex - 1 + currentImages.length) % currentImages.length;
  else return;
  document.getElementById('full-image').src = currentImages[currentImageIndex];
  document.getElementById('image-counter').innerText = `${currentImageIndex + 1} / ${currentImages.length}`;
}

createReviewModal();
loadPartyDetails();
loadTransactions();
