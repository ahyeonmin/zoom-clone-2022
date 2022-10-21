const socket = io();

/* Variables */

let roomName;
let nickname;
let muted = false; // ?†Œë¦? on
let cameraOff = false; // ì¹´ë©”?¼ on

let myStream;
let myPeerConnection;

let myDataChannel;
let chatable = false;

/* ----------------------------- */

/* Settings */

const myFace = document.querySelector("#myFace");
const muteBtn = document.querySelector("#mute");
const cameraBtn = document.querySelector("#camera");
const camerasSelect = document.querySelector("#cameras");

// ì¹´ë©”?¼ ëª©ë¡ ?ƒ?„±
async function getCameras() {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const cameras = devices.filter((device) => device.kind === "videoinput");
    const currentCamera = myStream.getVideoTracks()[0];
    cameras.forEach((camera) => {
      const option = document.createElement("option");
      option.value = camera.deviceId;
      option.innerText = camera.label;
      if (currentCamera.label === camera.label) {
        option.selected = true;
      }
      camerasSelect.appendChild(option);
    });
  } catch (error) {
    console.log(error);
  }
}

// ?‚´ ë¹„ë””?˜¤, ?˜¤?””?˜¤ ?„¤? •
async function getMedia(deviceId) {
  const initialConstraints = {
    audio: true,
    video: { facingMode: "user" }
  };
  const cameraConstraints = {
    audio: true,
    video: { deviceId: { exact: deviceId } }
  };
  try {
    myStream = await navigator.mediaDevices.getUserMedia(
      deviceId ? cameraConstraints : initialConstraints
    );
    myFace.srcObject = myStream;
    if (!deviceId) {
      await getCameras();
    }
  } catch (error) {
    console.log(error);
  }
}

// ?†Œë¦? on/off
function handleMuteClick(event) {
  event.preventDefault();
  myStream
    .getAudioTracks()
    .forEach((track) => (track.enabled = !track.enabled));
  if (!muted) {
    muteBtn.innerHTML = '<img src="/public/microphone-slash-solid.svg">';
    muted = true;
  } else {
    muteBtn.innerHTML = '<img src="/public/microphone-solid.svg">';
    muted = false;
  }
}

// ì¹´ë©”?¼ on/off
function handleCameraClick(event) {
  event.preventDefault();
  myStream
    .getVideoTracks()
    .forEach((track) => (track.enabled = !track.enabled));
  if (!cameraOff) {
    cameraBtn.innerHTML = '<img src="/public/video-slash-solid.svg">';
    cameraOff = true;
  } else {
    cameraBtn.innerHTML = '<img src="/public/video-solid.svg">';
    cameraOff = false;
  }
}

// ì¹´ë©”?¼ ?„ ?ƒ
async function handleCameraChange() {
  await getMedia(camerasSelect.value);
  if (myPeerConnection) {
    const videoTrack = myStream.getVideoTracks()[0];
    const videoSender = myPeerConnection
      .getSenders()
      .find((sender) => sender.track.kind === "video");
    videoSender.replaceTrack(videoTrack);
  }
}

muteBtn.addEventListener("click", handleMuteClick);
cameraBtn.addEventListener("click", handleCameraClick);
camerasSelect.addEventListener("click", handleCameraChange);

/* ----------------------------- */

/* Enter room */

const enter = document.querySelector("#enter");
const enterForm = document.querySelector("#enterForm");

const stream = document.querySelector("#stream");
stream.hidden = true;

// ?™”ë©? ?„¤? •
async function initStream() {
  enter.hidden = true;
  stream.hidden = false;
  await getMedia();
  makeConnection();
}

// ì±„íŒ…ë°? ?ž…?ž¥
async function handleEnterSubmit(event) {
  event.preventDefault();
  const roomInput = enterForm.querySelector("#roomInput");
  const nicknameInput = enterForm.querySelector("#nicknameInput");
  roomName = roomInput.value;
  nickname = nicknameInput.value;
  const roomTitle = document.querySelector("#roomTitle");
  roomTitle.innerText = `${roomName}`;
  await initStream();
  roomInput.value = "";
  nicknameInput.value = "";
  socket.emit("enter_room", roomName, nickname);
  const currentNickname = document.querySelector("#currentNickname");
  currentNickname.innerText = `: ${nickname}`;
}

