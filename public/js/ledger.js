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
    
    // তারিখ অনুযায়ী সাজানো (নতুন আগে)
    const docs = snapshot.docs.sort((a, b) => b.data().date.toDate() - a.data().date.toDate());

    // এখানে 'document' এর বদলে 'txDoc' ব্যবহার করা হয়েছে যাতে এরর না আসে
    docs.forEach((txDoc) => {
      const tx = txDoc.data();
      
      const dateObj = new Date(tx.date.toDate());
      const timeStr = dateObj.toLocaleTimeString('bn-IN', { hour: '2-digit', minute: '2-digit' });
      const dateStr = dateObj.toLocaleDateString('bn-IN', { day: '2-digit', month: 'short', year: 'numeric' });
      
      const imgHtml = tx.imageUrl 
        ? `<img src="${tx.imageUrl}" style="width:100%; height:150px; object-fit:cover; border-radius:8px; margin-top:8px;" alt="Proof">` 
        : ``;

      const isGiven = tx.direction === "given";
      const arrow = isGiven ? "↑" : "↓";
      const colorClass = isGiven ? "given" : "received";

      const card = document.createElement("div");
      card.className = "tx-card";
      
      card.innerHTML = `
        <div style="text-align:center; margin: 16px 0 8px 0;">
          <span style="background: #E0E0E0; padding: 4px 12px; border-radius: 12px; font-size: 12px; color: #555;">
            ${dateStr}
          </span>
        </div>
        <div class="tx-card-inner">
          <div class="tx-card-header">
            <span class="tx-amount ${colorClass}">
              ${arrow} ₹${tx.visibleAmount}
            </span>
            <span class="tx-time">${timeStr}</span>
          </div>
          ${imgHtml}
          ${tx.note ? `<div class="tx-note">${tx.note}</div>` : ''}
        </div>
      `;
      timeline.appendChild(card);
    });
    
  } catch (err) {
    alert("লেনদেন লোড করতে সমস্যা: " + err.message);
  }
}

loadTransactions();
