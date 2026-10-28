import { db } from "./firebase-init.js";
import { collection, addDoc, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { IMGBB_API_KEY } from "./config.js";

const urlParams = new URLSearchParams(window.location.search);
const partyId = urlParams.get("partyId");
const partyName = urlParams.get("name");
const txType = urlParams.get("type") || "given";
const accType = urlParams.get("accountType") || "paka";
const mobile = localStorage.getItem("paybook_mobile");

if (!partyId || !mobile) window.location.href = "dashboard.html";
document.getElementById("tx-party-name").innerText = partyName;

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

// ✅ ইমেজ কম্প্রেস করার ফাংশন (সাইজ ছোট করে, যাতে দ্রুত আপলোড হয়)
function compressImage(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target.result;
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const MAX_WIDTH = 600; // সাইজ আরও কমিয়ে ৬০০ করা হলো
        const scaleSize = MAX_WIDTH / img.width;
        canvas.width = MAX_WIDTH;
        canvas.height = img.height * scaleSize;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => {
          const compressedFile = new File([blob], "compressed_" + file.name, { type: "image/jpeg" });
          resolve(compressedFile);
        }, "image/jpeg", 0.6); // ৬০% কোয়ালিটি
      };
    };
  });
}

cameraInput.addEventListener("change", async (e) => { 
  if (e.target.files[0]) { 
    const compressed = await compressImage(e.target.files[0]);
    selectedFiles.push(compressed); 
    renderPreview(compressed, selectedFiles.length - 1); 
  } 
  cameraInput.value = ""; 
});

galleryInput.addEventListener("change", async (e) => { 
  const files = Array.from(e.target.files);
  for (const file of files) {
    const compressed = await compressImage(file);
    selectedFiles.push(compressed); 
    renderPreview(compressed, selectedFiles.length - 1); 
  }
  galleryInput.value = ""; 
});

function renderPreview(file, index) {
  const reader = new FileReader();
  reader.onload = (e) => {
    const div = document.createElement("div");
    div.style.cssText = "position:relative; width:70px; height:70px;";
    div.innerHTML = `
      <img src="${e.target.result}" style="width:100%;height:100%;object-fit:cover;border-radius:8px;border:1px solid #ddd;">
      <button type="button" class="remove-btn" data-index="${index}" style="position:absolute;top:-5px;right:-5px;background:red;color:white;border:none;border-radius:50%;width:22px;height:22px;font-size:12px;">✕</button>
    `;
    previewContainer.appendChild(div);
    div.querySelector('.remove-btn').onclick = function() { 
      selectedFiles.splice(parseInt(this.dataset.index), 1); 
      refreshPreviews(); 
    };
  };
  reader.readAsDataURL(file);
}

function refreshPreviews() { 
  previewContainer.innerHTML = ""; 
  selectedFiles.forEach((f, i) => renderPreview(f, i)); 
}

// ✅ Base64 রূপান্তর (যদি ImgBB ফেইল করে)
function getBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result);
    reader.onerror = error => reject(error);
  });
}

// ✅ স্মার্ট আপলোড ফাংশন: আগে ImgBB চেষ্টা করবে, ফেইল করলে Base64 করবে
async function smartImageUpload(file) {
  try {
    const formData = new FormData(); 
    formData.append("image", file);
    // টাইমআউট সেট করা হলো ৫ সেকেন্ড
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    
    const res = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, { 
      method: "POST", body: formData, signal: controller.signal 
    });
    clearTimeout(timeoutId);
    
    const data = await res.json();
    if (data.success) return data.data.url;
    throw new Error("ImgBB failed");
  } catch (e) {
    console.warn("ImgBB failed, using Base64 fallback...");
    // ImgBB ফেইল করলে Base64 রিটার্ন করবে
    return await getBase64(file);
  }
}

// সেভ বাটন
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
  btn.innerText = "প্রসেস হচ্ছে..."; 
  btn.disabled = true;

  try {
    let uploadedUrls = [];
    for (let i = 0; i < selectedFiles.length; i++) {
      btn.innerText = `আপলোড (${i+1}/${selectedFiles.length})...`;
      // স্মার্ট আপলোড (ImgBB অথবা Base64)
      const url = await smartImageUpload(selectedFiles[i]);
      uploadedUrls.push(url);
    }

    const partySnap = await getDoc(doc(db, "parties", partyId));
    const partyMobile = partySnap.exists() ? partySnap.data().mobile : null;
    const selectedDate = dateInput.value ? new Date(dateInput.value + 'T' + new Date().toTimeString().split(' ')[0]) : new Date();

    // ডেটাবেসে সেভ
    await addDoc(collection(db, "transactions"), {
      ownerMobile: mobile,
      partyId: partyId,
      counterpartyMobile: partyMobile,
      accountType: accType,
      direction: selectedDirection,
      visibleAmount: visibleAmount,
      imageUrls: uploadedUrls,
      isUploadingImages: false,
      note: note,
      date: selectedDate,
      isDeleted: false,
      isMirrored: false,
      deletedBy: [],
      verifiedBy: []
    });

    alert("সফলভাবে সেভ হয়েছে!");
    history.back();

  } catch (err) { 
    alert("সমস্যা: " + err.message); 
    btn.innerText = "সেভ করুন"; 
    btn.disabled = false; 
  }
});
