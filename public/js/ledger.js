import { db } from "./firebase-init.js";
import { collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const urlParams = new URLSearchParams(window.location.search);
const partyId = urlParams.get("partyId");
const partyName = urlParams.get("name");
const mobile = localStorage.getItem("paybook_mobile");

if (!partyId || !mobile) window.location.href = "dashboard.html";

document.getElementById("party-name").innerText = partyName;

// লেনদেন লোড করা
async function loadTransactions() {
  const txRef = collection(db, "transactions");
  // আপাতত পার্টির সব লেনদেন (paka amount) দেখাচ্ছি
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
    
    snapshot.forEach((doc) => {
      const tx = doc.data();
      const txDiv = document.createElement("div");
      txDiv.className = `tx-item ${tx.direction}`;
      
      // পাকা অ্যামাউন্ট সবসময় দেখাবে
      txDiv.innerHTML = `
        <div class="amount">₹${tx.visibleAmount}</div>
        <div style="font-size:11px; color:#777;">${new Date(tx.date.toDate()).toLocaleDateString('bn-IN')}</div>
      `;
      
      if (tx.direction === "given") {
        givenList.appendChild(txDiv);
      } else {
        receivedList.appendChild(txDiv);
      }
    });
    
    if (givenList.innerHTML === "") givenList.innerHTML = "<p style='font-size:12px; text-align:center; color:#999;'>খালি</p>";
    if (receivedList.innerHTML === "") receivedList.innerHTML = "<p style='font-size:12px; text-align:center; color:#999;'>খালি</p>";
    
  } catch (err) {
    console.error(err);
    alert("লেনদেন লোড করতে সমস্যা: " + err.message);
  }
}

// নতুন লেনদেন বাটনে ক্লিক
document.getElementById("add-tx").addEventListener("click", () => {
  window.location.href = `transaction.html?partyId=${partyId}&name=${encodeURIComponent(partyName)}`;
});

loadTransactions();
