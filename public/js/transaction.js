import { db } from "./firebase-init.js";
import { collection, addDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { IMGBB_API_KEY } from "./config.js";

const urlParams = new URLSearchParams(window.location.search);
const partyId = urlParams.get("partyId");
const partyName = urlParams.get("name");
const txType = urlParams.get("type") || "given";
const mobile = localStorage.getItem("paybook_mobile");

if (!partyId || !mobile) window.location.href = "dashboard.html";
document.getElementById("tx-party-name").innerText = partyName;

const typeHeader = document.getElementById("tx-type-header");
let selectedDirection = txType === "received" ? "received" : "given";
typeHeader.innerText = selectedDirection === "received" ? "↓ প্রাপ্য (Received)" : "↑ প্রদেয় (Given)";
typeHeader.style.color = selectedDirection === "received" ? "var(--success)" : "var(--danger)";

const dateInput = document.getElementById("tx-date");
dateInput.value = new Date().toISOString().split('T')[0];

let selectedFiles = []; 
const cameraInput = document.getElementById("camera-input");
const galleryInput = document.getElementById("gallery-input");
const previewContainer = document.getElementById("image-preview-container");
const modal = document.getElementById("media-modal");

// মোডাল ওপেন/ক্লোজ
document.getElementById("open-media-modal").onclick = () => modal.style.display = "flex";
document.getElementById("btn-cancel").onclick = () => modal.style.display = "none";

// ক্যামেরা বাটন
document.getElementById("btn-camera").onclick = () => { cameraInput.click(); modal.style.display = "none"; };
// গ্যালারি বাটন
document.getElementById("btn-gallery").onclick = () => { galleryInput.click(); modal.style.display = "none"; };

// ক্যামেরা থেকে ছবি আসলে (একটি করে)
cameraInput.addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (file) {
    selectedFiles.push(file);
    renderPreview(file, selectedFiles.length - 1);
  }
  cameraInput.value = "";
});

// গ্যালারি থেকে ছবি আসলে (একাধিক)
galleryInput.addEventListener("change", (e) => {
  const files = Array.from(e.target.files);
  files.forEach(file => {
    selectedFiles.push(file);
    renderPreview(file, selectedFiles.length - 1);
  });
  galleryInput.value = "";
});

function renderPreview(file, index) {
  const reader = new FileReader();
  reader.onload = (e) => {
    const div = document.createElement("div");
    div.style.position = "relative";
    div.style.width = "70px";
    div.style.height = "70px";
    div.innerHTML = `
      <img src="${e.target.result}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 8px; border: 1px solid #ddd;">
      <button type="button" class="remove-btn" data-index="${index}" style="position: absolute; top: -5px; right: -5px; background: red; color: white; border: none; border-radius: 50%; width: 22px; height: 22px; font-size: 12px; cursor: pointer;">✕</button>
    `;
    previewContainer.appendChild(div);

    div.querySelector('.remove-btn').addEventListener('click', function() {
      const removeIndex = parseInt(this.getAttribute('data-index'));
      selectedFiles.splice(removeIndex, 1);
      refreshPreviews();
    });
  };
  reader.readAsDataURL(file);
}

function refreshPreviews() {
  previewContainer.innerHTML = "";
  selectedFiles.forEach((file, index) => renderPreview(file, index));
}

async function uploadToImgBB(file) {
  const formData = new FormData();
  formData.append("image", file);
  const res = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, { method: "POST", body: formData });
  const data = await res.json();
  if (!data.success) throw new Error("ইমেজ আপলোড ব্যর্থ");
  return data.data.url;
}

document.getElementById("save-tx-btn").addEventListener("click", async () => {
  const visibleAmount = parseFloat(document.getElementById("visible-amount").value);
  const note = document.getElementById("note").value.trim();

  if (!visibleAmount || visibleAmount <= 0) return alert("সঠিক পাকা অ্যামাউন্ট দিন");
  if (selectedFiles.length === 0) return alert("অন্তত একটি ইমেজ প্রুফ আপলোড করা বাধ্যতামূলক");

  const btn = document.getElementById("save-tx-btn");
  btn.innerText = `আপলোড হচ্ছে (0/${selectedFiles.length})...`;
  btn.disabled = true;

  try {
    const imageUrls = [];
    for (let i = 0; i < selectedFiles.length; i++) {
      btn.innerText = `আপলোড হচ্ছে (${i + 1}/${selectedFiles.length})...`;
      const url = await uploadToImgBB(selectedFiles[i]);
      imageUrls.push(url);
    }

    await addDoc(collection(db, "transactions"), {
      ownerMobile: mobile,
      partyId: partyId,
      direction: selectedDirection,
      visibleAmount: visibleAmount,
      imageUrls: imageUrls, 
      note: note,
      date: new Date(dateInput.value),
      deletedBy: [], verifiedBy: []
    });

    alert("সফলভাবে সেভ হয়েছে!");
    history.back();
  } catch (err) {
    alert("সমস্যা হয়েছে: " + err.message);
    btn.innerText = "সেভ করুন";
    btn.disabled = false;
  }
});