enterForm.addEventListener("submit", handleEnterSubmit);

/* ----------------------------- */

/* Socket */

// peer A
socket.on("welcome", async () => {
  chatable = true;
  myDataChannel = myPeerConnection.createDataChannel("chat");
  console.log("made data channel");
  myDataChannel.addEventListener("message", (event) => {
    const parsedObj = JSON.parse(event.data);
    addMessage(parsedObj.message, parsedObj.nickname);
  });
  const offer = await myPeerConnection.createOffer();
  myPeerConnection.setLocalDescription(offer);
  socket.emit("offer", offer, roomName);
  console.log("sent the offer");
});

// peer B
socket.on("offer", async (offer) => {
  chatable = true;
  myPeerConnection.addEventListener("datachannel", (event, nickname) => {
    myDataChannel = event.channel;
    myDataChannel.addEventListener("message", (event) => {
      const parsedObj = JSON.parse(event.data);
      addMessage(parsedObj.message, parsedObj.nickname);
    });
  });
  console.log("receive the offer");
  myPeerConnection.setRemoteDescription(offer);
  const answer = await myPeerConnection.createAnswer();
  myPeerConnection.setLocalDescription(answer);
  socket.emit("answer", answer, roomName);
  console.log("sent the answer");
});

socket.on("answer", (answer) => {
  console.log("receive the answer");
  myPeerConnection.setRemoteDescription(answer);
});

socket.on("ice", (ice) => {
  console.log("receive candidate");
  myPeerConnection.addIceCandidate(ice);
});

/* ----------------------------- */

/* RTC */

function makeConnection() {
  myPeerConnection = new RTCPeerConnection({
    iceServers: [
      {
        urls: [
          "stun:stun.l.google.com:19302",
          "stun:stun1.l.google.com:19302",
          "stun:stun2.l.google.com:19302",
          "stun:stun3.l.google.com:19302",
          "stun:stun4.l.google.com:19302"
        ]
      }
    ]
  });
  myPeerConnection.addEventListener("icecandidate", handleIce);
  myPeerConnection.addEventListener("addstream", handleAddStream);
  myStream
    .getTracks()
    .forEach((track) => myPeerConnection.addTrack(track, myStream));
}

function handleIce(data) {
  socket.emit("ice", data.candidate, roomName);
  console.log("sent candidate");
}

function handleAddStream(data) {
  const peerFace = document.querySelector("#peerFace");
  peerFace.srcObject = data.stream;
}

/* ----------------------------- */

/* Chatting */

const chatForm = document.querySelector("#chatForm");

function addMessage(msg, nickname) {
  const chatList = document.querySelector("#chatList");
  const li = document.createElement("li");
  const span = document.createElement("span");
  li.innerText = msg;
  span.innerText = nickname;
  chatList.appendChild(span);
  chatList.appendChild(li);
  span.style.fontSize = "12px";
  span.style.marginLeft = "12px";
  span.style.position = "relative";
  span.style.top = "6px";
  li.style.backgroundColor = "#d7d8d8";
  li.style.width = "fit-content";
  li.style.marginLeft = "7px";
}

function addMyMessage(msg) {
  const chatList = document.querySelector("#chatList");
  const li = document.createElement("li");
  li.setAttribute("style", "background-color: #ABD5E8");
  li.style.color = "white";
  li.style.width ="fit-content";
  li.innerText = msg;
  chatList.appendChild(li);
}

function handleChatSubmit(event) {
  event.preventDefault();
  const input = chatForm.querySelector("input");
  const msg = input.value;
  const obj = {
    message: msg,
    nickname: nickname
  };
  addMyMessage(msg);
  input.value = "";
  if (chatable) {
    myDataChannel.send(JSON.stringify(obj));
  }
}

chatForm.addEventListener("submit", handleChatSubmit);

/* ----------------------------- */

/* Exit */

const exitBtn = document.querySelector("#exitBtn");

function handleExitClick(event) {
  window.location.reload();
}
exitBtn.addEventListener("click", handleExitClick);