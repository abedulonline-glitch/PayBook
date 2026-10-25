import { db } from "./firebase-init.js";
import { collection, addDoc, doc, setDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { IMGBB_API_KEY } from "./config.js";

const urlParams = new URLSearchParams(window.location.search);
const partyId = urlParams.get("partyId");
const partyName = urlParams.get("name");
const txType = urlParams.get("type") || "given"; // ডিফল্ট given
const mobile = localStorage.getItem("paybook_mobile");

if (!partyId || !mobile) window.location.href = "dashboard.html";
document.getElementById("tx-party-name").innerText = partyName;

// টাইপ অনুযায়ী হেডার সেট করা
const typeHeader = document.getElementById("tx-type-header");
let selectedDirection = "given"; // ভেরিয়েবল

if (txType === "received") {
  selectedDirection = "received";
  typeHeader.innerText = "↓ প্রাপ্য (Received)";
  typeHeader.style.color = "var(--success)";
} else {
  selectedDirection = "given";
  typeHeader.innerText = "↑ প্রদেয় (Given)";
  typeHeader.style.color = "var(--danger)";
}

let cropper = null;
let finalFile = null;

function handleImageSelect(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (event) => {
    document.getElementById("cropper-container").style.display = "block";
    const image = document.getElementById("image-preview");
    image.src = event.target.result;

    if (cropper) cropper.destroy();
    
    cropper = new Cropper(image, {
      aspectRatio: NaN,
      viewMode: 1,
      autoCropArea: 0.8,
      touchDragZoom: true,
    });
  };
  reader.readAsDataURL(file);
}

document.getElementById("camera-input").addEventListener("change", handleImageSelect);
document.getElementById("gallery-input").addEventListener("change", handleImageSelect);

async function uploadToImgBB(file) {
  const formData = new FormData();
  formData.append("image", file);
  const res = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, {
    method: "POST", body: formData
  });
  const data = await res.json();
  if (!data.success) throw new Error("ইমেজ আপলোড ব্যর্থ");
  return data.data.url;
}

document.getElementById("save-tx-btn").addEventListener("click", async () => {
  const visibleAmount = parseFloat(document.getElementById("visible-amount").value);
  const kachaAmount = parseFloat(document.getElementById("kacha-amount").value) || 0;
  const note = document.getElementById("note").value.trim();

  if (!visibleAmount || visibleAmount <= 0) return alert("সঠিক পাকা অ্যামাউন্ট দিন");
  if (!cropper) return alert("ইমেজ প্রুফ আপলোড করা বাধ্যতামূলক");

  const btn = document.getElementById("save-tx-btn");
  btn.innerText = "প্রসেস হচ্ছে...";
  btn.disabled = true;

  try {
    cropper.getCroppedCanvas().toBlob(async (blob) => {
      if (!blob) return alert("ছবি ক্রপ করতে সমস্যা হয়েছে");
      
      finalFile = new File([blob], "proof.jpg", { type: "image/jpeg" });
      const imageUrl = await uploadToImgBB(finalFile);

      const txRef = await addDoc(collection(db, "transactions"), {
        ownerMobile: mobile,
        partyId: partyId,
        direction: selectedDirection, // এখানে URL থেকে আসা ডিরেকশন সেভ হচ্ছে
        visibleAmount: visibleAmount,
        totalAmount: visibleAmount + kachaAmount,
        imageUrl: imageUrl,
        note: note,
        date: new Date(),
        deletedBy: [],
        verifiedBy: []
      });

      if (kachaAmount > 0) {
        await setDoc(doc(db, "transactions", txRef.id, "private", "details"), {
          kachaAmount: kachaAmount
        });
      }

      alert("সফলভাবে সেভ হয়েছে!");
      history.back();
    }, "image/jpeg", 0.8);

  } catch (err) {
    alert("সমস্যা হয়েছে: " + err.message);
    btn.innerText = "সেভ করুন";
    btn.disabled = false;
  }
});
