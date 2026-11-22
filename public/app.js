const socket = io();
const localVideo = document.getElementById("localVideo");
const remoteVideo = document.getElementById("remoteVideo");
const statusEl = document.getElementById("status");
const copyBtn = document.getElementById("copyBtn");
const micBtn = document.getElementById("micBtn");
const camBtn = document.getElementById("camBtn");

// ۱. استخراج یا ساخت خودکار شناسه اتاق در URL
const urlParams = new URLSearchParams(window.location.search);
let roomId = urlParams.get("room");
if (!roomId) {
  roomId = Math.random().toString(36).substring(2, 8);
  window.history.replaceState(null, "", `?room=${roomId}`);
}

const rtcConfig = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ],
};

let localStream = null;
let pc = null;
let pendingCandidates = [];

async function init() {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    localVideo.srcObject = localStream;
    statusEl.textContent = "لینک را برای دوستت بفرست و منتظر بمان...";
    socket.emit("join-room", roomId);
  } catch (err) {
    statusEl.textContent = "خطا در دسترسی به دوربین یا میکروفون (مطمئن شو روی HTTPS هستی).";
    console.error(err);
  }
}

function createPeerConnection() {
  pc = new RTCPeerConnection(rtcConfig);
  pendingCandidates = [];

  localStream.getTracks().forEach((track) => pc.addTrack(track, localStream));

  pc.ontrack = (event) => {
    remoteVideo.srcObject = event.streams[0];
    statusEl.textContent = "متصل شد";
  };

  pc.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit("signal", { roomId, data: { candidate: event.candidate } });
    }
  };

  pc.oniceconnectionstatechange = () => {
    if (pc.iceConnectionState === "failed") {
      statusEl.textContent = "در حال تلاش برای اتصال مجدد...";
      pc.restartIce();
    } else if (pc.iceConnectionState === "disconnected") {
      statusEl.textContent = "اتصال ناپایدار است...";
    } else if (pc.iceConnectionState === "connected") {
      statusEl.textContent = "متصل شد";
    }
  };
}

// نفر اول وقتی نفر دوم وارد می‌شود، Offer می‌سازد
socket.on("peer-joined", async () => {
  statusEl.textContent = "دوستت وارد شد، در حال برقراری تماس...";
  createPeerConnection();
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  socket.emit("signal", { roomId, data: { sdp: pc.localDescription } });
});

// دریافت Offer، Answer یا کاندیدهای ICE
socket.on("signal", async (data) => {
  if (!pc) createPeerConnection();

  if (data.sdp) {
    await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));

    while (pendingCandidates.length > 0) {
      await pc.addIceCandidate(new RTCIceCandidate(pendingCandidates.shift()));
    }

    if (data.sdp.type === "offer") {
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit("signal", { roomId, data: { sdp: pc.localDescription } });
    }
  } else if (data.candidate) {
    if (pc.remoteDescription) {
      await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
    } else {
      pendingCandidates.push(data.candidate);
    }
  }
});

socket.on("room-full", () => {
  statusEl.textContent = "ظرفیت این اتاق پر است (حداکثر ۲ نفر).";
});

socket.on("peer-left", () => {
  statusEl.textContent = "دوستت تماس را ترک کرد. منتظر ورود مجدد...";
  remoteVideo.srcObject = null;
  if (pc) {
    pc.close();
    pc = null;
  }
});

// کنترل‌های دکمه‌ها
copyBtn.onclick = async () => {
  await navigator.clipboard.writeText(window.location.href);
  copyBtn.textContent = "کپی شد!";
  setTimeout(() => (copyBtn.textContent = "کپی لینک دعوت"), 2000);
};

micBtn.onclick = () => {
  if (!localStream) return;
  const audioTrack = localStream.getAudioTracks()[0];
  if (!audioTrack) return;
  audioTrack.enabled = !audioTrack.enabled;
  micBtn.textContent = audioTrack.enabled ? "میکروفون: روشن" : "میکروفون: خاموش";
  micBtn.classList.toggle("off", !audioTrack.enabled);
};

camBtn.onclick = () => {
  if (!localStream) return;
  const videoTrack = localStream.getVideoTracks()[0];
  if (!videoTrack) return;
  videoTrack.enabled = !videoTrack.enabled;
  camBtn.textContent = videoTrack.enabled ? "دوربین: روشن" : "دوربین: خاموش";
  camBtn.classList.toggle("off", !videoTrack.enabled);
};

init();