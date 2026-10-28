import { db } from "./firebase-init.js";
import { collection, addDoc, doc, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
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

// ✅ ইমেজ কম্প্রেস করার ফাংশন (ImgBB-তে দ্রুত আপলোডের জন্য)
function compressImage(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target.result;
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const MAX_WIDTH = 800; // ম্যাক্স ৮০০ পিক্সেল
        const scaleSize = MAX_WIDTH / img.width;
        canvas.width = MAX_WIDTH;
        canvas.height = img.height * scaleSize;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => {
          const compressedFile = new File([blob], "compressed_" + file.name, { type: "image/jpeg" });
          resolve(compressedFile);
        }, "image/jpeg", 0.7); // ৭০% কোয়ালিটি
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

// ✅ ImgBB আপলোড ফাংশন (রিট্রাই লজিকসহ)
async function uploadToImgBB(file, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const formData = new FormData(); 
      formData.append("image", file);
      const res = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, { method: "POST", body: formData });
      const data = await res.json();
      if (data.success) return data.data.url;
    } catch (e) {
      console.warn(`Upload attempt ${i + 1} failed. Retrying...`);
    }
    // ২ সেকেন্ড অপেক্ষা করে আবার চেষ্টা করবে
    await new Promise(r => setTimeout(r, 2000));
  }
  throw new Error("ইমেজ আপলোড ব্যর্থ হয়েছে (৩ বার চেষ্টা করা হয়েছে)");
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
  btn.innerText = "ইমেজ আপলোড হচ্ছে..."; 
  btn.disabled = true;

  try {
    // ১. প্রথমে সব ছবি আপলোড করা (রিট্রাই লজিকসহ)
    let uploadedUrls = [];
    for (let i = 0; i < selectedFiles.length; i++) {
      btn.innerText = `আপলোড হচ্ছে (${i+1}/${selectedFiles.length})...`;
      try {
        const url = await uploadToImgBB(selectedFiles[i]);
        uploadedUrls.push(url);
      } catch (err) {
        throw new Error("ইমেজ আপলোড ব্যর্থ! ইন্টারনেট চেক করে আবার চেষ্টা করুন।");
      }
    }

    btn.innerText = "সেভ হচ্ছে...";
    const partySnap = await getDoc(doc(db, "parties", partyId));
    const partyMobile = partySnap.exists() ? partySnap.data().mobile : null;
    const selectedDate = dateInput.value ? new Date(dateInput.value + 'T' + new Date().toTimeString().split(' ')[0]) : new Date();

    // ২. সব ছবি আপলোড শেষ হলে ডেটাবেসে সেভ করা
    await addDoc(collection(db, "transactions"), {
      ownerMobile: mobile,
      partyId: partyId,
      counterpartyMobile: partyMobile,
      accountType: accType,
      direction: selectedDirection,
      visibleAmount: visibleAmount,
      imageUrls: uploadedUrls, // এখানে সরাসরি লিংকগুলো যাচ্ছে
      isUploadingImages: false, // আর পেন্ডিং থাকবে না
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
