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

// ✅ সাবস্ক্রিপশন চেক
async function checkSubscription() {
  const userSnap = await getDoc(doc(db, "users", mobile));
  if (userSnap.exists()) {
    const user = userSnap.data();
    if (user.editSubValidUntil && new Date() < user.editSubValidUntil.toDate()) {
      userHasSubscription = true;
    }
  }
}

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

    // 🛑 ডুপ্লিকেট ফিল্টার
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

    // পুরনো থেকে নতুন ক্রমে সাজানো (Running Balance)
    const sortedAsc = uniqueDocs.sort((a, b) => a.data().date.toDate() - b.data().date.toDate());

    // ৩. Running Balance এবং Total ক্যালকুলেশন
    let runningBalance = 0;
    let waTable = "";

    const processedDocs = sortedAsc.map(tDoc => {
      const tx = tDoc.data();
      let amt = tx.visibleAmount;
      if (tx.accountType === "kacha") amt = amt / 100;

      const isG = tx.direction === "given";
      
      // 🛑 শুধুমাত্র অ্যাপ্রুভড বা পেন্ডিং লেনদেন হিসাবে যোগ হবে (রিজেক্টেড বাদ যাবে)
      if (!tx.isDeleted && tx.status !== "rejected") {
        if (isG) {
          runningBalance -= amt;
        } else {
          runningBalance += amt;
        }
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

    // ৫. UI কার্ড তৈরি
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

      // WhatsApp মেসেজ
      const waMessage = `*PayBook Ledger - ${partyData.name}*\n\n` +
                        `Date      | Given   | Recv    | Bal    \n` +
                        `-------------------------------------\n` +
                        waTable +
                        `-------------------------------------\n` +
                        `*Total Balance: ${netBalanceText}*`;
      
      const waText = encodeURIComponent(waMessage);
      let waNumber = formatWhatsAppNumber(partyData.mobile);
      let waBtn = "";
      if (waNumber) {
        waBtn = `<button onclick="window.open('https://wa.me/${waNumber}?text=${waText}', '_blank')" style="background: transparent; border: none; font-size: 18px; cursor: pointer; margin-left: 8px;" title="Share">🟢</button>`;
      }

      // ✅ স্ট্যাটাস চেক (পুরনো isPending এবং নতুন status দুটোই সাপোর্ট করবে)
      const isPending = tx.status === "pending" || tx.isPending === true;
      const isApproved = tx.status === "approved";
      const isRejected = tx.status === "rejected";
      const isCreator = !tx.originalTxId; 
      
      let statusIcon = "";
      if (isApproved) statusIcon = `<span style="color: green; font-weight: bold; margin-left: 5px;" title="Approved">✓✓</span>`;
      else if (isRejected) statusIcon = `<span style="color: red; font-weight: bold; margin-left: 5px;" title="Rejected: ${tx.rejectReason}">❌</span>`;
      else if (isPending) statusIcon = `<span style="color: orange; font-weight: bold; margin-left: 5px;" title="Pending">⏳</span>`;

      // ✅ অ্যাকশন বাটন লজিক
      let actionBtns = "";
      
      // ডিলিট বাটন
      if (!tx.isDeleted && !isPending) {
        actionBtns += `<button onclick="deleteTransaction('${txDoc.id}')" style="background: transparent; border: none; font-size: 16px; cursor: pointer; margin-left: 5px;" title="Delete">🗑️</button>`;
      }

      // A (Creator) এর এডিট বাটন
      if (isCreator) {
        if (isRejected) {
          actionBtns += `<button onclick="editTransaction('${txDoc.id}', '${tx.visibleAmount}', '${tx.accountType}')" style="background: transparent; border: none; font-size: 16px; cursor: pointer; margin-left: 5px;" title="Edit">✏️</button>`;
        }
      }

      // B (Receiver) এর রিভিউ বাটন
      if (!isCreator && isPending) {
        if (userHasSubscription) {
          actionBtns += `<button onclick="openReviewModal('${txDoc.id}')" style="background: transparent; border: none; font-size: 20px; cursor: pointer; margin-left: 5px;" title="Review">👁️</button>`;
        } else {
          actionBtns += `<span style="font-size: 11px; color: #d32f2f; margin-left: 5px; display: inline-block; max-width: 80px; line-height: 1.1;">রিভিউ করতে সাবস্ক্রিপশন নিন</span>`;
        }
      }

      const card = document.createElement("div");
      card.className = `timeline-item ${isGiven ? 'given-item' : 'received-item'}`;
      const isDeleted = tx.isDeleted ? "opacity: 0.5; text-decoration: line-through;" : "";

      card.innerHTML = `
        <div class="timeline-date"><span>${dateStr}</span></div>
        <div class="tx-card-inner" style="${isDeleted}">
          <div class="tx-card-header ${isGiven ? 'header-given' : 'header-received'}" style="flex-wrap: wrap;">
            
            <div style="display: flex; align-items: center; width: 100%; justify-content: space-between;">
              <div style="display: flex; align-items: center; flex-wrap: wrap;">
                <span class="tx-amount ${colorClass}">${isGiven ? '↑' : '↓'} ₹${displayAmount} ${typeLabel}</span>
                ${statusIcon}
                ${waBtn}
                ${actionBtns}
              </div>
              <span class="tx-time">${timeStr}</span>
            </div>
            ${isRejected ? `<div style="width:100%; font-size:12px; color:red; margin-top:5px; background:#ffeeee; padding:4px; border-radius:4px;">কারণ: ${tx.rejectReason}</div>` : ''}
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

// ✅ রিভিউ মোডাল ওপেন
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

// ✅ এপ্রুভ লজিক
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

// ✅ রিজেক্ট লজিক
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

// ৪. ডিলিট ফাংশন
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

// ৬. এডিট (A-এর জন্য)
window.editTransaction = async function(txId, currentAmount, accType) {
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

// ৭. ইমেজ ভিউয়ার
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

// ইনিশিয়ালাইজ
createReviewModal();
loadPartyDetails();
loadTransactions();
