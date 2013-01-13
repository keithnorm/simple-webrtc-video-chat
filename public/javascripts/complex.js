var localVideo;
var miniVideo;
var remoteVideo;
var localStream;
var remoteStream;
var channel;
var channelReady = false;
var pc;
var socket;
var initiator = 0;
var started = false;
// Set up audio and video regardless of what devices are present.
var mediaConstraints = {'mandatory': {
                          'OfferToReceiveAudio':true, 
                          'OfferToReceiveVideo':true }};
var isVideoMuted = false;
var isAudioMuted = false;

function initialize() {
  console.log("Initializing; room=23666637.");
  card = document.getElementById("card");
  localVideo = document.getElementById("localVideo");
  miniVideo = document.getElementById("miniVideo");
  remoteVideo = document.getElementById("remoteVideo");
  resetStatus();
  openChannel('AHRlWronxgH2k_AR8MurZXhrcdeM0QsSh439GLHtK7-yisoZ0tFrYwJWVCejqEXsmLT8PDtc_Th_P0OhEPQmeWzrLwILreGuQtrV7fZpgx_7aKXcxnP4WxA');
  doGetUserMedia();
}

function openChannel(channelToken) {
  console.log("Opening channel.");
  var channel = new goog.appengine.Channel(channelToken);
  var handler = {
    'onopen': onChannelOpened,
    'onmessage': onChannelMessage,
    'onerror': onChannelError,
    'onclose': onChannelClosed
  };
  socket = channel.open(handler);
}

function resetStatus() {
  if (!initiator) {
    setStatus("Waiting for someone to join: <a href=\"https://apprtc.appspot.com/?r=23666637\">https://apprtc.appspot.com/?r=23666637</a>");
  } else {
    setStatus("Initializing...");
  }
}

function doGetUserMedia() {
  // Call into getUserMedia via the polyfill (adapter.js).
  var constraints = {"mandatory": {}, "optional": []}; 
  try {
    getUserMedia({'audio':true, 'video':constraints}, onUserMediaSuccess,
                 onUserMediaError);
    console.log("Requested access to local media with mediaConstraints:\n" +
                "  \"" + JSON.stringify(constraints) + "\"");
  } catch (e) {
    alert("getUserMedia() failed. Is this a WebRTC capable browser?");
    console.log("getUserMedia failed with exception: " + e.message);
  }
}

function createPeerConnection() {
  var pc_config = {"iceServers": [{"url": "stun:stun.l.google.com:19302"}]};
  try {
    // Create an RTCPeerConnection via the polyfill (adapter.js).
    pc = new RTCPeerConnection(pc_config);
    pc.onicecandidate = onIceCandidate;
    console.log("Created RTCPeerConnnection with config:\n" + "  \"" +
                JSON.stringify(pc_config) + "\".");
  } catch (e) {
    console.log("Failed to create PeerConnection, exception: " + e.message);
    alert("Cannot create RTCPeerConnection object; WebRTC is not supported by this browser.");
      return;
  }

  pc.onconnecting = onSessionConnecting;
  pc.onopen = onSessionOpened;
  pc.onaddstream = onRemoteStreamAdded;
  pc.onremovestream = onRemoteStreamRemoved;
}

function maybeStart() {
  if (!started && localStream && channelReady) {
    setStatus("Connecting...");
    console.log("Creating PeerConnection.");
    createPeerConnection();
    console.log("Adding local stream.");
    pc.addStream(localStream);
    started = true;
    // Caller initiates offer to peer.
    if (initiator)
      doCall();
  }
}

function setStatus(state) {
  footer.innerHTML = state;
}

function doCall() {
  console.log("Sending offer to peer.");
  pc.createOffer(setLocalAndSendMessage, null, mediaConstraints);
}

function doAnswer() {
  console.log("Sending answer to peer.");
  pc.createAnswer(setLocalAndSendMessage, null, mediaConstraints);
}

function setLocalAndSendMessage(sessionDescription) {
  // Set Opus as the preferred codec in SDP if Opus is present.
  sessionDescription.sdp = preferOpus(sessionDescription.sdp);
  pc.setLocalDescription(sessionDescription);
  sendMessage(sessionDescription);
}

function sendMessage(message) {
  var msgString = JSON.stringify(message);
  console.log('C->S: ' + msgString);
  path = '/message?r=23666637' + '&u=65431484';
  var xhr = new XMLHttpRequest();
  xhr.open('POST', path, true);
  xhr.send(msgString);
}

