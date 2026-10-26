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

// UI হেডার
const typeHeader = document.getElementById("tx-type-header");
let selectedDirection = txType === "received" ? "received" : "given";
typeHeader.innerText = selectedDirection === "received" ? "↓ প্রাপ্য (Received)" : "↑ প্রদেয় (Given)";
typeHeader.style.color = selectedDirection === "received" ? "var(--success)" : "var(--danger)";

// ডেট পিকার
const dateInput = document.getElementById("tx-date");
dateInput.value = new Date().toISOString().split('T')[0];

// মোডাল হ্যান্ডলিং
const modal = document.getElementById("media-modal");
document.getElementById("open-media-modal").onclick = () => modal.style.display = "flex";
document.getElementById("close-modal").onclick = () => modal.style.display = "none";
document.getElementById("btn-camera").onclick = () => { document.getElementById("camera-input").click(); modal.style.display = "none"; };
document.getElementById("btn-gallery").onclick = () => { document.getElementById("gallery-input").click(); modal.style.display = "none"; };

let cropper = null;
let finalFiles = []; // সব ছবি এখানে জমা হবে
let currentCameraFile = null;

// ছবি কম্প্রেস করার ফাংশন (মাল্টিপল ছবির জন্য)
function compressImage(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target.result;
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const MAX_WIDTH = 800; // রেজোলিউশন কমানো হলো
        const scaleSize = MAX_WIDTH / img.width;
        canvas.width = MAX_WIDTH;
        canvas.height = img.height * scaleSize;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => {
          resolve(new File([blob], file.name, { type: "image/jpeg" }));
        }, "image/jpeg", 0.7); // ৭০% কোয়ালিটি
      };
    };
  });
}

// গ্যালারি থেকে ছবি সিলেক্ট
document.getElementById("gallery-input").addEventListener("change", async (e) => {
  const files = Array.from(e.target.files);
  if (files.length === 0) return;

  const previewGrid = document.getElementById("preview-grid");
  
  for (const file of files) {
    const compressedFile = await compressImage(file);
    finalFiles.push(compressedFile);
    
    // প্রিভিউ দেখানো
    const div = document.createElement("div");
    div.className = "preview-item";
    const img = document.createElement("img");
    img.src = URL.createObjectURL(compressedFile);
    div.appendChild(img);
    previewGrid.appendChild(div);
  }
});

// ক্যামেরা থেকে ছবি সিলেক্ট (একটি একটি করে ক্রপ হবে)
document.getElementById("camera-input").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;

  currentCameraFile = file;
  const reader = new FileReader();
  reader.onload = (event) => {
    document.getElementById("cropper-container").style.display = "block";
    const image = document.getElementById("image-preview");
    image.src = event.target.result;

    if (cropper) cropper.destroy();
    cropper = new Cropper(image, { aspectRatio: NaN, viewMode: 1 });
  };
  reader.readAsDataURL(file);
});

// ক্যামেরার ছবি ক্রপ কনফার্ম
document.getElementById("confirm-crop-btn").onclick = () => {
  if (!cropper) return;
  cropper.getCroppedCanvas().toBlob((blob) => {
    const croppedFile = new File([blob], "camera_proof.jpg", { type: "image/jpeg" });
    finalFiles.push(croppedFile);
    
    // প্রিভিউ দেখানো
    const previewGrid = document.getElementById("preview-grid");
    const div = document.createElement("div");
    div.className = "preview-item";
    const img = document.createElement("img");
    img.src = URL.createObjectURL(croppedFile);
    div.appendChild(img);
    previewGrid.appendChild(div);

    // রিসেট
    cropper.destroy();
    cropper = null;
    document.getElementById("cropper-container").style.display = "none";
  }, "image/jpeg", 0.8);
};

// ImgBB তে আপলোড
async function uploadToImgBB(file) {
  const formData = new FormData();
  formData.append("image", file);
  const res = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, { method: "POST", body: formData });
  const data = await res.json();
  if (!data.success) throw new Error("ইমেজ আপলোড ব্যর্থ");
  return data.data.url;
}

// সেভ বাটন
document.getElementById("save-tx-btn").addEventListener("click", async () => {
  const visibleAmount = parseFloat(document.getElementById("visible-amount").value);
  const note = document.getElementById("note").value.trim();

  if (!visibleAmount || visibleAmount <= 0) return alert("সঠিক পাকা অ্যামাউন্ট দিন");
  if (finalFiles.length === 0) return alert("অন্তত একটি ইমেজ প্রুফ আপলোড করা বাধ্যতামূলক");

  const btn = document.getElementById("save-tx-btn");
  btn.innerText = `আপলোড হচ্ছে (0/${finalFiles.length})...`;
  btn.disabled = true;

  try {
    const imageUrls = [];
    // একটার পর একটা ছবি আপলোড হবে
    for (let i = 0; i < finalFiles.length; i++) {
      btn.innerText = `আপলোড হচ্ছে (${i + 1}/${finalFiles.length})...`;
      const url = await uploadToImgBB(finalFiles[i]);
      imageUrls.push(url);
    }

    // Firestore এ সেভ (imageUrls অ্যারে হিসেবে যাবে)
    await addDoc(collection(db, "transactions"), {
      ownerMobile: mobile,
      partyId: partyId,
      direction: selectedDirection,
      visibleAmount: visibleAmount,
      imageUrls: imageUrls, // নতুন ফিল্ড: একাধিক ছবির লিংক
      note: note,
      date: new Date(dateInput.value),
      deletedBy: [],
      verifiedBy: []
    });

    alert("সফলভাবে সেভ হয়েছে!");
    history.back();
  } catch (err) {
    alert("সমস্যা হয়েছে: " + err.message);
    btn.innerText = "সেভ করুন";
    btn.disabled = false;
  }
});
