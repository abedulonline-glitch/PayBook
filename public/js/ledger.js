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
    const givenList = document.getElementById("given-list");
    const receivedList = document.getElementById("received-list");
    
    if (snapshot.empty) {
      givenList.innerHTML = "<p style='font-size:12px; text-align:center; color:#999;'>খালি</p>";
      receivedList.innerHTML = "<p style='font-size:12px; text-align:center; color:#999;'>খালি</p>";
      return;
    }
    
    givenList.innerHTML = "";
    receivedList.innerHTML = "";
    
    // তারিখ অনুযায়ী সাজানো (নতুন আগে)
    const docs = snapshot.docs.sort((a, b) => b.data().date.toDate() - a.data().date.toDate());

    docs.forEach((document) => {
      const tx = document.data();
      const txDiv = document.createElement("div");
      txDiv.className = `tx-card`;
      
      const timeStr = new Date(tx.date.toDate()).toLocaleTimeString('bn-IN', { hour: '2-digit', minute: '2-digit' });
      const dateStr = new Date(tx.date.toDate()).toLocaleDateString('bn-IN', { day: '2-digit', month: 'short' });
      
      const imgHtml = tx.imageUrl 
        ? `<img src="${tx.imageUrl}" alt="Proof">` 
        : `<span class="no-img">কোনো ছবি নেই</span>`;

      txDiv.innerHTML = `
        <div class="tx-card-header">
          <span class="tx-amount ${tx.direction}">
            ${tx.direction === 'given' ? '↑' : '↓'} ₹${tx.visibleAmount}
          </span>
          <span class="tx-time">${dateStr}, ${timeStr}</span>
        </div>
        <div class="tx-image-container">
          ${imgHtml}
        </div>
        ${tx.note ? `<div class="tx-note">${tx.note}</div>` : ''}
      `;
      
      if (tx.direction === "given") {
        givenList.appendChild(txDiv);
      } else {
        receivedList.appendChild(txDiv);
      }
    });
    
  } catch (err) {
    alert("লেনদেন লোড করতে সমস্যা: " + err.message);
  }
}

document.getElementById("add-tx").addEventListener("click", () => {
  window.location.href = `transaction.html?partyId=${partyId}&name=${encodeURIComponent(partyName)}`;
});

loadTransactions();