function processSignalingMessage(message) {
  var msg = JSON.parse(message);

  if (msg.type === 'offer') {
    // Callee creates PeerConnection
    if (!initiator && !started)
      maybeStart();

    pc.setRemoteDescription(new RTCSessionDescription(msg));
    doAnswer();
  } else if (msg.type === 'answer' && started) {
    pc.setRemoteDescription(new RTCSessionDescription(msg));
  } else if (msg.type === 'candidate' && started) {
    var candidate = new RTCIceCandidate({sdpMLineIndex:msg.label,
                                         candidate:msg.candidate});
    pc.addIceCandidate(candidate);
  } else if (msg.type === 'bye' && started) {
    onRemoteHangup();
  }
}

function onChannelOpened() {
  console.log('Channel opened.');
  channelReady = true;
  if (initiator) maybeStart();
}
function onChannelMessage(message) {
  console.log('S->C: ' + message.data);
  processSignalingMessage(message.data);
}
function onChannelError() {
  console.log('Channel error.', arguments);
}
function onChannelClosed() {
  console.log('Channel closed.');
}

function onUserMediaSuccess(stream) {
  console.log("User has granted access to local media.");
  // Call the polyfill wrapper to attach the media stream to this element.
  attachMediaStream(localVideo, stream);
  localVideo.style.opacity = 1;
  localStream = stream;
  // Caller creates PeerConnection.
  if (initiator) maybeStart();
}

function onUserMediaError(error) {
  console.log("Failed to get access to local media. Error code was " + error.code);
  alert("Failed to get access to local media. Error code was " + error.code + ".");
}

function onIceCandidate(event) {
  if (event.candidate) {
    sendMessage({type: 'candidate',
                 label: event.candidate.sdpMLineIndex,
                 id: event.candidate.sdpMid,
                 candidate: event.candidate.candidate});
  } else {
    console.log("End of candidates.");
  }
}

function onSessionConnecting(message) {
  console.log("Session connecting.");
}
function onSessionOpened(message) {
  console.log("Session opened.");
}

function onRemoteStreamAdded(event) {
  console.log("Remote stream added.");
  // TODO(ekr@rtfm.com): Copy the minivideo on Firefox
  miniVideo.src = localVideo.src;
  attachMediaStream(remoteVideo, event.stream);
  remoteStream = event.stream;
  waitForRemoteVideo();  
}
function onRemoteStreamRemoved(event) {
  console.log("Remote stream removed.");
}

function onHangup() {
  console.log("Hanging up.");
  transitionToDone();
  stop();
  // will trigger BYE from server
  socket.close();
}
 
function onRemoteHangup() {
  console.log('Session terminated.');
  transitionToWaiting();
  stop();
  initiator = 0;
}

function stop() {
  started = false;
  isAudioMuted = false;
  isVideoMuted = false;
  pc.close();
  pc = null;
}

function waitForRemoteVideo() {
  if (remoteStream.videoTracks.length === 0 || remoteVideo.currentTime > 0) {
    transitionToActive();
  } else {
    setTimeout(waitForRemoteVideo, 100);
  }
}
function transitionToActive() {
  remoteVideo.style.opacity = 1;
  card.style.webkitTransform = "rotateY(180deg)";
  setTimeout(function() { localVideo.src = ""; }, 500);
  setTimeout(function() { miniVideo.style.opacity = 1; }, 1000);
  setStatus("<input type=\"button\" id=\"hangup\" value=\"Hang up\" onclick=\"onHangup()\" />");
}
function transitionToWaiting() {
  card.style.webkitTransform = "rotateY(0deg)";
  setTimeout(function() {
               localVideo.src = miniVideo.src;
               miniVideo.src = "";
               remoteVideo.src = ""; }, 500);
  miniVideo.style.opacity = 0;
  remoteVideo.style.opacity = 0;
  resetStatus();
}
function transitionToDone() {
  localVideo.style.opacity = 0;
  remoteVideo.style.opacity = 0;
  miniVideo.style.opacity = 0;
  setStatus("You have left the call. <a href=\"https://apprtc.appspot.com/?r=23666637\">Click here</a> to rejoin.");
}
function enterFullScreen() {
  container.webkitRequestFullScreen();
}

