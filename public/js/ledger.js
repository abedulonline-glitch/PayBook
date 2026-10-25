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
    const docs = snapshot.docs.sort((a, b) => b.data().date.toDate() - a.data().date.toDate());

    docs.forEach((txDoc) => {
      const tx = txDoc.data();
      
      const dateObj = new Date(tx.date.toDate());
      const timeStr = dateObj.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
      const dateStr = dateObj.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
      
      const imgHtml = tx.imageUrl 
        ? `<div class="tx-img-wrapper"><img src="${tx.imageUrl}" alt="Proof"></div>` 
        : ``;

      const isGiven = tx.direction === "given";
      const arrow = isGiven ? "↑" : "↓";
      const colorClass = isGiven ? "given" : "received";
      const noteHtml = tx.note ? `<div class="tx-note">${tx.note}</div>` : '';

      const card = document.createElement("div");
      card.className = "timeline-item";
      
      card.innerHTML = `
        <div class="timeline-date"><span>${dateStr}</span></div>
        <div class="tx-card-inner">
          <div class="tx-card-header">
            <span class="tx-amount ${colorClass}">${arrow} ₹${tx.visibleAmount}</span>
            <span class="tx-time">${timeStr}</span>
          </div>
          ${imgHtml}
          ${noteHtml}
        </div>
      `;
      timeline.appendChild(card);
    });
  } catch (err) {
    alert("লেনদেন লোড করতে সমস্যা: " + err.message);
  }
}

loadTransactions();
