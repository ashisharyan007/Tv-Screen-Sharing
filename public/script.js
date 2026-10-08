  // ==========================================
  // SOCKET
  // ==========================================

  const socket = io();


  // ==========================================
  // ELEMENTS
  // ==========================================

  const mainScreen =
    document.getElementById("mainScreen");

  const presenterScreen =
    document.getElementById("presenterScreen");

  const viewerScreen =
    document.getElementById("viewerScreen");

  const roomInput =
    document.getElementById("roomInput");

  const viewerNameInput =
    document.getElementById("viewerNameInput");

  const PIN_PATTERN = /^[A-Za-z0-9]{6}$/;

  const presenterButton =
    document.getElementById("presenterButton");

  const viewerButton =
    document.getElementById("viewerButton");

  const pinSection =
    document.getElementById("pinSection");

  const pinInput =
    document.getElementById("pinInput");

  const showPinToggle =
    document.getElementById("showPinToggle");

  const pinButton =
    document.getElementById("pinButton");

  const cancelPinButton =
    document.getElementById("cancelPinButton");

  const pinError =
    document.getElementById("pinError");

  const statusText =
    document.getElementById("status");

  const viewerCountText =
    document.getElementById("viewerCount");

  const shareButton =
    document.getElementById("shareButton");

  const qualitySelect =
    document.getElementById("qualitySelect");

  const presenterBackButton =
    document.getElementById(
      "presenterBackButton"
    );

  const viewerBackButton =
    document.getElementById(
      "viewerBackButton"
    );

  const presenterStatus =
    document.getElementById(
      "presenterStatus"
    );

  const presenterViewerCount =
    document.getElementById(
      "presenterViewerCount"
    );

  const approvalPanel =
    document.getElementById(
      "approvalPanel"
    );

  const approvalList =
    document.getElementById(
      "approvalList"
    );

  const activeViewerPanel =
    document.getElementById(
      "activeViewerPanel"
    );

  const activeViewerList =
    document.getElementById(
      "activeViewerList"
    );

  const presenterVideo =
    document.getElementById(
      "presenterVideo"
    );

  const viewerStatus =
    document.getElementById(
      "viewerStatus"
    );

  const video =
    document.getElementById("video");


  // ==========================================
  // STATE
  // ==========================================

  let role = null;

  let roomId = null;

  let viewerApproved = false;

  let screenStream = null;

  let viewerAssignedName = "";

  const pendingViewers = {};

  const activeViewers = {};


  // Every viewer has its own connection

  const peerConnections = {};


  // Early ICE candidates

  const pendingIceCandidates = {};


  // ==========================================
  // WEBRTC CONFIG
  // ==========================================

  const rtcConfig = {

    iceServers: [

      {
        urls:
          "stun:stun.l.google.com:19302"
      }

    ]

  };

  const videoQualityProfiles = {
    "480p": {
      width: 854,
      height: 480,
      maxBitrate: 900_000
    },
    "720p": {
      width: 1280,
      height: 720,
      maxBitrate: 2_500_000
    },
    "1080p": {
      width: 1920,
      height: 1080,
      maxBitrate: 5_000_000
    }
  };


  // ==========================================
  // STATUS FUNCTIONS
  // ==========================================

  function setStatus(message) {

    statusText.textContent =
      message;

    console.log(message);

  }


  function setPresenterStatus(message) {

    presenterStatus.textContent =
      message;

    console.log(message);

  }


  function setViewerStatus(message) {

    viewerStatus.innerHTML =
      message;

    console.log(message);

  }


  // ==========================================
  // CLOSE PEER CONNECTIONS
  // ==========================================

  function closeAllPeerConnections() {

    Object.keys(
      peerConnections
    ).forEach(
      remoteSocketId => {

        const pc =
          peerConnections[
            remoteSocketId
          ];


        if (pc) {

          pc.close();

        }


        delete peerConnections[
          remoteSocketId
        ];

      }
    );


    Object.keys(
      pendingIceCandidates
    ).forEach(
      remoteSocketId => {

        delete pendingIceCandidates[
          remoteSocketId
        ];

      }
    );

  }


  // ==========================================
  // STOP SCREEN SHARING
  // ==========================================

  function stopScreenSharing() {

    if (screenStream) {

      screenStream
        .getTracks()
        .forEach(track => {

          track.stop();

        });


      screenStream = null;

    }


    presenterVideo.srcObject =
      null;

    presenterVideo.style.display =
      "none";


    shareButton.disabled =
      false;


    shareButton.textContent =
      "Start Screen Sharing";

  }


  // ==========================================
  // RETURN TO MAIN SCREEN
  // ==========================================

  function renderApprovalList() {

    const entries =
      Object.values(
        pendingViewers
      );

    if (!entries.length) {

      approvalList.innerHTML =
        "<div class=\"small-text\">No pending viewers.</div>";

      return;

    }

    approvalList.innerHTML =
      entries.map(
        viewer => `
          <div class="approval-item">
            <span>${viewer.name}</span>
            <div class="approval-actions">
              <button class="approve-button" data-action="approve" data-socket-id="${viewer.socketId}">
                Approve
              </button>
              <button class="reject-button" data-action="reject" data-socket-id="${viewer.socketId}">
                Reject
              </button>
            </div>
          </div>
        `
      ).join("");

    approvalList
      .querySelectorAll("button")
      .forEach(button => {

        button.addEventListener(
          "click",
          () => {

            const {
              action,
              socketId
            } = button.dataset;

            if (
              action === "approve"
            ) {

              socket.emit(
                "approve-viewer",
                {
                  roomId,
                  viewerSocketId: socketId
                }
              );

            }

            if (
              action === "reject"
            ) {

              socket.emit(
                "reject-viewer",
                {
                  roomId,
                  viewerSocketId: socketId
                }
              );

            }

            delete pendingViewers[socketId];
            renderApprovalList();

          }
        );

      });

  }


  function renderActiveViewerList() {

    const entries =
      Object.values(
        activeViewers
      );

    if (!entries.length) {

      activeViewerList.innerHTML =
        "<div class=\"small-text\">No viewers are currently watching.</div>";

      return;

    }

    activeViewerList.innerHTML =
      entries.map(
        viewer => `
          <div class="approval-item">
            <span>${viewer.name}</span>
            <div class="approval-actions">
              <button class="reject-button" data-remove-socket-id="${viewer.socketId}">
                Remove
              </button>
            </div>
          </div>
        `
      ).join("");

    activeViewerList
      .querySelectorAll("button")
      .forEach(button => {

        button.addEventListener(
          "click",
          () => {

            const viewerSocketId =
              button.getAttribute(
                "data-remove-socket-id"
              );

            if (!viewerSocketId) {
              return;
            }

            socket.emit(
              "remove-viewer",
              {
                roomId,
                viewerSocketId
              }
            );

            delete activeViewers[viewerSocketId];
            renderActiveViewerList();

          }
        );

      });

  }


  function endSessionForEveryone(reason) {

    if (
      role === "presenter" &&
      roomId
    ) {

      socket.emit(
        "host-ended-session",
        {
          roomId,
          reason
        }
      );

    }

  }


  function showMainScreen() {

    console.log(
      "Returning to main screen..."
    );


    // Stop screen sharing

    stopScreenSharing();


    // Close WebRTC connections

    closeAllPeerConnections();


    // Tell server we are leaving

    if (
      role === "presenter" &&
      roomId
    ) {

      socket.emit(
        "host-ended-session",
        {
          roomId,
          reason: "Host returned to main screen."
        }
      );

    }

    socket.emit(
      "leave-room"
    );


    // Reset UI

    mainScreen.style.display =
      "block";

    presenterScreen.style.display =
      "none";

    viewerScreen.style.display =
      "none";

    pinSection.style.display =
      "none";

    approvalPanel.style.display =
      "none";

    activeViewerPanel.style.display =
      "none";

    approvalList.innerHTML =
      "";

    activeViewerList.innerHTML =
      "";

    Object.keys(pendingViewers).forEach(
      key => delete pendingViewers[key]
    );

    Object.keys(activeViewers).forEach(
      key => delete activeViewers[key]
    );


    pinInput.value =
      "";

    if (viewerNameInput) {
      viewerNameInput.value =
        "";
    }

    pinError.style.display =
      "none";


    // Reset buttons

    presenterButton.disabled =
      false;

    viewerButton.disabled =
      false;


    // Reset state

    role =
      null;

    roomId =
      null;

    viewerApproved =
      false;

    viewerAssignedName =
      "";


    // Reset video

    video.srcObject =
      null;

    video.style.display =
      "none";


    presenterVideo.srcObject =
      null;

    presenterVideo.style.display =
      "none";


    // Reset counters

    viewerCountText.textContent =
      "";

    presenterViewerCount.textContent =
      "";


    // Reset sharing button

    shareButton.disabled =
      false;

    shareButton.textContent =
      "Start Screen Sharing";


    setStatus(
      "Ready."
    );

  }


  // ==========================================
  // SHOW PRESENTER SCREEN
  // ==========================================

  function showPresenterScreen() {

    mainScreen.style.display =
      "none";

    presenterScreen.style.display =
      "block";

    viewerScreen.style.display =
      "none";

    approvalPanel.style.display =
      "block";

    activeViewerPanel.style.display =
      "block";

    renderApprovalList();
    renderActiveViewerList();


    setPresenterStatus(
      "Presenter authenticated. Ready to share your screen."
    );

  }


  // ==========================================
  // SHOW VIEWER SCREEN
  // ==========================================

  function showViewerScreen() {

    mainScreen.style.display =
      "none";

    presenterScreen.style.display =
      "none";

    viewerScreen.style.display =
      "block";

    setViewerStatus(
      "Viewer connected. Waiting for presenter..."
    );

  }


  // ==========================================
  // CREATE PEER CONNECTION
  // ==========================================

  function createPeerConnection(
    remoteSocketId
  ) {

    console.log(
      "Creating PeerConnection for:",
      remoteSocketId
    );


    const pc =
      new RTCPeerConnection(
        rtcConfig
      );


    peerConnections[
      remoteSocketId
    ] = pc;


    // ========================================
    // PRESENTER SENDS SCREEN
    // ========================================

    if (
      role === "presenter" &&
      screenStream
    ) {

      screenStream
        .getTracks()
        .forEach(track => {

          pc.addTrack(
            track,
            screenStream
          );

        });

    }


    // ========================================
    // ICE
    // ========================================

    pc.onicecandidate =
      event => {

        if (
          !event.candidate
        ) {

          return;

        }


        socket.emit(
          "ice-candidate",
          {
            target:
              remoteSocketId,

            candidate:
              event.candidate
          }
        );

      };


    // ========================================
    // RECEIVE VIDEO
    // ========================================

    pc.ontrack =
      event => {

        console.log(
          "Video track received from:",
          remoteSocketId
        );


        if (
          event.streams[0]
        ) {

          video.srcObject =
            event.streams[0];


          video.style.display =
            "block";


          const liveMessage = viewerAssignedName
            ? `Connected! Live screen received.<br><span class="session-name-label">Session name:</span> <span class="session-name-highlight">${viewerAssignedName}</span>`
            : "Connected! Live screen received.";

          setViewerStatus(liveMessage);

        }

      };


    // ========================================
    // CONNECTION STATE
    // ========================================

    pc.onconnectionstatechange =
      () => {

        console.log(
          remoteSocketId,
          "connection:",
          pc.connectionState
        );


        if (
          pc.connectionState ===
          "connected"
        ) {

          if (
            role ===
            "presenter"
          ) {

            setPresenterStatus(
              "Viewer connection established."
            );

          }


          if (
            role ===
            "viewer"
          ) {

            const connectedMessage = viewerAssignedName
              ? `Connected! Live screen received.<br><span class="session-name-label">Session name:</span> <span class="session-name-highlight">${viewerAssignedName}</span>`
              : "Connected! Live screen received.";

            setViewerStatus(connectedMessage);

          }

        }


        if (
          pc.connectionState ===
          "failed"
        ) {

          console.error(
            "WebRTC connection failed:",
            remoteSocketId
          );

        }

      };


    // ========================================
    // ICE CONNECTION STATE
    // ========================================

    pc.oniceconnectionstatechange =
      () => {

        console.log(
          remoteSocketId,
          "ICE:",
          pc.iceConnectionState
        );

      };


    return pc;

  }


  // ==========================================
  // CONNECT PRESENTER TO VIEWER
  // ==========================================

  async function connectPresenterToViewer(
    remoteSocketId
  ) {

    if (
      !remoteSocketId ||
      !screenStream
    ) {

      return;

    }

    let pc =
      peerConnections[remoteSocketId];

    if (!pc) {

      pc =
        createPeerConnection(
          remoteSocketId
        );

    }

    if (
      pc.signalingState !==
      "stable"
    ) {

      return;

    }

    const senders =
      pc.getSenders();

    screenStream
      .getTracks()
      .forEach(track => {

        const alreadySending =
          senders.some(
            sender =>
              sender.track ===
              track
          );

        if (
          !alreadySending
        ) {

          pc.addTrack(
            track,
            screenStream
          );

        }

      });

    const qualityErrors =
      await applyVideoQualityToPeer(
        pc,
        qualitySelect.value
      );

    if (qualityErrors.length) {
      setPresenterStatus(
        `Connected to viewer, but could not apply ${qualitySelect.value} quality.`
      );
    }

    const offer =
      await pc.createOffer();

    await pc.setLocalDescription(
      offer
    );

    socket.emit(
      "offer",
      {
        target:
          remoteSocketId,
        offer
      }
    );

  }

  async function applyVideoQualityToSender(
    sender,
    quality
  ) {

    const profile =
      videoQualityProfiles[quality];

    if (!profile) {
      throw new Error(
        `Unsupported screen quality: ${quality}`
      );
    }

    const parameters =
      sender.getParameters();

    if (
      !parameters.encodings ||
      parameters.encodings.length === 0
    ) {
      throw new Error(
        "The browser did not provide a video encoding to configure."
      );
    }

    const settings =
      sender.track
        ? sender.track.getSettings()
        : {};

    const width =
      settings.width || profile.width;

    const height =
      settings.height || profile.height;

    const scaleResolutionDownBy =
      Math.max(
        1,
        width / profile.width,
        height / profile.height
      );

    parameters.encodings.forEach(encoding => {
      encoding.maxBitrate =
        profile.maxBitrate;

      encoding.scaleResolutionDownBy =
        scaleResolutionDownBy;
    });

    await sender.setParameters(parameters);

  }


  async function applyVideoQualityToPeer(
    pc,
    quality
  ) {

    const errors = [];
    let videoSenders;

    try {
      videoSenders =
        pc.getSenders().filter(
          sender =>
            sender.track &&
            sender.track.kind === "video"
        );
    } catch (error) {
      console.error(
        "Could not inspect video senders:",
        error
      );
      return [error];
    }

    for (const sender of videoSenders) {
      try {
        await applyVideoQualityToSender(
          sender,
          quality
        );
      } catch (error) {
        console.error(
          "Could not apply screen quality:",
          error
        );
        errors.push(error);
      }
    }

    return errors;

  }


  async function applyVideoQualityToAllPeers(
    quality
  ) {

    const results =
      await Promise.all(
        Object.values(peerConnections).map(
          async pc => ({
            pc,
            errors: await applyVideoQualityToPeer(
              pc,
              quality
            )
          })
        )
      );

    return results.reduce(
      (count, result) =>
        count + result.errors.length,
      0
    );

  }


  // ==========================================
  // PROCESS PENDING ICE
  // ==========================================

  async function processPendingIce(
    remoteSocketId
  ) {

    const pc =
      peerConnections[
        remoteSocketId
      ];


    if (!pc) {

      return;

    }


    const candidates =
      pendingIceCandidates[
        remoteSocketId
      ] || [];


    for (
      const candidate of candidates
    ) {

      try {

        await pc.addIceCandidate(
          candidate
        );

      } catch (error) {

        console.error(
          "Queued ICE error:",
          error
        );

      }

    }


    delete pendingIceCandidates[
      remoteSocketId
    ];

  }


  // ==========================================
  // PRESENTER BUTTON
  // ==========================================

  presenterButton.addEventListener(
    "click",
    () => {

      presenterButton.classList.add("selected");
      viewerButton.classList.remove("selected");

      const selectedRoom =
        roomInput.value.trim();


      if (
        !selectedRoom
      ) {

        alert(
          "Enter a room name."
        );

        roomInput.focus();

        return;

      }


      roomId =
        selectedRoom;

      pinSection.style.display =
        "block";


      pinError.style.display =
        "none";


      pinInput.value =
        "";

      showPinToggle.textContent =
        "👁";

      showPinToggle.setAttribute(
        "aria-label",
        "Show PIN"
      );

      pinInput.type =
        "password";


      pinInput.focus();


      setStatus(
        "Enter the 6-character Presenter PIN."
      );

    }
  );


  // ==========================================
  // PIN BUTTON
  // ==========================================

  pinButton.addEventListener(
    "click",
    () => {

      const pin =
        pinInput.value.trim();


      if (
        !PIN_PATTERN.test(
          pin
        )
      ) {

        pinError.textContent =
          "PIN must be exactly 6 characters using only numbers or letters.";


        pinError.style.display =
          "block";


        return;

      }


      pinError.style.display =
        "none";


      setStatus(
        "Checking PIN..."
      );


      socket.emit(
        "authenticate-presenter",
        {
          pin
        }
      );

    }
  );


  // ==========================================
  // ENTER PIN WITH ENTER KEY
  // ==========================================

  showPinToggle.addEventListener(
    "click",
    () => {

      const isVisible =
        pinInput.type ===
        "text";

      pinInput.type =
        isVisible
          ? "password"
          : "text";

      showPinToggle.textContent =
        isVisible ? "👁" : "🙈";

      showPinToggle.setAttribute(
        "aria-label",
        isVisible ? "Show PIN" : "Hide PIN"
      );

      pinInput.focus();

    }
  );


  pinInput.addEventListener(
    "keydown",
    event => {

      if (
        event.key ===
        "Enter"
      ) {

        pinButton.click();

      }

    }
  );


  // ==========================================
  // CANCEL PIN
  // ==========================================

  cancelPinButton.addEventListener(
    "click",
    () => {

      pinInput.value =
        "";

      showPinToggle.textContent =
        "👁";

      showPinToggle.setAttribute(
        "aria-label",
        "Show PIN"
      );

      pinInput.type =
        "password";

      pinError.style.display =
        "none";

      pinSection.style.display =
        "none";


      setStatus(
        "Ready."
      );

    }
  );


  // ==========================================
  // AUTH RESULT
  // ==========================================

  socket.on(
    "presenter-auth-result",
    result => {

      // ======================================
      // WRONG PIN
      // ======================================

      if (
        !result.success
      ) {

        pinError.textContent =
          "Incorrect PIN. Returning to main screen...";


        pinError.style.display =
          "block";


        setStatus(
          "Incorrect PIN."
        );


        setTimeout(
          () => {

            showMainScreen();

          },
          1500
        );


        return;

      }


      // ======================================
      // CORRECT PIN
      // ======================================

      console.log(
        "Presenter authentication successful."
      );


      role =
        "presenter";


      socket.emit(
        "join-room",
        {
          roomId,
          role: "presenter"
        }
      );


      showPresenterScreen();

    }
  );


  // ==========================================
  // VIEWER BUTTON
  // ==========================================

  viewerButton.addEventListener(
    "click",
    () => {

      viewerButton.classList.add("selected");
      presenterButton.classList.remove("selected");

      const selectedRoom =
        roomInput.value.trim();


      if (
        !selectedRoom
      ) {

        alert(
          "Enter a room name."
        );

        roomInput.focus();

        return;

      }


      roomId =
        selectedRoom;


      role =
        "viewer";

      viewerApproved =
        false;

      const enteredName =
        viewerNameInput
          ? viewerNameInput.value.trim()
          : "";

      if (!enteredName) {
        alert(
          "Enter your name before joining."
        );

        if (viewerNameInput) {
          viewerNameInput.focus();
        }

        return;
      }


      socket.emit(
        "join-room",
        {
          roomId,
          role: "viewer",
          name: enteredName
        }
      );


      showViewerScreen();

    }
  );


  // ==========================================
  // START SCREEN SHARING
  // ==========================================

  qualitySelect.addEventListener(
    "change",
    async () => {

      const quality =
        qualitySelect.value;

      if (!screenStream) {
        setPresenterStatus(
          `${quality} selected. It will be used when screen sharing starts.`
        );
        return;
      }

      qualitySelect.disabled = true;

      try {
        const failedPeers =
          await applyVideoQualityToAllPeers(
            quality
          );

        if (failedPeers) {
          setPresenterStatus(
            `Could not apply ${quality} quality to ${failedPeers} video connection(s). Check the browser console for details.`
          );
        } else {
          setPresenterStatus(
            `Stream quality changed to ${quality} for all viewers.`
          );
        }
      } catch (error) {
        console.error(
          "Could not update stream quality:",
          error
        );
        setPresenterStatus(
          `Could not update stream quality to ${quality}. Check the browser console for details.`
        );
      } finally {
        qualitySelect.disabled = false;
      }

    }
  );


  shareButton.addEventListener(
    "click",
    async () => {

      try {

        screenStream =
          await navigator
            .mediaDevices
            .getDisplayMedia(
              {
                video: true,
                audio: true
              }
            );


        presenterVideo.srcObject =
          screenStream;


        presenterVideo.style.display =
          "block";


        shareButton.textContent =
          "Screen Sharing Active";


        shareButton.disabled =
          true;


        setPresenterStatus(
          "Your screen is being shared."
        );


        // ====================================
        // EXISTING VIEWERS
        // ====================================

        for (
          const remoteSocketId
          of Object.keys(
            activeViewers
          )
        ) {

          await connectPresenterToViewer(
            remoteSocketId
          );

        }


        // ====================================
        // SCREEN SHARE ENDED
        // ====================================

        const videoTrack =
          screenStream
            .getVideoTracks()[0];


        if (videoTrack) {

          videoTrack.addEventListener(
            "ended",
            () => {

              stopScreenSharing();

              endSessionForEveryone(
                "Host stopped screen sharing."
              );

              setPresenterStatus(
                "Screen sharing stopped."
              );

            }
          );

        }

      } catch (error) {

        console.error(
          "Screen sharing error:",
          error
        );


        if (
          error &&
          error.name === "NotAllowedError"
        ) {
          setPresenterStatus(
            "Screen sharing was cancelled or blocked by the browser."
          );
        } else {
          setPresenterStatus(
            "Screen sharing cancelled."
          );
        }

      }

    }
  );


  // ==========================================
  // HOST APPROVAL FLOW
  // ==========================================

  socket.on(
    "viewer-request",
    ({ socketId, name }) => {

      if (
        role !== "presenter"
      ) {
        return;
      }

      pendingViewers[socketId] = {
        socketId,
        name
      };

      renderApprovalList();

      setPresenterStatus(
        `Approval pending for ${name}.`
      );

    }
  );


  socket.on(
    "session-ended",
    ({ reason }) => {

      if (
        role === "viewer"
      ) {

        viewerApproved =
          false;

        setViewerStatus(
          reason ||
          "Host ended the session."
        );

        closeAllPeerConnections();
        video.srcObject = null;
        video.style.display = "none";

        setTimeout(
          () => {
            showMainScreen();
          },
          1200
        );

      }

      if (
        role === "presenter"
      ) {

        setPresenterStatus(
          reason ||
          "Session ended."
        );

        setTimeout(
          () => {
            showMainScreen();
          },
          1200
        );

      }

    }
  );


  socket.on(
    "viewer-rejected",
    ({ message }) => {

      if (
        role !== "viewer"
      ) {
        return;
      }

      viewerApproved =
        false;

      setViewerStatus(
        message
      );

      setTimeout(
        () => {
          showMainScreen();
        },
        1500
      );

    }
  );


  socket.on(
    "viewer-removed",
    ({ message }) => {

      if (
        role !== "viewer"
      ) {
        return;
      }

      viewerApproved =
        false;

      setViewerStatus(
        message
      );

      setTimeout(
        () => {
          showMainScreen();
        },
        1500
      );

    }
  );


  socket.on(
    "viewer-approved",
    ({ name }) => {

      if (
        role !== "viewer"
      ) {
        return;
      }

      viewerApproved =
        true;

      viewerAssignedName = name;

      setViewerStatus(
        `Approved by Host.<br><span class="session-name-label">Your session name is</span> <span class="session-name-highlight">${name}</span>`
      );

      viewerScreen.style.display =
        "block";

    }
  );


  socket.on(
    "viewer-join-error",
    ({ message }) => {

      alert(message);

      showMainScreen();

    }
  );


  socket.on(
    "viewer-left",
    ({ socketId }) => {

      if (
        pendingViewers[socketId]
      ) {
        delete pendingViewers[socketId];
        renderApprovalList();
      }

      if (
        activeViewers[socketId]
      ) {
        delete activeViewers[socketId];
      }

      renderActiveViewerList();

      if (
        role === "presenter"
      ) {
        setPresenterStatus(
          "A viewer left the session."
        );
      }

    }
  );


  socket.on(
    "active-viewers-update",
    ({ viewers = [] }) => {

      if (
        role !== "presenter"
      ) {
        return;
      }

      Object.keys(activeViewers).forEach(
        key => delete activeViewers[key]
      );

      viewers.forEach(viewer => {

        activeViewers[viewer.socketId] = {
          socketId: viewer.socketId,
          name: viewer.name
        };

      });

      renderActiveViewerList();

    }
  );


  socket.on(
    "viewer-joined",
    async ({ socketId }) => {

      if (
        role !==
        "presenter"
      ) {

        return;

      }


      console.log(
        "Viewer joined:",
        socketId
      );


      viewerCountText.textContent =
        "Viewer connected";


      presenterViewerCount.textContent =
        "Viewer connected";

      if (
        activeViewers[socketId]
      ) {
        delete activeViewers[socketId];
      }

      if (
        role === "presenter"
      ) {
        activeViewers[socketId] = {
          socketId,
          name: pendingViewers[socketId]?.name || "Viewer"
        };

        delete pendingViewers[socketId];
        renderApprovalList();
        renderActiveViewerList();
      }


      // No screen yet

      if (
        !screenStream
      ) {

        setPresenterStatus(
          "Viewer connected. Start screen sharing."
        );

        return;

      }


      await connectPresenterToViewer(
        socketId
      );

    }
  );


  // ==========================================
  // VIEWER RECEIVES OFFER
  // ==========================================

  socket.on(
    "offer",
    async ({ from, offer }) => {

      if (
        role !==
        "viewer"
      ) {

        return;

      }


      console.log(
        "Offer received from:",
        from
      );


      let pc =
        peerConnections[from];


      if (!pc) {

        pc =
          createPeerConnection(
            from
          );

      }


      await pc.setRemoteDescription(
        offer
      );


      await processPendingIce(
        from
      );


      const answer =
        await pc.createAnswer();


      await pc.setLocalDescription(
        answer
      );


      socket.emit(
        "answer",
        {
          target:
            from,

          answer
        }
      );


      setViewerStatus(
        "Connecting to presenter..."
      );

    }
  );


  // ==========================================
  // PRESENTER RECEIVES ANSWER
  // ==========================================

  socket.on(
    "answer",
    async ({ from, answer }) => {

      if (
        role !==
        "presenter"
      ) {

        return;

      }


      const pc =
        peerConnections[from];


      if (!pc) {

        console.warn(
          "No PeerConnection for:",
          from
        );

        return;

      }


      if (
        pc.signalingState !==
        "have-local-offer"
      ) {

        console.warn(
          "Ignoring stale answer:",
          pc.signalingState
        );

        return;

      }


      await pc.setRemoteDescription(
        answer
      );


      await processPendingIce(
        from
      );


      console.log(
        "Answer accepted from:",
        from
      );

    }
  );


  // ==========================================
  // ICE CANDIDATE
  // ==========================================

  socket.on(
    "ice-candidate",
    async ({ from, candidate }) => {

      let pc =
        peerConnections[from];


      // PeerConnection doesn't exist yet

      if (!pc) {

        if (
          !pendingIceCandidates[from]
        ) {

          pendingIceCandidates[from] =
            [];

        }


        pendingIceCandidates[from]
          .push(candidate);


        return;

      }


      // Remote description not ready

      if (
        !pc.remoteDescription
      ) {

        if (
          !pendingIceCandidates[from]
        ) {

          pendingIceCandidates[from] =
            [];

        }


        pendingIceCandidates[from]
          .push(candidate);


        return;

      }


      try {

        await pc.addIceCandidate(
          candidate
        );

      } catch (error) {

        console.error(
          "ICE candidate error:",
          error
        );

      }

    }
  );


  // ==========================================
  // AUTH REQUIRED
  // ==========================================

  socket.on(
    "auth-required",
    () => {

      showMainScreen();

      setStatus(
        "Presenter authentication required."
      );

    }
  );


  // ==========================================
  // SOCKET CONNECTED
  // ==========================================

  socket.on(
    "connect",
    () => {

      console.log(
        "Connected to server:",
        socket.id
      );

      statusText.classList.remove("disconnected");

      setStatus(
        "Connected to server."
      );

    }
  );


  // ==========================================
  // SOCKET DISCONNECTED
  // ==========================================

  socket.on(
    "disconnect",
    () => {

      statusText.classList.add("disconnected");

      setStatus(
        "Disconnected from server."
      );

    }
  );


  // ==========================================
  // BACK BUTTONS
  // ==========================================

  presenterBackButton.addEventListener(
    "click",
    () => {

      showMainScreen();

    }
  );


  viewerBackButton.addEventListener(
    "click",
    () => {

      showMainScreen();

    }
  );


  // ==========================================
  // INITIAL STATE
  // ==========================================

  presenterButton.classList.add("selected");
  viewerButton.classList.remove("selected");

  showMainScreen();