function toggleVideoMute() {
  if (localStream.videoTracks.length === 0) {
    console.log("No local video available.");
    return;
  }

  if (isVideoMuted) {
    for (i = 0; i < localStream.videoTracks.length; i++) {
      localStream.videoTracks[i].enabled = true;
    }
    console.log("Video unmuted.");
  } else {
    for (i = 0; i < localStream.videoTracks.length; i++) {
      localStream.videoTracks[i].enabled = false;
    }
    console.log("Video muted.");
  }

  isVideoMuted = !isVideoMuted;    
}

function toggleAudioMute() {
  if (localStream.audioTracks.length === 0) {
    console.log("No local audio available.");
    return;
  }

  if (isAudioMuted) {
    for (i = 0; i < localStream.audioTracks.length; i++) {
      localStream.audioTracks[i].enabled = true;
    }
    console.log("Audio unmuted.");
  } else {
    for (i = 0; i < localStream.audioTracks.length; i++){
      localStream.audioTracks[i].enabled = false;
    }
    console.log("Audio muted.");
  }

  isAudioMuted = !isAudioMuted;  
}

setTimeout(initialize, 1);

// Send BYE on refreshing(or leaving) a demo page
// to ensure the room is cleaned for next session.
window.onbeforeunload = function() {
  sendMessage({type: 'bye'});
};

// Ctrl-D: toggle audio mute; Ctrl-E: toggle video mute.
// On Mac, Command key is instead of Ctrl.
// Return false to screen out original Chrome shortcuts.
document.onkeydown = function() {
  if (navigator.appVersion.indexOf("Mac") != -1) {
    if (event.metaKey && event.keyCode === 68) {
      toggleAudioMute();
      return false;
    }
    if (event.metaKey && event.keyCode === 69) {
      toggleVideoMute();
      return false;
    }
  } else {
    if (event.ctrlKey && event.keyCode === 68) {
      toggleAudioMute();
      return false;
    }
    if (event.ctrlKey && event.keyCode === 69) {
      toggleVideoMute();
      return false;
    }
  }
};

// Set Opus as the default audio codec if it's present.
function preferOpus(sdp) {
  var sdpLines = sdp.split('\r\n');

  // Search for m line.
  for (var i = 0; i < sdpLines.length; i++) {
      if (sdpLines[i].search('m=audio') !== -1) {
        var mLineIndex = i;
        break;
      } 
  }
  if (mLineIndex === null)
    return sdp;

  // If Opus is available, set it as the default in m line.
  for (var i = 0; i < sdpLines.length; i++) {
    if (sdpLines[i].search('opus/48000') !== -1) {        
      var opusPayload = extractSdp(sdpLines[i], /:(\d+) opus\/48000/i);
      if (opusPayload)
        sdpLines[mLineIndex] = setDefaultCodec(sdpLines[mLineIndex], opusPayload);
      break;
    }
  }

  // Remove CN in m line and sdp.
  sdpLines = removeCN(sdpLines, mLineIndex);

  sdp = sdpLines.join('\r\n');
  return sdp;
}

function extractSdp(sdpLine, pattern) {
  var result = sdpLine.match(pattern);
  return (result && result.length == 2)? result[1]: null;
}

// Set the selected codec to the first in m line.
function setDefaultCodec(mLine, payload) {
  var elements = mLine.split(' ');
  var newLine = new Array();
  var index = 0;
  for (var i = 0; i < elements.length; i++) {
    if (index === 3) // Format of media starts from the fourth.
      newLine[index++] = payload; // Put target payload to the first.
    if (elements[i] !== payload)
      newLine[index++] = elements[i];
  }
  return newLine.join(' ');
}

// Strip CN from sdp before CN constraints is ready.
function removeCN(sdpLines, mLineIndex) {
  var mLineElements = sdpLines[mLineIndex].split(' ');
  // Scan from end for the convenience of removing an item.
  for (var i = sdpLines.length-1; i >= 0; i--) {
    var payload = extractSdp(sdpLines[i], /a=rtpmap:(\d+) CN\/\d+/i);
    if (payload) {
      var cnPos = mLineElements.indexOf(payload);
      if (cnPos !== -1) {
        // Remove CN payload from m line.
        mLineElements.splice(cnPos, 1);
      }
      // Remove CN line in sdp
      sdpLines.splice(i, 1);
    }
  }

  sdpLines[mLineIndex] = mLineElements.join(' ');
  return sdpLines;
}

