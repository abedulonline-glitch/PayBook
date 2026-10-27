import { db } from "./firebase-init.js";
import { collection, addDoc, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { IMGBB_API_KEY } from "./config.js";

const urlParams = new URLSearchParams(window.location.search);
const partyId = urlParams.get("partyId");
const partyName = urlParams.get("name");
const txType = urlParams.get("type") || "given"; // given / received
const accType = urlParams.get("accountType") || "paka"; // paka / kacha
const mobile = localStorage.getItem("paybook_mobile");

if (!partyId || !mobile) window.location.href = "dashboard.html";
document.getElementById("tx-party-name").innerText = partyName;

// হেডার সেট (পাকা নাকি কাঁচা)
const typeHeader = document.getElementById("tx-type-header");
let selectedDirection = txType;
typeHeader.innerText = (selectedDirection === "received" ? "↓ প্রাপ্য" : "↑ প্রদেয়") + ` (${accType === 'paka' ? 'পাকা' : 'কাঁচা'})`;
typeHeader.style.color = selectedDirection === "received" ? "var(--success)" : "var(--danger)";

const dateInput = document.getElementById("tx-date");
dateInput.value = new Date().toISOString().split('T')[0];

let selectedFiles = [];
const cameraInput = document.getElementById("camera-input");
const galleryInput = document.getElementById("gallery-input");
const previewContainer = document.getElementById("image-preview-container");
const modal = document.getElementById("media-modal");

document.getElementById("open-media-modal").onclick = () => modal.style.display = "flex";
document.getElementById("btn-cancel").onclick = () => modal.style.display = "none";
document.getElementById("btn-camera").onclick = () => { cameraInput.click(); modal.style.display = "none"; };
document.getElementById("btn-gallery").onclick = () => { galleryInput.click(); modal.style.display = "none"; };

cameraInput.addEventListener("change", (e) => { if (e.target.files[0]) { selectedFiles.push(e.target.files[0]); renderPreview(e.target.files[0], selectedFiles.length - 1); } cameraInput.value = ""; });
galleryInput.addEventListener("change", (e) => { Array.from(e.target.files).forEach(file => { selectedFiles.push(file); renderPreview(file, selectedFiles.length - 1); }); galleryInput.value = ""; });

function renderPreview(file, index) {
  const reader = new FileReader();
  reader.onload = (e) => {
    const div = document.createElement("div");
    div.style.cssText = "position:relative; width:70px; height:70px;";
    div.innerHTML = `<img src="${e.target.result}" style="width:100%;height:100%;object-fit:cover;border-radius:8px;border:1px solid #ddd;"><button type="button" class="remove-btn" data-index="${index}" style="position:absolute;top:-5px;right:-5px;background:red;color:white;border:none;border-radius:50%;width:22px;height:22px;font-size:12px;">✕</button>`;
    previewContainer.appendChild(div);
    div.querySelector('.remove-btn').onclick = function() { selectedFiles.splice(parseInt(this.dataset.index), 1); refreshPreviews(); };
  };
  reader.readAsDataURL(file);
}

function refreshPreviews() { previewContainer.innerHTML = ""; selectedFiles.forEach((f, i) => renderPreview(f, i)); }

async function uploadToImgBB(file) {
  const formData = new FormData(); formData.append("image", file);
  const res = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, { method: "POST", body: formData });
  const data = await res.json();
  if (!data.success) throw new Error("ইমেজ আপলোড ব্যর্থ");
  return data.data.url;
}

// সেভ বাটন (কাঁচা হলে পিন চাইবে, ছবি অপশনাল)
document.getElementById("save-tx-btn").addEventListener("click", async () => {
  const visibleAmount = parseFloat(document.getElementById("visible-amount").value);
  const note = document.getElementById("note").value.trim();

  if (!visibleAmount || visibleAmount <= 0) return alert("সঠিক অ্যামাউন্ট দিন");
  if (accType === "paka" && selectedFiles.length === 0) return alert("পাকা হিসাবে ইমেজ প্রুফ বাধ্যতামূলক");

  if (accType === "kacha") {
    let pin = prompt("কাঁচা এন্ট্রি করতে প্যানিক পিন দিন:");
    if (!pin) return;
    
    try {
      const userSnap = await getDoc(doc(db, "users", mobile));
      const user = userSnap.data();
      const enc = new TextEncoder();
      const keyMaterial = await crypto.subtle.importKey("raw", enc.encode(pin), "PBKDF2", false, ["deriveBits"]);
      const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt: enc.encode(user.salt), iterations: 100000, hash: "SHA-256" }, keyMaterial, 256);
      if (btoa(String.fromCharCode(...new Uint8Array(bits))) !== user.panicPinHash) return alert("ভুল প্যানিক পিন!");
    } catch (e) { return alert("এরর: " + e.message); }
  }

  const btn = document.getElementById("save-tx-btn");
  btn.innerText = "সেভ হচ্ছে..."; btn.disabled = true;

  try {
    const partySnap = await getDoc(doc(db, "parties", partyId));
    const partyMobile = partySnap.exists() ? partySnap.data().mobile : null;

    // ১. সাথে সাথে ডেটাবেসে সেভ করা (ছবি ছাড়া)
    const txRef = await addDoc(collection(db, "transactions"), {
      ownerMobile: mobile,
      partyId: partyId,
      counterpartyMobile: partyMobile,
      accountType: accType,
      direction: selectedDirection,
      visibleAmount: visibleAmount,
      imageUrls: [], // শুরুতে খালি থাকবে
      isUploadingImages: selectedFiles.length > 0, // আপলোড স্ট্যাটাস
      note: note,
      date: new Date(dateInput.value),
      isDeleted: false,
      isMirrored: false,
      deletedBy: [],
      verifiedBy: []
    });

    // ২. ইউজারকে সাথে সাথে ফেরত পাঠানো
    alert("লেনদেন সেভ হয়েছে! ছবি ব্যাকগ্রাউন্ডে আপলোড হচ্ছে।");
    history.back();

    // ৩. ব্যাকগ্রাউন্ডে ছবি আপলোড করা (ইউজার এই সময় অন্য কাজ করতে পারবে)
    if (selectedFiles.length > 0) {
      let uploadedUrls = [];
      for (let i = 0; i < selectedFiles.length; i++) {
        try {
          const url = await uploadToImgBB(selectedFiles[i]);
          uploadedUrls.push(url);
        } catch (e) {
          console.error("Image upload failed", e);
        }
      }
      
      // ৪. আপলোড শেষ হলে ডেটাবেস আপডেট করা
      await updateDoc(doc(db, "transactions", txRef.id), {
        imageUrls: uploadedUrls,
        isUploadingImages: false
      });
    }

  } catch (err) { 
    alert("সমস্যা: " + err.message); 
    btn.innerText = "সেভ করুন"; 
    btn.disabled = false; 
  }
});
