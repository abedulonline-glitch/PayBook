import { db } from "./firebase-init.js";
import { collection, addDoc, doc, setDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { IMGBB_API_KEY } from "./config.js";

const urlParams = new URLSearchParams(window.location.search);
const partyId = urlParams.get("partyId");
const partyName = urlParams.get("name");
const mobile = localStorage.getItem("paybook_mobile");

if (!partyId || !mobile) window.location.href = "dashboard.html";
document.getElementById("tx-party-name").innerText = partyName;

let selectedFile = null;

// ইমেজ প্রিভিউ
document.getElementById("image-input").addEventListener("change", (e) => {
  selectedFile = e.target.files[0];
  if (selectedFile) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = document.getElementById("image-preview");
      img.src = e.target.result;
      img.style.display = "block";
    };
    reader.readAsDataURL(selectedFile);
  }
});

// ImgBB আপলোড ফাংশন
async function uploadToImgBB(file) {
  const formData = new FormData();
  formData.append("image", file);
  const res = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, {
    method: "POST",
    body: formData
  });
  const data = await res.json();
  if (!data.success) throw new Error("ইমেজ আপলোড ব্যর্থ");
  return data.data.url;
}

// সেভ বাটন
document.getElementById("save-tx-btn").addEventListener("click", async () => {
  const direction = document.querySelector('input[name="direction"]:checked').value;
  const visibleAmount = parseFloat(document.getElementById("visible-amount").value);
  const kachaAmount = parseFloat(document.getElementById("kacha-amount").value) || 0;
  const note = document.getElementById("note").value.trim();

  if (!visibleAmount || visibleAmount <= 0) return alert("সঠিক পাকা অ্যামাউন্ট দিন");
  if (!selectedFile) return alert("ইমেজ প্রুফ আপলোড করা বাধ্যতামূলক");

  const btn = document.getElementById("save-tx-btn");
  btn.innerText = "সেভ হচ্ছে...";
  btn.disabled = true;

  try {
    // ১. ImgBB তে আপলোড
    const imageUrl = await uploadToImgBB(selectedFile);

    // ২. Firestore এ সেভ
    const txRef = await addDoc(collection(db, "transactions"), {
      ownerMobile: mobile,
      partyId: partyId,
      direction: direction,
      visibleAmount: visibleAmount,
      totalAmount: visibleAmount + kachaAmount,
      imageUrl: imageUrl,
      note: note,
      date: new Date(),
      deletedBy: [],
      verifiedBy: []
    });

    // ৩. কাঁচা অ্যামাউন্ট private সাবকালেকশনে সেভ
    if (kachaAmount > 0) {
      await setDoc(doc(db, "transactions", txRef.id, "private", "details"), {
        kachaAmount: kachaAmount
      });
    }

    alert("সফলভাবে সেভ হয়েছে!");
    history.back();
  } catch (err) {
    console.error(err);
    alert("সমস্যা হয়েছে: " + err.message);
    btn.innerText = "সেভ করুন";
    btn.disabled = false;
  }
});
